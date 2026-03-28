# Base Ecosystem Monitor Expansion

Research and execution plan for expanding the ReplyGuy/Timeline Monitor target list to better cover the Base ecosystem, AI agents, and crypto-native communities.

**Date:** 2026-03-28
**Status:** Phase 1 in progress

## Problem

Current monitor has 22 Base accounts and 13 General. Most digest tweets come from General — generic news accounts that provide algorithmic relevance but aren't our target audience. Base ecosystem coverage is thin: missing AI agent projects, Farcaster/onchain social, Base KOLs, and AI×crypto analysts.

## Current Base Accounts (22)

| Tier | Count | Handles |
|------|-------|---------|
| S | 3 | jessepollak, AerodromeFi, virtuals_io |
| A | 6 | base, BuildOnBase, aixbt_agent, coinbase, MoonwellDeFi, zaboronbase |
| B | 7 | faboronbase, degentokenbase, BasedBrett, caboronbase, MorphoLabs, dwr, brian_armstrong |
| C | 5 | Toshi_base, SeamlessFi, AcrossProtocol, PoolTogether, BaseSwap_fi |

### Coverage Gaps

1. **AI agents on Base** — only virtuals_io and aixbt_agent. Missing: Luna, CookieDAO, Kaito, Spectral, ai16z, Dolos (competitor), truth_terminal
2. **Farcaster / onchain social** — zero coverage. Missing: farcaster_xyz, Zora, Clanker, Warpcast
3. **AI×crypto KOLs** — zero coverage. Missing: Defi0xJeff, shawmakesmagic, 0xprismatic
4. **Base DeFi gaps** — missing Goldfinch (RWA), Limitless (prediction market)

## Phase 1: Account Expansion

### New Accounts to Add

**AI Agents on Base:**

| Handle | Project | Tier | Why |
|--------|---------|------|-----|
| luna_virtuals | Luna (Virtuals) | B | Top Virtuals agent, $365K Story Protocol contract |
| cookiedotfun | CookieDAO | B | Data layer for AI agents, on-chain metrics |
| _kaitoai | Kaito AI | A | Mindshare analytics, data layer for agents |
| Spectral_Labs | Spectral | C | AI credit scoring + Lux multi-agent framework on Base |
| dolos_diary | Dolos | B | Direct competitor, must monitor |
| truth_terminal | Terminal of Truths | B | OG AI agent, sets narratives |
| ai16zdao | ai16z/ElizaOS | A | Largest AI agent framework, $2.3B MC |
| shawmakesmagic | Shaw (ElizaOS) | B | ElizaOS creator, educational content |

**Base Infrastructure / Social:**

| Handle | Project | Tier | Why |
|--------|---------|------|-----|
| farcaster_xyz | Farcaster | A | Decentralized social on Base, 190K+ DAU |
| ZoraUpdates | Zora | B | Post = ERC-20 on Base, Coinbase Wallet integration |
| clanker_world | Clanker | B | AI token deployer via Farcaster |
| CoinbaseDev | Coinbase Dev | B | Developer advocacy, SDK announcements |

**Base DeFi:**

| Handle | Project | Tier | Why |
|--------|---------|------|-----|
| goldfinch_fi | Goldfinch | C | RWA private credit on Base |

**AI×Crypto KOLs / Analysts:**

| Handle | Role | Tier | Why |
|--------|------|------|-----|
| Defi0xJeff | AI agent analyst | B | Weekly agent reviews, top alpha source |
| 0xprismatic | Chain of Thought | C | Deep AI×crypto analytics |
| HighCoinviction | Syncracy Capital | C | Investments in AI agents |
| BanklessHQ | Bankless | B | Best coverage of AI agents + Base DeFi |

**Total: +17 accounts → 39 Base, 13 General = 52 total**

### Topic Keywords to Add (tweet-scorer.ts)

```
agent, autonomous, virtuals, farcaster, warpcast, clanker, eliza,
mindshare, agentic, onchain, buildonbase
```

## Phase 2: Keyword Search (future)

Add keyword-based search batches alongside `from:` queries:

```
// K1: Base AI agents
("base" OR "onbase") ("agent" OR "ai agent" OR "autonomous") -is:reply -is:retweet

// K2: Virtuals / AI ecosystem
("virtuals" OR "ai16z" OR "eliza") ("launch" OR "deploy" OR "build") -is:reply -is:retweet

// K3: Base ecosystem general
("Base chain" OR "BuildOnBase" OR "#onbase") ("shipped" OR "live" OR "deployed") -is:reply -is:retweet
```

Separate scoring path for discovered tweets (no tier bonus, use follower count from user expansion). Separate digest section: `DISCOVERED`.

## Phase 3: Smart Discovery (future)

- Track discovered authors across polls
- Auto-suggest new accounts for watchlist based on frequency + engagement
- Admin notification when a new account consistently appears

## Budget Impact

Adding ~17 accounts adds ~2 batches. Total: ~7 from-batches × 6 polls/hr × 24hr. Budget tracks tweet count (not API calls), most polls return 0-5 tweets — well within 17,500/month ceiling.
