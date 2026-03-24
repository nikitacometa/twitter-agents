# /roast-tweet Pipeline — Analysis, Design & Implementation Plan

## Current State

### Existing Generation Infrastructure

| Component | File | What it does |
|-----------|------|-------------|
| **RoastEngine** | `src/roast/roast-engine.ts` | Multi-strategy generation (rubric/persona/adversarial), content filter, optional evaluation |
| **BatchGenerator** | `src/farm/batch-generator.ts` | Farm pipeline wrapper — same 3 strategies + mutations + Twitter enrichment |
| **RoastEvaluator** | `src/evaluation/evaluator.ts` | Shared evaluator: pre-filter → judge panel (1 or 5) → weighted scoring → verdict |
| **SelfEvaluator** | `src/farm/self-evaluator.ts` | Farm-specific wrapper over shared evaluation logic |
| **TwitterEnricher** | `src/farm/twitter-enricher.ts` | Profile + pinned tweet + recent tweets + replies + liked tweets |
| **PromptBuilder** | `src/roast/prompt-builder.ts` | 3 strategy prompts + creative memory + profile context + mutations |
| **CreativeMemory** | `src/roast/creative-memory.ts` | Fire examples + reject examples + angle weights + target history + recent closers |
| **ContentFilter** | `src/content/content-filter.ts` | Regex safety net (TOS violations, banned patterns) |
| **MediaDownloader** | `src/common/utils/media-downloader.ts` | Download tweet images to /tmp for LLM multimodal input |
| **Admin Bot** | `src/admin/bot.ts` | Telegram commands: /roast, /power, /farm, /queue, etc. |

### Current Bot Commands (Generation)

| Command | Model | Variants | Mutations | Evaluation | Profile |
|---------|-------|----------|-----------|------------|---------|
| `/roast <target>` | Sonnet | 3x3=9 | optional | optional (quick) | `roast-research` |
| `/power <target>` | Opus | 2x3=6 | optional | quick (1 judge) | `roast-power` |
| `/farm <target>` | Opus | 2x3=6 | 2 | serious (5 judges) | `farm-generate` |
| `/queue <tweet_url>` | Sonnet | 3 | none | none | `roast-research` |

### How `/queue <tweet_url>` Works Now

1. `isTweetUrl()` detects a tweet link
2. `enqueueTweetUrl()` fetches tweet via ITwitterClient.getTweet()
3. Saves tweet to corpus (tweet_repo)
4. Enqueues as `source: 'mention'` with `context: reply_to:{tweetId}|media:{urls}`
5. Auto-triggers `processNextManual()` which calls `generateRoasts()` with default Sonnet profile
6. **No Twitter enrichment** — only the tweet text and media
7. **No author research** — no profile context injected
8. **No evaluation** — just picks highest self-score variant
9. Posts as reply (if Twitter enabled) or sends to Telegram for approval

### Gap Analysis: /queue tweet vs. Ideal /roast-tweet

| Dimension | /queue (current) | /roast-tweet (target) |
|-----------|-----------------|----------------------|
| **Tweet fetching** | getTweet() — text + media URLs | getTweet() + full enrichment |
| **Author enrichment** | None | Profile + recent tweets + replies + likes + pinned |
| **Tweet context** | Text snippet only | Full text + media analysis + conversation chain |
| **DB lookup** | None | Check existing roasts/data for this author |
| **Generation model** | Sonnet | Opus (`farm-generate` profile) |
| **Strategies** | 1 (rubric only, via RoastEngine) | 3 (rubric + persona + adversarial) |
| **Mutations** | None | 1 (on single strategy only) |
| **Evaluation** | None | Quick (1 judge) |
| **Visual analysis** | Media downloaded but not always used | LLM reads images, references in roast |
| **Output** | Auto-post or approval | Best variant to Telegram with score + [Post] [Skip] [Regen] |
| **Conversation chain** | Not fetched | Parent tweet + quote context (where available) |
| **Target type** | `project` (hardcoded) | `person` (tweet author) |

---

## Design: /roast-tweet Pipeline

### Concept

`/roast-tweet <url>` — a focused, high-quality pipeline optimized for roasting a **specific tweet**. Uses farm-quality generation (Opus, 3 strategies) but skips the farm's batch overhead (discovery, bulk evaluation, stockpiling). Designed for human-in-the-loop: sends the best roast to Telegram, user decides whether to post.

### Pipeline Flow

```
Telegram: /roast-tweet https://x.com/user/status/123
                |
                v
    +-------------------------+
    |  1. TWEET EXTRACTION    |  Parse URL -> fetch tweet via API/Scraper
    |     + media download    |  Download images to /tmp
    |     + conversation chain|  Fetch parent (if reply) + quoted tweet
    +------------+------------+
                 |
                 v
    +-------------------------+
    |  2. AUTHOR ENRICHMENT   |  TwitterEnricher.enrich(@author)
    |     + DB lookup         |  -> profile, tweets, replies, likes, pinned
    |                         |  + check stockpile/farm_attempts for history
    +------------+------------+
                 |
                 v
    +-------------------------+
    |  3. CONTEXT ASSEMBLY    |  buildTweetRoastContext() in prompt-builder.ts
    |                         |  Merge: tweet + media + author + chain + DB
    |                         |  -> single profileContext string
    +------------+------------+
                 |
                 v
    +-------------------------+
    |  4. MULTI-STRATEGY      |  3 strategies x 2 variants = 6
    |     GENERATION          |  + 1 mutation on 1 strategy only
    |     (Opus)              |  Profile: farm-generate
    +------------+------------+
                 |
                 v
    +-------------------------+
    |  5. CONTENT FILTER      |  Pre-filter (length, patterns, blacklist)
    |     + EVALUATION        |  + content-filter (TOS safety)
    |     (quick mode)        |  + RoastEngine's built-in eval (best-first)
    +------------+------------+
                 |
                 v
    +-------------------------+
    |  6. TELEGRAM OUTPUT     |  Best variant + score + tweet link
    |     + inline buttons    |  [Post] [Skip] [Regen]
    +-------------------------+
```

### Key Design Decisions (Revised)

**Reuse RoastEngine's existing evaluation flow, don't reinvent it.**
Original plan proposed "1 judge on top 3 candidates" — a new evaluation approach. But RoastEngine already does this correctly: evaluate best candidate by self-score → if vetoed → try next alternative. This is lazier (doesn't evaluate all 3 upfront) but MORE efficient: if the first candidate passes, we skip 2 unnecessary eval calls. The `quick` evaluation mode (deflation_hawk only) plugs directly into this flow.

**No separate TweetContextBuilder class.**
Original plan proposed a new file `src/roast/tweet-context-builder.ts`. This is overengineered. The data fetching (conversation chain, DB history) happens in the bot command handler. The formatting is a single function `buildTweetRoastContext()` added to the existing `prompt-builder.ts`. The output is a string that goes into the existing `profileContext` parameter — zero changes to generateRoasts() signature or RoastEngine internals.

**No new method on TwitterEnricher.**
Original plan proposed adding `enrichTweet(tweetId)` to TwitterEnricher. But TwitterEnricher is user-level enrichment (profile, timeline, likes). Fetching a parent/quoted tweet is a tweet-level operation — it's just `getTweet()` calls. Conversation chain fetching lives in the bot command handler, 2-3 lines of code. No method needed.

**Mutation on 1 strategy, not all 3.**
Original plan said "1 mutation" but didn't specify distribution. The current farm pipeline applies mutations to ALL strategies uniformly. For /roast-tweet: apply 1 mutation to only 1 randomly chosen strategy. This gives 2 "clean" strategies + 1 mutated = better diversity without diluting base quality on all variants.

**`deflation_hawk` is the right single judge.**
Considered `ct_degen` (shareability focus) since the human makes the final call. But the judge's purpose here is QUALITY GATE, not scoring. `deflation_hawk` starts at 2/5 and requires evidence to raise — it prevents slop from reaching the human. The human's time is valuable; showing them 5 mediocre roasts wastes it.

**Single-judge limitation: no consensus vetoes.**
With 1 judge, `checkFunnyConsensusVeto()` and composite consensus veto can't fire (they require majority vote). Only per-judge hard vetoes apply: FACTUAL < 2, ORIGINAL < 2, DEGEN < 1. A roast that's factual/original but NOT funny won't be auto-vetoed. Accepted tradeoff: the human catches unfunny roasts. Adding a 2nd judge doubles eval cost for marginal benefit in human-in-the-loop flow.

**Target type is always `person`.**
Current `enqueueTweetUrl()` hardcodes `targetType: 'project'`. For /roast-tweet, the target is always the tweet AUTHOR — a person. Setting `targetType: 'person'` activates the person-focused prompt framing in `buildProfileContextSection()` and `buildPersonResearchNote()`.

---

## Tweet Context Extraction: Maximizing Signal

### Data Sources (Priority Order)

**1. Tweet itself** (via API or Scraper)
- Full text (use `note_tweet` expansion for long posts — without it, text truncates)
- Media URLs → download for LLM multimodal analysis
- Engagement metrics (likes, RTs, views, replies)
- Entities (URLs, mentions, hashtags, cashtags)
- Referenced tweets (quote tweet source, reply chain parent)
- Created timestamp

**2. Conversation context** (1-2 additional getTweet() calls)
- If the tweet is a reply → fetch parent tweet (text + author)
- If the tweet quotes another → fetch quoted tweet (text + author)
- Depth limit: 1 level only (no recursive chains)
- Either call may fail silently — proceed with partial data

**3. Author profile** (via TwitterEnricher)
- Bio, display name, follower/following counts, join date
- Verified status, website, location
- Pinned tweet (what they consider their best work)
- Recent original tweets (patterns, obsessions, contradictions)
- Recent replies (who they suck up to, fight with)
- Liked tweets (affiliations, values — often the most revealing)
- Follower/following ratio (clout indicator)

**4. DB history** (existing data)
- Previous roasts of this author via stockpileRepo (avoid repeating angles)
- Recent closers from stockpile (avoid repeating punchlines)
- Farm attempts for same target (don't duplicate exact approaches)

### Computed Signals (derived in context assembly)

| Signal | Source | Roast value |
|--------|--------|-------------|
| **Engagement ratio** | tweet metrics + follower count | `0.02% engagement on 50K followers = talking to the void` |
| **Contradiction detection** | target tweet vs. recent tweets | `3 days ago: "never selling". today: "taking profits"` |
| **Tweet age** | created timestamp | If >48h, prompt note: "old tweet — acknowledge timing or go evergreen" |
| **Quote-flip opportunity** | target tweet text | If tweet makes a claim, prompt: "use their own words as ammunition" |

### Visual Analysis in Tweets

Current `media-downloader.ts` downloads up to 4 images. The LLM (Claude) reads these multimodally via `imagePaths` in the prompt. Key roast vectors from images:

| Visual element | Roast potential |
|----------------|----------------|
| **Charts** | "Your TVL chart looks like my portfolio" — reference specific patterns |
| **Screenshots** | Old tweets aging badly, contradictions, cope posts |
| **Meme usage** | The meme they chose reveals their cope level |
| **Profile pics** | PFP trends (laser eyes era, hexagon NFTs) — date their hopium |
| **Infographics** | Promised roadmaps vs. reality |

**For future visual generation**: The pipeline preserves `imagePaths` and media metadata in the output, so the next iteration can use them for generating response images.

### Prompt Context Assembly

Single function: `buildTweetRoastContext()` in `prompt-builder.ts`. Takes raw tweet data + enrichment + DB history, returns a string injected as `profileContext`.

```
## TARGET TWEET (YOUR PRIMARY AMMUNITION)
"<tweet text>" — @author, <timestamp>
Engagement: <likes> likes, <RTs> RTs, <views> views
<if old> NOTE: This tweet is <N> days old.
<if reply> In reply to @parent: "<parent text>"
<if quote> Quoting @quoted: "<quoted text>"

<if engagement_ratio computed>
Engagement rate: <ratio>% (their followers are decorative)

## TWEET MEDIA
<N> images attached. Read them for roast material.
<image paths>

## AUTHOR PROFILE
<TwitterEnricher output — profile, recent tweets, replies, likes>

## ROAST HISTORY
You've roasted @author <N> times before. Angles used: <list>.
Avoid repeating: <recent closers from stockpile>

## DIRECTIVE
Roast THIS SPECIFIC TWEET. The tweet itself is your primary ammunition.
Reference the exact words, claims, data, or images in the tweet.
The author's profile is supplementary — use it to add depth, not replace the tweet roast.
If the tweet makes a specific claim — quote-flip it. Use their own words against them.
```

The key structural insight: TARGET TWEET section goes FIRST, before author profile. This ensures all 3 strategy prompts (rubric/persona/adversarial) see the tweet as primary context, not supplementary.

---

## Degen Crypto Aesthetics — Integration Points

### What Makes CT Roasts Hit

| Pattern | Example | Application |
|---------|---------|-------------|
| **Specificity > generality** | "$47M TVL but the Discord has 12 people" | Research must find the incongruity |
| **Quote-flip** | Using target's own words against them | Conversation context enables this |
| **Ratio roast** | "12K followers, 3 likes per tweet" | Profile enrichment provides the data |
| **Timeline contradiction** | "6 months ago: 'never selling'. Today: wallet empty" | Recent tweets + on-chain data |
| **Understatement** | "interesting strategy" after listing catastrophic facts | UNDERSTATEMENT angle (highest human score: 3.73) |
| **Visual callout** | "that chart has more red than a soviet parade" | Multimodal image analysis |
| **Peer comparison** | "@competitor shipped a product, you shipped a logo" | Research via Perplexity |
| **"mid" diagnosis** | Single devastating word: "mid" after describing their achievement | CT's cruelest understatement |

### Format Constraints for CT

- **Under 150 chars optimal** (data: 3.4 avg score vs. 2.3 for >200 chars)
- **Max 2 sentences**: setup + punchline
- **No emojis unless ironic** (CT signals: real users don't emoji-spam)
- **Lowercase preferred** — matches degen voice
- **No hashtags** — marks you as a bot or Indian engagement farmer
- **CT slang sparingly** — "ser", "ngmi", "wen" only when it adds punch, not filler
- **Factual accuracy is non-negotiable** — CT will fact-check the roaster, errors = ratio'd

### Red Lines (Account Safety)

- No doxxing (real names, locations, photos)
- No slurs, threats, or appearance-based attacks
- No financial advice (even sarcastic "buy the dip")
- No brigading ("everyone go roast @X")
- No minors, no retail "rekt" victims
- Roast the powerful: KOLs, founders, VCs, influencers — people with platform

---

## Removing /power Command

`/power` is being replaced by `/roast-tweet` as the "premium generation" slot.

| Aspect | /power (remove) | /roast-tweet (add) |
|--------|-----------------|-------------------|
| Input | Target name | Tweet URL |
| Enrichment | None | Full tweet + author + conversation chain |
| Target type | `project` (implicit) | `person` (explicit) |
| Mutations | Optional (all strategies) | 1 (single strategy) |
| Evaluation | Quick (1 judge) | Quick (1 judge) — same |
| Regen | Via queue regeneration | Direct (stores tweet context) |
| Use case | "Give me the best roast of X" | "Roast this specific tweet" |

**Files to modify:**
- `src/admin/bot.ts` — remove `/power` handler, add `/roast-tweet` handler, update /start and /help
- `src/agent/claude-cli.config.ts` — `roast-power` preset can stay (valid config entry, not dead code)

---

## Graceful Degradation

The pipeline should never hard-fail on partial data. Each enrichment step is optional:

| Step | If fails | Fallback |
|------|----------|----------|
| Tweet fetch | Hard fail — no tweet = no roast | Return error to Telegram |
| Media download | Proceed without images | `imagePaths = []`, LLM won't reference media |
| Parent tweet fetch | Proceed without conversation chain | Context omits "In reply to" section |
| Quoted tweet fetch | Proceed without quote context | Context omits "Quoting" section |
| Author enrichment | Proceed without profile | `profileContext` has tweet context only — LLM researches independently |
| DB history lookup | Proceed without anti-repetition | No "avoid these angles" section |

This mirrors how the existing `/queue` flow works — it never crashes on missing data, just degrades quality.

---

## Regen Button Design

The existing `regenerate:` callback (bot.ts:1519) works via `queueManager.regenerateRoast()` which re-runs the full pipeline from queue state. For /roast-tweet, we need a different approach since the roast doesn't go through the queue.

**Approach**: Store the tweet URL + assembled context in a Map keyed by roastId. On [Regen], re-run generation with the SAME context but fresh LLM seed (different mutation, different random angle weights). This avoids re-fetching the tweet and re-enriching the author (saves ~30s + rate limit budget).

```typescript
// In bot.ts — stored per roast-tweet invocation
const roastTweetContexts = new Map<number, {
  tweetUrl: string;
  profileContext: string;
  imagePaths: string[];
  replyToId: string;
}>();
```

On [Regen]: look up stored context → call `generateRoasts()` with same profileContext/imagePaths → store new roastId → send new approval message.

---

## Twitter API Budget

Each /roast-tweet invocation costs Twitter API calls:

| Call | Count | Purpose |
|------|-------|---------|
| getTweet(targetId) | 1 | Fetch target tweet |
| getTweet(parentId) | 0-1 | Fetch parent (if reply) |
| getTweet(quotedId) | 0-1 | Fetch quoted tweet (if quote) |
| enrichViaScraper (4 calls) | 4 | Profile + pinned + timeline + likes |
| **Total** | **5-7** | Per invocation |

With Basic API tier (~15K reads/month), this limits to ~2,000-3,000 /roast-tweet invocations per month. Scraper calls don't count against API quota.

**Future optimization**: Cache enrichment in `target_profiles` table with 24h TTL. If we've enriched the same author recently, reuse cached `profileContext`. Saves 4 calls per repeat target.

---

## Progressive Telegram Updates

Unlike /roast and /farm which show a simple timer, /roast-tweet has distinct stages visible to the user:

```
Stage 1: "Fetching tweet by @author..."        (~2-5s)
Stage 2: "Enriching @author profile..."         (~5-15s)
Stage 3: "Generating roasts (3 strategies)..."  (~60-120s)
Stage 4: "Evaluating best candidates..."        (~15-30s)
Result:  Best variant + score + buttons
```

Each stage updates the same Telegram message (via `editMessageText`). The existing `/queue` flow already does this pattern (bot.ts:567-577). For /roast-tweet, we add stage labels instead of just elapsed time.

---

## Future: Visual Generation (Next Iteration)

The pipeline is designed with visual generation in mind:

1. **Output metadata**: Each roast variant includes `imagePaths` from the original tweet, available for the image generation step
2. **Pipeline extension point**: After evaluation, a step 5.5 can generate images using the winning roast + original media as input
3. **Posting format**: Reply with text + generated image (Twitter API supports media attachments on replies)

No code for this now — just ensuring the data model doesn't block it.

---

## Implementation Plan

### Milestone 1: Context & Prompt (Foundation)

**Task 1: Add `buildTweetRoastContext()` to prompt-builder.ts**

New function in the existing `src/roast/prompt-builder.ts`. Pure formatting — takes structured data, returns a string.

Input:
```typescript
interface TweetRoastContextInput {
  // Target tweet
  tweetText: string;
  tweetAuthor: string;
  tweetTimestamp?: string;
  metrics?: { likes: number; retweets: number; replies: number; views?: number };
  // Conversation chain
  parentTweet?: { text: string; author: string };
  quotedTweet?: { text: string; author: string };
  // Author enrichment (from TwitterEnricher)
  enrichmentContext?: string;
  // Media
  imagePaths?: string[];
  // DB history
  roastHistory?: { count: number; angles: string[]; recentClosers: string[] };
  // Computed signals
  engagementRate?: number;
  tweetAgeDays?: number;
}
```

Output: formatted string matching the context template above. Injected as `profileContext` into `generateRoasts()` — requires zero changes to existing function signatures.

Also: ensure `targetType: 'person'` is always set so existing prompt framing (person-focused research, "focus on personal behavior") activates.

**Why this is a standalone task**: Pure function, testable in isolation, no side effects, blocks Task 2.

---

### Milestone 2: Pipeline (Core)

**Task 2: Add `/roast-tweet` command to admin bot**

The main pipeline handler in `src/admin/bot.ts`. Orchestrates the full flow:

1. Parse tweet URL from command argument
2. Validate URL format (reuse `isTweetUrl()` + `parseTweetUrl()`)
3. Send initial Telegram status: "Fetching tweet..."
4. Fetch tweet via `ITwitterClient.getTweet()`
5. Download media via `downloadTweetMedia()`
6. Fetch conversation chain (1-2 optional `getTweet()` calls for parent/quoted)
7. Update status: "Enriching @author..."
8. Run `TwitterEnricher.enrich(@author)` — graceful null if fails
9. Lookup DB history (stockpileRepo, farmAttemptRepo)
10. Assemble context via `buildTweetRoastContext()`
11. Update status: "Generating roasts..."
12. Call `generateRoasts()` with:
    - `profile: 'farm-generate'` (Opus)
    - `variantCount: 2` (per strategy, 6 total)
    - `mutationCount: 1` (applied to 1 random strategy)
    - `evaluationMode: 'quick'` (deflation_hawk)
    - `profileContext`: assembled tweet context
    - `imagePaths`: downloaded media
    - `targetType: 'person'`
13. Save to `roasts` table as `pending_approval` with `replyToId: tweetId`
14. Store context in `roastTweetContexts` Map (for Regen)
15. Send result to Telegram with [Post] [Skip] [Regen] buttons
16. Cleanup temp media files

**Error handling**: Any step except tweet fetch (step 4) can fail gracefully. If tweet fetch fails, return error immediately. All other failures degrade quality but don't abort.

**Regen callback**: Add a `roast-tweet-regen:` callback prefix to distinguish from regular `regenerate:` callbacks. On regen, look up stored context → re-run `generateRoasts()` with same context.

**Mutation distribution note**: RoastEngine's `runMultiStrategy()` (roast-engine.ts:376-383) applies mutations uniformly to all strategies. To apply to only 1 strategy, we'd need to either modify RoastEngine or pass `mutationCount: 0` and manually inject mutation into the profileContext with a note like "CREATIVE CONSTRAINT: ..." that gets picked up by all strategies naturally. The latter is simpler — no engine changes needed.

Actually, the cleanest approach: pass `mutationCount: 0` to RoastEngine. Instead, pick 1 mutation via `pickMutations(1)` and append `formatMutationSection()` to the profileContext. All 3 strategies see it, but it reads as "creative direction" rather than "hard constraint per strategy." This gives mutation diversity without engine changes.

---

### Milestone 3: Cleanup & Verification

**Task 3: Remove `/power` + update help/start**

- Delete `bot.command('power', ...)` handler from `src/admin/bot.ts`
- Update `/start` command text — replace /power with /roast-tweet, update description
- Update `/help` command text — same
- Keep `roast-power` preset in `claude-cli.config.ts` (valid config, not dead code)

**Task 4: Integration test**

Test the full flow with a real tweet URL:
- Verify: URL parsing → tweet fetch → media download → enrichment → generation → evaluation → Telegram output
- Verify graceful degradation: test with tweet that has no media, is not a reply, author enrichment disabled
- Verify [Post] button works (creates reply tweet)
- Verify [Regen] button works (re-generates with stored context)
- Target timing: under 3 minutes for full pipeline

---

### Task Dependency Graph

```
Task 1 (buildTweetRoastContext)
  |
  +---> Task 2 (/roast-tweet command) ---> Task 4 (integration test)
                                      |
Task 3 (remove /power + update help) -+
```

Tasks 1 and 3 are independent — can be parallelized.
Task 2 depends on Task 1.
Task 4 depends on Tasks 2 and 3.

---

### Estimated LLM Cost per /roast-tweet Invocation

| Step | LLM Calls | Model | Tokens (est.) |
|------|-----------|-------|---------------|
| Generation (3 strategies) | 3 | Opus | ~15K input + ~3K output each |
| Evaluation (1 judge, best-first) | 1-3 | Opus | ~2K input + ~500 output each |
| **Typical** | **4-5** | **Opus** | **~60K tokens** |
| **Worst case** (all vetoed) | **6** | **Opus** | **~63K tokens** |

"1-3" evaluation calls because RoastEngine evaluates best candidate first. If it passes (typical), only 1 eval call. If vetoed, tries alternatives one by one (up to 3).

This is ~3-4x cheaper than a full farm run (5 judges on all candidates) while maintaining quality through multi-strategy diversity + single-judge quality gate + human final decision.

---

## What Was Improved vs. Original Plan

| Original | Problem | Revised |
|----------|---------|---------|
| "1 judge on top 3 candidates" | Reinvents existing evaluation logic, wastes calls on candidates that might pass first try | Use RoastEngine's built-in best-first evaluation flow |
| Separate `TweetContextBuilder` class + file | Overengineered — 2 responsibilities (fetching + formatting) in 1 class, unnecessary abstraction | Single function `buildTweetRoastContext()` in existing prompt-builder.ts |
| `enrichTweet()` method on TwitterEnricher | Wrong abstraction — tweet-level fetching != user-level enrichment | 2-3 `getTweet()` calls in bot command handler |
| "1 mutation always" (all strategies) | Mutations on ALL strategies dilutes base quality | 1 mutation injected via profileContext as "creative direction" |
| No graceful degradation design | Pipeline could hard-fail on enrichment errors | Every step except tweet fetch degrades gracefully |
| No Regen button design | [Regen] mentioned but not specified | Context stored in Map, regen reuses context with fresh LLM seed |
| No progressive updates | 2-3 min wait with just a timer | Stage-by-stage updates: fetching → enriching → generating → evaluating |
| `targetType: 'project'` inherited from /queue | Tweet author is always a person | `targetType: 'person'` activates person-focused prompts |
| 7 tasks across 2 phases | Too granular, some tasks trivial or misplaced | 4 tasks across 3 milestones |
