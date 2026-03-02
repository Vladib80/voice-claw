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

---

## Design & Code Standards

### UI Design (Anti-AI-Slop)
- NO generic fonts (Inter, Roboto, Arial) — use characterful typography
- NO emojis as UI icons — use SVG (Lucide, Heroicons)
- NO purple-on-white gradients or cookie-cutter SaaS layouts
- All interactive elements need `cursor-pointer`
- Hover states: color/opacity/shadow only, no scale transforms that shift layout
- Minimum 4.5:1 contrast ratio for accessibility
- Responsive at 375px, 768px, 1024px, 1440px — no horizontal scroll on mobile
- Every page needs: loading state, error state, empty state, populated state

### Building Features (ATLAS Framework)
Follow this order for any new feature:
1. **Architect** — Define problem, user stories, success metrics, non-goals
2. **Trace** — Schema, API design, auth model (validate data layer BEFORE writing UI)
3. **Link** — Test DB queries, API endpoints, integrations before building frontend
4. **Assemble** — Build one feature at a time, fully complete before starting next
5. **Stress-test** — Edge cases, security (RLS, input validation), mobile, performance

### Writing Copy (Humanizer Rules)
When writing any user-facing text, marketing copy, or documentation:
- No "serves as a testament", "in today's landscape", "crucial/pivotal/vibrant"
- No rule-of-three lists forced for rhythm ("seamless, intuitive, and powerful")
- No em dash overuse, no "It's not just X, it's Y" constructions
- No sycophantic filler ("Great question!", "I hope this helps!")
- Use specific details over vague claims. Concrete > abstract.
- Vary sentence length. Short punchy ones. Then longer flowing ones.
- Have opinions. Be direct. Cut the fluff.
