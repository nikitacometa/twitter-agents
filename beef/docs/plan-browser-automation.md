# Browser Automation Integration Plan

**Date:** 2026-03-18
**Goal:** Test launch $BEEF bot on Twitter via `agent-twitter-client` (cookie auth) with a test account

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    $BEEF Bot                         │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │ Telegram Bot  │    │ Twitter Pipeline          │   │
│  │ (grammY)      │    │                          │   │
│  │               │    │  MentionPoller ──┐       │   │
│  └──────┬───────┘    │  QueueManager ──┤       │   │
│         │            │  EngagementTracker┤       │   │
│         │            └──────────────┬───┘       │   │
│         │                           │            │   │
│         ▼                           ▼            │   │
│  ┌──────────────────────────────────────────┐   │   │
│  │         RoastEngine + ProviderManager     │   │   │
│  │  Claude Code CLI (primary) → SDK fallback │   │   │
│  └──────────────────────────────────────────┘   │   │
│                           │                      │   │
│                           ▼                      │   │
│  ┌──────────────────────────────────────────┐   │   │
│  │         ITwitterClient (interface)         │   │   │
│  │                                           │   │   │
│  │  ┌─────────────┐  ┌───────────────────┐  │   │   │
│  │  │ Official API │  │ agent-twitter-    │  │   │   │
│  │  │ (twitter-    │  │ client (cookie    │  │   │   │
│  │  │  api-v2)     │  │  auth, scraping)  │  │   │   │
│  │  └─────────────┘  └───────────────────┘  │   │   │
│  └──────────────────────────────────────────┘   │   │
└─────────────────────────────────────────────────┘
```

**Key insight:** LLM layer is shared between Telegram and Twitter — both use `generateRoasts()` → `RoastEngine` → `ProviderManager` → Claude Code CLI. No changes needed there.

**What changes:** Only the Twitter transport layer. A new `ScraperTwitterClient` implementing the same interface as the existing `TwitterClient`.

---

## Interface Contract

Both clients must satisfy this contract (structural typing, no explicit interface needed):

```typescript
interface ITwitterClient {
  get isConfigured(): boolean;
  postTweet(text: string): Promise<{ tweetId: string } | null>;
  replyToTweet(text: string, replyToId: string): Promise<{ tweetId: string } | null>;
  getMentions(sinceId?: string): Promise<Array<{
    tweetId: string;
    authorId: string;
    authorName: string;
    text: string;
  }>>;
  getTweetMetrics(tweetIds: string[]): Promise<Map<string, TweetMetrics>>;
}
```

Consumers: `MentionHandler`, `QueueManager`, `EngagementTracker`, `HealthMonitor` (via callback).

---

## Tasks

### Milestone 1: Adapter Implementation (core)

#### T1. Extract `ITwitterClient` interface
- Create `src/twitter/twitter-client.interface.ts`
- Extract interface from existing `TwitterClient` class
- Update consumers to import the interface type instead of the concrete class
- Update `index.ts` factory to select client based on env config
- **No behavior change** — existing Official API client continues to work

#### T2. Implement `ScraperTwitterClient`
- Create `src/twitter/scraper-twitter-client.ts`
- Install `agent-twitter-client` package
- Implement all 5 methods:

| Method | agent-twitter-client mapping |
|--------|------------------------------|
| `isConfigured` | Check if login succeeded |
| `postTweet(text)` | `scraper.sendTweet(text)` → parse response for tweet ID |
| `replyToTweet(text, id)` | `scraper.sendTweet(text, id)` → parse response |
| `getMentions(sinceId?)` | `scraper.searchTweets('@botname', 50, SearchMode.Latest)` → filter by sinceId via BigInt comparison |
| `getTweetMetrics(ids)` | `scraper.getTweet(id)` per ID → extract `likes`, `retweetCount`, `replyCount`, `views` |

**Key differences from Official API:**
- No native `getMentions()` → use `searchTweets('@handle')` as workaround
- No batch `getTweetMetrics()` → iterate per tweet (acceptable for 20 tweets/hour)
- `sendTweet` returns raw `Response`, not structured data → parse tweet ID from response body or headers
- Cookie session may expire → implement `ensureLoggedIn()` with auto-relogin

#### T3. Cookie management
- Create `src/twitter/cookie-store.ts`
- Load cookies from file (`data/twitter-cookies.json`) on startup
- Save cookies after successful login
- Auto-relogin when session expires (detect via `scraper.isLoggedIn()`)
- Support manual cookie injection (from browser DevTools)

#### T4. Client factory in `index.ts`
- New env var: `TWITTER_CLIENT_MODE = 'api' | 'scraper'` (default: `'api'`)
- When `scraper`: instantiate `ScraperTwitterClient` with username/password/email
- When `api`: instantiate existing `TwitterClient` with API keys
- Both pass through the same `ITwitterClient` type to all consumers

### Milestone 2: Configuration & Safety

#### T5. Env schema update
- Add to `env.validation.ts`:
  ```
  TWITTER_CLIENT_MODE: 'api' | 'scraper' (default 'api')
  TWITTER_USERNAME: string (required when mode=scraper)
  TWITTER_PASSWORD: string (required when mode=scraper)
  TWITTER_EMAIL: string (optional, helps avoid verification)
  TWITTER_2FA_SECRET: string (optional, TOTP secret for 2FA)
  ```
- Conditional validation: scraper mode requires username+password; api mode requires 4 API keys

#### T6. Rate limiting for scraper mode
- Implement `ScraperRateLimiter` — internal rate tracker
- Limits: max 5 tweets/hour, max 20 search queries/hour, min 30s between posts
- Jitter on all intervals (±20%)
- These are conservative starting limits — adjust based on testing

#### T7. DRY_RUN guard for scraper
- In scraper mode with `DRY_RUN=true`: skip `sendTweet`, log what would be posted
- `getMentions` and `getTweetMetrics` always work (read-only, safe)

### Milestone 3: Testing & Validation

#### T8. Unit tests for ScraperTwitterClient
- Mock `agent-twitter-client` Scraper class
- Test all 5 methods: happy path + error cases
- Test cookie persistence (save/load cycle)
- Test auto-relogin on expired session
- Test rate limiter enforcement

#### T9. Integration test script
- `scripts/test-scraper.ts` — manual test script:
  1. Login with test account credentials
  2. Verify `isLoggedIn()` returns true
  3. Search for recent mentions of test account
  4. Post a test tweet (with `[TEST]` prefix)
  5. Reply to own tweet
  6. Fetch metrics of posted tweet
  7. Log all results, report pass/fail
- Run with: `npx tsx scripts/test-scraper.ts`

#### T10. End-to-end smoke test
- Start bot with `TWITTER_CLIENT_MODE=scraper DRY_RUN=false`
- Send a mention to test account from another account: `@testbot roast @bitcoin`
- Verify:
  - [ ] Mention detected within 2 poll cycles (≤20 min)
  - [ ] Roast generated via Claude Code CLI
  - [ ] Reply posted to the mention tweet
  - [ ] Reply visible on Twitter
  - [ ] Engagement tracking picks up the reply's metrics after 1 hour
  - [ ] Telegram admin shows the roast in /stats

### Milestone 4: Operational Readiness

#### T11. Logging & monitoring
- Tag all scraper logs with `{client: 'scraper'}` for filtering
- Log cookie refresh events
- Alert on 3+ consecutive login failures → Telegram notification
- Health monitor: add scraper-specific check (`scraper.isLoggedIn()`)

#### T12. Documentation
- Update `.env.example` and `.env.production.example` with new vars
- Add scraper mode notes to `beef/CLAUDE.md`

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Twitter blocks cookie auth login | High | Cookie injection from browser DevTools as fallback; pre-saved cookies in `data/twitter-cookies.json` |
| `agent-twitter-client` GraphQL endpoints change | High | Pin to v0.0.18; monitor GitHub issues; Official API as production fallback |
| Test account gets banned | Medium | Use burner account; residential IP; conservative rate limits |
| `searchTweets` misses mentions | Medium | Complement with `fetchHomeTimeline`; shorter poll interval (3 min) |
| `sendTweet` response format changes | Medium | Parse defensively; log raw response on failure |

---

## Timeline Estimate

| Phase | Tasks | Depends on |
|-------|-------|------------|
| **Phase 1** | T1, T2, T3, T4 | Nothing — can start now |
| **Phase 2** | T5, T6, T7 | T2 (needs client to configure) |
| **Phase 3** | T8, T9 | T2, T3 (needs implementation) |
| **Phase 4** | T10, T11, T12 | T9 (needs passing integration test) |

Phases 1+2 can be done in one session. Phase 3 requires test account credentials. Phase 4 requires a second Twitter account to send test mentions.

---

## What's Needed From You

1. **Test Twitter account** — username, password, email. Burner account preferred
2. **Second Twitter account** (optional) — to send test mentions to the bot
3. **Residential IP or VPN** — datacenter IPs (AWS, etc.) get blocked immediately
4. **Confirm**: run locally first, or deploy to VPS?

---

## Playwright MCP — Verdict

**Not used as transport.** Reasons:
- Playwright MCP is LLM-driven (Claude sends browser commands) — wrong paradigm for autonomous bot
- Heavy (200-500 MB RAM for browser process)
- Twitter detects headless Playwright aggressively

**Where Playwright helps:**
- One-time manual login to extract cookies (when `agent-twitter-client` login fails)
- Ad-hoc debugging: `npx playwright codegen twitter.com` to inspect current selectors
- Not in the production pipeline

---

## Decision Log

| Decision | Rationale |
|----------|-----------|
| `agent-twitter-client` over Playwright | Lightweight (HTTP only), proven in crypto bot ecosystem, sufficient API surface |
| Cookie auth over credential login | Twitter blocks credential login with ArkoseLogin/CAPTCHA; cookies bypass this |
| `searchTweets` for mentions | No native mentions endpoint in scraper; this is how ElizaOS does it |
| Per-tweet metrics instead of batch | No batch endpoint; 20 tweets/hour is acceptable load |
| Conservative rate limits (5 tweets/hr) | Avoid ban during test phase; can increase after validation |
| Interface extraction (T1) before adapter | Clean separation; zero risk to existing Official API path |
