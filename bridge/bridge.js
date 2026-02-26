#!/usr/bin/env node
/* VoiceClaw Bridge v2 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const WebSocket = require('ws');

const CONFIG_DIR = path.join(os.homedir(), '.voiceclaw');
const CONFIG_PATH = path.join(CONFIG_DIR, 'bridge.json');

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function makePrompt(rl) {
  return (question) => new Promise((resolve) => rl.question(question, (answer) => resolve(answer.trim())));
}

async function init() {
  const apiBase = process.env.VOICECLAW_API_BASE || 'https://www.voiceclaw.io';
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = makePrompt(rl);
  const pairCode = (await prompt('Enter VoiceClaw pair code (VC-XXXX-XXXX): ')).toUpperCase();
  const deviceName = await prompt('Device name (optional): ') || os.hostname();
  rl.close();
  process.stdin.destroy();
  const gatewayUrl = 'http://127.0.0.1:18789';
  const gatewayToken = '';

  const res = await fetch(`${apiBase}/api/bridge/pair/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairCode, device: { name: deviceName, os: process.platform, bridgeVersion: '0.2.0' } }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('Pairing failed:', data.error || res.statusText);
    process.exit(1);
  }

  saveConfig({
    apiBase,
    bridgeId: data.bridgeId,
    wsToken: data.wsToken,
    scope: data.scope,
    gatewayUrl: gatewayUrl.replace(/\/$/, ''),
    gatewayToken,
    pairedAt: Date.now(),
  });

  console.log(`✅ Paired: ${data.bridgeId}`);
  console.log(`Config saved: ${CONFIG_PATH}`);
}

function wsUrl(apiBase, token) {
  const u = new URL(apiBase);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/api/bridge/ws';
  u.search = `?token=${encodeURIComponent(token)}`;
  return u.toString();
}

async function forwardChatCompletions(cfg, body) {
  const res = await fetch(`${cfg.gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.gatewayToken}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: `Invalid JSON from gateway: ${text.slice(0, 200)}` }; }
  if (!res.ok) {
    return { ok: false, error: json?.error?.message || json?.error || `Gateway HTTP ${res.status}` };
  }
  return { ok: true, payload: json };
}

function run() {
  const cfg = loadConfig();
  if (!cfg) {
    console.error('Bridge not initialized. Run: node bridge.js init');
    process.exit(1);
  }
  if (!cfg.gatewayUrl) {
    console.error('Missing gateway URL. Re-run: node bridge.js init');
    process.exit(1);
  }

  const connect = () => {
    const url = wsUrl(cfg.apiBase, cfg.wsToken);
    const ws = new WebSocket(url);

    ws.on('open', () => {
      console.log(`✅ Bridge connected (${cfg.bridgeId})`);
    });

    ws.on('message', async (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (!msg?.id || msg.type !== 'invoke') return;

      try {
        if (msg.payload?.kind === 'chatCompletions') {
          const out = await forwardChatCompletions(cfg, msg.payload.body || {});
          if (out.ok) {
            ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: true, payload: out.payload }));
          } else {
            ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: false, error: out.error }));
          }
        } else {
          ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: false, error: 'Unsupported invoke kind' }));
        }
      } catch (e) {
        ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: false, error: e.message }));
      }
    });

    ws.on('close', () => {
      console.log('Bridge disconnected. Reconnecting in 3s...');
      setTimeout(connect, 3000);
    });

    ws.on('error', (err) => {
      console.error('WS error:', err.message);
    });
  };

  connect();
}

function status() {
  const cfg = loadConfig();
  if (!cfg) return console.log('Not initialized');
  console.log(JSON.stringify(cfg, null, 2));
}

const cmd = process.argv[2];
if (cmd === 'init') init().catch((e) => { console.error(e.message); process.exit(1); });
else if (cmd === 'run') run();
else if (cmd === 'status') status();
else {
  console.log('Usage: node bridge.js <init|run|status>');
}
