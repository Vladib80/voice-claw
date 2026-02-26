#!/usr/bin/env bash
set -euo pipefail

API_BASE="${VOICECLAW_API_BASE:-https://voiceclaw.io}"
BRIDGE_DIR="$HOME/.voiceclaw"
BRIDGE_FILE="$BRIDGE_DIR/bridge.js"

echo ""
echo "  VoiceClaw Bridge Installer"
echo "  =========================="
echo ""

# Check Node
if ! command -v node >/dev/null 2>&1; then
  echo "❌  Node.js not found. Install Node 18+ from https://nodejs.org and retry."
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
echo "✅  Node.js $NODE_VER found"

# Check ws package available
mkdir -p "$BRIDGE_DIR"
cd "$BRIDGE_DIR"

if [ ! -f "package.json" ]; then
  echo '{ "name": "voiceclaw-bridge", "version": "0.1.0", "private": true }' > package.json
fi

if [ ! -d "node_modules/ws" ]; then
  echo "📦  Installing ws dependency..."
  npm install ws --silent
fi

echo "⬇️   Downloading bridge.js..."
curl -fsSL "$API_BASE/bridge.js" -o "$BRIDGE_FILE"
echo "✅  Downloaded to $BRIDGE_FILE"

echo ""
echo "🔗  Running pairing setup..."
echo ""
node "$BRIDGE_FILE" init

echo ""
echo "✅  Setup complete!"
echo ""
echo "   To start the bridge:"
echo "   node $BRIDGE_FILE run"
echo ""
