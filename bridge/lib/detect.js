'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BACKENDS = [
  { type: 'openclaw',  port: 18789, probe: '/v1/models',  label: 'OpenClaw',   needsToken: true  },
  { type: 'ollama',    port: 11434, probe: '/api/tags',    label: 'Ollama',     needsToken: false },
  { type: 'lmstudio',  port: 1234,  probe: '/v1/models',  label: 'LM Studio',  needsToken: false },
];

/**
 * Try connecting to a local port. Resolves true if HTTP response (any status), false on timeout/error.
 */
function probePort(port, probePath, timeout = 2000) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: probePath, method: 'GET', timeout }, (res) => {
      res.resume(); // drain
      resolve(true); // any HTTP response means something is listening
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/**
 * Load OpenClaw config from ~/.openclaw/openclaw.json
 * Returns { token, port } or null
 */
function loadOpenClawConfig() {
  try {
    const ocPath = path.join(os.homedir(), '.openclaw', 'openclaw.json');
    const cfg = JSON.parse(fs.readFileSync(ocPath, 'utf8'));
    return {
      token: cfg?.gateway?.auth?.token || '',
      port: cfg?.gateway?.port || 18789,
    };
  } catch { return null; }
}

/**
 * Scan for local LLMs. Returns array of detected backends.
 * Each entry: { type, label, url, port, needsToken, token? }
 */
async function detectLocalLLMs() {
  const ocConfig = loadOpenClawConfig();

  // If OpenClaw config says a different port, update it
  const targets = BACKENDS.map(b => {
    if (b.type === 'openclaw' && ocConfig?.port) {
      return { ...b, port: ocConfig.port };
    }
    return b;
  });

  const results = await Promise.allSettled(
    targets.map(async (b) => {
      const alive = await probePort(b.port, b.probe);
      return alive ? b : null;
    })
  );

  const found = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      const b = r.value;
      const entry = {
        type: b.type,
        label: b.label,
        url: `http://127.0.0.1:${b.port}`,
        port: b.port,
        needsToken: b.needsToken,
      };
      // Attach OpenClaw auto-config
      if (b.type === 'openclaw' && ocConfig?.token) {
        entry.token = ocConfig.token;
        entry.autoConfigured = true;
      }
      found.push(entry);
    }
  }

  return found;
}

// Cloud backends for manual fallback
const CLOUD_BACKENDS = [
  { type: 'anthropic',  label: 'Claude',      url: 'https://api.anthropic.com', needsToken: true, isAnthropic: true,  tokenPrompt: 'Anthropic API Key (sk-ant-...): ' },
  { type: 'openrouter', label: 'OpenRouter',   url: 'https://openrouter.ai/api', needsToken: true, isAnthropic: false, tokenPrompt: 'OpenRouter API Key (sk-or-v1-...): ' },
  { type: 'openai',     label: 'OpenAI',       url: 'https://api.openai.com',    needsToken: true, isAnthropic: false, tokenPrompt: 'OpenAI API Key (sk-proj-...): ' },
];

module.exports = { detectLocalLLMs, loadOpenClawConfig, CLOUD_BACKENDS, BACKENDS };
