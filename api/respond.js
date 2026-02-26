// Vercel serverless function — CommonJS
const https = require('https');

const YURIK_SYSTEM_PROMPT = `You are VoiceClaw, an AI voice assistant. Keep responses SHORT and conversational — this is a voice call, not a chat. 2-3 sentences max unless asked for more. No markdown, no lists, no asterisks. Just natural speech.`;

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    const opts = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        resolve({ status: res.statusCode, raw });
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function callGPT(text, history) {
  const messages = [
    { role: 'system', content: YURIK_SYSTEM_PROMPT },
    ...(history || []).slice(-20),
    { role: 'user', content: text },
  ];

  const body = {
    model: 'gpt-4o',
    max_tokens: 300,
    messages,
  };

  const result = await httpsPost(
    'api.openai.com',
    '/v1/chat/completions',
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body
  );

  const json = JSON.parse(result.raw.toString());
  if (json.error) throw new Error('OpenAI error: ' + json.error.message);
  return json.choices[0].message.content;
}

async function callOpenAITTS(text) {
  const body = {
    model: 'tts-1',
    input: text,
    voice: 'onyx',
    response_format: 'mp3',
  };

  const bodyStr = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.openai.com',
      path: '/v1/audio/speech',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode !== 200) {
          const errBody = Buffer.concat(chunks).toString();
          reject(new Error(`OpenAI TTS error ${res.statusCode}: ${errBody}`));
          return;
        }
        const audioBuffer = Buffer.concat(chunks);
        resolve(audioBuffer.toString('base64'));
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error('Invalid JSON body')); }
      });
      req.on('error', reject);
    });

    const { text, history } = body;
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'No text provided' });
      return;
    }

    // 1. Get GPT-4o response
    const responseText = await callGPT(text, history);

    // 2. Convert to speech
    const audioBase64 = await callOpenAITTS(responseText);

    res.status(200).json({ text: responseText, audio: audioBase64 });
  } catch (err) {
    console.error('Respond error:', err);
    res.status(500).json({ error: err.message });
  }
};
