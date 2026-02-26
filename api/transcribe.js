// Vercel serverless function — CommonJS
const https = require('https');
const http = require('http');
const { Readable } = require('stream');

// Parse multipart/form-data manually (no external deps needed for simple case)
// We use a lightweight approach: read the raw body, extract the file bytes
async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      if (!boundaryMatch) {
        reject(new Error('No boundary in multipart'));
        return;
      }
      const boundary = '--' + boundaryMatch[1];
      const boundaryBuf = Buffer.from(boundary);

      // Find parts
      let start = body.indexOf(boundaryBuf);
      const parts = [];
      while (start !== -1) {
        const end = body.indexOf(boundaryBuf, start + boundaryBuf.length);
        if (end === -1) break;
        const part = body.slice(start + boundaryBuf.length, end);
        // Skip \r\n at start and end
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const headers = part.slice(2, headerEnd).toString();
          const data = part.slice(headerEnd + 4, part.length - 2); // trim trailing \r\n
          const nameMatch = headers.match(/name="([^"]+)"/);
          const filenameMatch = headers.match(/filename="([^"]+)"/);
          const ctMatch = headers.match(/Content-Type:\s*(.+)/i);
          parts.push({
            name: nameMatch ? nameMatch[1] : '',
            filename: filenameMatch ? filenameMatch[1] : '',
            contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
            data,
          });
        }
        start = end;
      }
      resolve(parts);
    });
    req.on('error', reject);
  });
}

// Send multipart to Groq
function postToGroq(audioBuffer, filename, mimeType) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

    const modelPart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n`
    );
    const responseFormatPart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`
    );
    const languagePart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nru\r\n`
    );
    const fileHeader = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`);

    const body = Buffer.concat([modelPart, responseFormatPart, languagePart, fileHeader, audioBuffer, fileFooter]);

    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(raw);
          resolve(json);
        } catch (e) {
          reject(new Error('Groq parse error: ' + raw));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
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
    const parts = await parseMultipart(req);
    const filePart = parts.find((p) => p.name === 'audio');
    if (!filePart) {
      res.status(400).json({ error: 'No audio field in form' });
      return;
    }

    // Determine filename/mime for Groq
    const ext = filePart.filename.includes('mp4') ? 'mp4' : 'webm';
    const mime = ext === 'mp4' ? 'audio/mp4' : 'audio/webm';
    const filename = `audio.${ext}`;

    const groqResult = await postToGroq(filePart.data, filename, mime);

    if (groqResult.error) {
      console.error('Groq error:', groqResult.error);
      res.status(500).json({ error: groqResult.error.message || 'Groq error' });
      return;
    }

    res.status(200).json({ text: groqResult.text || '' });
  } catch (err) {
    console.error('Transcribe error:', err);
    res.status(500).json({ error: err.message });
  }
};
