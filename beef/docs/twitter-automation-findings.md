# Twitter Automation Findings

Practical findings from E2E testing sessions (2026-03-19, 2026-03-20). What works, what doesn't, and how to approach local automation with Playwright + scraper.

## Account Setup

### Cookie Auth (@the-convocation/twitter-scraper)

**How it works:** Login once via `scraper.login(username, password, email, twoFactorSecret)`, save cookies to `data/twitter-cookies.json` via `CookieStore`, reuse across sessions.

**Critical: verify cookie ownership.** Cookies contain a `twid` field (e.g. `u%3D<user_id>`) encoding the user ID. If you import cookies from DevTools, always verify the `twid` matches the target account. In our March 20 session, stale cookies from an old test account caused posts to go out from the wrong account.

**Cookie import from Chrome DevTools:**
```bash
npx tsx scripts/import-cookies.ts <ct0> <_twitter_sess> <twid>
```
Export cookies via DevTools → Application → Cookies → `x.com`. Required: `ct0`, `_twitter_sess`, `twid`. The scraper adds `auth_token`, `guest_id`, etc. on first use.

### Error 226 (Anti-Automation Block)

**What it is:** Twitter returns HTTP 226 on `CreateTweet` GraphQL endpoint. Account-level block, not IP-level.

**Triggers observed:**
- New accounts with zero/low activity
- Accounts that only interact via API (no browser sessions)
- Posting immediately after cookie import without browser warm-up

**What we tried (all failed):**
- CycleTLS with Windows Chrome UA → 226
- Regular `fetch` with macOS Chrome 134 UA → 226
- Different `queryId` values for CreateTweet → 226
- Changing content-type, referer headers → 226

**What works:** Posting via real browser (Playwright MCP). The 226 block targets API requests specifically — browser automation with real Chrome profile is not affected.

**Implications for production:**
- New bot accounts need a "warm-up" period of manual/browser activity before API posting works
- If 226 persists, Playwright-based posting is a viable fallback
- Reading (getMentions, getProfile, getTweets) is NOT affected by 226

## Scraper Library Limitations

### Outdated GraphQL Query IDs

The `@the-convocation/twitter-scraper` library hardcodes GraphQL query IDs that Twitter rotates periodically.

**Broken as of 2026-03-20:**
- `SearchTimeline` (`rkp6b4vtR9u7v3naGoOzUQ`) → 404
- `UserTweetsAndReplies` (`zedqO5hg41Ox6UeAKsWWzA`) → 404
- `scraper.searchTweets()` → unusable
- `scraper.getTweetsAndReplies()` → unusable

**Still working:**
- `scraper.getTweets(username, count)` — user's Posts tab (not replies)
- `scraper.getProfile(username)` — profile data
- `scraper.getTweet(id)` — individual tweet by ID
- `scraper.isLoggedIn()` — auth check
- `scraper.getCookies()` / `scraper.setCookies()` — cookie management
- Notifications endpoint (custom implementation, not from library)

**Workaround:** Direct API calls to `search/adaptive.json` instead of library's GraphQL. See `fetchMentionsViaSearch()` in `scraper-twitter-client.ts`.

### Notifications API vs Search Fallback

**Primary: Notifications endpoint** (`/2/notifications/all.json`)
- Works for established accounts with existing mentions
- Returns 0 for new/inactive accounts — mentions exist but notifications API doesn't surface them

**Fallback: Search adaptive** (`/2/search/adaptive.json`)
- Query: `@botUsername`, `result_filter=Latest`, `tweet_search_mode=live`
- Returns `globalObjects.tweets` + `globalObjects.users` (REST v1.1 format, not GraphQL)
- **Caveat:** Also returns empty for very new/low-engagement accounts (Twitter doesn't index them)
- Uses regular `fetch` (not CycleTLS) — CycleTLS returns empty body for this endpoint

**Both endpoints use the same auth pattern:**
```
authorization: Bearer <public_bearer_token>
cookie: <all_cookies_joined>
x-csrf-token: <ct0_cookie_value>
x-twitter-auth-type: OAuth2Session
x-twitter-active-user: yes
```

## Playwright MCP for Twitter

### Setup

Config in `.mcp.json` (gitignored):
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-playwright@latest"],
      "env": {
        "PLAYWRIGHT_CHROME_PROFILE": "/Users/nikitagorokhov/.chrome-profiles/twitter-agents"
      }
    }
  }
}
```

Separate Chrome profile per project to avoid SingletonLock conflicts.

### Browser Posting Workflow

1. **Verify logged-in account:** Check sidebar → Profile link shows `/BeefThis82091`
2. **Autonomous post:** Click "Post" in sidebar → opens compose dialog. If pre-filled with `@someone` (from current page context), select all + delete first
3. **Reply to tweet:** Navigate to tweet URL → click reply textbox → type → click Reply button
4. **Important:** Compose dialog inherits context from current page. If you're on `@<user>/with_replies`, compose will pre-fill `@<user>`. Clear it for standalone posts.

### Known Issues

- **MCP disconnects during long operations** (>2 min, e.g. roast generation). Workaround: `/mcp` reconnect in Claude Code
- **Compose context bleed:** Opening compose while viewing another user's page pre-fills their @handle
- **Snapshot size:** Full page snapshots are 50KB+. Use `browser_wait_for` to confirm page loaded before snapshot

## E2E Test Results (2026-03-20)

### Pipeline (DRY_RUN)

All steps validated:
1. **Auth:** Cookie load + `isLoggedIn()` → true
2. **Classify:** Both mention types correctly classified (`roast_request` with target, `roast_request` without target for parent tweet)
3. **Generate:** 3×3 multi-strategy → 8/9 variants generated (1 adversarial timeout), best 4.8/5
4. **Filter:** Content filter passed (sentence count, length, banned patterns)
5. **Post (DRY_RUN):** Correctly formatted for standalone and reply

### Browser Posting (Real)

All 3 posts published from @BeefThis82091:

| Type | Tweet ID | Content |
|------|----------|---------|
| Autonomous roast | `2034878187143143724` | Base chain roast (standalone post) |
| Scenario 1 reply | `2034878411295137932` | Reply to "@BeefThis82091 roast @base" |
| Scenario 2 reply | `2034878669609738368` | Reply to "@BeefThis82091 roast" (parent tweet roast) |

### What Failed

- API posting (error 226) — account-level anti-automation block
- `scraper.searchTweets()` — outdated GraphQL query ID (404)
- `scraper.getTweetsAndReplies()` — outdated GraphQL query ID (404)
- `search/adaptive.json` — returns empty body for new accounts (indexed but not searchable)
- CycleTLS fetch to search endpoint — empty body (regular `fetch` works but also empty for this account)

## Recommendations for Production

1. **Warm up new accounts** via real browser activity before API posting
2. **Keep Playwright as posting fallback** — if API gets 226, switch to browser automation
3. **Monitor scraper library updates** — GraphQL query IDs rotate, library needs updates
4. **Use notifications endpoint as primary** — more reliable than search for established accounts
5. **Cookie hygiene:** Always verify `twid` matches target account after import. Store per-account cookies in separate files if running multiple accounts
6. **Rate limiting:** Browser actions are slower than API — factor in page load times (2-5s per navigation)
