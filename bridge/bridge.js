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

  console.log('\n── API Keys (for voice features) ──');
  console.log('Get your OpenAI key at: https://platform.openai.com/api-keys');
  console.log('Get your Groq key at: https://console.groq.com/keys\n');
  const openaiKey = await prompt('OpenAI API Key (for text-to-speech): ');
  const groqKey = await prompt('Groq API Key (for speech-to-text): ');

  if (!openaiKey || !groqKey) {
    console.warn('\n⚠️  Missing API keys — voice features will not work through bridge.');
    console.warn('   You can re-run "node bridge.js init" to add them later.\n');
  }

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

  saveConfig({
    apiBase,
    bridgeId: data.bridgeId,
    wsToken: data.wsToken,
    scope: data.scope,
    gatewayUrl: gatewayUrl.replace(/\/$/, ''),
    gatewayToken,
    openaiKey: openaiKey || '',
    groqKey: groqKey || '',
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
    const url = wsUrl(cfg.apiBase, cfg.wsToken);
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
          const out = await forwardChatCompletions(cfg, body);
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

    ws.on('close', () => {
      console.log(`Bridge disconnected. Reconnecting in ${reconnectDelay / 1000}s...`);
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
