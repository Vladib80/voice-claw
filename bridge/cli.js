#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const { loadConfig, saveConfig, configExists, loadPid, savePid, removePid, isRunning, LOG_PATH, CONFIG_PATH } = require('./lib/config');
const { detectLocalLLMs, loadOpenClawConfig, CLOUD_BACKENDS } = require('./lib/detect');
const { completePairing } = require('./lib/pair');
const { startBridge } = require('./lib/bridge');
const ui = require('./lib/ui');

const VERSION = require('./package.json').version;
const API_BASE = process.env.VOICECLAW_API_BASE || 'https://www.voiceclaw.io';
const PAIR_CODE_RE = /^VC-[A-Z0-9]{4}-[A-Z0-9]{4}$/i;

/* ── Parse args ─────────────────────────────────────── */

const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('-')));
const positional = args.filter(a => !a.startsWith('-'));

const command = positional[0] || '';
const isDaemon = flags.has('--daemon') || flags.has('-d');
const isHelp = flags.has('--help') || flags.has('-h');
const isVersion = flags.has('--version') || flags.has('-v');
const isForeground = flags.has('--foreground'); // internal flag for daemon child

if (isVersion) { console.log(VERSION); process.exit(0); }
if (isHelp) { printHelp(); process.exit(0); }

/* ── Route command ──────────────────────────────────── */

(async () => {
  try {
    if (command === 'stop')     return cmdStop();
    if (command === 'status')   return cmdStatus();
    if (command === 'config')   return await cmdConfig();
    if (command === 'unpair')   return cmdUnpair();

    // Smart start: is the first arg a pair code?
    const pairCode = PAIR_CODE_RE.test(command) ? command.toUpperCase()
                   : PAIR_CODE_RE.test(positional[1] || '') ? positional[1].toUpperCase()
                   : null;

    if (pairCode) {
      await cmdPairAndRun(pairCode);
    } else if (command === 'start' || command === '' || command === 'run') {
      await cmdRun();
    } else {
      console.error(`  Unknown command: ${command}\n`);
      printHelp();
      process.exit(1);
    }
  } catch (e) {
    console.error(`\n  ${ui.red('Error:')} ${e.message}\n`);
    process.exit(1);
  }
})();

/* ── Commands ───────────────────────────────────────── */

async function cmdPairAndRun(pairCode) {
  ui.banner(VERSION);

  // 1. Auto-detect local LLMs
  const spin = ui.spinner('Scanning for local AI...');
  const found = await detectLocalLLMs();

  if (found.length === 0) {
    spin.fail('No local AI detected');
    console.log(`\n  ${ui.dim('Start Ollama, LM Studio, or OpenClaw and try again.')}`);
    console.log(`  ${ui.dim('Or use a cloud provider:')}\n`);

    // Fallback: manual selection including cloud
    const selected = await pickBackendManual();
    return await pairAndStart(pairCode, selected);
  }

  // Show what we found
  const names = found.map(b => {
    const extra = b.autoConfigured ? ui.dim(' (auto-configured)') : '';
    return `${b.label} on :${b.port}${extra}`;
  });
  spin.succeed(`Found ${names.join(', ')}`);

  // 2. Pick backend
  let selected;
  if (found.length === 1) {
    selected = found[0];
  } else {
    const options = found.map(b => ({
      label: b.label,
      hint: `(${b.url}${b.autoConfigured ? ', auto-configured' : ''})`,
      value: b,
    }));
    selected = await ui.selectMenu('Which AI backend?', options);
  }

  // 3. Get token if needed and not auto-configured
  if (selected.needsToken && !selected.token) {
    const token = await ui.prompt(`${selected.label} token: `);
    selected.token = token;
  }

  await pairAndStart(pairCode, selected);
}

async function pairAndStart(pairCode, backend) {
  // Pair with server
  const spin = ui.spinner('Pairing with VoiceClaw...');
  let pairResult;
  try {
    pairResult = await completePairing(pairCode, API_BASE);
    spin.succeed(`Paired! Bridge ID: ${ui.bold(pairResult.bridgeId)}`);
  } catch (e) {
    spin.fail(e.message);
    process.exit(1);
  }

  // Build config
  const config = {
    apiBase: API_BASE,
    bridgeId: pairResult.bridgeId,
    wsToken: pairResult.wsToken,
    scope: pairResult.scope,
    gatewayUrl: (backend.url || '').replace(/\/$/, ''),
    gatewayToken: backend.token || '',
    gatewayType: backend.type,
    openaiKey: '',
    groqKey: '',
    pairedAt: Date.now(),
    version: VERSION,
  };
  if (backend.isAnthropic) {
    config.anthropicKey = backend.token || '';
    config.gatewayToken = '';
  }

  // Preserve existing voice keys if re-pairing
  const existing = loadConfig();
  if (existing?.openaiKey) config.openaiKey = existing.openaiKey;
  if (existing?.groqKey) config.groqKey = existing.groqKey;

  saveConfig(config);

  console.log('');
  if (!config.openaiKey || !config.groqKey) {
    console.log(`  ${ui.warn} Voice keys not set — speech won't work yet.`);
    console.log(`  ${ui.dim('Run')} ${ui.bold('voiceclaw config')} ${ui.dim('to add OpenAI + Groq keys.')}`);
    console.log('');
  }

  // Start the bridge
  if (isDaemon) {
    return startDaemon();
  }

  return runForeground(config);
}

async function cmdRun() {
  const cfg = loadConfig();
  if (!cfg) {
    ui.banner(VERSION);
    console.log(`  No config found. Pair first:\n`);
    console.log(`  ${ui.bold('node ~/.voiceclaw/cli.js VC-XXXX-XXXX')}`);
    console.log(`  ${ui.dim('Get the code from voiceclaw.io on your phone.')}\n`);
    process.exit(1);
  }

  if (isDaemon) {
    ui.banner(VERSION);
    return startDaemon();
  }

  ui.banner(VERSION);
  return runForeground(cfg);
}

function runForeground(cfg) {
  const bridge = startBridge(cfg, {
    onConnect() {
      console.log(`  ${ui.ok} Bridge connected ${ui.dim(`(${cfg.bridgeId})`)}`);
      console.log(`  ${ui.dim(`Backend: ${cfg.gatewayType} (${cfg.gatewayUrl})`)}`);
      console.log(`\n  ${ui.dim('Press Ctrl+C to stop.')}\n`);
    },
    onDisconnect(code, reason) {
      console.log(`  ${ui.dim(`Disconnected (${code}). Reconnecting...`)}`);
    },
    onError(err) {
      console.error(`  ${ui.red('WS error:')} ${err.message}`);
    },
    onInvoke(kind) {
      process.stdout.write(`  ${ui.dot} ${kind}\n`);
    },
    onFatal(msg) {
      console.error(`\n  ${ui.fail} ${msg}`);
      console.error(`  ${ui.dim('Get a new code from your phone and run:')} ${ui.bold('node ~/.voiceclaw/cli.js VC-XXXX-XXXX')}\n`);
      process.exit(1);
    },
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log(`\n  ${ui.dim('Stopping bridge...')}`);
    bridge.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function startDaemon() {
  const existing = loadPid();
  if (existing && isRunning(existing)) {
    console.log(`  ${ui.warn} Bridge already running (PID ${existing})`);
    return;
  }

  const child = spawn(process.execPath, [__filename, 'start', '--foreground'], {
    detached: true,
    stdio: ['ignore', fs.openSync(LOG_PATH, 'a'), fs.openSync(LOG_PATH, 'a')],
    env: { ...process.env, VOICECLAW_DAEMON: '1' },
  });

  child.unref();
  savePid(child.pid);

  console.log(`  ${ui.ok} Bridge running in background (PID ${child.pid})`);
  console.log(`  ${ui.dim(`Log: ${LOG_PATH}`)}`);
  console.log(`  ${ui.dim(`Stop: node ~/.voiceclaw/cli.js stop`)}\n`);
  process.exit(0);
}

function cmdStop() {
  const pid = loadPid();
  if (!pid) {
    console.log('  No bridge PID found.');
    return;
  }

  if (!isRunning(pid)) {
    removePid();
    console.log('  Bridge was not running (stale PID removed).');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    removePid();
    console.log(`  ${ui.ok} Bridge stopped (PID ${pid})`);
  } catch (e) {
    // Windows fallback
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      removePid();
      console.log(`  ${ui.ok} Bridge stopped (PID ${pid})`);
    } catch {
      console.error(`  ${ui.fail} Could not stop PID ${pid}: ${e.message}`);
    }
  }
}

function cmdStatus() {
  const cfg = loadConfig();
  if (!cfg) {
    console.log('  Not paired. Run the install script from voiceclaw.io/setup');
    return;
  }

  const pid = loadPid();
  const running = pid && isRunning(pid);

  ui.banner(VERSION);
  console.log(`  Status:     ${running ? ui.green('Running') + ` (PID ${pid})` : ui.dim('Stopped')}`);
  console.log(`  Bridge ID:  ${cfg.bridgeId}`);
  console.log(`  Backend:    ${cfg.gatewayType} (${cfg.gatewayUrl})`);
  console.log(`  Voice STT:  ${cfg.groqKey ? ui.green('Configured') : ui.yellow('Not set')}`);
  console.log(`  Voice TTS:  ${cfg.openaiKey ? ui.green('Configured') : ui.yellow('Not set')}`);
  console.log(`  Paired:     ${new Date(cfg.pairedAt).toLocaleDateString()}`);
  console.log(`  Config:     ${CONFIG_PATH}`);
  console.log('');
}

async function cmdConfig() {
  const cfg = loadConfig();
  if (!cfg) {
    console.log('  Not paired yet. Run the install script from voiceclaw.io/setup');
    process.exit(1);
  }

  ui.banner(VERSION);
  console.log(`  ${ui.bold('Current config:')}`);
  console.log(`  Backend: ${cfg.gatewayType} (${cfg.gatewayUrl})`);
  console.log(`  OpenAI key (TTS): ${cfg.openaiKey ? ui.green('set') : ui.yellow('not set')}`);
  console.log(`  Groq key (STT):   ${cfg.groqKey ? ui.green('set') : ui.yellow('not set')}`);
  console.log('');

  const action = await ui.selectMenu('What to configure?', [
    { label: 'OpenAI key', hint: '(text-to-speech)', value: 'openai' },
    { label: 'Groq key', hint: '(speech-to-text)', value: 'groq' },
    { label: 'Change backend', hint: '', value: 'backend' },
    { label: 'Done', hint: '', value: 'done' },
  ]);

  if (action === 'openai') {
    console.log(`\n  ${ui.dim('Get a key at: https://platform.openai.com/api-keys')}`);
    const key = await ui.prompt('OpenAI API Key: ');
    if (key) { cfg.openaiKey = key; saveConfig(cfg); console.log(`  ${ui.ok} Saved`); }
  } else if (action === 'groq') {
    console.log(`\n  ${ui.dim('Get a key at: https://console.groq.com/keys')}`);
    const key = await ui.prompt('Groq API Key: ');
    if (key) { cfg.groqKey = key; saveConfig(cfg); console.log(`  ${ui.ok} Saved`); }
  } else if (action === 'backend') {
    const found = await detectLocalLLMs();
    const options = [
      ...found.map(b => ({ label: b.label, hint: `(${b.url})`, value: b })),
      ...CLOUD_BACKENDS.map(b => ({ label: b.label, hint: '(cloud)', value: b })),
    ];
    const sel = await ui.selectMenu('Pick backend:', options);
    let token = sel.token || '';
    if (sel.needsToken && !token) {
      token = await ui.prompt(`${sel.label} token: `);
    }
    cfg.gatewayType = sel.type;
    cfg.gatewayUrl = (sel.url || '').replace(/\/$/, '');
    cfg.gatewayToken = sel.isAnthropic ? '' : token;
    if (sel.isAnthropic) cfg.anthropicKey = token;
    saveConfig(cfg);
    console.log(`  ${ui.ok} Backend updated to ${sel.label}`);
  }

  console.log('');
}

function cmdUnpair() {
  // Stop if running
  const pid = loadPid();
  if (pid && isRunning(pid)) {
    try { process.kill(pid, 'SIGTERM'); } catch {}
    removePid();
  }

  try { fs.unlinkSync(CONFIG_PATH); } catch {}
  removePid();
  console.log(`  ${ui.ok} Unpaired. Config deleted.`);
}

/* ── Manual backend picker (no local AI found) ──────── */

async function pickBackendManual() {
  const options = [
    { label: 'OpenClaw',   hint: '(127.0.0.1:18789)', value: { type: 'openclaw',  url: 'http://127.0.0.1:18789', needsToken: true } },
    { label: 'Ollama',     hint: '(127.0.0.1:11434)', value: { type: 'ollama',    url: 'http://127.0.0.1:11434', needsToken: false } },
    { label: 'LM Studio',  hint: '(127.0.0.1:1234)',  value: { type: 'lmstudio',  url: 'http://127.0.0.1:1234',  needsToken: false } },
    ...CLOUD_BACKENDS.map(b => ({
      label: b.label,
      hint: '(cloud)',
      value: { type: b.type, url: b.url, needsToken: b.needsToken, isAnthropic: b.isAnthropic },
    })),
  ];

  const selected = await ui.selectMenu('Pick your AI backend:', options);

  if (selected.needsToken) {
    if (selected.type === 'openclaw') {
      const ocConfig = loadOpenClawConfig();
      if (ocConfig?.token) {
        console.log(`  ${ui.ok} Auto-detected OpenClaw token`);
        selected.token = ocConfig.token;
        if (ocConfig.port) selected.url = `http://127.0.0.1:${ocConfig.port}`;
      } else {
        selected.token = await ui.prompt('OpenClaw gateway token: ');
      }
    } else {
      const label = CLOUD_BACKENDS.find(b => b.type === selected.type)?.tokenPrompt || 'API key: ';
      selected.token = await ui.prompt(label);
    }
  }

  return selected;
}

/* ── Help ───────────────────────────────────────────── */

function printHelp() {
  const cmd = 'node ~/.voiceclaw/cli.js';
  console.log(`
  ${ui.bold('VoiceClaw Bridge')} ${ui.dim(`v${VERSION}`)}

  ${ui.bold('Usage:')}
    ${cmd} VC-XXXX-XXXX    Pair and start bridge
    ${cmd}                  Start with saved config
    ${cmd} --daemon         Run in background
    ${cmd} stop             Stop background bridge
    ${cmd} status           Show bridge info
    ${cmd} config           Edit settings (voice keys, backend)
    ${cmd} unpair           Delete config and stop

  ${ui.bold('First time?')}
    1. Open voiceclaw.io on your phone
    2. Copy the pair code
    3. Run the install command shown on the setup page

  ${ui.dim('https://github.com/Vladib80/voice-claw')}
`);
}
