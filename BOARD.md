# Twitter Agents — Task Board

> Last updated: 2026-03-15

## Conventions
- **ID format**: `TA-NNN` (sequential, never reuse)
- **Statuses**: `todo` | `in_progress` | `blocked` | `done`
- **Priorities**: `critical` | `high` | `medium` | `low`
- Next available ID: **TA-024**

---

## Active

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-015 | Define bot personality — single degen roaster character | todo | critical | Name, voice, style, topics, knowledge base |
| TA-016 | Create character config (system prompt + examples) | todo | critical | Depends on TA-015. Claude Sonnet character prompt |
| TA-017 | Choose Twitter handle for the bot | todo | high | Must be available, memorable, roast-themed |
| TA-018 | Initialize TypeScript project — custom stack (not ElizaOS) | todo | high | twitter-api-v2 + @anthropic-ai/sdk + viem |
| TA-019 | Implement Twitter client — cookie auth MVP | todo | high | agent-twitter-client, poll mentions, post roasts |
| TA-020 | Implement roast engine — Claude Sonnet generation | todo | high | Character prompt + target context → 280 char roast |
| TA-021 | Test roast quality — 50+ generated roasts, review humor | todo | high | If not funny after tuning — pivot character or kill |
| TA-022 | Implement news monitor — RSS + DexScreener + trending | todo | medium | Autonomous target discovery for Mode 1 |
| TA-023 | Implement fact-checker + content filter pre-publish | todo | medium | Claude Haiku verifies claims before posting |

## Backlog

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-024 | Set up Snapshot.org space for challenge voting | todo | medium | Off-chain, gasless, token-weighted |
| TA-025 | Token launch via Bankr | todo | medium | After 500+ followers and 20+ public roasts |
| TA-026 | Implement burn-to-roast request flow | todo | medium | User burns $BEEF → bot queues target. After token launch |
| TA-027 | Set up Farcaster integration via Neynar | todo | medium | Secondary channel, no bot restrictions |
| TA-028 | Set up DexScreener + CoinGecko token monitoring | todo | low | Price/volume alerts after token launch |
| TA-029 | Deploy bot to VPS (Hetzner) with PM2 | todo | medium | Production setup, Sentry error tracking |
| TA-030 | Seed first 20 roasts with friends/KOLs | todo | medium | Cold start content before token launch |
| TA-031 | Implement challenge/accountability flow | todo | low | Snapshot vote + treasury reward. Phase 2 |

## Done

| ID | Task | Status | Priority | Notes |
|----|------|--------|----------|-------|
| TA-001 | Define bot personas — contrasting personality pair | done | critical | Pivoted: single roast bot, not PVP |
| TA-002 | Design character.json files for both bots | done | critical | Pivoted: single bot character config |
| TA-003 | Choose final ticker ($BEEF vs alternatives) | done | high | $BEEF confirmed |
| TA-004 | Choose Twitter handles for both bots | done | high | Pivoted: single bot handle needed |
| TA-005 | Technology stack research and decisions | done | high | Custom TypeScript over ElizaOS. See docs/stack-research.md |
