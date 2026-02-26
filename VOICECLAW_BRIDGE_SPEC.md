# VoiceClaw Bridge Spec (v1)

## Goal
Give VoiceClaw **full OpenClaw access** without asking users to paste gateway tokens into the web app.

## Architecture
- Client (mobile/web PWA) ↔ VoiceClaw API
- VoiceClaw API ↔ Bridge (persistent WebSocket, outbound from user machine)
- Bridge ↔ Local OpenClaw Gateway (`http://127.0.0.1:18789`)

Bridge runs on user machine and keeps OpenClaw credentials local.

---

## Pairing Flow
1. User opens `voiceclaw.io/setup` and clicks **Connect OpenClaw**
2. Server creates short-lived pairing code (`VC-XXXX-XXXX`), expires in 10 min
3. User runs installer command
4. Installer asks for pairing code and stores local bridge secret
5. Bridge calls `POST /bridge/pair/complete` with code + device metadata
6. Server returns `bridgeId` + signed session token
7. Bridge opens WS to `/bridge/ws` with token
8. VoiceClaw account now has connected device

---

## Security Model
- No raw OpenClaw gateway token in browser
- Bridge stores local secret in `~/.voiceclaw/bridge.json`
- Server stores hashed bridge secret
- Device revocation supported from dashboard
- Capability scope per bridge:
  - `chat_only`
  - `tools_safe` (default)
  - `full` (advanced)

### Default blocked operations
- destructive filesystem actions
- arbitrary shell exec
- system-level admin operations

---

## API Contract (VoiceClaw Cloud)

### 1) Create Pairing Code
`POST /api/bridge/pair/start`

Request:
```json
{ "userId": "u_123" }
```

Response:
```json
{ "pairCode": "VC-7M2K-91Q4", "expiresAt": "2026-02-26T12:00:00Z" }
```

### 2) Complete Pairing (bridge side)
`POST /api/bridge/pair/complete`

Request:
```json
{
  "pairCode": "VC-7M2K-91Q4",
  "device": { "name": "My-PC", "os": "windows", "bridgeVersion": "0.1.0" },
  "pubKey": "base64..."
}
```

Response:
```json
{
  "bridgeId": "br_abc",
  "wsToken": "jwt...",
  "scope": "tools_safe"
}
```

### 3) Bridge WebSocket
`wss://voiceclaw.io/api/bridge/ws?token=<wsToken>`

Envelope:
```json
{
  "id": "req_1",
  "type": "invoke",
  "payload": {
    "kind": "chatCompletions",
    "body": { "model": "openclaw:main", "messages": [{"role":"user","content":"..."}] }
  }
}
```

Response:
```json
{
  "id": "req_1",
  "type": "result",
  "ok": true,
  "payload": { "choices": [{ "message": { "content": "..." } }] }
}
```

### 4) Revoke Bridge
`POST /api/bridge/revoke`

Request:
```json
{ "bridgeId": "br_abc" }
```

Response:
```json
{ "ok": true }
```

---

## Bridge Local Behavior
- Heartbeat every 15s
- Reconnect with exponential backoff
- Executes only allowlisted operations
- For each cloud request:
  1) validate scope
  2) forward to local OpenClaw endpoint
  3) return result/error

---

## Installer UX

### macOS/Linux
```bash
curl -fsSL https://voiceclaw.io/install.sh | bash
```

### Windows PowerShell
```powershell
irm https://voiceclaw.io/install.ps1 | iex
```

Installer prompts:
1. Pair code
2. Optional device name
3. Start bridge service

---

## v1 Build Order
1. Pairing endpoints (cloud)
2. WS server (cloud)
3. Bridge daemon (Node CLI)
4. Installer scripts
5. Onboarding UI (pair code + connection state)
6. Revoke UI

---

## Non-goals (v1)
- Team accounts
- Multi-tenant org RBAC
- Marketplace of bridge plugins
- Fine-grained per-tool policies UI

---

## Success Criteria
- User can pair in <3 minutes
- VoiceClaw can call OpenClaw tools without exposing gateway token in browser
- User can revoke bridge instantly
