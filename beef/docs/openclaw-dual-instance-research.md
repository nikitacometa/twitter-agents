# OpenClaw Dual-Instance Research

Research date: 2026-03-26

## Question

Can two OpenClaw instances run on the same Hostinger VPS (8GB RAM, 2 vCPU, Ubuntu 24.04)? One personal (@PersonalBot), one for $BEEF. Or should we get a second server?

## Answer

**Two instances on one server, separate Linux users (Option B).** Resources are fine (~17% RAM), OpenClaw supports multi-instance natively, OS-level isolation protects credentials.

## OpenClaw Multi-Instance Support

### Native mechanisms

1. **`--profile` flag** — isolates config, state dir, systemd service name per profile
2. **Env vars** — `OPENCLAW_CONFIG_PATH`, `OPENCLAW_STATE_DIR`, `OPENCLAW_GATEWAY_PORT`

### Port requirements

Gateway occupies a range (base port + ~20 for Browser CDP + WebSocket control). Current instance: 18789 (main) + 18792 (WS). Second instance: 19001+ (safe gap).

## Resource Analysis

| Component | RAM |
|-----------|-----|
| OpenClaw #1 (personal, @PersonalBot) | ~390 MB |
| OpenClaw #2 ($BEEF) | ~390 MB |
| $BEEF Node.js bot (PM2) | ~59 MB |
| OS + systemd + Node overhead | ~400-600 MB |
| **Total** | **~1.2-1.4 GB / 8 GB (17%)** |

No upgrade needed. Both instances are I/O-bound (waiting for LLM API responses), not CPU-bound.

## Recommended Architecture: Option B (Separate Linux Users)

```
User: deploy (existing)
├── ~/.openclaw/         (personal config, chmod 700)
├── systemd user service: openclaw-gateway.service
├── Gateway: 127.0.0.1:18789
└── Telegram: @PersonalBot

User: beef-bot (new)
├── ~/.openclaw/         (BEEF config, chmod 700)
├── systemd user service: openclaw-gateway.service
├── Gateway: 127.0.0.1:19001
├── PM2: beef-bot process
└── Telegram: @0xBeefer admin bot (or dedicated)
```

### Why not Option A (same user, profiles only)

OpenClaw docs warn: "If someone can modify ~/.openclaw/, treat them as a trusted operator." With one user, compromised $BEEF instance reads personal credentials. With separate users, Linux DAC blocks cross-access.

### Why not Option C (second server) — yet

- +$16-20/mo for Hostinger KVM 1/2
- Two places to deploy, monitor, backup
- Current server at 17% capacity — no resource pressure
- Revisit when $BEEF needs uptime guarantees independent of personal instance

## Security Findings

ClawHub ecosystem has serious problems (2026 data):
- **824+ malicious skills** on ClawHub (~20% of registry) — mostly AMOS infostealer
- **CVE-2026-25253**: one-click RCE via malicious skill
- **135,000+ open instances** with leaked API keys and credentials

### Hardening checklist for $BEEF instance

- [ ] `chmod 700 ~/.openclaw/` for beef-bot user
- [ ] `chmod 600 ~/.openclaw/openclaw.json`
- [ ] Gateway binds `127.0.0.1` only (not `0.0.0.0`)
- [ ] Separate API keys (OpenAI/Anthropic) per instance
- [ ] No ClawHub skills — custom only
- [ ] Firewall: block external access to ports 18789, 19001

## Sources

- [Multiple Gateways | OpenClaw Docs](https://openclaws.io/docs/gateway/multiple-gateways)
- [Gateway Security | OpenClaw Official Docs](https://docs.openclaw.ai/gateway/security)
- [Running OpenClaw safely | Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2026/02/19/running-openclaw-safely-identity-isolation-runtime-risk/)
- [OpenClaw Security Crisis | Particula](https://particula.tech/blog/openclaw-security-crisis-malicious-ai-agents)
- [Hostinger VPS Plans | VPSBenchmarks](https://www.vpsbenchmarks.com/compare/hostinger)
