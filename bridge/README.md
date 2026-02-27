# VoiceClaw Bridge

Connect VoiceClaw to your local AI. One command, any LLM.

## Install

```bash
npx voiceclaw VC-XXXX-XXXX
```

Get the pair code from [voiceclaw.io](https://www.voiceclaw.io) on your phone.

**That's it.** The bridge auto-detects your local AI (Ollama, OpenClaw, LM Studio), pairs, and starts running.

## Requirements

- [Node.js 18+](https://nodejs.org)
- A local AI running (Ollama, OpenClaw, LM Studio) — or a cloud API key (Claude, OpenAI, OpenRouter)

## Commands

```bash
npx voiceclaw VC-XXXX-XXXX    # Pair and start
npx voiceclaw                  # Re-run with saved config
npx voiceclaw --daemon         # Run in background
npx voiceclaw stop             # Stop background bridge
npx voiceclaw status           # Show bridge info
npx voiceclaw config           # Edit settings (voice keys, backend)
npx voiceclaw unpair           # Delete config and stop
```

## How it works

1. Your phone opens `voiceclaw.io` and generates a pair code
2. You run `npx voiceclaw VC-XXXX-XXXX` on your PC
3. The bridge connects to VoiceClaw cloud via WebSocket
4. When you speak, VoiceClaw routes requests through the bridge to your local AI
5. Responses come back through the bridge to your phone

All API keys stay on your machine. The bridge is outbound-only (no ports to open).

## Voice API keys

Voice features (speech-to-text + text-to-speech) need separate API keys:

- **Groq** (STT) — free tier at [console.groq.com/keys](https://console.groq.com/keys)
- **OpenAI** (TTS) — at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

Add them anytime with:

```bash
npx voiceclaw config
```

## Config

Stored at `~/.voiceclaw/bridge.json`. Contains your bridge ID, gateway URL, and API keys. Never sent to the browser.

## License

MIT
