# PlaywrightTwitterClient Audit

Date: 2026-03-29. Scope: code review + anti-detection research + Twitter detection research.

## Overall Score: 5.5/10

Solid skeleton, but 3 critical bugs and significant stealth gaps. Must fix before deploying to production.

---

## Critical Bugs (must fix)

### 1. Race condition: healthCheck vs active posting

`playwright-twitter-client.ts:96-98`

`setInterval(healthCheck, 5min)` fires unconditionally. `healthCheck()` calls `page.goto('x.com/home')`. If a `replyToTweet()` is mid-flight (textarea filled, about to click post), the health check navigates away — destroying the in-progress post. Playwright does NOT serialize calls to the same `Page`.

**Fix:** Add a `busy` flag. Health check skips iteration when `busy === true`.

### 2. extractPostedTweetId returns wrong ID for replies

`playwright-twitter-client.ts:256-286`

After `replyToTweet()`, the page URL stays at `x.com/i/status/{replyToId}` — Twitter doesn't navigate to the new reply. The regex on line 267 matches and returns `replyToId` (the parent tweet), not the newly posted reply. Every reply gets the wrong tweet ID in the DB.

**Fix:** Intercept the `CreateTweet` GraphQL response via `page.waitForResponse()` before clicking post. Parse the new tweet ID from the response JSON.

### 3. initialize() has no idempotency guard

`playwright-twitter-client.ts:62-99`

Double call leaks: first browser context never closes, first health check timer never clears. Can happen on PM2 restart without clean shutdown.

**Fix:** Check `this.context !== null` at top, return early or call `shutdown()` first.

---

## Important Issues

### 4. stealth-init.js is minimal — 6 missing patches

Current: 3 patches (webdriver, languages, playwright globals).
Needed for Twitter: 9+ patches. Research confirms Twitter checks these:

| Missing patch | Detection risk | Source |
|---------------|---------------|--------|
| `navigator.plugins` (empty array) | High | bot.sannysoft.com |
| `window.chrome` object | High | Twitter checks `chrome.runtime` |
| `navigator.permissions.query` | Medium | Notifications permission behavior |
| `navigator.deviceMemory` | Medium | Undefined in automation |
| `navigator.hardwareConcurrency` | Medium | Undefined in some contexts |
| `WebGL renderer` (SwiftShader) | Medium | Fingerprint signal |
| `window.outerWidth/Height` (0 in headless) | Low (we use headful) | Fallback safety |

### 5. No mouse movement before clicks

Twitter tracks mouse events before clicks. Current code: `click('[data-testid="reply"]')` — instant teleport click with no mouse trail. Behavioral detection signal.

**Fix:** Add `ghost-cursor` or manual `page.mouse.move()` with Bezier curves before each click.

### 6. No selector fallbacks

`tweetButtonInline` and `tweetButton` selectors are relatively stable but have broken after UI redesigns (MoneyPrinterV2 issue #100, Feb 2025). Current code has no fallback — a selector change = silent failure (catch returns `null`).

**Fix:** Fallback chain: `[data-testid="tweetButtonInline"]` -> `[data-testid="tweetButton"]` -> text-based.

### 7. isConfigured doesn't reflect login state

`isConfigured` returns `true` if browser is launched, even if session is expired. Callers get `true`, attempt post, get redirected to /login, catch returns `null` — silent failure.

**Fix:** Track `isLoggedIn` state separately, update in `healthCheck()`.

### 8. REBROWSER env vars missing from env_test in ecosystem.config

`ecosystem.config.cjs:17-19` — `REBROWSER_PATCHES_*` only in `env` (production default), not in `env_test`. Running `pm2 start --env test` = no stealth patches on test account.

---

## Research Findings

### Anti-detection stack (validated best practice 2026)

| Layer | Tool | Status in our code |
|-------|------|--------------------|
| CDP patches | rebrowser-playwright + `addBinding` mode | Done |
| Headful via Xvfb | `headless: false` + DISPLAY=:99 | Done (needs Xvfb service) |
| Init script | stealth-init.js | **Insufficient** (3/9 patches) |
| Mouse simulation | ghost-cursor / Bezier curves | **Missing** |
| Typing simulation | pressSequentially(delay: 45ms) | Done (adequate) |
| Persistent profile | launchPersistentContext | Done |
| Proxy | ISP residential SOCKS5 | Done (config ready, awaiting purchase) |

### Patchright: alternative to rebrowser-playwright

Patchright (`v1.58.0`, active as of March 2026) patches Playwright at source level, not runtime. Removes `Runtime.enable` and `Console.enable` entirely. Primary language: Python, Node.js community port exists. Worth monitoring but not switching — rebrowser-playwright is stable for Node.js.

### Twitter-specific detection facts

1. **Error 226** is request-level, not account ban. Datacenter ASN = guaranteed 226 on writes
2. **Cookie fingerprint binding** (Jan 2025): cookies partially tied to browser fingerprint. Reusing cookies from different fingerprint = potential invalidation
3. **agent-twitter-client broken for posting** since Nov 2025 — GraphQL doc_ids rotate every 2-4 weeks. Playwright is the only viable option
4. **CDP detection signal broken in V8** — the classic `Runtime.enable` side-effect detection no longer works. But rebrowser patches still valuable for other vectors
5. **Headed mode is key**: "Working with normal Playwright is fine, it's only when you go headless that Twitter tries to block you"

### Detection test sites (verify before production)

| Site | What it checks |
|------|---------------|
| bot.sannysoft.com | Basic: webdriver, plugins, chrome |
| pixelscan.net/bot-check | Environment flags |
| creepjs | Deep fingerprint (canvas, WebGL, audio) |
| rebrowser-bot-detector (GitHub) | CDP-specific |

### CreateTweet response interception (for extractPostedTweetId fix)

```typescript
// Set up response interceptor BEFORE clicking post
const responsePromise = this.page.waitForResponse(
  (resp) => resp.url().includes('/CreateTweet') && resp.status() === 200,
  { timeout: 15_000 },
);

// Click post button
await this.page.locator('[data-testid="tweetButtonInline"]').click();

// Parse response
const response = await responsePromise;
const json = await response.json();
const tweetId = json?.data?.create_tweet?.tweet_results?.result?.rest_id;
```

### Comprehensive stealth-init.js (2026 edition)

```javascript
// 1. webdriver
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 2. Playwright globals
delete window.__playwright__binding__;
delete window.__pwInitScripts;
delete window.__playwright_target__;

// 3. Languages
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

// 4. Plugins (empty = instant flag)
Object.defineProperty(navigator, 'plugins', {
  get: () => {
    const plugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
      { name: 'Native Client', filename: 'internal-nacl-plugin' },
    ];
    plugins.__proto__ = PluginArray.prototype;
    return plugins;
  },
});

// 5. window.chrome
if (!window.chrome) {
  window.chrome = {
    app: { isInstalled: false, getDetails: () => null, getIsInstalled: () => false },
    runtime: {
      PlatformOs: { MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux' },
      PlatformArch: { ARM: 'arm', X86_32: 'x86-32', X86_64: 'x86-64' },
      connect: () => {},
      sendMessage: () => {},
    },
  };
}

// 6. Permissions API
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) =>
  parameters.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : originalQuery(parameters);

// 7. outerWidth/Height (safety for headful via Xvfb)
if (window.outerWidth === 0) {
  Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
  Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
}

// 8. deviceMemory
if (!navigator.deviceMemory) {
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
}

// 9. hardwareConcurrency
if (!navigator.hardwareConcurrency || navigator.hardwareConcurrency < 2) {
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
}

// 10. WebGL renderer
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function(parameter) {
  if (parameter === 37445) return 'Intel Inc.';
  if (parameter === 37446) return 'Intel Iris OpenGL Engine';
  return getParameter.call(this, parameter);
};
```

---

## Improvement Plan (priority order)

| # | Fix | Severity | Effort |
|---|-----|----------|--------|
| 1 | Busy flag for health check race condition | Critical | 15 min |
| 2 | CreateTweet response interception for tweet ID | Critical | 30 min |
| 3 | initialize() idempotency guard | Critical | 10 min |
| 4 | Expand stealth-init.js to 10 patches | Important | 20 min |
| 5 | Add selector fallback chains | Important | 15 min |
| 6 | Track isLoggedIn state | Important | 10 min |
| 7 | Add REBROWSER vars to env_test | Important | 5 min |
| 8 | Mouse movement before clicks | Medium | 30 min (ghost-cursor) |

Total estimated: ~2-3 hours for all fixes.
