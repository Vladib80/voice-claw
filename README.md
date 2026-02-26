# VoiceClaw

**Talk to your OpenClaw AI agent by voice. From any browser. On any device.**

VoiceClaw is an open-source voice interface for [OpenClaw](https://openclaw.ai). It bridges your phone or browser to your local OpenClaw gateway — no app install, no cloud lock-in, no token exposure.

🌐 **Live:** [voiceclaw.io](https://www.voiceclaw.io)

---

## Setup in 2 minutes

1. Go to **[voiceclaw.io/setup](https://www.voiceclaw.io/setup)** — a pair code generates automatically
2. Run the installer on your OpenClaw machine:

   **Windows (PowerShell):**
   ```powershell
   irm https://www.voiceclaw.io/install.ps1 | iex
   ```

   **Mac / Linux:**
   ```bash
   curl -fsSL https://www.voiceclaw.io/install.sh | bash
   ```

3. Enter the pair code when the installer asks (just 2 prompts)
4. Page detects your bridge automatically → tap the orb and talk 🎙️

> ⚠️ Windows users: run in **PowerShell**, not Command Prompt or Git Bash.

---

## How it works

```
[Browser / Phone]
      ↕ HTTPS
[VoiceClaw Server]
      ↕ WebSocket (Bridge)
[Your PC running OpenClaw]
      ↕ localhost
[OpenClaw Gateway → Your AI Agent]
```

- **Speech-to-text:** Groq Whisper (fast, free tier available)
- **AI response:** Routed through your OpenClaw gateway (your keys, your agent)
- **Text-to-speech:** OpenAI TTS `onyx` voice
- **Bridge:** Lightweight Node.js process running on your machine

Your OpenClaw token never leaves your machine.

---

## Self-hosting

### Environment variables

```bash
OPENAI_API_KEY=sk-proj-...
GROQ_API_KEY=gsk_...
VOICECLAW_ADMIN_TOKEN=your-admin-token   # optional, for /admin metrics
```

### Run locally

```bash
npm install
npm run build
npm start
```

Open: `http://localhost:3000`

### Deploy on Render

1. Fork this repo
2. Create a new **Web Service** in Render
3. Build command: `npm run render-build`
4. Start command: `node server.js`
5. Add env vars: `OPENAI_API_KEY`, `GROQ_API_KEY`

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

## License

MIT — free forever to self-host. Bring your own keys.
