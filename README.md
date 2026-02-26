# VoiceClaw

**A universal voice interface for any AI. Talk to Ollama, Claude, OpenClaw, GPT-4, or any local model — from any browser, on any device.**

VoiceClaw adds a voice layer to whatever AI you're already running. Install the bridge on your machine, then open **voiceclaw.io/app** on any phone or browser and talk to your AI.

🌐 **Live:** [voiceclaw.io](https://www.voiceclaw.io)

---

## Supported AI Backends

| Backend | URL | Notes |
|---|---|---|
| **OpenClaw** | `http://localhost:18789` | Default — OpenClaw AI agent |
| **Ollama** | `http://localhost:11434` | Llama 3, Mistral, Gemma, Qwen, Phi — no token needed |
| **LM Studio** | `http://localhost:1234` | GUI-based local LLMs — no token needed |
| **OpenRouter** | `https://openrouter.ai/api` | 100+ models (Claude, GPT-4, Llama) with one key |
| **OpenAI** | `https://api.openai.com` | GPT-4o, o1, and more |
| **Anthropic Claude** | `https://api.anthropic.com` | Requires bridge (bridge handles API format conversion) |
| **Custom** | Your URL | Any OpenAI-compatible endpoint |

---

## Privacy & Security

- **Your conversations stay yours.** Each user pairs their own private bridge. Nobody else can access your sessions.
- **Your AI credentials never leave your machine.** The bridge runs locally and makes an outbound connection to VoiceClaw — no port forwarding, no ngrok, no exposing localhost to the internet.
- **Bring your own keys (BYOK).** API keys for your AI backend and voice services are stored locally on your device, not on the server.
- **Open source.** Don't trust us? Read the code, or self-host the whole stack.

```
[Your phone / browser]
        ↕ HTTPS
[VoiceClaw Server — voiceclaw.io]
        ↕ WebSocket (outbound from your PC — no port forwarding needed)
[Bridge running on your PC]
        ↕ localhost only
[Your AI — Ollama / OpenClaw / Claude / GPT-4 / anything]
```

---

## Setup in 2 minutes (Bridge mode — recommended)

1. Go to **[voiceclaw.io/setup](https://www.voiceclaw.io/setup)** — pair code generates automatically
2. Run the installer on your machine:

   **Windows (PowerShell):**
   ```powershell
   irm https://www.voiceclaw.io/install.ps1 | iex
   ```

   **Mac / Linux:**
   ```bash
   curl -fsSL https://www.voiceclaw.io/install.sh | bash
   ```

3. Enter the pair code when asked, choose your AI backend (Ollama, Claude, etc.), add your voice API keys
4. Page detects your bridge automatically → open voiceclaw.io/app and talk 🎙️

> ⚠️ Windows: use **PowerShell**, not Command Prompt or Git Bash.

### Voice API Keys (required for all modes)

You need two API keys for speech — separate from your AI backend:
- **OpenAI** key for text-to-speech → [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Groq** key for speech-to-text → [console.groq.com/keys](https://console.groq.com/keys)

Both are free to get started. Groq Whisper costs ~$0.001/min. OpenAI TTS costs ~$0.015/1K chars.

---

## Direct Gateway mode (no bridge)

If you already have a publicly reachable endpoint (e.g. OpenRouter, OpenAI, or a VPS-hosted model):

1. Go to **[voiceclaw.io/setup](https://www.voiceclaw.io/setup)** → click **Direct Gateway**
2. Select your backend from the preset picker (URL auto-fills)
3. Enter your API key (not needed for Ollama/LM Studio)
4. Add your OpenAI + Groq keys for voice → Test Connection

> For Ollama and LM Studio, the endpoint must be reachable from the internet — use [Tailscale](https://tailscale.com) or a VPS. For cloud APIs (OpenRouter, OpenAI), no setup needed.

---

## How the bridge works

The bridge makes an **outbound** WebSocket connection from your PC to voiceclaw.io. This means:

- ✅ Works behind any firewall or router — no port forwarding needed
- ✅ No Tailscale, no ngrok, no VPN required for local models
- ✅ Your AI gateway stays on `localhost` — never exposed to the internet
- ✅ Claude support — bridge converts OpenAI format to Anthropic Messages API automatically
- ✅ If the bridge is off, nobody can reach your agent — you're in full control

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React |
| Backend | Node.js + Express + WebSocket |
| STT | Groq Whisper (via bridge or direct) |
| TTS | OpenAI TTS (via bridge or direct) |
| Bridge | Node.js (`~/.voiceclaw/bridge.js`) |
| Hosting | Render |

---

## Using on multiple devices

The bridge runs on one PC. You can use VoiceClaw from any browser or phone.

| Situation | What to do |
|---|---|
| First time setup | Install bridge on PC + pair from browser |
| Same browser, next time | Nothing — open voiceclaw.io/app directly |
| New phone / new browser | Go to voiceclaw.io/setup → get pair code → run `node ~/.voiceclaw/bridge.js init` on your PC → run `node ~/.voiceclaw/bridge.js run` |
| Bridge already running | Stop bridge → re-init with new pair code → restart |

> **Note:** Re-pairing from a new device starts a new session. Simultaneous sessions from multiple browsers are not supported in v1.

---

## Self-hosting

Fork this repo and deploy your own instance.

**1. Clone and install:**
```bash
git clone https://github.com/Vladib80/voice-claw.git
cd voice-claw
npm install
```

**2. Create a `.env` file** (copy from `.env.example`):
```
VOICECLAW_ADMIN_TOKEN=your-random-secret
ALLOWED_ORIGIN=https://yourapp.onrender.com
```

> Note: `OPENAI_API_KEY` and `GROQ_API_KEY` are deprecated server-side. Users bring their own keys via the bridge or setup page.

**3. Build and start:**
```bash
npm run build && npm start
```

The server runs on port `3000` by default. Set `PORT` to change it.

**Deploying to Render:** Create a new Web Service, set build command to `npm run render-build`, start command to `npm start`, and set `ALLOWED_ORIGIN` + `VOICECLAW_ADMIN_TOKEN` in the dashboard.

---

## License

MIT — free forever to self-host. Bring your own keys.
