# Activity Feed — Backend Technical Spec

Technical specification for implementing the activity feed (public diary) in the $BEEF bot backend.

## Overview

The bot should emit structured activity events at key pipeline moments and write them to a static JSON file that the frontend SPA polls. Events have two narrative sources:

1. **Creative events** (LLM already running): `diaryThought` field added to the LLM output JSON schema
2. **Routine events** (mechanical): narrative generated from a template bank at emit time

The JSON file is always self-contained — every event has a `narrative` field.

## Output: `activity-feed.json`

Location: `beef/data/activity-feed.json` (served by nginx as a static file)

```typescript
interface ActivityFeed {
  version: number          // schema version, start at 1
  botStatus: 'online' | 'offline' | 'sleeping'
  lastUpdate: string       // ISO 8601
  stats: {
    totalRoasts: number
    totalLikes: number
    stockpileSize: number
    burnedTokens: number   // placeholder 0 until token launches
    uptime: string         // e.g. "3d 14h"
  }
  events: ActivityEvent[]  // newest first, max 50
}

interface ActivityEvent {
  id: string               // uuidv4 or `${type}-${timestamp}-${hash}`
  type: ActivityEventType
  timestamp: string        // ISO 8601
  narrative: string        // ALWAYS present — LLM-generated or template
  data?: Record<string, unknown>
  expandable?: {
    title: string
    content: string
  }
}

type ActivityEventType =
  | 'wake' | 'sleep' | 'hunt' | 'target_locked'
  | 'research' | 'cooking' | 'roast_ready' | 'posted'
  | 'engagement' | 'mention' | 'burn_request' | 'challenge'
  | 'think' | 'stats' | 'error' | 'milestone'
```

## New Module: `beef/src/activity/`

### `activity-logger.ts`

```typescript
class ActivityLogger {
  constructor(opts: {
    feedPath: string           // path to activity-feed.json
    getStats: () => ActivityFeedStats
    logger: Logger
    maxEvents?: number         // default 50
  })

  emit(event: {
    type: ActivityEventType
    narrative?: string         // if provided (LLM), use it; if null, use template
    data?: Record<string, unknown>
    expandable?: { title: string; content: string }
  }): void

  setStatus(status: 'online' | 'offline' | 'sleeping'): void
}
```

**Behavior:**
- `emit()` creates an event with generated ID and current timestamp
- If `narrative` is null/undefined, picks a template from the template bank (see below)
- After each `emit()`, writes the full JSON atomically: `writeFileSync(tmpPath)` + `renameSync(tmpPath, feedPath)`
- Maintains in-memory buffer of last `maxEvents` events (newest first)
- On startup, reads existing file (if present) to preserve history across restarts
- `getStats()` is called on each flush to get fresh stats

### `templates.ts`

Template bank for routine events. Structure:

```typescript
const TEMPLATES: Record<ActivityEventType, string[]> = {
  wake: [
    "booting up. someone's about to have a bad day.",
    // 20-25 per type
  ],
  hunt: [
    "opened a file on {target}. the tvl smells funny.",
    // variables: {target}, {source}
  ],
  // ... all 16 types
}

function pickTemplate(type: ActivityEventType, eventId: string): string
function interpolate(template: string, data: Record<string, unknown>): string
```

Template selection is deterministic via `hash(eventId) % templates.length`.

Variable interpolation: `{target}`, `{author}`, `{score}`, `{count}`, `{error}`, `{tweetId}`.

### `types.ts`

Shared types for the activity module. Keep in sync with `beef-web/src/types/activity.ts`.

## Template Generation

Templates should NOT be hand-written. Use LLM generation:

1. Create a generation prompt using the full `characters/beef-bot.json` systemPrompt as context
2. Generate 50 candidates per event type
3. Curate best 20-25 per type (manual review or automated pre-filter)

**Template quality criteria:**
- Setup + punchline structure (the humor is in the TWIST, not the setup)
- Specific crypto/DeFi vocabulary (TVL, whitepaper, smart contract, roadmap, etc.)
- $BEEF forensic-accountant-meets-shitposter voice
- Self-aware AI references where appropriate
- Max 150 chars, 1-2 sentences
- Variables are springboards, not the joke itself — template must be funny even with generic data

## LLM diaryThought Injection

### Which prompts to modify

| Function in `prompt-builder.ts` | Task profile | Modify? | Rationale |
|---|---|---|---|
| `buildRoastPrompt()` | `roast-research` / `farm-generate` | **Yes** | Full research context, max value |
| `buildPersonaPrompt()` | `roast-research` / `farm-generate` | **Yes** | Same |
| `buildAdversarialPrompt()` | `roast-research` / `farm-generate` | **Yes** | Same |
| `buildNoResearchPrompt()` | `roast-quick` | **No** | Fast fallback, don't add latency |
| `buildCasualReplyPrompt()` | `reply` | **Yes** | Low risk, conversational context |
| `buildEvaluationPrompt()` | `farm-evaluate` | **No** | Judges are not $BEEF persona |

### What to add

In the OUTPUT FORMAT section of each modified prompt, add as the **LAST field**:

```
"diaryThought": "A 1-2 sentence internal monologue for your public activity diary. Write in your $BEEF voice about what you just researched or discovered about this target. Reference specific findings from your research — the funnier and more specific the better. This is NOT the roast — it's your private forensic note about the process. Max 150 chars."
```

### How to extract

In `roast-engine.ts`, after parsing the main JSON output:

```typescript
const diaryThought = parsed.diaryThought as string | undefined
// Pass it up through GenerateRoastsResult or return separately
```

Add `diaryThought?: string` to:
- The output parsing logic in `roast-engine.ts`
- `GenerateRoastsResult` in `admin/roast-generator.ts` (or wherever the result type is)
- Any intermediary types that carry the result up to `queue-manager.ts`

## Integration Points

### `index.ts` — initialization

```typescript
import { ActivityLogger } from './activity/activity-logger.js';

const activityLogger = new ActivityLogger({
  feedPath: resolve(process.cwd(), 'data/activity-feed.json'),
  getStats: () => ({
    totalRoasts: roastRepo.getTotalCount(),
    totalLikes: 0, // TODO: from engagement snapshots
    stockpileSize: stockpileRepo.getAvailableCount(),
    burnedTokens: 0,
    uptime: formatUptime(startTime),
  }),
  logger,
});

// Emit wake event
activityLogger.emit({ type: 'wake' });
activityLogger.setStatus('online');

// Pass to QueueManager, MentionHandler, Scheduler
// ... (add activityLogger to constructor opts where needed)

// Shutdown
const shutdown = async () => {
  activityLogger.emit({ type: 'sleep' });
  activityLogger.setStatus('offline');
  // ... existing shutdown
};
```

### `queue-manager.ts` — main pipeline

Emit events at these points (line references approximate):

| Point | Event type | Data | Narrative source |
|---|---|---|---|
| `dequeueAndProcess()` — item dequeued | `hunt` | `{ target, source }` | template |
| After `buildProfileContext()` | `target_locked` | `{ target }` | template |
| During `generateRoasts()` (before call) | `cooking` | `{ target, strategies: 3 }` | template |
| After `generateRoasts()` completes | `think` | `{ target, variantCount }` | `diaryThought` from LLM |
| After `evaluateAndStockpile()` | `roast_ready` | `{ target, score, verdict, roastText }` | `diaryThought` or template |
| After successful `postOrSkip()` | `posted` | `{ target, tweetId, roastText }` | template |
| On error catch | `error` | `{ target, error: msg }` | template |
| Quiet hours skip | `sleep` | `{ reason: 'quiet_hours' }` | template |
| Daily limit reached | `stats` | `{ count, limit }` | template |
| Stockpile hit | `cooking` | `{ target, fromStockpile: true }` | template |

### `mention-handler.ts`

| Point | Event type | Data |
|---|---|---|
| New roast request mention | `mention` | `{ author, text, requestType: 'roast_request' }` |
| New casual mention | `mention` | `{ author, text, requestType: 'reply' }` |
| Burn request (future) | `burn_request` | `{ author, amount }` |

### `engagement-tracker.ts`

| Point | Event type | Data |
|---|---|---|
| After `trackRecent()` | `engagement` | `{ tracked, newLikes, topTweet }` |

### `scheduler.ts`

| Point | Event type | Data |
|---|---|---|
| Periodic stats (add new hourly/daily job) | `stats` | `{ roastsToday, stockpileSize, mentions24h }` |

## File Structure

```
beef/src/activity/
  activity-logger.ts    # main class
  templates.ts          # template bank (20-25 per event type)
  types.ts              # ActivityEvent, ActivityFeed types
```

## Data Directory

Create `beef/data/` directory (gitignored except for README):
- `activity-feed.json` — written at runtime, not committed
- Add `data/` to `.gitignore` with exception for README

## Testing

- Unit test `ActivityLogger.emit()` — verify event structure, max buffer, atomic write
- Unit test template interpolation — verify all variables resolve
- Unit test deterministic template selection — same eventId = same template
- Integration test: verify `activity-feed.json` is valid JSON after multiple emits

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `diaryThought` degrades roast quality | Last field in schema, isolated instruction, validated by A/B comparison |
| LLM doesn't generate `diaryThought` | Fallback to template — `narrative` is always filled |
| JSON file grows unbounded | Hard limit 50 events, oldest dropped on emit |
| Frequent writes under load | Debounce: max 1 write per 5 seconds (buffer in memory, flush on timer) |
| Crash during write | Atomic write via tmp file + rename (POSIX guarantee) |

## nginx Configuration

Add to the beef VPS nginx config (or cometa-proxy):

```nginx
location /api/activity {
    alias /home/deploy/beef/data/activity-feed.json;
    add_header Content-Type application/json;
    add_header Cache-Control "public, max-age=30";
    add_header Access-Control-Allow-Origin "https://app.0xbeef.wtf";
}
```

The SPA at `app.0xbeef.wtf` will poll this endpoint every 5 minutes.
