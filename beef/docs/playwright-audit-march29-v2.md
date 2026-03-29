# PlaywrightTwitterClient — Deep Audit v2

Date: 2026-03-29. Scope: code review + anti-detection research + fingerprinting vectors + new tools survey.

## Overall Score: 6.5/10

Previous audit (v1) scored 5.5/10 — three critical bugs fixed (race condition, tweet ID extraction, idempotency). Current code is functional but has **reliability gaps** for 24/7 production and **stealth gaps** that advanced detectors will catch.

---

## Critical Findings

### 1. `addInitScript` applied to Page, not Context

`playwright-twitter-client.ts:95`

```typescript
await this.page.addInitScript({ path: STEALTH_INIT_PATH });
```

`page.addInitScript()` applies only to that specific page. If Twitter opens a popup, redirect, or new tab — stealth patches won't apply. Twitter occasionally opens popups for login challenges, cookie consent, and age verification.

**Fix:** Replace with `this.context.addInitScript()` — applies to all pages in the context.

### 2. `postTweet`/`replyToTweet` don't check `busy` flag

`playwright-twitter-client.ts:138,194`

Both methods set `this.busy = true` without checking if it's already set. If `healthCheck()` is mid-flight (awaiting `page.goto('/home')`), and `postTweet()` is called from another event handler, both will fight over the same Page — healthCheck navigates to `/home` while postTweet navigates to `/compose/post`.

```
healthCheck() → busy=true → await page.goto('/home') → [event loop yields]
postTweet()  → busy=true (no check!) → await page.goto('/compose/post')
// Both fighting over same page — undefined behavior
```

**Fix:** Add `if (this.busy) { return null; }` guard at the top of both methods, before setting `busy = true`.

### 3. Session cookies not persisted across restarts

`playwright-twitter-client.ts:82-88`

Playwright issue #36139 (closed as expected behavior): session cookies (without `Expires`/`Max-Age`) are NOT saved when persistent context closes. Twitter auth uses session cookies. Every PM2 restart = potential session loss = manual re-login required.

Current Chrome args don't include `--restore-last-session`.

**Fix:** Add `--restore-last-session` to Chrome args. Additionally, consider saving `context.storageState()` on shutdown and restoring on init.

### 4. No browser crash recovery

`playwright-twitter-client.ts:66-119`

If Chrome crashes (OOM, Xvfb failure, OS signal), `this.context` and `this.page` remain non-null but dead. `isConfigured` returns `true`. Every operation throws `Target closed`. `healthCheck()` catches the error but only logs — no restart attempt.

Missing: `context.on('close', ...)` handler.

**Fix:** Add crash detection and auto-reinitialize with exponential backoff:
```typescript
this.context.on('close', () => {
  this.logger.error('Browser context closed unexpectedly');
  this.context = null;
  this.page = null;
  this._isLoggedIn = false;
  // Emit event for parent to decide on restart
});
```

---

## Stealth Layer Assessment

### stealth-init.js — Patch-by-Patch Analysis

| # | Patch | Verdict | Issue |
|---|-------|---------|-------|
| 1 | `navigator.webdriver = undefined` | **Keep** | Works with `--disable-blink-features=AutomationControlled`. Without the flag, `Object.getOwnPropertyDescriptor` reveals the override |
| 2 | `delete __playwright*` globals | **Keep, but insufficient** | rebrowser issue #110: `__pwInitScripts` and `__playwright_builtins__` still visible in some configs. rebrowser's own patches should handle this — manual deletion may conflict |
| 3 | `navigator.languages` | **Keep, add HTTP header sync** | Advanced detectors compare JS value with `Accept-Language` HTTP header. Mismatch = signal |
| 4 | `navigator.plugins` (3 plugins) | **Update** | Static list of 3 plugins is itself a fingerprint. Modern Chrome 2025+ has different defaults. Low priority — most detectors moved past this |
| 5 | `window.chrome` | **Keep** | Required. But `toString()` on patched functions returns non-`[native code]` — advanced check |
| 6 | `permissions.query` | **Keep** | Solid. Fixes notifications permission behavior |
| 7 | `outerWidth/Height` | **Keep** | Safety net for Xvfb. Correct |
| 8 | `deviceMemory = 8` | **Risky** | Fixed `8` may conflict with WebGL renderer claim. If GPU says Intel Iris but memory says 8GB — inconsistency signal |
| 9 | `hardwareConcurrency = 4` | **Risky** | Static `4` is a known automation pattern. Should match device profile |
| 10 | `WebGL renderer: Intel Iris OpenGL Engine` | **Outdated, dangerous** | This is a 2018-era macOS string. On Ubuntu VPS this is implausible. Detectors cross-reference renderer + OS + GPU specs |

**Fundamental JS-patching limitation**: Castle.io research (June 2025) confirms that JS-level overrides introduce their own inconsistencies. CreepJS and GeeTest check **fingerprint profile consistency**, not individual properties. Partial patching creates anomalies.

### Missing Stealth Vectors

| Vector | Severity | Description | Our Status |
|--------|----------|-------------|------------|
| Canvas fingerprinting | **Medium** | Software rasterizer fingerprint reveals VM/cloud. CreepJS checks canvas hash consistency | **Not addressed** |
| WebRTC IP leak | **Medium** | STUN requests bypass HTTP proxy, reveal real IP (Playwright issue #16702) | **Not addressed** |
| iframe cross-check | **Medium** | `navigator.webdriver` in iframes not patched by page-level init scripts | **Partially fixed** (context-level addInitScript would fix) |
| Web Worker leak | **Low** | `navigator.webdriver` in Web Workers not patched | **Not addressed** |
| `Object.getOwnPropertyDescriptor` | **Medium** | Detects JS-overridden properties vs native ones | **Not addressed** — requires C++-level patches |

### rebrowser-playwright: Known Gaps

rebrowser-patches has **open issues** (Oct–Dec 2025):
- **#110**: `__pwInitScripts` and `__playwright_builtins__` still visible
- **#119**: Persistent context shows "controlled by automated software" infobar
- **#124/#125**: Detection failures on live sites
- **#104**: Cloudflare Turnstile detects in infinite loop
- **#108**: HCaptcha detects

Independent benchmark ([techinz/browsers-benchmark](https://github.com/techinz/browsers-benchmark)):
- `camoufox_headless`: **83.3%** bypass rate
- `nodriver-chrome`: **83.3%** bypass rate
- `patchright_headless`: **16.7%** bypass rate

**However**: Camoufox (Firefox-based) has issue #274 — Twitter blocks login through it. Playwright-based solutions still work for Twitter with manual login + cookie persistence.

---

## Code Quality Issues

### 5. [High] No login redirect detection during posting

`playwright-twitter-client.ts:140-142`

`postTweet` navigates to `/compose/post` and immediately looks for `tweetTextarea_0`. If session expired and Twitter redirects to `/login`, `waitFor()` times out after 10 seconds. Error log says "Failed to post tweet" with no diagnosis.

**Fix:** After `goto`, check `this.page.url()` for `/login` pattern and set `_isLoggedIn = false`.

### 6. [High] `waitForCreateTweetResponse` doesn't handle non-200

`playwright-twitter-client.ts:300-315`

Filter: `resp.status() === 200`. If Twitter returns 400 (rate limit) or 403 (block), the interceptor ignores it, timeout fires after 15s, fallback ID `pw_${Date.now()}` is returned. `trackPost()` increments counter even though tweet wasn't posted.

**Fix:** Intercept all `CreateTweet` responses regardless of status. Check status in extraction method.

### 7. [Medium] `shutdown()` doesn't wait for active operations

`playwright-twitter-client.ts:248-260`

If `shutdown()` is called during active `postTweet`, `context.close()` kills the browser immediately. Tweet may already be published by Twitter but the ID is lost — never recorded in DB. PM2 `kill_timeout: 220000` gives 220s but code doesn't use it.

**Fix:** Wait for `busy` to clear before closing:
```typescript
const deadline = Date.now() + 30_000;
while (this.busy && Date.now() < deadline) {
  await new Promise(r => setTimeout(r, 200));
}
```

### 8. [Medium] Timezone mismatch in `trackPost()`

`playwright-twitter-client.ts:398`

`new Date().toISOString().slice(0, 10)` gives UTC date. Browser runs with `timezoneId: 'America/New_York'` (UTC-4/5). Near midnight UTC, counter resets on wrong day relative to Twitter's perspective.

**Fix:** Use `new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })`.

### 9. [Medium] `PROXY_URL` not validated as URL

`env.validation.ts:18`

`PROXY_URL: z.string().optional()` accepts any string. Playwright requires scheme prefix (`http://`, `socks5://`). Invalid format = cryptic browser launch failure.

**Fix:** `z.string().url().optional()` or custom regex for proxy URL format.

### 10. [Medium] No `DISPLAY` environment check

`playwright-twitter-client.ts:79`

`headless: false` requires X server. `DISPLAY=:99` set in ecosystem.config but not checked in code. Running outside PM2 (direct `tsx src/index.ts`) without Xvfb = cryptic "Failed to launch browser".

**Fix:** Check `process.env.DISPLAY` in `initialize()` and log clear warning.

### 11. [Low] `dailyPostCount` not persisted

Resets to 0 on PM2 restart. Multiple restarts/day = inaccurate daily count. Not critical but misleading for rate limit monitoring.

### 12. [Low] `SELECTOR_TIMEOUT` (10s) may be too short

With residential proxy latency (100-300ms RTL), 10s timeout for `hover()` and `click()` operations could be marginal. Twitter pages are heavy (3-5MB JS).

---

## New Tools & Techniques (2025-2026)

### Mouse Simulation: ghost-cursor is Dead for Playwright

ghost-cursor is Puppeteer-native. All Playwright ports have issues:
- `ghost-cursor-playwright` (reaz1995) — last commit 2023, abandoned
- `ghost-cursor-play` (bn-l) — README: "not useable in its current state"
- `playwright-ghost-cursor` (CloverLabs) — new fork, attempting fix

**Recommended alternatives:**
| Library | Approach | Status |
|---------|----------|--------|
| **shy-mouse-playwright** | Fatigue model, polling rate variation (60-144Hz), Perlin noise | Active 2025, npm |
| **OxyMouse** | Gaussian walk + Bezier, detailed analysis in Web Scraping Club #63 | Active 2025 |

Our current `hoverAndClick()` (hover → 100-400ms delay → click) is minimal but functional. Upgrade to shy-mouse-playwright for production hardening.

### Anti-Detection Landscape

| Tool | Benchmark Score | Language | Twitter Compat |
|------|----------------|----------|---------------|
| **Camoufox** | 83.3% bypass | Python (Firefox) | Login blocked (issue #274) |
| **Nodriver** | 83.3% bypass | Python (Chrome) | Unknown |
| **Patchright** | 16.7% bypass | Node.js (Playwright fork) | Works |
| **rebrowser-playwright** | ~50% (estimated) | Node.js (Playwright patches) | Works |

**Verdict:** rebrowser-playwright is the right choice for Node.js + Twitter. Camoufox scores higher but doesn't work with Twitter login. Patchright is an alternative worth monitoring.

### Behavioral Analysis: Twitter's ML Detection

Twitter uses ML-based behavioral biometrics (87% accuracy per research):
- **Timing patterns**: Regular intervals between actions = bot signal
- **Mouse entropy**: Straight-line movement detected; need Bezier curves with noise
- **Scroll behavior**: Linear constant-speed scroll = bot; human scrolls irregularly
- **Tab focus**: Constant focus without blur events = suspicious
- **Activity distribution**: 24/7 without sleep = flagged

Our mitigations: `humanDelay(min, max)` with random range. Adequate for timing but missing scroll simulation and tab focus events.

---

## Improvement Plan (Priority Order)

| # | Fix | Severity | Effort | Impact |
|---|-----|----------|--------|--------|
| 1 | `context.addInitScript()` instead of `page.addInitScript()` | Critical | 5 min | Stealth patches apply to all pages |
| 2 | `busy` guard in `postTweet`/`replyToTweet` | Critical | 10 min | Prevents page navigation collision |
| 3 | `--restore-last-session` Chrome arg | Critical | 5 min | Session cookies survive restart |
| 4 | Browser crash detection + state cleanup | Critical | 30 min | Production resilience |
| 5 | Login redirect detection in posting methods | High | 15 min | Clear error diagnosis |
| 6 | Intercept all CreateTweet statuses, not just 200 | High | 15 min | Correct post tracking |
| 7 | Update WebGL renderer string for Ubuntu/VPS | High | 10 min | Remove implausible fingerprint |
| 8 | Consistent hardware profile (deviceMemory + concurrency + WebGL) | High | 20 min | Fingerprint consistency |
| 9 | `shutdown()` wait for busy operations | Medium | 15 min | Clean shutdown |
| 10 | Timezone fix in `trackPost()` | Medium | 5 min | Accurate daily counting |
| 11 | `PROXY_URL` format validation | Medium | 5 min | Better error messages |
| 12 | WebRTC leak prevention | Medium | 10 min | IP protection |
| 13 | DISPLAY env check | Medium | 5 min | Better error messages |
| 14 | shy-mouse-playwright integration | Medium | 1-2 hrs | Natural mouse movement |

Total estimated: ~3-4 hours for all fixes.

---

## Research Sources

- [rebrowser/rebrowser-patches issues #104, #108, #110, #119, #124, #125](https://github.com/rebrowser/rebrowser-patches/issues)
- [techinz/browsers-benchmark](https://github.com/techinz/browsers-benchmark) — anti-detect benchmark
- [camoufox issue #274](https://github.com/daijro/camoufox/issues/274) — Twitter login blocked
- [Playwright issue #36139](https://github.com/microsoft/playwright/issues/36139) — session cookie persistence
- [Playwright issue #16702](https://github.com/microsoft/playwright/issues/16702) — WebRTC proxy leak
- [Castle.io: From Puppeteer stealth to Nodriver (June 2025)](https://blog.castle.io/from-puppeteer-stealth-to-nodriver-how-anti-detect-frameworks-evolved-to-evade-bot-detection/)
- [AB6162/shy-mouse-playwright](https://github.com/AB6162/shy-mouse-playwright) — Playwright mouse simulation
- [DataDome: CDP Signal Impact on Bot Detection](https://datadome.co/threat-research/how-new-headless-chrome-the-cdp-signal-are-impacting-bot-detection/)
- [twitterapi.io: Error 226 analysis](https://twitterapi.io/blog/twitter-request-looks-like-it-might-be-automated-error-226)
- [Cloudflare JA3/JA4 documentation](https://developers.cloudflare.com/bots/additional-configurations/ja3-ja4-fingerprint/)
