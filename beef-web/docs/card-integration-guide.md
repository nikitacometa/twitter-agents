# Card System V2 — Integration Guide for beef bot

## Overview

`beef-web/src/cards/` contains a standalone image generation pipeline that renders branded cards as JPEG/PNG buffers. The pipeline is **pure TypeScript, no server required** — import `generateCard()`, pass data, get a `Buffer` back.

**Pipeline:** JSX template → satori (SVG) → resvg (PNG) → sharp (composite with AI art background + red border frame) → JPEG buffer

**Dependencies:** `satori`, `@resvg/resvg-js`, `sharp`, font files (`assets/fonts/`), art scenes (`src/cards/art/`)

## How to integrate into beef bot

### Option A: CLI (simplest, no dependency changes)

Call the CLI from beef bot via `child_process`:

```typescript
import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BEEF_WEB = join(__dirname, '../../beef-web');

async function generateCardImage(type: string, data: object): Promise<string> {
  const outputPath = `/tmp/beef-card-${Date.now()}.jpg`;

  return new Promise((resolve, reject) => {
    const child = execFile('npx', [
      'tsx', 'src/cards/cli.ts',
      '--type', type,
      '--data', '-',
      '--output', outputPath,
      '--format', 'jpeg',
    ], { cwd: BEEF_WEB }, (err) => {
      if (err) return reject(err);
      resolve(outputPath);
    });

    child.stdin!.write(JSON.stringify(data));
    child.stdin!.end();
  });
}
```

**Pros:** Zero coupling, no shared dependencies.
**Cons:** ~2-3s cold start per call (tsx compilation).

### Option B: Direct import (recommended for production)

Add `beef-web` card modules as a local dependency or copy `src/cards/` into beef bot. The generator has no web framework dependencies — it only needs `satori`, `@resvg/resvg-js`, `sharp`, and the font/art files.

```typescript
import { generateCard } from '../../beef-web/src/cards/generator.js';
import type { CardData } from '../../beef-web/src/cards/types.js';

async function makeRoastCard(roast: StockpileRow): Promise<Buffer> {
  const card: CardData = {
    type: 'roast',
    data: {
      targetName: roast.target_name,
      targetType: roast.target_type,   // 'project' | 'token' | 'trend' | 'person'
      roastText: roast.text,
      qualityScore: roast.quality_score,
      timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    },
  };

  return generateCard(card, { format: 'jpeg', quality: 90 });
}
```

**Required npm packages** (add to beef bot if not present):
```
satori @resvg/resvg-js sharp
```

**Required files** (copy or symlink):
```
beef-web/assets/fonts/*.ttf          → font files (IBM Plex Mono + Zilla Slab)
beef-web/src/cards/art/scene-*.png   → 5 AI art backgrounds (~8.5MB total)
```

## Available card types

### 1. `roast` — Main roast tweet card (1600x900)

**When to use:** Every roast tweet. The primary card type — attach to all posted roasts.

```typescript
const card: CardData = {
  type: 'roast',
  data: {
    targetName: 'SafeMoon',
    targetType: 'project',       // 'project' | 'token' | 'trend' | 'person'
    roastText: 'Their smart contract is neither smart nor a contract. It\'s a vending machine that only takes your money and dispenses regret.',
    qualityScore: 4.4,           // 1.0-5.0, controls verdict: RARE / MEDIUM RARE / CRISPY / WELL DONE
    timestamp: 'Mar 24',         // optional
  },
};
```

**Art:** Bull skull character on left pointing accusatorially, fire behind. Text on dark right panel.

**Maps from stockpile/roasts table:**
- `target_name` → `targetName`
- `target_type` → `targetType`
- `text` → `roastText`
- `quality_score` → `qualityScore`

---

### 2. `stats-overview` — Bot stats dashboard (1600x900)

**When to use:** Periodic stats tweet (daily/weekly), milestone celebrations, "week in review" posts.

```typescript
const card: CardData = {
  type: 'stats-overview',
  data: {
    totalRoasts: 1247,
    avgQualityScore: 4.2,
    projectsAudited: 89,
    topTargets: [
      { name: 'SafeMoon', count: 14 },
      { name: 'Cardano', count: 12 },
      { name: 'CZ', count: 10 },
      { name: 'Justin Sun', count: 8 },
      { name: 'Solana', count: 6 },
    ],
  },
};
```

**Data source:** Query directly from SQLite:
```sql
SELECT COUNT(*) as totalRoasts FROM roasts WHERE status = 'posted';
SELECT AVG(quality_score) as avgQualityScore FROM roasts WHERE status = 'posted';
SELECT COUNT(DISTINCT target_name) as projectsAudited FROM roasts WHERE status = 'posted';
SELECT target_name as name, COUNT(*) as count
  FROM roasts WHERE status = 'posted'
  GROUP BY target_name ORDER BY count DESC LIMIT 5;
```

---

### 3. `leaderboard` — Top targets ranking (1200x1200)

**When to use:** Weekly "most roasted" ranking, community engagement posts, "hall of shame" content.

```typescript
const card: CardData = {
  type: 'leaderboard',
  data: {
    title: 'MOST ROASTED',
    subtitle: 'top 10 audited targets this week',
    entries: [
      { rank: 1, name: '@CometaHub', score: 28, count: 28 },
      { rank: 2, name: 'CZ', score: 7, count: 7 },
      { rank: 3, name: 'Cardano', score: 6, count: 6 },
      // ...up to 10 entries
    ],
  },
};
```

**Variations:**
- "MOST ROASTED" — by roast count
- "HIGHEST RATED" — by avg quality score (use `score` for avg, `count` for roast count)
- "HALL OF SHAME" — worst targets by some metric
- "COMMUNITY PICKS" — most requested via roast-me

---

### 4. `number-card` — Big number showcase (1600x900)

**When to use:** Milestones, impressive stats, any single number worth celebrating. Very dramatic — fire explosion background.

```typescript
const card: CardData = {
  type: 'number-card',
  data: {
    number: '1,247',                              // pre-formatted string
    achievement: 'roasts served',                  // what the number means
    supportingText: 'the slaughterhouse never sleeps',  // flavor text
  },
};
```

**Use cases:**
- "1,000 roasts served" — milestone
- "$4,200 of $BEEF burned" — token burn milestone
- "47% rug pull rate" — shocking stat from research
- "0 due diligence" — roast stat about a target
- "98.6% scam rate" — data point from on-chain analysis

---

### 5. `stat-duo` — Two numbers side by side (1200x1200)

**When to use:** Contrasting two stats about a target or topic. Great for "exposing" data, before/after comparisons, ratio breakdowns.

```typescript
const card: CardData = {
  type: 'stat-duo',
  data: {
    targetName: 'Solana Memecoins',                // optional header
    stats: [
      { value: '47%', label: 'of GDP from DEX volume' },
      { value: '98.6%', label: 'of launched tokens were rugs' },
    ],
    sourceText: 'half an economy built on a 1.4% legitimacy rate',  // optional italic quote
  },
};
```

**Use cases:**
- Two contrasting stats about a project/chain
- Before/after comparison
- "What they claim" vs "what the data says"
- Pair with a roast tweet as supplementary data

---

### 6. `stat-quad` — Four numbers in 2x2 grid (1600x900)

**When to use:** Comprehensive data dump about a target. "Forensic report" style — four damning numbers at once.

```typescript
const card: CardData = {
  type: 'stat-quad',
  data: {
    targetName: 'Solana',                          // optional header
    stats: [
      { value: '47%', label: 'GDP from DEX volume' },
      { value: '98.6%', label: 'rug pull rate' },
      { value: '1.4%', label: 'legitimate projects' },
      { value: '$0', label: 'due diligence budget' },
    ],
    sourceText: 'textbooks will call this "infrastructure"',  // optional italic quote
  },
};
```

**Use cases:**
- Deep dive on a project/chain with multiple data points
- "Forensic audit" thread starter
- Weekly recap with 4 key metrics
- Target profile with 4 key stats

## Integration points in beef bot pipeline

### 1. Roast posting (highest priority)

In `queue-manager.ts` → `postOrSkip()`, generate a roast card and attach as media:

```typescript
// After selecting the roast text, before posting:
const cardBuffer = await generateCard({
  type: 'roast',
  data: {
    targetName: item.target_name,
    targetType: item.target_type as RoastCardData['targetType'],
    roastText: roastText,
    qualityScore: roast.quality_score,
  },
});

const imagePath = `/tmp/beef-card-${Date.now()}.jpg`;
writeFileSync(imagePath, cardBuffer);

// Post with media (requires ITwitterClient.postTweetWithMedia)
const result = replyToId
  ? await this.twitter.replyToTweetWithMedia(text, replyToId, imagePath)
  : await this.twitter.postTweetWithMedia(text, imagePath);

// Cleanup
unlinkSync(imagePath);
```

**Prerequisite:** Add `postTweetWithMedia(text, imagePath)` to `ITwitterClient` and implement in both `TwitterClient` (Official API: `v1.uploadMedia()` + `v2.tweet({ media: { media_ids } })`) and `ScraperTwitterClient` (upload via GraphQL media endpoint).

### 2. Periodic stats tweets (autonomous content)

Add a new cron job or scheduled task:

```typescript
// Weekly stats card — run every Sunday
async function postWeeklyStats() {
  const stats = await db.getWeeklyStats();  // query from roasts table
  const card = await generateCard({
    type: 'stats-overview',
    data: stats,
  });
  // ...post with media
}
```

### 3. Milestone detection

In `queue-manager.ts` after successful post, check for round numbers:

```typescript
const totalPosted = await this.repo.countPosted();
if (totalPosted % 100 === 0) {
  const card = await generateCard({
    type: 'number-card',
    data: {
      number: totalPosted.toLocaleString(),
      achievement: 'roasts served',
      supportingText: 'the slaughterhouse never sleeps',
    },
  });
  // ...post milestone tweet with card
}
```

### 4. Farm pipeline — data cards

When LLM generates roasts with research data (stats about a target), extract numbers into stat-duo or stat-quad cards:

```typescript
// In farm generate, when enricher returns data points:
if (enrichment.dataPoints && enrichment.dataPoints.length >= 2) {
  const card = await generateCard({
    type: enrichment.dataPoints.length >= 4 ? 'stat-quad' : 'stat-duo',
    data: {
      targetName: target.name,
      stats: enrichment.dataPoints.slice(0, 4).map(dp => ({
        value: dp.value,
        label: dp.label,
      })),
    },
  });
  // Save card to stockpile alongside roast text
}
```

### 5. Telegram admin — preview cards

In `admin/bot.ts`, when showing pending approvals, render a card preview and send as photo:

```typescript
bot.action(/^approve:(.+)$/, async (ctx) => {
  const roast = await getStockpileRoast(roastId);
  const card = await generateCard({
    type: 'roast',
    data: { /* ... */ },
  });
  await ctx.replyWithPhoto({ source: card }, { caption: 'Card preview' });
});
```

## Output specs

| Format | Size | Quality | Use |
|--------|------|---------|-----|
| JPEG (default) | 80-150KB | 90 | Twitter posts (smaller, progressive) |
| PNG | 200-400KB | lossless | Telegram preview, archival |

All cards have a 3px red border frame (`rgba(204,0,0,0.6)`) for light/dark Twitter theme compatibility.

Canvas sizes:
- `roast`, `stats-overview`, `number-card`, `stat-quad` → 1600x900 (landscape)
- `leaderboard`, `stat-duo` → 1200x1200 (square)

## CLI for testing

```bash
cd beef-web

# Roast card
pnpm generate-card --type roast --data '{"targetName":"SafeMoon","targetType":"project","roastText":"Their roadmap is just a map of all the exits.","qualityScore":4.2}' --output /tmp/test-roast.jpg

# Number card
pnpm generate-card --type number-card --data '{"number":"1,000","achievement":"roasts served","supportingText":"the slaughterhouse never sleeps"}' --output /tmp/test-number.jpg

# Stat duo (pipe from stdin)
echo '{"targetName":"Solana","stats":[{"value":"47%","label":"GDP from DEX"},{"value":"98.6%","label":"rug rate"}],"sourceText":"built different"}' | pnpm generate-card --type stat-duo --data - --output /tmp/test-duo.jpg

# All types
for type in roast stats-overview leaderboard number-card stat-duo stat-quad; do
  echo "Rendering $type..."
done
```

## Card selection logic (suggested)

```typescript
function selectCardType(context: PostContext): CardType | null {
  // Every roast gets a card
  if (context.type === 'roast') return 'roast';

  // Milestone numbers
  if (context.type === 'milestone') return 'number-card';

  // Periodic stats
  if (context.type === 'weekly-stats') return 'stats-overview';

  // Data-heavy roasts with extracted numbers
  if (context.dataPoints?.length >= 4) return 'stat-quad';
  if (context.dataPoints?.length >= 2) return 'stat-duo';

  // Weekly ranking
  if (context.type === 'leaderboard') return 'leaderboard';

  return null;  // text-only tweet
}
```

## File reference

```
beef-web/src/cards/
  generator.ts     — generateCard(card, options) → Buffer
  types.ts         — CardData, CardType, all data interfaces
  theme.ts         — colors, fonts, scoreToVerdict(), sizes
  fonts.ts         — font loading (IBM Plex Mono + Zilla Slab)
  assets.ts        — AI art scene buffers (loaded once at module init)
  cli.ts           — CLI wrapper for testing
  templates/
    roast-card.tsx       — main roast (split scene)
    stats-overview.tsx   — bot stats dashboard (split scene)
    leaderboard.tsx      — target ranking (corner anchor)
    number-card.tsx      — big number showcase (full bleed)
    stat-duo.tsx         — two stats (corner anchor)
    stat-quad.tsx        — four stats grid (split scene)
  art/
    scene-accuse.png     — roast card background
    scene-analyst.png    — stats/quad background
    scene-arena.png      — leaderboard background
    scene-explosion.png  — number card background
    scene-present.png    — stat-duo background

beef-web/assets/fonts/
    IBMPlexMono-Regular.ttf
    IBMPlexMono-SemiBold.ttf
    IBMPlexMono-Bold.ttf
    ZillaSlab-Medium.ttf
    ZillaSlab-SemiBold.ttf
    ZillaSlab-Bold.ttf
```

## Rendered examples

See `beef-web/docs/card-examples/` for all 6 card types rendered with sample data.
