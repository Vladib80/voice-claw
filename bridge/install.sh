#!/usr/bin/env bash
set -euo pipefail

PAIR_CODE="${1:-}"
API_BASE="${VOICECLAW_API_BASE:-https://www.voiceclaw.io}"
# Note: bare voiceclaw.io doesn't resolve — always use www
BRIDGE_DIR="$HOME/.voiceclaw"

echo ""
echo "  VoiceClaw Bridge Installer"
echo "  =========================="
echo ""

# ── Check Node.js ──────────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "  ❌  Node.js not found."
  echo "     Install Node 18+ from https://nodejs.org and retry."
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "  ❌  Node.js $NODE_VER is too old. Need 18+."
  echo "     Update from https://nodejs.org"
  exit 1
fi
echo "  ✅  Node.js $NODE_VER"

# ── Check npm ──────────────────────────────────────────────────────────────────
if ! command -v npm >/dev/null 2>&1; then
  echo "  ❌  npm not found. It should come with Node.js."
  exit 1
fi

# ── Create directories ─────────────────────────────────────────────────────────
mkdir -p "$BRIDGE_DIR/lib"

# ── Download bridge files ──────────────────────────────────────────────────────
echo "  ⬇️   Downloading bridge..."

FILES="cli.js package.json lib/config.js lib/detect.js lib/pair.js lib/bridge.js lib/ui.js"
for f in $FILES; do
  curl -fsSL "$API_BASE/bridge/$f" -o "$BRIDGE_DIR/$f"
done

echo "  ✅  Downloaded to $BRIDGE_DIR"

# ── Install dependencies ──────────────────────────────────────────────────────
cd "$BRIDGE_DIR"
npm install --silent 2>/dev/null
echo "  ✅  Dependencies installed"

# ── If no pair code, prompt ────────────────────────────────────────────────────
if [ -z "$PAIR_CODE" ]; then
  echo ""
  echo "  Enter the pair code from your phone:"
  read -rp "  > " PAIR_CODE
  if [ -z "$PAIR_CODE" ]; then
    echo "  ❌  No pair code entered."
    exit 1
  fi
fi

# ── Run bridge ─────────────────────────────────────────────────────────────────
echo ""
node "$BRIDGE_DIR/cli.js" "$PAIR_CODE"
