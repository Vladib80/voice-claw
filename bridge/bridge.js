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

  // Backend selection
  console.log('\n── AI Backend ──');
  console.log('Pick the LLM that will power your voice conversations:\n');
  console.log('  1) OpenClaw   (local, http://127.0.0.1:18789)  [default]');
  console.log('  2) Ollama     (local, http://127.0.0.1:11434)');
  console.log('  3) LM Studio  (local, http://127.0.0.1:1234)');
  console.log('  4) Claude     (cloud, Anthropic API)');
  console.log('  5) OpenRouter (cloud, 100+ models)');
  console.log('  6) OpenAI     (cloud, GPT-4o, o1)');
  console.log('  7) Custom URL');
  let backendNum = (await prompt('\nChoose backend [1-7, default=1]: ')) || '1';

  const BACKEND_MAP = {
    '1': { type: 'openclaw',   url: 'http://127.0.0.1:18789',    needsToken: true,  isAnthropic: false, tokenPrompt: 'OpenClaw gateway token: ' },
    '2': { type: 'ollama',     url: 'http://127.0.0.1:11434',    needsToken: false, isAnthropic: false },
    '3': { type: 'lmstudio',   url: 'http://127.0.0.1:1234',     needsToken: false, isAnthropic: false },
    '4': { type: 'anthropic',  url: 'https://api.anthropic.com', needsToken: true,  isAnthropic: true,  tokenPrompt: 'Anthropic API Key (sk-ant-...): ' },
    '5': { type: 'openrouter', url: 'https://openrouter.ai/api', needsToken: true,  isAnthropic: false, tokenPrompt: 'OpenRouter API Key (sk-or-v1-...): ' },
    '6': { type: 'openai',     url: 'https://api.openai.com',    needsToken: true,  isAnthropic: false, tokenPrompt: 'OpenAI API Key (sk-proj-...): ' },
    '7': { type: 'custom',     url: null,                         needsToken: false, isAnthropic: false },
  };

  const backend = BACKEND_MAP[backendNum] || BACKEND_MAP['1'];
  let gatewayUrl = backend.url || '';
  let gatewayToken = '';
  let anthropicKey = '';

  // Auto-detect OpenClaw config
  if (backend.type === 'openclaw') {
    const ocPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    let autoToken = '';
    let autoPort = 18789;
    try {
      const ocCfg = JSON.parse(fs.readFileSync(ocPath, 'utf8'));
      autoToken = ocCfg?.gateway?.auth?.token || '';
      autoPort = ocCfg?.gateway?.port || 18789;
    } catch {}
    if (autoToken) {
      console.log(`\n  Auto-detected OpenClaw gateway token from ${ocPath}`);
      gatewayToken = autoToken;
      gatewayUrl = `http://127.0.0.1:${autoPort}`;
      console.log(`  Gateway: ${gatewayUrl}`);
    } else {
      console.log('\n  Could not auto-detect OpenClaw config.');
      gatewayToken = await prompt(backend.tokenPrompt);
    }
  } else if (backend.url === null) {
    gatewayUrl = await prompt('Gateway URL (e.g. http://localhost:8080/v1): ');
    const customToken = await prompt('Auth token (leave blank if none): ');
    if (customToken) gatewayToken = customToken;
  } else if (backend.needsToken) {
    const key = await prompt(backend.tokenPrompt);
    if (backend.isAnthropic) {
      anthropicKey = key;
    } else {
      gatewayToken = key;
    }
  }

  // Voice API keys (separate from the AI backend — used for STT + TTS)
  console.log('\n── Voice API Keys ──');
  console.log('These power speech recognition and text-to-speech, separate from your AI backend.');
  console.log('Get OpenAI key: https://platform.openai.com/api-keys');
  console.log('Get Groq key:   https://console.groq.com/keys\n');
  const openaiKey = await prompt('OpenAI API Key (for text-to-speech): ');
  const groqKey = await prompt('Groq API Key (for speech-to-text): ');

  if (!openaiKey || !groqKey) {
    console.warn('\n⚠️  Missing voice API keys — voice features will not work through bridge.');
    console.warn('   You can re-run "node bridge.js init" to add them later.\n');
  }

  // Close readline AFTER all prompts are done
  rl.close();
  process.stdin.destroy();

  const res = await fetch(`${apiBase}/api/bridge/pair/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pairCode, device: { name: deviceName, os: process.platform, bridgeVersion: '0.2.0' } }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.error || res.statusText;
    if (msg.toLowerCase().includes('expired')) {
      console.error('\n❌ Pair code expired — codes are valid for 10 minutes.');
      console.error('   Go to voiceclaw.io/setup, get a fresh code, then run this command again immediately.\n');
    } else if (msg.toLowerCase().includes('invalid') || res.status === 404) {
      console.error('\n❌ Pair code not found — double-check you typed it correctly.');
      console.error('   Expected format: VC-XXXX-XXXX (letters and numbers, no spaces)\n');
    } else {
      console.error(`\n❌ Pairing failed: ${msg}\n`);
    }
    process.exit(1);
  }

  const config = {
    apiBase,
    bridgeId: data.bridgeId,
    wsToken: data.wsToken,
    scope: data.scope,
    gatewayUrl: gatewayUrl.replace(/\/$/, ''),
    gatewayToken,
    gatewayType: backend.type,
    openaiKey: openaiKey || '',
    groqKey: groqKey || '',
    pairedAt: Date.now(),
  };
  if (anthropicKey) config.anthropicKey = anthropicKey;
  saveConfig(config);

  console.log(`\n✅ Paired: ${data.bridgeId}`);
  console.log(`Backend: ${backend.type}`);
  console.log(`Config saved: ${CONFIG_PATH}`);
}

function wsUrl(apiBase, bridgeId, token) {
  const u = new URL(apiBase);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/api/bridge/ws';
  u.search = `?bridgeId=${encodeURIComponent(bridgeId)}&token=${encodeURIComponent(token)}`;
  return u.toString();
}

async function forwardChatCompletions(cfg, body) {
  // OpenClaw routes by agent ID, not raw model name
  const fwdBody = cfg.gatewayType === 'openclaw'
    ? { ...body, model: 'openclaw:main' }
    : body;

  const res = await fetch(`${cfg.gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.gatewayToken}`,
    },
    body: JSON.stringify(fwdBody),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: `Invalid JSON from gateway: ${text.slice(0, 200)}` }; }
  if (!res.ok) {
    return { ok: false, error: json?.error?.message || json?.error || `Gateway HTTP ${res.status}` };
  }
  return { ok: true, payload: json };
}

async function bridgeTranscribe(cfg, body) {
  if (!cfg.groqKey) return { ok: false, error: 'No Groq API key configured in bridge. Re-run: node bridge.js init' };
  const { audioBase64, mimeType, filename } = body;
  if (!audioBase64) return { ok: false, error: 'No audio data' };

  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const ext = (filename || 'audio.mp4').split('.').pop() || 'mp4';
  const safeFilename = 'audio.' + ext;

  const pre = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename}"\r\nContent-Type: ${mimeType || 'audio/mp4'}\r\n\r\n`
  );
  const modelPart = Buffer.from(
    `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n--${boundary}--\r\n`
  );
  const formBody = Buffer.concat([pre, audioBuffer, modelPart]);

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.groqKey}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body: formBody,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { return { ok: false, error: `Invalid JSON from Groq: ${text.slice(0, 200)}` }; }
  if (!res.ok) return { ok: false, error: json?.error?.message || `Groq HTTP ${res.status}` };
  return { ok: true, text: json.text || '' };
}

async function bridgeTts(cfg, body) {
  if (!cfg.openaiKey) return { ok: false, error: 'No OpenAI API key configured in bridge. Re-run: node bridge.js init' };
  const { text, voice } = body;
  if (!text) return { ok: false, error: 'No text for TTS' };

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'tts-1', input: text, voice: voice || 'onyx', response_format: 'mp3' }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `TTS error ${res.status}`;
    try { msg = JSON.parse(errText).error?.message || msg; } catch {}
    return { ok: false, error: msg };
  }

  const arrayBuf = await res.arrayBuffer();
  const audioBase64 = Buffer.from(arrayBuf).toString('base64');
  return { ok: true, audioBase64 };
}

async function forwardAnthropicMessages(cfg, body) {
  if (!cfg.anthropicKey) return { ok: false, error: 'No Anthropic API key configured. Re-run: node bridge.js init' };

  // Split system message from chat messages (Anthropic uses a top-level system field)
  const messages = body.messages || [];
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');

  const anthropicBody = {
    model: body.model || 'claude-3-5-sonnet-20241022',
    max_tokens: body.max_tokens || 1024,
    messages: chatMessages,
  };
  if (systemMsg) {
    anthropicBody.system = typeof systemMsg.content === 'string'
      ? systemMsg.content
      : systemMsg.content.map(c => c.text || '').join('');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': cfg.anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(anthropicBody),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: { message: `Invalid JSON from Anthropic: ${text.slice(0, 200)}` } }; }

  if (!res.ok) {
    return { ok: false, error: json?.error?.message || json?.error?.type || `Anthropic HTTP ${res.status}` };
  }

  // Convert Anthropic response → OpenAI chat.completion format
  const content = json.content?.[0]?.text || '';
  return {
    ok: true,
    payload: {
      id: json.id || 'chatcmpl-bridge',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: json.model || anthropicBody.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: json.stop_reason === 'end_turn' ? 'stop' : (json.stop_reason || 'stop'),
      }],
      usage: {
        prompt_tokens: json.usage?.input_tokens || 0,
        completion_tokens: json.usage?.output_tokens || 0,
        total_tokens: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0),
      },
    },
  };
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

  let reconnectDelay = 3000;
  const MAX_RECONNECT_DELAY = 30000;

  const connect = () => {
    const url = wsUrl(cfg.apiBase, cfg.bridgeId, cfg.wsToken);
    const ws = new WebSocket(url);

    ws.on('open', () => {
      reconnectDelay = 3000; // reset on successful connect
      console.log(`✅ Bridge connected (${cfg.bridgeId})`);
    });

    ws.on('message', async (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (!msg?.id || msg.type !== 'invoke') return;

      try {
        const kind = msg.payload?.kind;
        const body = msg.payload?.body || {};

        if (kind === 'chatCompletions') {
          const out = cfg.gatewayType === 'anthropic'
            ? await forwardAnthropicMessages(cfg, body)
            : await forwardChatCompletions(cfg, body);
          if (out.ok) {
            ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: true, payload: out.payload }));
          } else {
            ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: false, error: out.error }));
          }

        } else if (kind === 'transcribe') {
          const out = await bridgeTranscribe(cfg, body);
          if (out.ok) {
            ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: true, payload: { text: out.text } }));
          } else {
            ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: false, error: out.error }));
          }

        } else if (kind === 'tts') {
          const out = await bridgeTts(cfg, body);
          if (out.ok) {
            ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: true, payload: { audioBase64: out.audioBase64 } }));
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

    ws.on('close', (code, reason) => {
      const reasonStr = reason?.toString() || '';
      if (code === 1008 && reasonStr.includes('invalid token')) {
        console.error('❌ Server rejected the connection: invalid token.');
        console.error('   Your bridge pairing may have expired (server restarted).');
        console.error('   Fix: re-run "node bridge.js init" to pair again.\n');
        process.exit(1);
      }
      console.log(`Bridge disconnected (code=${code}${reasonStr ? ', ' + reasonStr : ''}). Reconnecting in ${reconnectDelay / 1000}s...`);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
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
