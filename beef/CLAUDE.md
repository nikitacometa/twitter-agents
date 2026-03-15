# $BEEF — AI Crypto Roast Bot

Single AI bot that roasts crypto projects, tokens, and narratives on Twitter. Community interacts via burn-to-roast requests and fact-checking challenges.

**One-liner:** "AI that roasts your bags. Burn $BEEF to aim it."

## How It Works

```
1. Bot autonomously monitors crypto news, launches, and narratives
2. Posts savage roasts of projects, tokens, trends (2-5/day)
3. Users burn $BEEF to submit roast requests (target a specific project)
4. If bot roasts with false info → community challenges via Snapshot vote
5. Valid challenge → challenger rewarded from treasury
6. Invalid challenge → challenger's stake burned
```

## Three Operating Modes

### Mode 1: Autonomous Roast
Bot finds targets independently via news feeds, trending tokens, on-chain events. No user input needed. This is the core content engine — 60-70% of all posts.

### Mode 2: Community Roast Request
User burns X $BEEF → bot roasts the specified target. Higher burn = priority queue. Creates buy pressure on every roast request.

### Mode 3: Accountability Layer
If a roast contains provably false claims, any $BEEF holder can challenge it via Snapshot vote. Successful challenge = reward from treasury. Failed challenge = stake burned. Creates trust and engagement loop.

## Tokenomics

- **To request a roast** → burn $BEEF (deflation on every interaction)
- **To challenge a roast** → stake $BEEF (skin in the game)
- **Successful challenge** → challenger gets reward from treasury
- **Failed challenge** → stake burned (more deflation)
- **Swap fees** → Bankr/Clanker pool generates ongoing fees
- **Treasury** → funded by failed challenges + % of burns → periodic buyback

**Why token goes up:** Every roast request burns supply. Every challenge locks supply. Content virality drives new buyers. Deflation is mechanical, not narrative.

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | Custom TypeScript | ElizaOS Twitter plugin has active bugs (#5172, #4921). Custom = stable, debuggable |
| **Twitter auth** | `agent-twitter-client` (cookie) → `twitter-api-v2` (API) | Cookie for MVP ($0). Upgrade to Basic ($200/mo) after validation |
| **LLM** | Claude Sonnet 4.6 (`@anthropic-ai/sdk`) | Best character consistency. Haiku for content filter |
| **Chain** | Base (Ethereum L2) | #1 L2 by TVL ($3.9B), low gas, Coinbase ecosystem |
| **Token launch** | Bankr (@bankrbot on Twitter) | Instant ERC-20 + Uniswap V3 pool. 0.684% creator fee |
| **News feeds** | RSS + DexScreener SSE + Twitter trending | Autonomous target discovery |
| **Fact-checking** | Claude Haiku + web search pre-publish | Verify claims before posting |
| **Voting** | Snapshot.org (off-chain) | Free, gasless, token-weighted governance |
| **Farcaster** | Neynar SDK | Secondary channel, crypto-native, no bot restrictions |
| **Crypto data** | CoinGecko API + DexScreener API | Price, volume, liquidity monitoring |
| **Hosting** | Hetzner VPS ($6-8/mo) | European, cheap, reliable |
| **Process mgmt** | PM2 | Auto-restart, log aggregation |
| **Error tracking** | Sentry (free tier) | Crash reporting |
| **Alerts** | Telegram bot | Critical alerts to founders |

## Project Structure

```
beef/
├── CLAUDE.md              # This file — project instructions
├── docs/                  # Research and strategy documents
│   ├── strategy-v4-roast-battle.md    # Strategy evolution (historical)
│   ├── strategy-v3-16-analysts.md     # 16-analyst strategy (historical)
│   ├── strategy-v2-expert-review.md   # Expert review (historical)
│   ├── market-research-2026.md        # Base chain market analysis
│   ├── fresh-research-march-2026.md   # Phase 1 research corrections
│   ├── late-agent-results.md          # Additional agent findings
│   ├── twitter-playbook.md            # Twitter algorithm, content rules, bot survival
│   └── stack-research.md              # Technology stack research & decisions
├── characters/            # Bot personality configuration
│   └── beef-bot.json      # Single bot character definition
├── contracts/             # Foundry project (Solidity) — future staking
│   ├── src/               # Contract sources
│   ├── test/              # Contract tests
│   └── foundry.toml       # Foundry config
└── src/                   # TypeScript bot source
    ├── twitter/           # Twitter client (cookie + API auth)
    ├── roast/             # Roast generation engine (Claude Sonnet)
    ├── news/              # News monitoring (RSS, DexScreener, trending)
    ├── content/           # Fact-checker + content filter
    ├── voting/            # Snapshot integration for challenges
    ├── token/             # Token monitoring (price, volume, burns)
    └── index.ts           # Entry point + scheduler
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Scheduler (cron)               │
│  ┌──────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ News     │  │ Mention  │  │ Autonomous    │  │
│  │ Monitor  │  │ Poller   │  │ Roast Timer   │  │
│  └────┬─────┘  └────┬─────┘  └──────┬────────┘  │
│       │              │               │           │
│       ▼              ▼               ▼           │
│  ┌──────────────────────────────────────────┐    │
│  │           Roast Engine (Claude Sonnet)    │    │
│  │  character.json + target context + news   │    │
│  └──────────────────┬───────────────────────┘    │
│                     │                            │
│       ┌─────────────┼─────────────┐              │
│       ▼             ▼             ▼              │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐         │
│  │ Fact    │  │ Content  │  │ Length   │         │
│  │ Checker │  │ Filter   │  │ Check   │         │
│  └────┬────┘  └────┬─────┘  └────┬────┘         │
│       └─────────────┼─────────────┘              │
│                     ▼                            │
│  ┌──────────────────────────────────────────┐    │
│  │        Twitter Client (post/reply)        │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

## Development Workflow

```bash
# Install dependencies
pnpm install

# Run bot locally (watch mode)
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint + format
pnpm lint

# Smart contract tests (future)
cd contracts && forge test

# Deploy to production
pm2 start ecosystem.config.js
```

## TypeScript Conventions

**Strict mode is non-negotiable.** `tsconfig.json` has `strict: true` + `noUncheckedIndexedAccess` + `noImplicitReturns` + `noUnusedLocals` + `noUnusedParameters`. Do not loosen.

**ESLint critical rules:**
- `no-floating-promises: error` — every promise must be awaited or explicitly voided
- `require-await: error` — don't mark functions async if they don't await
- `consistent-type-imports: error` — use `import type { Foo }` for type-only imports
- `no-explicit-any: warn` — prefer `unknown` + type guards over `any`

**Error handling:**
- Use `getErrorMessage(error: unknown)` from `@common/utils/error.util.ts` — never inline `instanceof Error` checks
- Use `retryWithBackoff()` for API calls (Twitter, Anthropic, DexScreener) — exponential backoff with jitter
- Every try/catch must log the error with context (use `logger.error({ err, context }, 'message')`)
- Never swallow errors in catch blocks

**Environment:**
- All env vars validated at startup via Zod (`src/common/config/env.validation.ts`)
- Cross-field validation via `superRefine` (e.g., production requires Sentry DSN)
- Access config through validated `AppConfig` type, never raw `process.env`

**Imports:**
- Use path aliases: `@common/*`, `@twitter/*`, `@roast/*`, `@news/*`, `@content/*`
- ESM: use `.js` extension in relative imports (`import { foo } from './bar.js'`)

**Logging:**
- Use `pino` logger from `@common/utils/logger.ts` — never `console.log` in production code
- Structured logging: `logger.info({ key: value }, 'message')` — object first, message second

**Testing:**
- Vitest (not Jest) — ESM-native, faster
- Test files: `*.spec.ts` or `*.test.ts` next to source
- `clearMocks: true` in vitest config — auto-reset between tests
- For every `mockResolvedValue` — add a sibling `mockRejectedValue` test
- Use `it.each()` for parameterized tests

**Pre-commit checklist (run before every commit):**
1. `pnpm typecheck` — zero errors
2. `pnpm lint:check` — zero errors
3. `pnpm test` — all pass
4. No `console.log` in production code
5. No hardcoded API keys or secrets
6. No `any` types without explicit justification comment
7. Tweet length ≤ 280 chars enforced in roast generation
8. Rate limits respected (check MENTION_POLL_INTERVAL_MS, POST_JITTER_PERCENT)

## Twitter Constraints

**Critical rules — violating any = account ban:**
- **Reply-only** for interactions with other accounts. Never initiate threads tagging others
- **Bot label** in profile — mandatory for automated accounts
- **2-5 proactive posts/day** (original roasts, NOT replies)
- **Randomized timing** — fixed intervals trigger spam detection
- **No ticker spam** — Grok detects `$BEEF $BEEF $BEEF` patterns
- **X Premium required** — 4x reach boost, posts get near-zero reach without it

**Roast post flow:**
1. News monitor finds target OR user submits burn request
2. Roast engine generates roast with real data context
3. Fact-checker verifies claims (separate Claude Haiku call)
4. Content filter checks for TOS violations
5. Post as original tweet (autonomous) or reply (to mention/request)

## Bot Personality

Single bot: **$BEEF** — aggressive degen roaster, crypto-native, meme-fluent.

**Core traits:**
- Savage but factual — every roast references real data (TVL, price action, team history)
- Degen voice — lowercase, "ser", "ngmi", "touched grass", CT slang
- Self-aware — knows it's an AI, jokes about it, doesn't pretend to be human
- Equal opportunity — roasts blue chips AND shitcoins, no sacred cows
- Short and lethal — max 280 chars, single tweet, no threads

**Anti-patterns:**
- No generic insults ("you're dumb") — always specific ("your TVL dropped 94% and you're tweeting about partnerships")
- No doxxing, slurs, threats
- No coordinated brigading
- No financial advice (even sarcastically)

## Competitors

| Project | Mcap | Status | How we differ |
|---------|------|--------|---------------|
| Freysa ($FAI) | $53M | Active | Human vs AI jailbreak, not roast content |
| AIXBT | $27M | Active | Analysis bot, not entertainment/comedy |
| Dolos ($BULLY) | $164K | Dead | Had roast but no token utility, no community interaction |
| BurnieAI ($ROAST) | $122K | Dead | Roast bot but no accountability layer, no burn mechanics |

**Our niche:** Roast bot with token burn mechanics + accountability (challenge system). No direct competitor alive.

**Precedent:** Wordware AI Roast — 4M users in 11 days. Proves roast AI is inherently viral. They had no token, no ongoing utility.

## Growth Catalysts

| Catalyst | How to get it | Expected effect |
|----------|--------------|-----------------|
| Viral roast screenshot | Roast a major project, community screenshots | Organic viral — Wordware got 4M users this way |
| RT from Jesse Pollak | Build on Base, show at Farcaster | $17M mcap in 1 hour (precedent) |
| Mention from @0xDeployer | Deploy via Bankr, engage Bankr community | $DRB: $38M mcap in 3 days |
| Challenge AIXBT | Public roast on Farcaster/Twitter | 300K+ follower exposure |
| KOL roast request | Micro-KOL burns $BEEF to roast a rival | Their audience discovers the bot |

## Budget

| Item | Cost |
|------|------|
| Initial liquidity (Bankr pool) | $800-1,000 |
| Twitter API (cookie MVP → Basic later) | $0 → $200/mo |
| X Premium | $8/mo |
| LLM API (Claude Sonnet) | $20-40/mo |
| VPS (Hetzner) | $6-8/mo |
| 1-2 micro-KOL seeds | $500-1,000 |
| **Total launch** | **$1,334-2,056** |
| **Monthly recurring** | **$34-56** (cookie) / **$234-256** (API) |

## External Knowledge (Cometa Project)

Extensive Twitter analysis exists in the Cometa Strategy project — do NOT duplicate, reference directly:

| Document | Path | What it contains |
|----------|------|------------------|
| Voice Profile | `~/dev/cometa/cometa-strategy/research/knowledge-base/voice-profile.md` | Emoji fingerprint, tweet length patterns, 5 voice markers, anti-patterns |
| Content Patterns | `~/dev/cometa/cometa-strategy/research/knowledge-base/content-patterns.md` | Performance data by content type, posting timing, templates |
| Twitter Strategy | `~/dev/cometa/cometa-strategy/strategy/twitter-comeback-strategy.md` | Full comeback strategy, 2-week calendar, KPIs, format hierarchy |
| Execution Plan | `~/dev/cometa/cometa-strategy/content/day1-execution-plan.md` | Twitter algorithm weights, ready tweet templates, DM templates |

## MCP Servers

Configure these in `.claude/mcp.json` for the project:

| Server | Purpose |
|--------|---------|
| **CoinGecko** | Token prices, volume, market cap — real-time crypto data |
| **Context7** | twitter-api-v2 docs, Foundry docs |
| **Perplexity** | Deep research on competitors, market trends |
| **Tavily** | Quick lookups, fact-checking |

## Commit Discipline

- Start with lowercase verb: `add`, `fix`, `implement`, `update`, `remove`
- Single concise line
- Push after committing
