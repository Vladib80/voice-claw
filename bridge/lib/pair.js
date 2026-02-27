'use strict';
const os = require('os');

const VERSION = require('../package.json').version;

/**
 * Complete the pairing with the VoiceClaw server.
 * @param {string} pairCode  e.g. "VC-7M2K-91Q4"
 * @param {string} apiBase   e.g. "https://www.voiceclaw.io"
 * @returns {{ bridgeId: string, wsToken: string, scope: string }}
 */
async function completePairing(pairCode, apiBase) {
  const res = await fetch(`${apiBase}/api/bridge/pair/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pairCode,
      device: {
        name: os.hostname(),
        os: process.platform,
        bridgeVersion: VERSION,
      },
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data.error || res.statusText;
    if (msg.toLowerCase().includes('expired')) {
      throw new Error('Pair code expired — codes last 10 minutes. Get a new one from your phone and try again.');
    }
    if (msg.toLowerCase().includes('invalid') || res.status === 404) {
      throw new Error('Pair code not found — check you typed it correctly (format: VC-XXXX-XXXX).');
    }
    throw new Error(`Pairing failed: ${msg}`);
  }

  return {
    bridgeId: data.bridgeId,
    wsToken: data.wsToken,
    scope: data.scope || 'tools_safe',
  };
}

module.exports = { completePairing };
