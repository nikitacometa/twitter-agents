# Autonomy Deployment Plan

Date: 2026-03-28. Status: planning. Revision: 2.

## Why Playwright Is Required

Twitter API v2 returns **403 Forbidden** on replies to tweets where the bot wasn't mentioned (since February 2026). Reply-guy strategy — proactively commenting on other accounts' tweets — is the primary virality mechanism and is impossible through the API.

**Playwright (browser automation) is the only way to do reply-guy.**

API v2 remains useful for: reads (tweet data, user info, search, mention polling), standalone posts, and mention replies.

## Current State

| Component | Status | What's Missing |
|-----------|--------|----------------|
| beef-bot (PM2) | Running | No browser posting, no autonomy |
| OpenClaw @BeefAdminBot | Running, 12 skills | No Playwright, no autonomy control |
| Twitter API v2 | Creds ready | Can't do reply-guy (403 on non-mention replies) |
| Scraper (cookie auth) | Active for reads | HTTP-only, Error 226 blocks writes |
| Proxy | **None** | Datacenter IP = ban risk 8.5/10 |
| Playwright | Local MCP only | Not on server |
| Autonomy | **Off** | B-33–B-36 not implemented |

## Target Architecture

```
VPS (Hostinger, 8GB RAM, Ubuntu 24.04)
│
├── Xvfb :99 (systemd)              ← Virtual display for headful Chromium
│
├── beef-bot (PM2, user deploy)  ← Content engine + scheduler
│   ├── Content: Claude CLI → Codex → SDK (roast generation)
│   ├── Queue: SQLite (approve/reject/auto)
│   ├── Scheduler: cron (farm, post, replies, monitor)
│   ├── API v2 client: reads + standalone posts + mention replies
│   └── PlaywrightTwitterClient: reply-guy posting    ← NEW
│       ├── rebrowser-playwright (stealth CDP patches)
│       ├── Persistent Chrome profile (/home/deploy/.chrome-profiles/twitter)
│       ├── SOCKS5 proxy (Decodo ISP residential)
│       └── stealth-init.js (navigator.webdriver, fingerprint patches)
│
├── OpenClaw @BeefAdminBot (systemd, user beef, port 19001)
│   ├── Existing: 12 skills (beef API + Twitter API read)
│   ├── NEW: Playwright MCP (browse Twitter via NL, ad-hoc posting)
│   └── NEW: Autonomy control skills
│
└── Proxy: Decodo ISP Static Residential (SOCKS5, ~$3-5/mo)
```

### Dual Playwright Usage

| Who | How | When |
|-----|-----|------|
| **beef-bot** | Programmatic (`rebrowser-playwright` API) | Autonomous posting: reply-guy, auto-post, smart replies. Fast, deterministic, no LLM in posting loop |
| **OpenClaw** | LLM-driven (Playwright MCP) | Operator commands: "browse @vitalik timeline", "reply to this tweet". Flexible, handles edge cases |

**Why both?** Routine posting (50+/day) needs to be fast and reliable — programmatic Playwright does this in ~5 seconds per post without LLM calls. OpenClaw + Playwright MCP is for ad-hoc operator tasks where flexibility matters more than speed.

**Shared resources:** Same proxy, same Xvfb display. **Separate Chrome profiles** to avoid session conflicts (beef-bot profile vs OpenClaw profile).

---

## Anti-Ban Strategy

### Layer 1: IP Reputation

| Before | After |
|--------|-------|
| Hostinger datacenter IP (ASN blocked by Twitter/Cloudflare) | Decodo ISP Static Residential (ASN = Comcast/Verizon) |
| Ban risk: 8.5/10 | Ban risk: 2/10 |

**Setup:** 1 static IP, SOCKS5, $3-5/mo. One account = one IP = one city. Never rotate.

### Layer 2: Browser Fingerprint

| Detection Vector | Mitigation |
|-----------------|------------|
| `navigator.webdriver === true` | `rebrowser-playwright` patches + stealth-init.js |
| CDP `Runtime.enable` side-effects | `rebrowser-playwright` REBROWSER_PATCHES_RUNTIME_FIX_MODE=addBinding |
| HeadlessChrome User-Agent | Headful mode via Xvfb (real Chrome UA) |
| `window.__playwright__binding__` | stealth-init.js deletes it |
| GPU/SwiftShader (software renderer) | Xvfb headful = real GPU rendering path |
| Missing `Accept-Language` | Set in browser context options |

**Stack:** `rebrowser-playwright` (drop-in replacement for `playwright`) + Xvfb headful + stealth-init.js + persistent Chrome profile.

### Layer 3: Behavioral

| Pattern | Rule |
|---------|------|
| Posting frequency | Start 15-20 replies/day week 1, ramp to 40-50 by week 3 |
| Timing | Random 5-20 min between replies, jitter ±30% |
| Quiet hours | No posting 1am-6am UTC |
| Browsing simulation | Scroll timeline 5-10s before replying, random likes |
| Reply targets | Never reply to same user twice in 24h |
| Tweet age | Only reply to tweets < 4 hours old |
| Content | Every reply unique (LLM-generated), no templates |
| Activity mix | 60% replies, 20% likes, 10% standalone posts, 10% browsing |
| Daily cap | Hard limit 50 replies/day (safety) |
| Session | Keep browser alive, no login/logout cycles |

### Layer 4: Account Trust

- @0xBeefer is an established account (not brand new)
- X Premium active (required for reach)
- Bot label in profile (mandatory)
- Consistent posting history builds trust score

---

## Implementation Plan

### Phase 0: Infrastructure (Day 1)

#### 0.1 — Buy and configure proxy

1. Purchase Decodo ISP Static Residential (1 IP, SOCKS5)
2. Get credentials: `socks5://user:password@gate.decodo.com:7777`
3. Test from VPS:
   ```bash
   curl --socks5-hostname user:pass@gate.decodo.com:7777 https://api.ipify.org
   # Should return a residential IP (not Hostinger's)
   ```
4. Add `PROXY_URL` to both `.env` files on VPS

#### 0.2 — Install Xvfb on VPS

```bash
sudo apt update
sudo apt install -y xvfb x11-utils

# Install Chromium dependencies
npx playwright install-deps chromium
```

Create systemd service `/etc/systemd/system/xvfb.service`:
```ini
[Unit]
Description=Xvfb virtual display
After=network.target

[Service]
ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac
Restart=always
User=deploy

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable xvfb && sudo systemctl start xvfb
# Verify
DISPLAY=:99 xdpyinfo | head -5
```

#### 0.3 — Set up Chrome profile

```bash
# Create profile directory
mkdir -p /home/deploy/.chrome-profiles/twitter

# Install rebrowser-playwright + Chromium
cd /home/deploy/twitter-agents/beef
pnpm add rebrowser-playwright
npx playwright install chromium
```

**One-time manual login** (via VNC or SSH X-forwarding):
```bash
# Install VNC for visual access
sudo apt install -y x11vnc
x11vnc -display :99 -nopw -listen 0.0.0.0 -rfbport 5900 &

# Launch browser with proxy, connect via VNC, login to Twitter manually
DISPLAY=:99 npx playwright open --browser chromium \
  --proxy-server="socks5://user:pass@gate.decodo.com:7777" \
  --user-data-dir=/home/deploy/.chrome-profiles/twitter \
  https://twitter.com/login
```

After login: close browser, kill VNC. Session is saved in the profile directory.

#### 0.4 — Create stealth-init.js

```javascript
// /home/deploy/twitter-agents/beef/src/twitter/stealth-init.js
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
delete window.__playwright__binding__;
delete window.__pwInitScripts;
```

---

### Phase 1: PlaywrightTwitterClient (Day 2-3)

New implementation of `ITwitterClient` interface using `rebrowser-playwright`.

#### Architecture

```typescript
// src/twitter/playwright-twitter-client.ts
import { chromium, type BrowserContext, type Page } from 'rebrowser-playwright';

class PlaywrightTwitterClient implements ITwitterClient {
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async initialize(): Promise<void> {
    this.context = await chromium.launchPersistentContext(
      '/home/deploy/.chrome-profiles/twitter',
      {
        headless: false,          // Headful via Xvfb
        viewport: { width: 1440, height: 900 },
        proxy: { server: config.PROXY_URL },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ],
      }
    );
    this.page = this.context.pages()[0] || await this.context.newPage();
    await this.page.addInitScript({ path: 'src/twitter/stealth-init.js' });
  }

  async postReply(tweetId: string, text: string): Promise<string> {
    // Navigate to tweet
    await this.page.goto(`https://x.com/i/status/${tweetId}`);
    await this.humanDelay(2000, 5000);

    // Click reply
    await this.page.click('[data-testid="reply"]');
    await this.humanDelay(500, 1500);

    // Type reply (character by character for realism)
    const textarea = this.page.locator('[data-testid="tweetTextarea_0"]');
    await textarea.pressSequentially(text, { delay: 50 });
    await this.humanDelay(1000, 3000);

    // Post
    await this.page.click('[data-testid="tweetButtonInline"]');
    await this.humanDelay(2000, 4000);

    // Extract posted tweet ID from URL/response
    return this.extractPostedTweetId();
  }

  async postTweet(text: string): Promise<string> {
    await this.page.goto('https://x.com/compose/post');
    // ... similar flow
  }

  private async humanDelay(min: number, max: number): Promise<void> {
    const delay = min + Math.random() * (max - min);
    await new Promise(r => setTimeout(r, delay));
  }

  async shutdown(): Promise<void> {
    await this.context?.close();
  }
}
```

#### Key design decisions

- **`launchPersistentContext`** (not `launch` + `newContext`) — preserves full Chrome profile (cookies, localStorage, IndexedDB, service workers). Twitter ties session to browser fingerprint.
- **`pressSequentially`** with 50ms delay — simulates human typing, not instant fill.
- **Human delays** between every action — 2-5 seconds, randomized.
- **Browser stays alive** between posts — don't restart for each tweet. Reuse the same page, navigate between tweets.
- **Session health check** — periodically verify still logged in, alert on expiry.

#### Integration with beef-bot

```
ITwitterClient interface
├── TwitterClient (API v2)        — reads + standalone posts + mention replies
├── ScraperTwitterClient (legacy) — reads only (being deprecated)
└── PlaywrightTwitterClient (NEW) — reply-guy + any posting that needs browser
```

The scheduler decides which client to use per operation:
- Reply-guy (proactive comment) → PlaywrightTwitterClient
- Standalone post → API v2 (faster, no browser overhead)
- Mention reply → API v2 (allowed by Twitter)
- Timeline reads → API v2

#### PM2 config update

```javascript
// ecosystem.config.cjs
env_production: {
  BEEF_ENV: 'production',
  DRY_RUN: 'false',
  DISPLAY: ':99',  // ← Xvfb
  REBROWSER_PATCHES_RUNTIME_FIX_MODE: 'addBinding',
  REBROWSER_PATCHES_SOURCE_URL: 'app.js',
}
```

---

### Phase 2: OpenClaw + Playwright MCP (Day 4)

#### 2.1 — Add Playwright MCP to OpenClaw

Edit `/home/beef/.openclaw/openclaw.json`, add to `mcpServers`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y", "@playwright/mcp@latest",
        "--browser", "chromium",
        "--user-data-dir", "/home/beef/.chrome-profiles/twitter-openclaw",
        "--viewport-size", "1440x900",
        "--proxy-server", "socks5://user:pass@gate.decodo.com:7777",
        "--init-script", "/home/beef/stealth-init.js",
        "--no-sandbox"
      ],
      "env": {
        "DISPLAY": ":99",
        "REBROWSER_PATCHES_RUNTIME_FIX_MODE": "addBinding"
      }
    }
  }
}
```

**Separate Chrome profile** (`twitter-openclaw`) — prevents session conflicts with beef-bot's profile. One-time manual login required for this profile too.

**Note:** Check if `@playwright/mcp` uses `rebrowser-playwright` or standard `playwright` under the hood. If standard, the `REBROWSER_PATCHES_*` env vars won't work — may need a custom wrapper.

#### 2.2 — New OpenClaw skills for autonomy control

| Skill | Endpoint | Description |
|-------|----------|-------------|
| `beef-autonomy-status` | GET /api/autonomy | Show which phases are on/off, current limits |
| `beef-set-autonomy` | POST /api/autonomy | Toggle phases ("enable auto-farm", "disable auto-post") |
| `beef-auto-farm-trigger` | POST /api/farm/trigger | Manual farm run via NL |
| `beef-auto-post-trigger` | POST /api/post/trigger | Post best stockpile item now |
| `beef-reply-guy-trigger` | POST /api/reply-guy/trigger | Run one reply-guy cycle |

Each skill = SKILL.md file in `/home/beef/.openclaw/workspace/skills/`:

```yaml
---
name: beef-set-autonomy
description: Enable or disable autonomy phases (auto-farm, auto-post, smart-replies, learning-loop)
user-invocable: true
---

Call POST http://127.0.0.1:3001/api/autonomy with bearer auth.
Body: { "phase": "<phase-name>", "enabled": true/false }
Phases: auto-farm, auto-post, smart-replies, learning-loop
```

#### 2.3 — OpenClaw can now browse Twitter

After Playwright MCP is configured, operators can use NL via @BeefAdminBot:

- "Open @vitalik's latest tweet" → navigates browser
- "Reply to this tweet: [roast text]" → posts via browser
- "Check if our last post got engagement" → reads page
- "Screenshot @0xBeefer profile" → takes screenshot

---

### Phase 3: Autonomy Ladder (Week 2-3)

#### 3.1 — Auto-Farm (#B-33)

```
Cron: every 6h
1. Timeline monitor → top 3-5 targets (score > threshold)
2. Dedup: skip targets farmed within 48h
3. For each: farm pipeline → stockpile
4. If stockpile < 5 after run → Telegram alert
```

Env: `ENABLE_AUTO_FARM=true/false`

#### 3.2 — Auto-Post from Stockpile (#B-34)

```
Cron: every 3h
1. Pick best entry (humanScore ≥ 4 OR avgScore ≥ 4.2)
2. Check: buffer ≥ 5 (don't drain stockpile)
3. Check: < 3 auto-posts today
4. Post via PlaywrightTwitterClient (standalone tweet)
5. Notify admin AFTER with Delete button
```

Env: `ENABLE_AUTO_POST=true/false`, `MAX_AUTO_POSTS_PER_DAY=3`

#### 3.3 — Reply-Guy Autonomy (#B-35, revised)

This is the key new capability enabled by Playwright.

```
Cron: every 15-20 min (with jitter)
1. Timeline monitor identifies high-value tweet (trending topic, KOL post, controversy)
2. Generate contextual reply (roast/witty comment, not generic)
3. Evaluate quality (≥ 3.5 score required)
4. Check: target not replied to in 24h
5. Check: < 50 replies today
6. Post via PlaywrightTwitterClient → reply to target tweet
7. Log to DB, notify admin periodically (batch digest, not per-reply)
```

Stratified by risk:
- < 1K followers: auto-reply (eval ≥ 3.5)
- 1K-10K: auto-reply (eval ≥ 4.0)
- \> 10K: require approval (high visibility = high risk)
- "roast me" trigger: always auto-reply

Env: `ENABLE_REPLY_GUY=true/false`, `REPLY_GUY_DAILY_CAP=50`

#### 3.4 — Learning Loop (#B-36)

```
Cron: daily
1. Fetch engagement data for posts from last 48h
2. High-engagement (> 5 likes OR > 2 RTs) → auto-add to few-shot pool
3. Low-engagement → flag angle/strategy for review
4. Weekly report to Telegram: best/worst 5, trend by angle
```

Env: `ENABLE_LEARNING_LOOP=true/false`

---

## Warm-Up Schedule

Critical for new automated posting channel. Don't go from 0 to 50 overnight.

| Week | Replies/day | Standalone/day | Notes |
|------|-------------|----------------|-------|
| 1 | 10-15 | 2-3 | Manual approval only, monitor for warnings |
| 2 | 20-30 | 3-5 | Enable auto-reply for < 1K followers |
| 3 | 30-40 | 5-8 | Enable auto-reply for 1K-10K |
| 4+ | 40-50 | 5-10 | Full autonomy, > 10K still requires approval |

---

## RAM Budget

| Component | RAM | Notes |
|-----------|-----|-------|
| beef-bot | 59 MB | Current |
| Chromium (Playwright) | 300-500 MB | Persistent browser, one tab |
| OpenClaw gateway | 415 MB | Current |
| OpenClaw Playwright MCP | 200-400 MB | Separate browser, on-demand |
| Xvfb | ~10 MB | Minimal |
| **Total peak** | **~1.4 GB** | Out of 8 GB — comfortable |

---

## Execution Timeline

```
Day 1: Infrastructure
  ├── Buy Decodo proxy, verify residential IP          (0.5h)
  ├── Install Xvfb + systemd service on VPS            (0.5h)
  ├── Install rebrowser-playwright + Chromium on VPS    (0.5h)
  ├── Manual Twitter login, save Chrome profile         (0.5h)
  └── Create stealth-init.js                            (0.5h)

Day 2-3: PlaywrightTwitterClient
  ├── Implement PlaywrightTwitterClient (ITwitterClient) (4-6h)
  ├── Add PROXY_URL + DISPLAY to env schema              (1h)
  ├── Wire into scheduler (reply-guy → Playwright)       (2h)
  ├── Test posting through proxy on VPS                  (1h)
  └── Deploy + smoke test                                (1h)

Day 4: OpenClaw + Playwright MCP
  ├── Add Playwright MCP to OpenClaw config              (0.5h)
  ├── Create second Chrome profile + manual login        (0.5h)
  ├── Add 5 new autonomy skills                          (2h)
  ├── Add beef API endpoints for autonomy control        (2h)
  └── Test NL-driven browsing via @BeefAdminBot          (0.5h)

Week 2: Autonomy Phase 1-2
  ├── Auto-Farm cron (#B-33)                             (4-6h)
  ├── Auto-Post from stockpile (#B-34)                   (3-4h)
  └── Monitor + adjust warm-up                           (ongoing)

Week 3: Autonomy Phase 3
  ├── Reply-Guy autonomy (#B-35)                         (4-6h)
  ├── Ramp up posting volume per warm-up schedule         (ongoing)
  └── Monitor engagement + ban signals                   (ongoing)

Week 4+: Autonomy Phase 4
  └── Learning Loop (#B-36)                              (6-8h)
```

## Env Variables

```bash
# === Infrastructure ===
PROXY_URL=socks5://user:password@gate.decodo.com:7777
DISPLAY=:99

# === Playwright ===
REBROWSER_PATCHES_RUNTIME_FIX_MODE=addBinding
REBROWSER_PATCHES_SOURCE_URL=app.js
CHROME_PROFILE_PATH=/home/deploy/.chrome-profiles/twitter

# === Posting Mode ===
TWITTER_CLIENT_MODE=hybrid   # api (reads + mentions) + playwright (reply-guy)

# === Autonomy ===
ENABLE_AUTO_FARM=false
AUTO_FARM_INTERVAL_HOURS=6
AUTO_FARM_TARGET_COUNT=5

ENABLE_AUTO_POST=false
AUTO_POST_INTERVAL_HOURS=3
MAX_AUTO_POSTS_PER_DAY=3
AUTO_POST_MIN_SCORE=4.0
AUTO_POST_MIN_BUFFER=5

ENABLE_REPLY_GUY=false
REPLY_GUY_INTERVAL_MINUTES=15
REPLY_GUY_DAILY_CAP=50

ENABLE_SMART_REPLIES=false
SMART_REPLY_LOW_FOLLOWERS=1000
SMART_REPLY_MID_FOLLOWERS=10000
SMART_REPLY_LOW_MIN_EVAL=3.5
SMART_REPLY_MID_MIN_EVAL=4.0

ENABLE_LEARNING_LOOP=false
```

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Twitter detects Playwright | Medium | High (ban) | rebrowser-playwright + ISP proxy + Xvfb + human-like delays |
| Chrome profile session expires | Low | Medium (downtime) | Health check cron, Telegram alert, manual re-login |
| Proxy IP gets flagged | Low | Medium | Switch to backup IP (Decodo allows IP changes) |
| Chromium crashes/memory leak | Medium | Low | PM2 max_memory_restart, periodic browser restart (every 6h) |
| OpenClaw + Playwright MCP conflict | Low | Low | Separate Chrome profiles per consumer |
| Warm-up too aggressive | Medium | High (ban) | Conservative schedule, monitor engagement signals |
| Reply content flagged as spam | Low | Medium | LLM-generated unique content, quality gate (eval ≥ 3.5) |

## Key Decisions Log

| Decision | Rationale |
|----------|-----------|
| Playwright for posting, not API | API v2 returns 403 on non-mention replies (Feb 2026). Reply-guy is primary growth strategy |
| Programmatic Playwright in beef-bot | Routine posting needs speed + reliability. LLM-in-loop would be 10x slower per post |
| OpenClaw gets Playwright MCP separately | Ad-hoc operator commands need flexibility. Separate profile avoids session conflicts |
| rebrowser-playwright over playwright-extra | Patches CDP Runtime.enable (deepest detection vector). Drop-in replacement, no code changes |
| Headful via Xvfb, not headless | Twitter checks headless signals (GPU, rendering). Xvfb eliminates this entire detection class |
| ISP static proxy, not rotating | One account = one IP. Rotation triggers geo-anomaly detection |
| Warm-up schedule | Going from 0 → 50 replies/day overnight = immediate flag. Gradual ramp builds trust |
