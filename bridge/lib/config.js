'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_DIR  = path.join(os.homedir(), '.voiceclaw');
const CONFIG_PATH = path.join(CONFIG_DIR, 'bridge.json');
const PID_PATH    = path.join(CONFIG_DIR, 'bridge.pid');
const LOG_PATH    = path.join(CONFIG_DIR, 'bridge.log');

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch { return null; }
}

function saveConfig(config) {
  ensureDir();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function configExists() {
  return fs.existsSync(CONFIG_PATH);
}

function loadPid() {
  try {
    const raw = fs.readFileSync(PID_PATH, 'utf8').trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch { return null; }
}

function savePid(pid) {
  ensureDir();
  fs.writeFileSync(PID_PATH, String(pid));
}

function removePid() {
  try { fs.unlinkSync(PID_PATH); } catch {}
}

function isRunning(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

module.exports = {
  CONFIG_DIR, CONFIG_PATH, PID_PATH, LOG_PATH,
  ensureDir, loadConfig, saveConfig, configExists,
  loadPid, savePid, removePid, isRunning,
};
