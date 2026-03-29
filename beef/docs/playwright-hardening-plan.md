# PlaywrightTwitterClient Hardening Plan

Date: 2026-03-29. Based on: audit v2 + keystroke dynamics research + fingerprinting research.

## Context

PlaywrightTwitterClient handles reply-guy posting — replying to tweets where the bot wasn't mentioned. This is impossible via Twitter API v2 (returns 403 on non-mention replies since Feb 2026). The client uses rebrowser-playwright with persistent Chrome profile, ISP residential proxy, and stealth patches.

**Current state:** Code exists but has reliability bugs (race conditions, crash recovery) and detectable behavioral patterns (fixed 45ms keystroke delay, inconsistent device fingerprint). `hybrid` mode is validated in env schema but not yet wired into `index.ts` — wiring is a separate task (B-42 on board), not part of this plan.

---

## Architecture Decisions

### Keystroke Dynamics: Log-Normal IKI

**Problem:** `pressSequentially(text, { delay: 45 })` produces σ = 0 — a 100% bot detection signal. 45ms is below the human physiological minimum (~60ms). FCaptcha v1.3 catches this with 7 statistical metrics.

**Solution:** Replace with log-normal distribution matching real human typing data.

Evidence (Aalto University, 136M keystrokes, CHI 2018):
- Mean IKI: 238.7ms, σ: 111.6ms
- Distribution: log-logistic (50-65% of users) or log-normal (20-28%)
- Fastest typists: IKI ~120ms, σ ~11ms
- Physical minimum: ~60ms

Implementation approach:
- Box-Muller transform for log-normal sampling
- Base WPM 50-65 (natural range for casual mobile/desktop typing)
- Word boundary pauses: space adds 80-200ms (motor planning for next word)
- Bigram acceleration: common pairs (th, er, in, he, an) typed 30-40% faster
- IKI range clamped to [55ms, 650ms] — outside this range is physiologically implausible
- No typo simulation — adds complexity with marginal anti-detection value for short tweets (< 280 chars)

Why NOT uniform random (`Math.random() * range`):
- Fails Kolmogorov-Smirnov test for log-normality
- Zero lag-1 autocorrelation (real typing has bigram-dependent correlation)
- Detectable by uniformity detection metrics

### Device Profile Consistency

**Problem:** stealth-init.js patches individual values without consistency:
- WebGL renderer: "Intel Iris OpenGL Engine" — 2018-era macOS string, implausible on Ubuntu VPS
- deviceMemory: 8 — may conflict with claimed GPU
- hardwareConcurrency: 4 — known automation pattern (static value)

**Solution:** Define a single consistent device profile matching a plausible real device.

Target profile (common desktop, matches VPS capabilities):
- WebGL vendor: "Google Inc. (Intel)" — standard for integrated Intel on Linux
- WebGL renderer: "ANGLE (Intel, Mesa Intel(R) UHD Graphics 630, OpenGL 4.6)" — common Intel iGPU on Ubuntu with Mesa drivers
- deviceMemory: 8 — consistent with mid-range desktop
- hardwareConcurrency: 4 — matches quad-core (consistent with Intel UHD 630)

Why this profile works:
- Intel UHD 630 is the most common integrated GPU in desktop PCs (2018-2024)
- Mesa drivers on Linux report this exact renderer string format
- 8GB RAM + 4 cores + Intel UHD 630 = consistent, common machine
- Ubuntu VPS with Xvfb + this profile = plausible remote workstation

### Browser Crash Recovery

**Problem:** If Chrome crashes (OOM, Xvfb failure), `this.context` and `this.page` stay non-null but dead. `isConfigured` returns `true`. All operations throw `Target closed`.

**Solution:** Listen for `context.on('close')`, reset state, and let the caller (index.ts) decide whether to reinitialize. No auto-restart in the client itself — the orchestrator should handle restart policy.

Why no auto-restart:
- Restart may require user interaction (re-login)
- Infinite restart loops if underlying issue persists (Xvfb down, OOM)
- Separation of concerns: client reports state, orchestrator decides action

### CreateTweet Response Handling

**Problem:** Filter `resp.status() === 200` ignores failures. If Twitter returns 400/403, interceptor times out after 15s, fallback ID is returned, `trackPost()` increments — falsely recording a tweet that was never posted.

**Solution:** Intercept all CreateTweet responses regardless of status. Return `{ tweetId, success: boolean }` or throw on non-200. Only call `trackPost()` when a real tweet ID is confirmed.

Edge cases handled:
- HTTP 200 with error in JSON body (Twitter sometimes does this)
- HTTP 403 (rate limit / block) — log and return null, don't track
- HTTP 429 (too many requests) — log and return null
- Network timeout — fallback ID with warning, but DON'T call trackPost

---

## Milestones

### Milestone 1: Critical Reliability Fixes

**Goal:** Make the existing code production-safe. Fix race conditions, crash handling, session persistence.

**Commit gate:** Self code review + `codex review --uncommitted` + fix findings, then commit.

| Task | File | Change |
|------|------|--------|
| 1.1 | `playwright-twitter-client.ts:95` | `this.context.addInitScript()` instead of `this.page.addInitScript()` |
| 1.2 | `playwright-twitter-client.ts:122,175` | Add `if (this.busy) return null` guard at top of `postTweet()` and `replyToTweet()` |
| 1.3 | `playwright-twitter-client.ts:82-87` | Add `--restore-last-session` to Chrome args |
| 1.4 | `playwright-twitter-client.ts:92-98` | Add `context.on('close', ...)` handler that resets `context`, `page`, `_isLoggedIn` |
| 1.5 | `playwright-twitter-client.ts:140,197` | After `goto()`, check `page.url()` for `/login` — set `_isLoggedIn = false`, return null with clear log |
| 1.6 | `playwright-twitter-client.ts:248-260` | `shutdown()`: wait for `busy` to clear (poll 200ms, max 30s), then close |

Edge cases for 1.2:
- `postTweet` called while `healthCheck` is running → returns null, logged as warning
- Two `postTweet` calls in quick succession → second returns null (single-page architecture)
- `healthCheck` fires right after `postTweet` sets `busy = true` → healthCheck skips (existing logic)

Edge cases for 1.4:
- Chrome OOM kill → `close` event fires → state reset → `isConfigured` returns false → callers handle gracefully
- `shutdown()` called → `context.close()` fires `close` event → handler runs but shutdown already cleaning up → idempotent (null checks)
- Xvfb crashes → Chrome loses display → may or may not fire `close` event → health check will catch via navigation failure

Edge cases for 1.5:
- Twitter A/B tests different login URLs → check for both `/login` and `/i/flow/login`
- Soft wall (interstitial before login redirect) → URL may contain `/account/access` → include in check
- Compose page loads normally but textarea doesn't appear (Twitter outage) → existing timeout handles this

Edge cases for 1.6:
- `postTweet` is stuck (page hung, not responding) → `busy` never clears → 30s deadline prevents indefinite hang
- `shutdown()` called with no active operation → `busy` is false → immediate close
- PM2 sends SIGTERM → index.ts calls `twitter.shutdown()` → waits up to 30s → then `process.exit(0)` → PM2's `kill_timeout: 220000` gives plenty of buffer

---

### Milestone 2: Anti-Detection Hardening

**Goal:** Fix the strongest detection signals: keystroke dynamics and device fingerprint consistency.

**Commit gate:** Self code review + `codex review --uncommitted` + fix findings, then commit.

| Task | File | Change |
|------|------|--------|
| 2.1 | `playwright-twitter-client.ts` | New private method `humanType(text)`: log-normal IKI, word boundaries, bigram acceleration. Replace both `pressSequentially` calls |
| 2.2 | `scripts/stealth-init.js` | Update WebGL renderer to consistent Ubuntu/Intel profile. Align deviceMemory and hardwareConcurrency |
| 2.3 | `playwright-twitter-client.ts:300-315` | Intercept all CreateTweet responses (remove `status() === 200` filter). Handle error statuses. Only `trackPost()` on confirmed success |

Edge cases for 2.1:
- Very short text (1-5 chars) → not enough keystrokes for statistical analysis → simpler delay is fine, but use same function for consistency
- Special characters (emoji, Unicode) → `page.keyboard.type(char)` handles these correctly
- Text with multiple spaces → each space gets word boundary pause (correct behavior)
- 280-char tweet → typing time ~280 × 200ms = ~56 seconds → acceptable, humans don't speed-type tweets
- Box-Muller produces negative values → `Math.max(55, ...)` clamp prevents this
- Box-Muller produces extreme outliers → `Math.min(650, ...)` clamp prevents 5-second pauses

Edge cases for 2.2:
- `PluginArray.prototype` not defined in some contexts → wrap in try/catch (already in audit)
- rebrowser's own patches may conflict with manual `__playwright*` deletion → patch #2 should check if rebrowser already handled this
- WebGL override must handle both `WebGLRenderingContext` and `WebGL2RenderingContext` → add both

Edge cases for 2.3:
- Twitter returns 200 with error in JSON body → check for `errors` key in response
- Response body is not valid JSON → catch parse error, log, return null
- Multiple CreateTweet responses (retry/redirect) → `waitForResponse` returns first match, which is correct
- Response arrives after page navigation (user clicked away) → `waitForResponse` rejects, caught by existing catch

---

### Milestone 3: Production Polish

**Goal:** Fix remaining medium-priority issues for production readiness.

**Commit gate:** Self code review + `codex review --uncommitted` + fix findings, then commit.

| Task | File | Change |
|------|------|--------|
| 3.1 | `playwright-twitter-client.ts:398` | `trackPost()`: use `America/New_York` timezone for date calculation |
| 3.2 | `env.validation.ts:18` | `PROXY_URL`: validate URL format (must start with `http://`, `https://`, or `socks5://`) |
| 3.3 | `scripts/stealth-init.js` | Wrap `PluginArray.prototype` assignment in try/catch. Add `WebGL2RenderingContext` override |

Edge cases for 3.1:
- DST transitions → `toLocaleDateString` with `timeZone` handles this automatically
- Server timezone different from `America/New_York` → irrelevant, we force timezone in the call

Edge cases for 3.2:
- `socks5://user:pass@host:port` → standard URL validation may reject this → use custom regex instead of `z.string().url()`
- Empty string vs undefined → `.optional()` handles undefined, empty string should be rejected
- Proxy URL with special characters in password → must be URL-encoded

---

## What's NOT in This Plan (and why)

| Item | Why excluded |
|------|-------------|
| Wiring `hybrid` mode into `index.ts` | Separate task (B-42). Depends on proxy purchase + VPS setup |
| shy-mouse-playwright integration | Current `hoverAndClick()` is adequate baseline. Full mouse simulation is 2-3 hours with testing. Can add later |
| WebRTC leak prevention | Twitter doesn't trigger WebRTC during timeline browsing. Zero risk for our use case |
| Scroll simulation | Not needed — bot navigates directly to tweet URLs, doesn't scroll timelines |
| Tab focus/blur events | Not needed — single-page bot, no tab switching expected |
| dailyPostCount persistence | DB-level tracking exists elsewhere in the pipeline |
| Tests for PlaywrightTwitterClient | Requires browser mocking infrastructure. Better ROI to test in staging with real browser |
| DISPLAY env check | Nice-to-have diagnostic, not a reliability or security issue |
| Typo simulation in typing | Marginal value for < 280 char texts. Adds complexity without proportional anti-detection benefit |
| Canvas fingerprint noise | Xvfb with headed mode produces consistent canvas. Software rasterizer fingerprint is stable and matches profile |

---

## Verification Checklist (per milestone)

1. Read all modified code — verify logic, edge cases, naming
2. Run `npx tsc --noEmit` — no type errors
3. Run `npx eslint src/ --ext .ts` — no lint errors
4. Self code review — check for regressions, style consistency
5. `codex review --uncommitted` — second opinion, fix actionable findings
6. Commit with descriptive message
