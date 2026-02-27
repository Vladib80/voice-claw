$ErrorActionPreference = "Stop"

$ApiBase = if ($env:VOICECLAW_API_BASE) { $env:VOICECLAW_API_BASE } else { "https://www.voiceclaw.io" }
$BridgeDir = Join-Path $HOME ".voiceclaw"
$LibDir = Join-Path $BridgeDir "lib"

Write-Host ""
Write-Host "  VoiceClaw Bridge Installer"
Write-Host "  =========================="
Write-Host ""

# ── Check Node.js ──────────────────────────────────────────────────────────────
try {
  $nodeVer = & node -e "process.stdout.write(process.versions.node)" 2>&1
  if ($LASTEXITCODE -ne 0) { throw "node failed" }
  $nodeMajor = [int]($nodeVer -split '\.')[0]
  if ($nodeMajor -lt 18) { throw "too old" }
  Write-Host "  Node.js $nodeVer"
} catch {
  Write-Host "  ERROR: Node.js 18+ not found. Install from https://nodejs.org"
  exit 1
}

# ── Check npm ──────────────────────────────────────────────────────────────────
try {
  $null = & npm --version 2>&1
  if ($LASTEXITCODE -ne 0) { throw "npm failed" }
} catch {
  Write-Host "  ERROR: npm not found. It should come with Node.js."
  exit 1
}

# ── Create directories ─────────────────────────────────────────────────────────
New-Item -ItemType Directory -Path $LibDir -Force | Out-Null

# ── Download bridge files ──────────────────────────────────────────────────────
Write-Host "  Downloading bridge..."

$files = @("cli.js", "package.json", "lib/config.js", "lib/detect.js", "lib/pair.js", "lib/bridge.js", "lib/ui.js")
foreach ($f in $files) {
  $url = "$ApiBase/bridge/$f"
  $outPath = Join-Path $BridgeDir ($f -replace '/', '\')
  $outDir = Split-Path $outPath -Parent
  if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
  Invoke-WebRequest -Uri $url -OutFile $outPath -UseBasicParsing
}

Write-Host "  Downloaded to $BridgeDir"

# ── Install dependencies ──────────────────────────────────────────────────────
Set-Location $BridgeDir
& npm install --silent 2>$null
Write-Host "  Dependencies installed"

# ── Get pair code ──────────────────────────────────────────────────────────────
$PairCode = $env:VC_CODE
if (-not $PairCode) {
  Write-Host ""
  Write-Host "  Enter the pair code from your phone:"
  $PairCode = Read-Host "  > "
  if (-not $PairCode) {
    Write-Host "  ERROR: No pair code entered."
    exit 1
  }
}

# ── Run bridge ─────────────────────────────────────────────────────────────────
Write-Host ""
& node (Join-Path $BridgeDir "cli.js") $PairCode
