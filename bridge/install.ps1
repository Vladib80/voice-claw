$ErrorActionPreference = "Stop"

$ApiBase = if ($env:VOICECLAW_API_BASE) { $env:VOICECLAW_API_BASE } else { "https://voiceclaw.io" }
$BridgeDir = Join-Path $HOME ".voiceclaw"
$BridgeFile = Join-Path $BridgeDir "bridge.js"

Write-Host ""
Write-Host "  VoiceClaw Bridge Installer"
Write-Host "  =========================="
Write-Host ""

# Check Node
try {
  $nodeVer = & node -e "process.stdout.write(process.versions.node)" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "node failed" }
  Write-Host "Node.js $nodeVer found"
} catch {
  Write-Host "ERROR: Node.js not found. Install Node 18+ from https://nodejs.org and retry."
  exit 1
}

# Create dir
New-Item -ItemType Directory -Path $BridgeDir -Force | Out-Null

# Install ws dependency
Set-Location $BridgeDir
if (-not (Test-Path "package.json")) {
  '{ "name": "voiceclaw-bridge", "version": "0.1.0", "private": true }' | Set-Content "package.json"
}
if (-not (Test-Path "$BridgeDir\node_modules\ws")) {
  Write-Host "Installing ws dependency..."
  & npm install ws --silent
}

# Download bridge.js
Write-Host "Downloading bridge.js..."
$bridgeUrl = "$ApiBase/bridge.js"
Invoke-WebRequest -Uri $bridgeUrl -OutFile $BridgeFile -UseBasicParsing
Write-Host "Downloaded to $BridgeFile"

Write-Host ""
Write-Host "  ✅ Bridge downloaded! Opening pairing setup..."
Write-Host ""

# Launch init in a fresh window so readline gets clean stdin
$initCmd = "node '$BridgeFile' init; if (`$LASTEXITCODE -eq 0) { Write-Host ''; Write-Host '  ✅ Paired! Starting bridge in background...'; Write-Host ''; Start-Process -NoNewWindow -FilePath 'node' -ArgumentList '$BridgeFile run'; Write-Host '  🟢 Bridge is running! Return to voiceclaw.io to continue.'; Write-Host '' } else { Write-Host '  ❌ Pairing failed. Try again.' }; Read-Host 'Press Enter to close'"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $initCmd -Wait
