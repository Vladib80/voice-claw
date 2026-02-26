const express = require('express');
const https = require('https');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const http = require('http');

// Keepalive ping
app.get('/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Bridge installer scripts ─────────────────────────────────────────────────
app.get('/install.sh', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.join(__dirname, 'bridge', 'install.sh'));
});

app.get('/install.ps1', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.join(__dirname, 'bridge', 'install.ps1'));
});

app.get('/bridge.js', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.sendFile(path.join(__dirname, 'bridge', 'bridge.js'));
});

// ── BRIDGE PAIRING (v1 in-memory) ───────────────────────────────────────────

const bridgePairs = new Map(); // pairId -> { pairCode, status, expiresAt, device, bridgeId, wsToken }
const bridgeSockets = new Map(); // bridgeId -> ws
const bridgePending = new Map(); // reqId -> { resolve, reject, timer }

const METRICS_DIR = path.join(__dirname, 'data');
const METRICS_FILE = path.join(METRICS_DIR, 'metrics.json');

function defaultMetrics() {
  return {
    pairStarted: 0,
    pairCompleted: 0,
    bridgeConnectedEvents: 0,
    bridgeDisconnectedEvents: 0,
    uniqueBridgeIds: [],
    updatedAt: Date.now(),
  };
}

function loadMetrics() {
  try {
    if (!fs.existsSync(METRICS_FILE)) return defaultMetrics();
    const raw = fs.readFileSync(METRICS_FILE, 'utf8');
    return { ...defaultMetrics(), ...JSON.parse(raw) };
  } catch {
    return defaultMetrics();
  }
}

let metrics = loadMetrics();

function saveMetrics() {
  try {
    if (!fs.existsSync(METRICS_DIR)) fs.mkdirSync(METRICS_DIR, { recursive: true });
    metrics.updatedAt = Date.now();
    fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
  } catch (e) {
    console.error('Metrics save failed:', e.message);
  }
}

function markUniqueBridge(bridgeId) {
  if (!bridgeId) return;
  if (!metrics.uniqueBridgeIds.includes(bridgeId)) {
    metrics.uniqueBridgeIds.push(bridgeId);
    saveMetrics();
  }
}

function requireAdmin(req, res, next) {
  const expected = process.env.VOICECLAW_ADMIN_TOKEN;
  if (!expected) return res.status(500).json({ error: 'VOICECLAW_ADMIN_TOKEN not configured' });
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : (req.headers['x-admin-token'] || req.query.token || '');
  if (token !== expected) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function makePairCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = () => Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `VC-${rand()}-${rand()}`;
}

app.post('/api/bridge/pair/start', (req, res) => {
  const pairId = `pair_${crypto.randomBytes(8).toString('hex')}`;
  const pairCode = makePairCode();
  const expiresAt = Date.now() + 10 * 60 * 1000;
  bridgePairs.set(pairId, { pairCode, status: 'pending', expiresAt, createdAt: Date.now() });
  metrics.pairStarted += 1;
  saveMetrics();
  res.json({ pairId, pairCode, expiresAt });
});

app.get('/api/bridge/pair/status/:pairId', (req, res) => {
  const row = bridgePairs.get(req.params.pairId);
  if (!row) return res.status(404).json({ error: 'Pair not found' });
  if (Date.now() > row.expiresAt && row.status === 'pending') row.status = 'expired';
  const connected = !!(row.bridgeId && bridgeSockets.has(row.bridgeId));
  res.json({
    pairId: req.params.pairId,
    status: row.status,
    connected,
    expiresAt: row.expiresAt,
    bridgeId: row.bridgeId || null,
    device: row.device || null,
  });
});

app.post('/api/bridge/pair/complete', (req, res) => {
  const { pairCode, device } = req.body || {};
  if (!pairCode) return res.status(400).json({ error: 'pairCode required' });

  let targetId = null;
  for (const [id, row] of bridgePairs.entries()) {
    if (row.pairCode === pairCode) {
      targetId = id;
      break;
    }
  }
  if (!targetId) return res.status(404).json({ error: 'Invalid pair code' });

  const row = bridgePairs.get(targetId);
  if (Date.now() > row.expiresAt) {
    row.status = 'expired';
    return res.status(400).json({ error: 'Pair code expired' });
  }

  row.status = 'paired';
  row.device = device || { name: 'Unknown device' };
  row.bridgeId = `br_${crypto.randomBytes(6).toString('hex')}`;

  const wsToken = crypto.randomBytes(24).toString('hex');
  row.wsToken = wsToken;

  metrics.pairCompleted += 1;
  markUniqueBridge(row.bridgeId);
  saveMetrics();

  res.json({ ok: true, pairId: targetId, bridgeId: row.bridgeId, wsToken, scope: 'tools_safe' });
});

app.get('/api/admin/metrics', requireAdmin, (req, res) => {
  res.json({
    pairStarted: metrics.pairStarted,
    pairCompleted: metrics.pairCompleted,
    conversionPct: metrics.pairStarted > 0 ? Number(((metrics.pairCompleted / metrics.pairStarted) * 100).toFixed(1)) : 0,
    uniqueBridges: metrics.uniqueBridgeIds.length,
    bridgeConnectedEvents: metrics.bridgeConnectedEvents,
    bridgeDisconnectedEvents: metrics.bridgeDisconnectedEvents,
    onlineNow: bridgeSockets.size,
    pendingPairsNow: Array.from(bridgePairs.values()).filter(p => p.status === 'pending' && p.expiresAt > Date.now()).length,
    updatedAt: metrics.updatedAt,
  });
});

function invokeBridge(bridgeId, kind, body) {
  return new Promise((resolve, reject) => {
    const ws = bridgeSockets.get(bridgeId);
    if (!ws || ws.readyState !== 1) return reject(new Error('Bridge offline'));

    const id = `req_${crypto.randomBytes(8).toString('hex')}`;
    const timer = setTimeout(() => {
      bridgePending.delete(id);
      reject(new Error('Bridge timeout'));
    }, 15000);

    bridgePending.set(id, { resolve, reject, timer });

    ws.send(JSON.stringify({
      id,
      type: 'invoke',
      payload: { kind, body },
    }));
  });
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function httpsPost(hostname, path_, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = {
      hostname, path: path_, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// Supports both http:// and https:// gateway URLs
function gatewayPost(gatewayUrl, path_, token, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const parsed = new URL(gatewayUrl + path_);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'Authorization': `Bearer ${token}`,
      },
    };
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Gateway timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

// ── POST /api/gateway-test ───────────────────────────────────────────────────

app.post('/api/gateway-test', async (req, res) => {
  const { url, token } = req.body;
  if (!url || !token) return res.status(400).json({ error: 'url and token required' });
  try {
    const result = await gatewayPost(url, '/v1/chat/completions', token, {
      model: 'claude-sonnet-4-6',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'say ok' }],
    });
    if (result.status === 200 || result.status === 201) {
      return res.json({ ok: true });
    }
    const body = result.raw.toString();
    return res.status(400).json({ error: `Gateway returned ${result.status}: ${body.slice(0, 120)}` });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// ── POST /api/transcribe ─────────────────────────────────────────────────────

const Busboy = require('busboy');

app.post('/api/transcribe', (req, res) => {
  const bb = Busboy({ headers: req.headers, limits: { fileSize: 25 * 1024 * 1024 } });
  const chunks = [];
  let filename = 'audio.mp4';
  let mimetype = 'audio/mp4';

  bb.on('file', (name, file, info) => {
    filename = info.filename || filename;
    mimetype = info.mimeType || mimetype;
    file.on('data', d => chunks.push(d));
  });

  bb.on('finish', async () => {
    try {
      const audioBuffer = Buffer.concat(chunks);
      const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
      const ext = filename.split('.').pop() || 'mp4';
      const safeFilename = 'audio.' + ext;

      // Build multipart body manually
      const pre = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename}"\r\nContent-Type: ${mimetype}\r\n\r\n`
      );
      const model = Buffer.from(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n--${boundary}--\r\n`
      );
      const body = Buffer.concat([pre, audioBuffer, model]);

      const result = await new Promise((resolve, reject) => {
        const opts = {
          hostname: 'api.groq.com',
          path: '/openai/v1/audio/transcriptions',
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        };
        const req2 = https.request(opts, (r) => {
          const cs = [];
          r.on('data', c => cs.push(c));
          r.on('end', () => resolve({ status: r.statusCode, raw: Buffer.concat(cs) }));
        });
        req2.on('error', reject);
        req2.write(body);
        req2.end();
      });

      const json = JSON.parse(result.raw.toString());
      if (json.error) return res.status(500).json({ error: json.error.message });

      // Filter Whisper hallucinations (silence → "Thank you" etc.)
      const HALLUCINATIONS = [
        'thank you', 'thanks', 'you', 'thank you.', 'thanks.',
        'bye', 'bye.', 'goodbye', 'see you', 'okay', 'ok',
        'thank you very much', 'thanks a lot', 'sure', '.',
        'thank you for watching', 'thanks for watching',
        'please subscribe', 'like and subscribe',
        'the end', 'silence', 'so', 'um', 'uh',
      ];
      const trimmed = (json.text || '').trim().toLowerCase();
      if (trimmed.length < 3 || HALLUCINATIONS.includes(trimmed)) {
        return res.json({ text: '', skipped: true });
      }

      res.json({ text: json.text });
    } catch (err) {
      console.error('Transcribe error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  req.pipe(bb);
});

// ── POST /api/respond ────────────────────────────────────────────────────────

const YURIK_SYSTEM_PROMPT = `You are VoiceClaw, an AI voice assistant. Keep responses SHORT and conversational — this is a voice call, not a chat. 2-3 sentences max unless the user asks to go deeper. No bullet points, no markdown — just natural speech that sounds good out loud.`;

app.post('/api/respond', async (req, res) => {
  try {
    const { text, history, voice: rawVoice, gatewayUrl, gatewayToken, bridgeId } = req.body;
    const VALID_VOICES = ['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'];
    const voice = VALID_VOICES.includes(rawVoice) ? rawVoice : 'onyx';
    if (!text?.trim()) return res.status(400).json({ error: 'No text' });

    const messages = [
      { role: 'system', content: YURIK_SYSTEM_PROMPT },
      ...(history || []).slice(-20),
      { role: 'user', content: text },
    ];

    let responseText;

    // 1. LLM — prefer Bridge, then direct gateway, then fallback OpenAI
    if (bridgeId) {
      const br = await invokeBridge(bridgeId, 'chatCompletions', {
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages,
      });
      if (br.error) throw new Error('Bridge: ' + br.error);
      responseText = br.choices?.[0]?.message?.content || br.output_text || '';
      if (!responseText) throw new Error('Bridge returned empty response');
    } else if (gatewayUrl && gatewayToken) {
      const gwResult = await gatewayPost(gatewayUrl, '/v1/chat/completions', gatewayToken, {
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        messages,
      });
      const gwJson = JSON.parse(gwResult.raw.toString());
      if (gwJson.error) throw new Error('Gateway: ' + (gwJson.error.message || JSON.stringify(gwJson.error)));
      responseText = gwJson.choices[0].message.content;
    } else {
      const chatResult = await httpsPost(
        'api.openai.com', '/v1/chat/completions',
        { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        { model: 'gpt-4o', max_tokens: 300, messages }
      );
      const chatJson = JSON.parse(chatResult.raw.toString());
      if (chatJson.error) throw new Error('OpenAI: ' + chatJson.error.message);
      responseText = chatJson.choices[0].message.content;
    }

    // 2. TTS onyx
    const ttsBodyStr = JSON.stringify({ model: 'tts-1', input: responseText, voice, response_format: 'mp3' });
    const audioBase64 = await new Promise((resolve, reject) => {
      const opts = {
        hostname: 'api.openai.com', path: '/v1/audio/speech', method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(ttsBodyStr),
        },
      };
      const req2 = https.request(opts, (r) => {
        const cs = [];
        r.on('data', c => cs.push(c));
        r.on('end', () => {
          if (r.statusCode !== 200) return reject(new Error('TTS error ' + r.statusCode));
          resolve(Buffer.concat(cs).toString('base64'));
        });
      });
      req2.on('error', reject);
      req2.write(ttsBodyStr);
      req2.end();
    });

    res.json({ text: responseText, audio: audioBase64 });
  } catch (err) {
    console.error('Respond error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Static frontend ──────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

const wss = new WebSocketServer({ server, path: '/api/bridge/ws' });

wss.on('connection', (ws, req) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(1008, 'missing token');
      return;
    }

    let matched = null;
    for (const row of bridgePairs.values()) {
      if (row.wsToken === token) {
        matched = row;
        break;
      }
    }

    if (!matched?.bridgeId) {
      ws.close(1008, 'invalid token');
      return;
    }

    bridgeSockets.set(matched.bridgeId, ws);
    metrics.bridgeConnectedEvents += 1;
    markUniqueBridge(matched.bridgeId);
    saveMetrics();

    ws.on('message', (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        if (!msg?.id || msg.type !== 'result') return;
        const pending = bridgePending.get(msg.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        bridgePending.delete(msg.id);
        if (msg.ok) pending.resolve(msg.payload || {});
        else pending.reject(new Error(msg.error || 'Bridge invoke failed'));
      } catch {}
    });

    ws.on('close', () => {
      if (bridgeSockets.get(matched.bridgeId) === ws) {
        bridgeSockets.delete(matched.bridgeId);
      }
      metrics.bridgeDisconnectedEvents += 1;
      saveMetrics();
    });
  } catch {
    ws.close(1011, 'server error');
  }
});

server.listen(PORT, () => console.log(`VoiceClaw running on port ${PORT}`));
