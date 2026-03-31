# Playwright Automation Audit v3

**Date:** 2026-03-31
**Scope:** Stealth, anti-detection, architecture, security, research findings
**Overall score:** 7.2/10 → target 9/10

---

## Executive Summary

Текущий стек (rebrowser-playwright 1.52.0 + stealth-init.js + headed Chrome Stable + Xvfb + Decodo proxy) — рабочий, но содержит 3 критичных уязвимости и ~10 важных улучшений. Главные риски:

1. **WebRTC leak** — реальный IP сервера утекает через RTCPeerConnection, минуя SOCKS5 proxy
2. **Session loss на рестарте** — session cookies теряются при pm2 restart (нет `--restore-last-session`)
3. **rebrowser-playwright 1.52.0 устарел** — Patchright v1.58.0 (март 2026) закрывает больше CDP-детекций

Ландшафт 2025-2026: детекция сместилась с `navigator.webdriver` на CDP-протокол (`Runtime.enable` leak), Canvas/WebGL pixel hashing и behavioral analysis. Twitter использует Cloudflare Bot Management + Arkose Labs + собственный behavioral engine.

---

## Scorecard

| Область | Оценка | Критичная проблема |
|---------|--------|-------------------|
| Stealth Architecture | 7/10 | Timezone mismatch, нет WebRTC/audio protection |
| Browser Lifecycle | 8/10 | Нет авто-restart после crash, waitForTimeout |
| Twitter Interactions | 8.5/10 | Нет 2FA challenge handling, mouse humanization |
| Proxy & Network | 5/10 | WebRTC IP leak, DNS leak, timezone vs proxy location |
| Error Handling | 8/10 | CB не разделяет типы ошибок, нет retry |
| Configuration | 7.5/10 | .env.example неполный |

---

## Part 1: Stealth Tech Landscape (Research)

### Что устарело

| Технология | Статус | Причина |
|-----------|--------|---------|
| `playwright-extra` + stealth plugin | Мертво (4 года) | Автор неактивен, не покрывает CDP leaks |
| Ручной `navigator.webdriver = undefined` | Детектируется | `Object.getOwnPropertyDescriptor` выдаёт override |
| Фейковые `navigator.plugins` без consistency | Детектируется | Несоответствие с Canvas/WebGL/font fingerprint |
| `--disable-blink-features=AutomationControlled` alone | Недостаточно | Без CDP-патчей Runtime.enable всё равно утекает |

### Что актуально (март 2026)

| Технология | Версия | Подход | Vs Twitter |
|-----------|--------|--------|-----------|
| **Patchright** | v1.58.0 (07.03.2026) | 22 AST-патча Playwright, Runtime.enable fix, Console.enable fix | Лучший для Chromium |
| **rebrowser-playwright** | v1.52.0 | Runtime fix (3 режима), source URL маскировка | Текущий наш выбор |
| **Camoufox** | Active | Firefox C++-level patches, 0% automation score | Альтернатива если Chromium не работает |
| **ZenDriver** | Active | CDP-minimal, минимум команд | 75% bypass в бенчмарках |

### Вектор детекции в 2026

```
CDP-уровень (главный):
  └─ Runtime.enable leak → executionContextCreated signal
  └─ Console.enable leak
  └─ sourceURL=pptr: в eval
  └─ Utility world name (__playwright_utility_world__)

Fingerprint-уровень:
  └─ Canvas toDataURL() → детерминированный hash per machine
  └─ WebGL pixel output → одинаковый в headless
  └─ AudioContext → floating-point fingerprint
  └─ Font enumeration → предсказуемый набор

Behavioral:
  └─ Mouse: математически идеальные curves vs human jitter
  └─ Typing: без micro-pauses и опечаток
  └─ Scroll: постоянная скорость
  └─ Sequence: нет случайных hover/pause

Network:
  └─ TLS fingerprint (JA3/JA4)
  └─ WebRTC STUN → реальный IP через UDP
  └─ DNS leak через системный resolver
  └─ IP geolocation vs browser timezone
```

---

## Part 2: Twitter Detection Specifics

### Что использует Twitter/X

- **Cloudflare Bot Management** — мигрировали инфраструктуру на Cloudflare (подтверждено, ноябрь 2025)
- **Arkose Labs (Titan, 6-е поколение)** — 225+ сигналов, visual challenges при регистрации/DM
- **Нативный behavioral engine** — cookie entropy, signature tokens, device correlation, timing

### Error 226 — триггеры

| Триггер | Тип | Наш статус |
|---------|-----|-----------|
| Datacenter IP (AWS, Hetzner, OVH) | Немедленный | OK — Decodo residential |
| Невалидные/свежие cookies | Немедленный | OK — persistent profile |
| Automation library fingerprints | Немедленный | Частично — rebrowser, но v1.52 |
| Repetitive time-synchronized actions | Накопительный | OK — humanDelay + jitter |
| Login velocity / proxy switching | Накопительный | OK — sticky session |
| Cloud environment correlation | Накопительный | Риск — VPS fingerprint |

### Безопасные пороги для постинга

| Действие | Опасный порог | Наш cap | Статус |
|----------|--------------|---------|--------|
| Tweets/day | >50 | 15-20 | OK |
| Replies/hour | >30 | ~3-5 | OK |
| Follow/unfollow/day | >50-100 | 0 | OK |
| Likes/hour | >100 | 0 | OK |
| Min delay between posts | <10 min | ~20-30 min | OK |

### API v2 ценообразование (февраль 2026)

X перешёл на pay-per-use. Существующие подписки (наш Basic $200/мес) пока работают. Для новых подписчиков: $0.01/пост, $0.005/чтение.

---

## Part 3: Code Issues Found

### P0 — Critical (fix before production posting)

#### 3.1 WebRTC IP Leak
**File:** `stealth-init.js`
**Problem:** RTCPeerConnection sends STUN requests directly, bypassing SOCKS5 proxy → real server IP exposed
**Evidence:** Playwright issue #16702, confirmed by architecture review
**Fix:**
```javascript
// Add to stealth-init.js after section 10 (WebGL)
// 11. WebRTC leak prevention — block STUN/TURN to hide real IP behind proxy
const OriginalRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;
if (OriginalRTC) {
  window.RTCPeerConnection = class extends OriginalRTC {
    constructor(config, constraints) {
      super({ ...config, iceServers: [] }, constraints);
    }
  };
  if (window.webkitRTCPeerConnection) {
    window.webkitRTCPeerConnection = window.RTCPeerConnection;
  }
}
```
**Alternative:** Add `--disable-features=WebRtcHideLocalIpsWithMdns` + `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` to Chrome args

#### 3.2 Session Cookies Lost on Restart
**File:** `playwright-twitter-client.ts` line 112-121
**Problem:** Twitter session cookies have no `Expires`/`Max-Age`. Playwright persistent context doesn't save them on close. Every pm2 restart = session lost → need re-inject cookies.
**Fix:** Add `'--restore-last-session'` to `args` array + save `storageState()` on clean shutdown
```typescript
// In args array:
'--restore-last-session',

// In shutdown():
if (this.context) {
  await this.context.storageState({ path: `${this.profilePath}/storage-state.json` });
}
```

#### 3.3 Upgrade rebrowser-playwright → Patchright
**File:** `package.json`
**Problem:** rebrowser-playwright 1.52.0 has known open issues (#110 __pwInitScripts visible, #119 automation infobar, #124/#125 detection failures). Patchright v1.58.0 (March 2026) applies 22 patches, auto-follows upstream Playwright.
**Fix:**
```bash
npm uninstall rebrowser-playwright rebrowser-playwright-core
npm install patchright
```
```typescript
// playwright-twitter-client.ts
// Before: import { chromium } from 'rebrowser-playwright';
// After:
import { chromium } from 'patchright';
```
**Risk:** Low — Patchright is API-compatible drop-in. Test posting flow after switch.

### P1 — High (fix in next sprint)

#### 3.4 DNS Leak Through System Resolver
**File:** `playwright-twitter-client.ts` line 112-121
**Problem:** SOCKS5 proxy does not route DNS by default in Chromium → DNS queries go through VPS resolver → ISP can see twitter.com lookups
**Fix:** Add to Chrome args:
```typescript
'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
// Or for SOCKS5 specifically:
// Chromium routes DNS through SOCKS5 when using --proxy-server with socks5://
// but NOT when using Playwright's proxy option. Verify with tcpdump.
```

#### 3.5 Timezone vs Proxy Location Mismatch
**File:** `playwright-twitter-client.ts` line 122
**Problem:** `timezoneId: 'Asia/Singapore'` hardcoded. If Decodo proxy exit node is not in Singapore → browser timezone ≠ IP geolocation. Cloudflare can detect this.
**Fix:** Make `timezoneId` configurable via env var `BROWSER_TIMEZONE`, default to proxy location.

#### 3.6 No Auto-Restart After Browser Crash
**File:** `playwright-twitter-client.ts` — `handleContextClose()`
**Problem:** Browser crash sets `isConfigured = false`, all writes silently return null. No auto-recovery, no Telegram alert.
**Fix:**
```typescript
private handleContextClose(): void {
  this.logger.error('Browser context closed unexpectedly');
  this.resetState();
  // Alert + auto-restart
  this.sendContextCrashAlert().catch(() => {});
  setTimeout(() => this.initialize().catch(err => {
    this.logger.error({ err }, 'Auto-restart failed');
  }), 5000);
}
```

#### 3.7 `checkLoggedIn()` Uses `waitForTimeout(3000)`
**File:** `playwright-twitter-client.ts` line 442
**Problem:** Unconditional 3s wait on every health check (every 5 min). Fragile on slow VPS.
**Fix:** Replace with `waitForSelector('[data-testid="primaryColumn"]', { timeout: 10000 })` or `waitForLoadState('domcontentloaded')`.

#### 3.8 No Retry in Playwright Posting
**File:** `playwright-twitter-client.ts`
**Problem:** API client has `retryWithBackoff`. Playwright has zero retry. One transient timeout = circuit breaker increment.
**Fix:** Add 1 retry with 3s delay for transient errors (TimeoutError, "element not attached"). Non-retryable errors (403, suspended) → immediate failure.

#### 3.9 Circuit Breaker Doesn't Distinguish Error Types
**File:** `playwright-twitter-client.ts` lines 726-793
**Problem:** Timeout (transient) and 403 Suspended (permanent) both increment the same counter. 403 should trip CB immediately.
**Fix:** Add `isNonRetryable(error)` check — suspend/ban signals trip CB instantly.

### P2 — Medium (backlog)

#### 3.10 No Mouse Movement Before Interactions
**Problem:** Real users scroll, hover, move mouse before clicking textarea. Current: one `hover()` call. Advanced behavioral detectors see teleportation.
**Fix:** Add pre-interaction mouse movement (random intermediate points along Bezier curve).

#### 3.11 Reply Button Targets First on Page
**File:** `playwright-twitter-client.ts` — `[data-testid="reply"].first()`
**Problem:** If Twitter adds sponsored content above target tweet, first reply button is wrong.
**Fix:** Scope reply button selector to tweet article element.

#### 3.12 No 2FA Challenge Handling
**Problem:** If Twitter requests re-verification during session, page shows dialog → current code times out. `isLoginRedirect()` doesn't cover `/i/flow/suspended` or challenge screens.
**Fix:** Detect challenge screens and send Telegram alert for manual intervention.

#### 3.13 Hardcoded QueryId in Scraper Client
**File:** `scraper-twitter-client.ts` line 204
**Problem:** `queryId = '7TKRKCPuAGsmYde0CudbVg'` — Twitter rotates these. Silent 400/403 on rotation.
**Fix:** Extract from Twitter's main.js bundle at runtime, or use library that auto-updates.

#### 3.14 No Canvas/Audio Fingerprint Noise
**Problem:** Canvas `toDataURL()` returns deterministic hash per machine. AudioContext same. Both are detection vectors.
**Fix:** Add noise injection in stealth-init.js (small random perturbation to canvas pixel data and AudioContext output). Low priority — persistent profile with consistent fingerprint is actually less suspicious than randomized per-session.

---

## Part 4: Prioritized Action Plan

### Phase 1: Critical Hardening (before live posting)

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | WebRTC leak prevention in stealth-init.js | 15 min | Critical — blocks IP exposure |
| 2 | Add `--restore-last-session` Chrome arg | 5 min | Critical — prevents session loss |
| 3 | Save `storageState()` on shutdown | 15 min | Critical — session backup |
| 4 | Evaluate Patchright migration | 2h | High — better CDP stealth |
| 5 | DNS leak: verify SOCKS5 DNS routing | 30 min | High — verify with tcpdump |
| 6 | Verify proxy timezone matches `Asia/Singapore` | 10 min | High — fingerprint consistency |

### Phase 2: Reliability (next sprint)

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 7 | Auto-restart after browser crash | 30 min | High — uptime |
| 8 | Replace waitForTimeout(3000) → smart wait | 15 min | Medium — robustness |
| 9 | Add 1 retry for Playwright posting | 30 min | Medium — reduces false CB trips |
| 10 | CB error type discrimination | 30 min | Medium — smarter recovery |
| 11 | Make timezoneId configurable via env | 15 min | Medium — flexibility |

### Phase 3: Defense in Depth (backlog)

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 12 | Pre-interaction mouse movement | 2h | Medium — behavioral stealth |
| 13 | 2FA challenge detection + alert | 1h | Medium — edge case resilience |
| 14 | Scoped reply button selector | 15 min | Low — correctness |
| 15 | Canvas/Audio fingerprint noise | 2h | Low — optional hardening |
| 16 | Dynamic queryId extraction for scraper | 4h | Low — scraper client unused in prod |

### Validation Checklist

After implementing Phase 1:
- [ ] Run rebrowser-bot-detector test page → verify 0 detections
- [ ] Check WebRTC leak at browserleaks.com/webrtc → no public IP shown
- [ ] Verify DNS at dnsleaktest.com → only proxy resolver visible
- [ ] Verify timezone at browserleaks.com/javascript → matches proxy location
- [ ] Post one dry-run tweet → confirm no Error 226
- [ ] Restart pm2 → verify session persists (no re-login needed)
- [ ] Kill browser process → verify auto-restart + Telegram alert

---

## Part 5: Alternative Approaches (if current stack fails)

### Option A: Patchright (recommended next step)
- Drop-in Playwright replacement, 22 patches
- v1.58.0 actively maintained, auto-follows upstream
- Effort: 2h (swap import, test)

### Option B: Camoufox (if Chromium gets blocked)
- Firefox-based, C++-level patches
- 0% automation score in tests
- Effort: 1-2 days (new browser engine, different selectors)

### Option C: Full API Mode (safest, most expensive)
- No browser automation — all operations via Twitter API v2
- Cost: $200/mo Basic or pay-per-use ($0.01/post)
- Pro: No detection risk. Con: rate limits, missing features, cost

### Option D: Anti-detect Browser Service
- Multilogin, GoLogin, AdsPower — commercial anti-detect browsers
- Pre-built fingerprint management, proxy integration
- Cost: $50-100/mo. Pro: battle-tested. Con: dependency, API integration needed

---

## Sources

- [Patchright GitHub](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) — v1.58.0, March 2026
- [rebrowser-patches GitHub](https://github.com/rebrowser/rebrowser-patches)
- [Castle.io — Headless Chrome Detection](https://blog.castle.io/how-to-detect-headless-chrome-bots-instrumented-with-playwright/)
- [CDP Detection Lab — WebScrapingClub](https://substack.thewebscraping.club/p/playwright-stealth-cdp)
- [Arkose Labs Titan](https://www.helpnetsecurity.com/2026/01/30/arkose-labs-titan/) — January 2026
- [Cloudflare + X migration](https://events.cloudflare.com/connect/2025/sessions/3269511)
- [Error 226 analysis — twitterapi.io](https://twitterapi.io/blog/twitter-request-looks-like-it-might-be-automated-error-226)
- [Anti-bot benchmark 2025](https://medium.com/@dimakynal/baseline-performance-comparison-of-nodriver-zendriver-selenium-and-playwright-against-anti-bot-2e593db4b243)
- [X API pay-per-use — GIGAZINE](https://gigazine.net/gsc_news/en/20260209-x-api-pay-per-use/) — February 2026
- [Playwright WebRTC issue #16702](https://github.com/microsoft/playwright/issues/16702)
- [Twitter shadowban 2025 — Pixelscan](https://pixelscan.net/blog/twitter-shadowban-2025-guide/)
