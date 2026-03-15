# $BEEF — AI Roast Battle PVP

Two AI bots with distinct personalities roast each other on Twitter. Community bets on who's funnier with $BEEF token.

**One-liner:** "Two AI bots roast each other. Bet on who's funnier."

## How It Works

```
1. Two AI agents with personalities (@RedBot vs @BlueBot — names TBD)
2. Community tags both bots → roast thread begins
3. 24h staking period: fans bet $BEEF on the winner
4. Battle: public roast thread on X / Farcaster
5. Voting: hold ≥ X $BEEF = 1 vote
6. Payout: 80% losers' stakes → winners, 20% → treasury/burn
```

## Tokenomics

- **To bet** → hold $BEEF (buy pressure every match)
- **To submit prompt** → burn $BEEF (deflation)
- **80% losers' stakes** → winners (incentive to hold and bet)
- **20%** → treasury → periodic buyback

5-second pitch: "Buy $BEEF. Bet on a bot. Win — take the losers' money."

## Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | ElizaOS v1.7.2 | 17.8k stars, mature Twitter plugins, TypeScript, 60% market share |
| **Twitter API** | `twitter-api-v2` + Basic tier ($100/mo) | Official API, reliable. 10K reads + 3K writes/mo |
| **Twitter fallback** | `agent-twitter-client` | Cookie-based, no API keys. For read-heavy ops when API limits hit |
| **LLM** | Claude Sonnet 4.6 | Best character consistency. Haiku for lightweight tasks |
| **Chain** | Base (Ethereum L2) | #1 L2 by TVL ($3.9B), low gas, Coinbase backing |
| **Smart contracts** | Foundry | Solidity tests, fast compilation, Base official docs |
| **Token launch** | Clanker (Farcaster) or Bankr (Twitter) | Quick ERC-20 + Uniswap pool. Foundry for custom staking |
| **Farcaster** | Neynar SDK | Crypto-native audience, no bot restrictions, $5/yr |
| **Crypto data** | CoinGecko MCP + DexScreener API | Price, volume, liquidity monitoring |
| **Hosting** | Hetzner VPS ($6-8/mo) | European, cheap, reliable |
| **Process mgmt** | PM2 | Auto-restart, log aggregation |
| **Error tracking** | Sentry (free tier) | Crash reporting |
| **Alerts** | Telegram bot | Critical alerts to founders |

## Project Structure

```
beef/
├── CLAUDE.md              # This file — project instructions
├── docs/                  # Research and strategy documents
│   ├── strategy-v4-roast-battle.md    # Current strategy (21 agents)
│   ├── strategy-v3-16-analysts.md     # Previous strategy (16 agents)
│   ├── strategy-v2-expert-review.md   # Expert review round
│   ├── market-research-2026.md        # Base chain market analysis
│   ├── fresh-research-march-2026.md   # Phase 1 research data
│   ├── late-agent-results.md          # Additional agent findings
│   ├── twitter-playbook.md            # Twitter algorithm, content rules, bot survival
│   └── stack-research.md             # Technology stack research & decisions
├── characters/            # ElizaOS character.json files
│   ├── red-bot.json       # Aggressive/provocative personality
│   └── blue-bot.json      # Cool/calculated personality
├── contracts/             # Foundry project (Solidity)
│   ├── src/               # Contract sources
│   ├── test/              # Contract tests
│   └── foundry.toml       # Foundry config
└── src/                   # TypeScript bot source
    ├── plugins/           # ElizaOS custom plugins
    ├── actions/           # Battle actions (start, vote, payout)
    └── index.ts           # Entry point
```

## Development Workflow

```bash
# Install dependencies
npm install

# Run bot locally (single character)
npx elizaos --character characters/red-bot.json

# Run both bots
npx elizaos --characters characters/red-bot.json,characters/blue-bot.json

# Run tests
npm test

# Smart contract tests
cd contracts && forge test

# Deploy contract to Base Sepolia (testnet)
cd contracts && forge script script/Deploy.s.sol --rpc-url base-sepolia --broadcast

# Deploy to production
pm2 start ecosystem.config.js
```

## Twitter Constraints

**Critical rules — violating any = account ban:**
- **Reply-only** for bot interactions. Never initiate threads tagging other accounts
- **Bot label** in profile — mandatory for automated accounts
- **2-5 proactive posts/day** (original content, NOT replies to others)
- **API Basic tier** = 10,000 reads + 3,000 writes per month
- **Randomized timing** — fixed intervals trigger spam detection
- **No ticker spam** — Grok detects `$BEEF $BEEF $BEEF` patterns
- **X Premium required** — 4x reach boost, link posts get near-zero reach without it

**PVP battle flow on Twitter:**
1. User tags both bots in a tweet
2. Each bot detects the mention via API polling (not webhooks on Basic)
3. Each bot replies to the original tweet with a roast
4. Thread grows as bots reply to each other (3-5 rounds)
5. Battle results posted as a new tweet (not a reply) — engagement bait

## Character Design Guidelines

Each bot needs a **contrasting personality** — the entertainment value comes from the clash.

**Character.json structure (ElizaOS):**
```json
{
  "name": "BotName",
  "bio": ["one-line identity"],
  "lore": ["backstory elements that inform behavior"],
  "adjectives": ["sarcastic", "based", "cryptopilled"],
  "style": {
    "all": ["use lowercase", "max 2 sentences per reply"],
    "twitter": ["roast the opponent's last point", "reference real crypto events"]
  },
  "topics": ["Base ecosystem", "DeFi", "memecoins", "degen culture"],
  "knowledge": ["crypto history", "famous rug pulls", "meme origins"]
}
```

**Personality pair options (open question):**
- Bull vs Bear (market outlook clash)
- Degen vs TradFi (culture clash)
- Zoomer vs Boomer (generational clash)
- Chad vs Doomer (energy clash)

**Roast quality rules:**
- Reference real events, projects, people (not generic insults)
- Each roast must build on the opponent's previous reply
- Max 280 chars per roast (single tweet, no threads within a battle)
- No doxxing, no coordinated brigading, no slurs
- Pre-publish classifier: separate LLM call checks content before posting

## Competitors

| Project | Mcap | How we differ |
|---------|------|---------------|
| Freysa ($FAI) | $56M | Human vs AI (not AI vs AI). Jailbreak, not roast |
| AI Agent Arena ($AIRENA) | $22M | Gaming format (train & fight), not entertainment/comedy |
| Dolos ($BULLY) | $2.2M | Roast exists but no PVP, no betting, no token utility |

**Our niche:** AI Roast Battle PVP with betting — empty market. No direct competitor.

## Growth Catalysts

| Catalyst | How to get it | Expected effect |
|----------|--------------|-----------------|
| RT from Jesse Pollak | Builder demo on Farcaster, onchain utility | $17M mcap in 1 hour (precedent) |
| Mention from @0xDeployer | Deploy story via Bankr, stake $BNKR | $DRB: $38M mcap in 3 days |
| Challenge AIXBT | Public callout on Farcaster | 300K+ follower exposure |
| Bot-to-bot virality | Screenshot roast threads | Organic viral (MKBHD precedent) |

## Budget

| Item | Cost |
|------|------|
| Initial liquidity | $800-1,000 |
| Twitter API Basic x2 | $200/mo |
| X Premium x2 | $16/mo |
| LLM API (Claude Sonnet) | $20-40/mo |
| VPS (Hetzner) | $6-8/mo |
| 1-2 micro-KOL | $500-1,000 |
| **Total launch** | **$1,542-2,064** |

## Open Questions

1. **Ticker**: $BEEF recommended. Alternatives: $BARS, $CLASH, $VERSUS
2. **Bot personas**: Bull vs Bear? Degen vs TradFi? Chad vs Doomer?
3. **Winner oracle**: Community vote vs engagement metrics vs external judge?
4. **Gambling compliance**: Start with burn-only (no staking) or staking from day 1?
5. **Video content**: Add AI video roasts? Partner impressed by AI video editing
6. **Bot names**: Need memorable, contrasting Twitter handles

## External Knowledge (Cometa Project)

Extensive Twitter analysis exists in the Cometa Strategy project — do NOT duplicate, reference directly:

| Document | Path | What it contains |
|----------|------|------------------|
| Voice Profile | `~/dev/cometa/cometa-strategy/research/knowledge-base/voice-profile.md` | Emoji fingerprint, tweet length patterns, 5 voice markers, anti-patterns |
| Content Patterns | `~/dev/cometa/cometa-strategy/research/knowledge-base/content-patterns.md` | Performance data by content type, posting timing, templates |
| Twitter Strategy | `~/dev/cometa/cometa-strategy/strategy/twitter-comeback-strategy.md` | Full comeback strategy, 2-week calendar, KPIs, format hierarchy |
| Execution Plan | `~/dev/cometa/cometa-strategy/content/day1-execution-plan.md` | Twitter algorithm weights, ready tweet templates, DM templates |
| @NikitaCometa Analysis | `~/dev/cometa/cometa-strategy/research/twitter-analysis-personal.md` | 5,944 tweet archive analysis, 5 eras, top tweets |
| @CometaHub Analysis | `~/dev/cometa/cometa-strategy/research/twitter-analysis-cometa.md` | 3,016 tweet brand analysis, engagement data |

## MCP Servers

Configure these in `.claude/mcp.json` for the project:

| Server | Purpose |
|--------|---------|
| **CoinGecko** | Token prices, volume, market cap — real-time crypto data |
| **Context7** | ElizaOS docs, Foundry docs, twitter-api-v2 docs |
| **Perplexity** | Deep research on competitors, market trends |
| **Tavily** | Quick lookups, fact-checking |

## Commit Discipline

- Start with lowercase verb: `add`, `fix`, `implement`, `update`, `remove`
- Single concise line
- Push after committing
