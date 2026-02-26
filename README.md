# VoiceClaw

**Talk to your OpenClaw AI agent by voice. From any browser. On any device.**

VoiceClaw is an open-source voice interface for [OpenClaw](https://openclaw.ai). Run the bridge on your machine — then open **voiceclaw.io/app** on any phone or browser and talk to your AI agent.

🌐 **Live:** [voiceclaw.io](https://www.voiceclaw.io)

---

## Privacy & Security

- **Your conversations stay yours.** Each user pairs their own private bridge. Nobody else can see or access your sessions.
- **Your OpenClaw token never leaves your machine.** The bridge runs locally and makes an outbound connection to VoiceClaw — no port forwarding, no Tailscale, no exposing localhost to the internet.
- **No data mixing.** voiceclaw.io routes each request only to the bridge it was paired with. User A cannot access User B's agent.
- **Open source.** Don't trust us? Read the code, or self-host the whole stack.

```
[Your phone / browser]
        ↕ HTTPS
[VoiceClaw Server — voiceclaw.io]
        ↕ WebSocket (outbound from your PC — no port forwarding needed)
[Bridge running on your PC]
        ↕ localhost only
[Your OpenClaw Gateway → Your AI Agent]
```

---

## Setup in 2 minutes

1. Go to **[voiceclaw.io/setup](https://www.voiceclaw.io/setup)** — pair code generates automatically
2. Run the installer on your OpenClaw machine:

   **Windows (PowerShell):**
   ```powershell
   irm https://www.voiceclaw.io/install.ps1 | iex
   ```

   **Mac / Linux:**
   ```bash
   curl -fsSL https://www.voiceclaw.io/install.sh | bash
   ```

3. Enter the pair code when asked (2 prompts only)
4. Page detects your bridge automatically → open voiceclaw.io/app and talk 🎙️

> ⚠️ Windows: use **PowerShell**, not Command Prompt or Git Bash.

---

## How the bridge works

The bridge makes an **outbound** WebSocket connection from your PC to voiceclaw.io. This means:

- ✅ Works behind any firewall or router — no port forwarding needed
- ✅ No Tailscale, no ngrok, no VPN required
- ✅ Your OpenClaw gateway stays on `localhost` — never exposed to the internet
- ✅ If the bridge is off, nobody can reach your agent — you're in full control

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React |
| Backend | Node.js + Express + WebSocket |
| STT | Groq Whisper |
| TTS | OpenAI TTS |
| Bridge | Node.js (`~/.voiceclaw/bridge.js`) |
| Hosting | Render |

---

## Self-hosting

Fork this repo and deploy your own instance. You control everything.

```bash
OPENAI_API_KEY=sk-proj-...
GROQ_API_KEY=gsk_...
```

```bash
npm install && npm run build && npm start
```

See [Deploy on Render](#) for full instructions.

---

## License

MIT — free forever to self-host. Bring your own keys.
