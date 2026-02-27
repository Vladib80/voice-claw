'use strict';
const WebSocket = require('ws');

/* ── Helpers ─────────────────────────────────────────── */

function wsUrl(apiBase, bridgeId, token) {
  const u = new URL(apiBase);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/api/bridge/ws';
  u.search = `?bridgeId=${encodeURIComponent(bridgeId)}&token=${encodeURIComponent(token)}`;
  return u.toString();
}

/* ── Request Handlers ────────────────────────────────── */

async function forwardChatCompletions(cfg, body) {
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
  if (!res.ok) return { ok: false, error: json?.error?.message || json?.error || `Gateway HTTP ${res.status}` };
  return { ok: true, payload: json };
}

async function forwardAnthropicMessages(cfg, body) {
  if (!cfg.anthropicKey) return { ok: false, error: 'No Anthropic API key configured. Run: voiceclaw config' };

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
  try { json = JSON.parse(text); } catch { json = { error: { message: `Invalid JSON: ${text.slice(0, 200)}` } }; }
  if (!res.ok) return { ok: false, error: json?.error?.message || json?.error?.type || `Anthropic HTTP ${res.status}` };

  const content = json.content?.[0]?.text || '';
  return {
    ok: true,
    payload: {
      id: json.id || 'chatcmpl-bridge',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: json.model || anthropicBody.model,
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: json.stop_reason === 'end_turn' ? 'stop' : (json.stop_reason || 'stop') }],
      usage: { prompt_tokens: json.usage?.input_tokens || 0, completion_tokens: json.usage?.output_tokens || 0, total_tokens: (json.usage?.input_tokens || 0) + (json.usage?.output_tokens || 0) },
    },
  };
}

async function bridgeTranscribe(cfg, body) {
  if (!cfg.groqKey) return { ok: false, error: 'No Groq API key configured. Run: voiceclaw config' };
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
  if (!cfg.openaiKey) return { ok: false, error: 'No OpenAI API key configured. Run: voiceclaw config' };
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

/* ── Main Bridge ─────────────────────────────────────── */

/**
 * Start the WebSocket bridge.
 * @param {object} cfg - Bridge config from ~/.voiceclaw/bridge.json
 * @param {object} opts
 * @param {function} opts.onConnect    - called when WS connects
 * @param {function} opts.onDisconnect - called with (code, reason) on WS close
 * @param {function} opts.onError      - called with (error) on WS error
 * @param {function} opts.onInvoke     - called with (kind) on each invoke
 * @param {function} opts.onFatal      - called when bridge should exit (e.g. invalid token)
 * @returns {{ stop: function }}
 */
function startBridge(cfg, opts = {}) {
  let reconnectDelay = 3000;
  const MAX_DELAY = 30000;
  let ws = null;
  let stopped = false;
  let reconnectTimer = null;
  let pingTimer = null;

  const connect = () => {
    if (stopped) return;
    const url = wsUrl(cfg.apiBase, cfg.bridgeId, cfg.wsToken);
    ws = new WebSocket(url);

    ws.on('open', () => {
      reconnectDelay = 3000;
      if (opts.onConnect) opts.onConnect();

      // Keepalive ping every 30s
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.ping();
      }, 30000);
    });

    ws.on('message', async (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (!msg?.id || msg.type !== 'invoke') return;

      if (opts.onInvoke) opts.onInvoke(msg.payload?.kind);

      try {
        const kind = msg.payload?.kind;
        const body = msg.payload?.body || {};
        let out;

        if (kind === 'chatCompletions') {
          out = cfg.gatewayType === 'anthropic'
            ? await forwardAnthropicMessages(cfg, body)
            : await forwardChatCompletions(cfg, body);
          if (out.ok) ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: true, payload: out.payload }));
          else ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: false, error: out.error }));

        } else if (kind === 'transcribe') {
          out = await bridgeTranscribe(cfg, body);
          if (out.ok) ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: true, payload: { text: out.text } }));
          else ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: false, error: out.error }));

        } else if (kind === 'tts') {
          out = await bridgeTts(cfg, body);
          if (out.ok) ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: true, payload: { audioBase64: out.audioBase64 } }));
          else ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: false, error: out.error }));

        } else {
          ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: false, error: 'Unsupported invoke kind' }));
        }
      } catch (e) {
        try { ws.send(JSON.stringify({ id: msg.id, type: 'result', ok: false, error: e.message })); } catch {}
      }
    });

    ws.on('close', (code, reason) => {
      clearInterval(pingTimer);
      if (stopped) return;

      const reasonStr = reason?.toString() || '';

      // Fatal: invalid token means re-pair needed
      if (code === 1008 && reasonStr.includes('invalid token')) {
        if (opts.onFatal) opts.onFatal('Server rejected connection: invalid token. Re-pair with a new code.');
        return;
      }

      if (opts.onDisconnect) opts.onDisconnect(code, reasonStr);
      reconnectTimer = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    });

    ws.on('error', (err) => {
      if (opts.onError) opts.onError(err);
    });
  };

  connect();

  return {
    stop() {
      stopped = true;
      clearTimeout(reconnectTimer);
      clearInterval(pingTimer);
      if (ws) {
        try { ws.close(1000, 'bridge stopped'); } catch {}
      }
    },
  };
}

module.exports = { startBridge };
