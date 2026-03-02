# CLAUDE.md — VoiceClaw

## What is this?
VoiceClaw (formerly YurikVoice) — mobile voice companion app. Talk to AI with your voice.
- **Live:** https://yurik-voice.onrender.com
- **Pricing:** $14.99/mo flat subscription, BYOK for LLM

## Tech Stack
- **Frontend:** Vite + React + Tailwind CSS
- **Backend:** Express + WebSocket (server.js)
- **TTS:** OpenAI (onyx voice)
- **STT:** Groq Whisper
- **Hosting:** Render — service ID: srv-d6fsogkr85hc73b2efv0

## Key Commands
```bash
npm run dev       # Local dev (Vite)
npm run build     # Production build
npm run start     # Production server (node server.js)
```

## Project Structure
- `src/` — React frontend
- `api/` — API routes
- `bridge/` — VoiceClaw bridge spec (native app communication)
- `branding/` — Logo and brand assets
- `server.js` — Express + WebSocket server
- `VOICECLAW_BRIDGE_SPEC.md` — Native bridge protocol spec

## Deployment
- Branch: main
- Render auto-deploys
- Build command: `npm install && npm run build`
- Verify at https://yurik-voice.onrender.com after deploy

## API Keys
- OpenAI and Groq keys are in `.env` / `.env.local` — never commit them
- TTS: OpenAI (onyx voice)
- STT: Groq Whisper

## Critical Rules
- Owner (Vladimir) is NOT a coder — plain English always
- DossPass is priority #1 during work hours — VoiceClaw is secondary
- Always verify deployment before saying "done"
- Keep it simple — this is an MVP

## Render API
- API Key: rnd_tdC4CHIRYuTI33QN9TXeMR7L8qOp
- Base: https://api.render.com/v1
