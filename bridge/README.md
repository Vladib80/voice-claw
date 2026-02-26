# VoiceClaw Bridge (v1 skeleton)

Local daemon that connects VoiceClaw cloud to user's local OpenClaw gateway.

## Planned commands
- `voiceclaw-bridge init` (pairing)
- `voiceclaw-bridge run` (daemon)
- `voiceclaw-bridge status`
- `voiceclaw-bridge revoke`

## Local config path
- Windows: `%USERPROFILE%\\.voiceclaw\\bridge.json`
- macOS/Linux: `~/.voiceclaw/bridge.json`

## Security
- No gateway token sent to browser
- Outbound-only connection from local machine to VoiceClaw cloud
- Scope-enforced operation allowlist
