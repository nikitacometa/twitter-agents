# Technology Stack Research — Crypto Twitter AI Agents

**Date:** 2026-03-15
**Scope:** Framework, Twitter API, LLM, on-chain, monitoring for Base chain AI agent

---

## Framework: ElizaOS v1.7.2

**Decision: ElizaOS** — 17.8K GitHub stars, 60% market share among crypto AI agents, TypeScript.

| Alternative | Why not |
|-------------|---------|
| ZerePy | Python, smaller ecosystem, fewer Web3 plugins |
| Rig (ARC) | Rust, no native Twitter, enterprise-focused |
| GAME (Virtuals) | Gaming focus, limited flexibility |
| Custom Node.js | More work for same result, lose plugin ecosystem |

**Key plugins:**
- `@elizaos/plugin-twitter` — official Twitter integration
- `elizaos-plugins/client-twitter` — full integration (posts, replies, search, Spaces)
- `payainetwork/client-twitter-api-access` — official v2 API version for ElizaOS

**Version note:** v2 is in beta (Shaw: "it's still a beta, job's not done"). Use v1.7.x for production.

---

## Twitter API

### Pricing

| Tier | Price | Reads/mo | Writes/mo | Search |
|------|-------|----------|-----------|--------|
| Free | $0 | ~1 req/15 min | 1,500 | No |
| **Basic** | **$100** | **10,000** | **3,000** | 7 days |
| Pro | $5,000 | 1,000,000 | Full | Archive |

**Decision: Basic tier** — 3,000 writes/mo = ~100 tweets/day, sufficient for active bot.

### Libraries

- **Primary:** `twitter-api-v2` (npm) — strongly typed, supports v1.1 + v2, actively maintained
- **Fallback:** `agent-twitter-client` — cookie-based auth, no API keys, for read-heavy ops when API limits hit. Risk: Twitter rotates GraphQL endpoints every 2-4 weeks

---

## LLM for Roast Generation

All frontier models score within 1-2% on humor benchmarks (HumorBench):
- Gemini 2.5 Pro: 93% humor understanding
- GPT-4o: 92%
- Claude Sonnet 4.6: 91%

**Decision: Claude Sonnet 4.6** — best character consistency, no separate API key needed in Claude ecosystem.

**Key insight:** LLM isn't "funny" by default. Roast quality depends entirely on character file and system prompt, not model choice.

---

## On-chain (Base)

### Smart Contracts: Foundry
- Solidity tests, fast compilation
- Base officially documents Foundry deploys
- Standard pattern: OpenZeppelin ERC20 + Ownable + custom staking accumulator

### Token Launch Options

| Method | Speed | Control | Notes |
|--------|-------|---------|-------|
| **Clanker** | Instant | Low | Tag in Farcaster cast → ERC-20 + Uniswap V3 pool. 1% swap fee (40% creator / 60% protocol). 13K new tokens/day |
| **Bankr** | Instant | Low | Tag @bankrbot on Twitter → uses Clanker under the hood. Privy embedded wallets |
| **Foundry** | Hours | Full | Custom tokenomics, staking, vesting. Required for staking contracts |

**Decision:** Bankr for quick memecoin launch, Foundry for staking contract.

---

## MCP Servers

| Server | What it provides |
|--------|-----------------|
| **CoinGecko MCP** | 15K+ coins, realtime prices, GeckoTerminal for DEX data. Free demo: 30 req/min |
| **Beyond Social MCP** | Farcaster via Neynar API (wallet profiles, trending feed, channel search) |
| **Neynar MCP** | Official Farcaster integration for Cursor. x402 protocol for agent-to-agent payments |
| **Twitter MCP** (community) | `EnesCinr/twitter-mcp` — not production-grade, useful for dev/testing only |

### Additional APIs (no MCP)

- **DexScreener** — free REST + SSE stream for realtime token data: `GET https://api.dexscreener.com/latest/dex/tokens/{address}`
- **Moralis/Alchemy** — webhooks for on-chain events (transfers, swaps)

---

## Farcaster

- **Neynar SDK** — standard for Farcaster integration
- No bot restrictions (unlike Twitter)
- $5/year for 5,000 casts
- Clanker is native to Farcaster — token launch seamless
- x402 protocol: HTTP-native payments, agent-to-agent transactions

---

## Monitoring

| Layer | Tool | Notes |
|-------|------|-------|
| Process | PM2 | Auto-restart, `pm2 monit`, log aggregation |
| Errors | Sentry (free tier) | Unhandled exceptions, crash reporting |
| Uptime | UptimeRobot (free) | 5-min ping intervals |
| Logging | Pino → stdout | Structured JSON logs |
| Alerts | Telegram bot | Critical alerts to founders |
| Token | DexScreener SSE | Price, volume, liquidity realtime |

---

## Hosting

**Hetzner VPS** — $6-8/mo, European, reliable. Alternatively: existing Hostinger VPS if resources allow.

---

## Sources

- [twitter-api-v2 npm](https://www.npmjs.com/package/twitter-api-v2)
- [ElizaOS GitHub](https://github.com/elizaOS/eliza) — v1.7.2
- [ElizaOS Docs](https://docs.elizaos.ai)
- [X API Pricing — xpoz.ai](https://www.xpoz.ai/blog/guides/understanding-twitter-api-pricing-tiers-and-alternatives/)
- [CoinGecko MCP](https://docs.coingecko.com/docs/mcp-server)
- [Base Foundry Deploy](https://docs.base.org/learn/foundry/deploy-with-foundry)
- [Clanker — gate.com](https://www.gate.com/crypto-wiki/article/what-is-clanker-clanker-and-how-does-its-ai-powered-token-launch-platform-work-on-base-20260106)
- [Bankr Docs](https://docs.bankr.bot/)
- [HumorBench — arxiv](https://arxiv.org/html/2507.21476v1)
- [DexScreener Docs](https://docs.dexscreener.com/)
