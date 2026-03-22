# $BEEF Web Strategy — March 2026

Research-backed roadmap for beef-web evolution. Based on competitive analysis of 15+ crypto agent/meme coin sites, AI agent interfaces, and viral mechanics in crypto.

## Strategic Direction

**A (now) → B (parallel) → C (token launch)**

- **A: Shareable Machine** — viral artifacts users create and post on Twitter. Max reach, min blockchain integration
- **B: Living Agent** — diary app, real-time observation, pipeline visualizer. Cult following around bot personality. High retention
- **C: Utility-first** — wallet connect, burn queue, token-gated content. Monetization layer. Requires token

## Prioritized Features

### Tier 1 — Pre-token (1-5 days each)

| # | Feature | Impact | Effort | Description |
|---|---------|--------|--------|-------------|
| 1 | **Shareable Roast Card** | 9/10 | 3-4d | Upgrade "Submit to Audit" — visual card (canvas/HTML→image) with verdict, score, roast text. "Share on X" posts image + text. Every share = organic ad for @0xBeefer. Wordware precedent |
| 2 | **Roast Archive / Hall of Fame** | 8/10 | 2-3d | Grid of best roasts by engagement (likes, RT). Filters: hottest / most brutal / latest. Share button on each. Data from backend SQLite |
| 3 | **Live Stats Strip** | 7/10 | 0.5d | Persistent bar in app: `Today: 4 roasts · 31 evaluated · 847 avg impressions · Queue: 2`. Data already in feed.stats |
| 4 | **Pipeline Visualizer** | 7/10 | 1-2d | Horizontal phase bar: `SCAN → RESEARCH → COOK → JUDGE → POST` with live highlight of current step. Derived from last event type |

### Tier 2 — Next sprint (1-3 weeks)

| # | Feature | Impact | Effort | Description |
|---|---------|--------|--------|-------------|
| 5 | **Guilty/Not Guilty voting** | 8/10 | 3-4d | Vote on each roast. Two camps = Twitter conflict = viral threads. Project shills bring their own traffic |
| 6 | **Public Audit Queue** | 7/10 | 3-4d | Show "Next targets". Later: burn-to-request queue with positions. Creates anticipation + return visits |
| 7 | **WebSocket/SSE for diary** | 6/10 | 2-3d | Replace 5min polling with real-time. Backend already writes events — need SSE endpoint |
| 8 | **BEEF voice for all UI** | 6/10 | 1d | Replace system text with BEEF personality. "Loading..." → "sharpening the knives..." |

### Tier 3 — Token launch (day 14-21)

| # | Feature | Impact | Effort |
|---|---------|--------|--------|
| 9 | **Wallet Connect + Burn UI** | 9/10 | 5-7d |
| 10 | **Token-gated "Inner Monologue"** | 7/10 | 3-4d |
| 11 | **"Beef Wrapped"** — portfolio roast card | 9/10 | 8-12d |
| 12 | **Targets Leaderboard** | 7/10 | 3-4d |

## What NOT to Build

- Points/farming system — attracts farmers, not community
- friend.tech-style social keys — dies with influencer activity
- Farcaster Frames — CT audience is on Twitter
- Chat with bot — dilutes "autonomous agent" brand, kills mystique

## Key Market Insights

- **Burn-to-request** — no competitor has this as UX pattern. White space
- **AIXBT** — token-gated terminal, 600K tokens for full access. $500M FDV
- **pump.fun** — real-time feed creates FOMO, impossible to leave
- **Truth Terminal** — personality + narrative >> product for early growth ($1.2B mcap peak)
- **Wordware** — shareable AI cards drove millions of visits
- **Perplexity** — progress visibility = users wait longer when they see steps

## Research Sources

Full research reports saved in:
- `docs/agent-ui-research.md` — AI agent interface patterns
- `docs/viral-mechanics-research.md` — viral/engagement mechanics in crypto
