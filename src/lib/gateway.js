const KEY = 'voiceclaw_gateway';
const BRIDGE_KEY = 'voiceclaw_bridge';

export function getGateway() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setGateway(url, token) {
  const normalized = url.replace(/\/$/, '');
  localStorage.setItem(KEY, JSON.stringify({ url: normalized, token }));
}

export function clearGateway() {
  localStorage.removeItem(KEY);
}

export function setBridge(bridgeId) {
  localStorage.setItem(BRIDGE_KEY, JSON.stringify({ bridgeId, pairedAt: Date.now() }));
}

export function getBridge() {
  try {
    const raw = localStorage.getItem(BRIDGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearBridge() {
  localStorage.removeItem(BRIDGE_KEY);
}

const API_KEYS_KEY = 'voiceclaw_api_keys';

export function setApiKeys(openaiKey, groqKey) {
  localStorage.setItem(API_KEYS_KEY, JSON.stringify({ openaiKey, groqKey }));
}

export function getApiKeys() {
  try {
    const raw = localStorage.getItem(API_KEYS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function clearApiKeys() {
  localStorage.removeItem(API_KEYS_KEY);
}

export function isConnected() {
  const gw = getGateway();
  const br = getBridge();
  return !!((gw?.url && gw?.token) || br?.bridgeId);
}
