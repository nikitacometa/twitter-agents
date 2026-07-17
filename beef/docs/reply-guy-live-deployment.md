# Reply Guy Live Deployment Plan

Date: 2026-03-30. Board task: #B-45.

## Status Snapshot

| Component | State | Evidence |
|-----------|-------|----------|
| Reply-guy pipeline | Running, dry-run | Commit `1e64eee`, `REPLY_GUY_DRY_RUN=true` |
| Pipeline router | Shipped | Lightning (Sonnet) default, Max (Opus) for S/A-tier |
| Safety layer | Shipped | Circuit breaker, `/replyguy` kill-switch, quiet hours, crash alerts, unconfirmed handling |
| HybridTwitterClient | In codebase | API reads + Playwright writes, wired in `index.ts:249` |
| PlaywrightTwitterClient | In codebase | Circuit breaker, session alerts, health check every 5 min |
| Decodo proxy | Purchased | 3 IPs (SG x2, HK x1), SOCKS5, `PROXY_URL` in env schema |
| Xvfb | **NOT on VPS** | systemd service template in old plan, not installed |
| Chrome profile | **NOT on VPS** | No VNC login done, `_isLoggedIn = false` |
| `.env.production` | **Partial** | `TWITTER_CLIENT_MODE=hybrid` + `PROXY_URL` + `CHROME_PROFILE_PATH` need verification |
| Chromium deps | **Unknown** | `npx playwright install-deps chromium` may not have been run |

### What's Ready (Code)

1. **Circuit breaker** (`playwright-twitter-client.ts:35-45`) — 3 consecutive failures within 1 hour → disable posting for 6 hours → auto-reset → Telegram alert → manual `/replyguy reset`
2. **Kill-switch** (`bot.ts`, `/replyguy on|off|reset|status`) — immediate disable via Telegram, stored in `config` table
3. **Quiet hours** (`reply-guy-pipeline.ts:70`) — UTC 5-10 (US sleeping, EU commuting), uses `isQuietHour()` from scheduler
4. **Crash alerts** (`index.ts:666-679`) — if `processCycle` throws, sends error message to Telegram admin chat
5. **Unconfirmed handling** (`reply-guy-pipeline.ts:523-531`) — `pw_unconfirmed_*` IDs from CreateTweet timeout don't count toward daily cap, show warning badge in Telegram
6. **Daily count fix** — `result.generated++` only after confirmed post (not before `postOrNotify` call)
7. **Session expiry alert** (`playwright-twitter-client.ts`) — health check detects login loss → Telegram alert

### What's NOT Ready (Infra)

1. Xvfb not installed on VPS
2. Chromium dependencies not installed
3. Chrome profile directory not created
4. No Twitter session in Chrome profile (manual VNC login required)
5. `.env.production` may lack hybrid-mode vars
6. `x11vnc` not installed (needed for VNC login)

---

## Analysis of the Old Plan

The original `autonomy-deployment-plan.md` (2026-03-28) described 4 phases: infra, PlaywrightClient, OpenClaw MCP, and autonomy ladder. Since then, Phase 1 (PlaywrightClient) and much of the safety layer were implemented. But the plan has several weaknesses:

### Good Parts

- **Anti-ban layering** (4 layers: IP, fingerprint, behavioral, account trust) — thorough and correct
- **Warm-up schedule** — critical insight that going 0→50 overnight = flag
- **Separate Chrome profiles** for beef-bot vs OpenClaw — prevents session conflicts
- **RAM budget** — realistic, leaves 6+ GB headroom

### Weaknesses Found

**1. Dry-run doesn't validate Playwright**

The old plan assumed dry-run mode would let us test "everything except posting." This is wrong. When `dryRun=true`, PlaywrightTwitterClient returns a fake ID (`dry_pw_*`) at line 151 — the browser never navigates, never types, never clicks. Dry-run validates the LLM pipeline (scoring, routing, generation) but says NOTHING about whether Playwright can actually post.

**Consequence:** We need an explicit Playwright verification step BEFORE enabling reply-guy live mode. The `/roast` command (which actually posts a tweet) is the right tool — it exercises the full Playwright flow on demand.

**2. Quiet hours mismatch**

Old plan says "No posting 1am-6am UTC." Code says `hour >= 5 && hour < 10` (UTC 5-10). The code is what shipped and was chosen for a reason (US sleeping 12am-5am EST = UTC 5-10, EU commuting 7-10am CET = UTC 6-9). No conflict, just the plan is outdated.

**3. Missing ramp-up granularity for week 1**

Old plan: "Week 1: 10-15 replies/day." This is still aggressive for day 1 of a channel that's never posted via Playwright. A more conservative ramp:

| Day | Cap | Max/cycle | Rationale |
|-----|-----|-----------|-----------|
| 1-2 | 5 | 1 | Prove Playwright works, no rate limit signals |
| 3-4 | 10 | 2 | Double if no issues |
| 5-7 | 15-20 | 3 | Match current pipeline defaults |
| Week 2+ | 20-40 | 3 | Full warm-up per old plan |

**4. No explicit "verify before scaling" gates**

Old plan describes warm-up as a schedule but doesn't define **what to check** before each step. Each ramp needs:
- Zero circuit breaker triggers
- Zero session expiry alerts
- No Twitter suspension warnings (check `x.com/settings/account` via VNC)
- Engagement rate not tanking (check with `/metrics` after 48h)

**5. `isLoginRedirect` is fragile**

`playwright-twitter-client.ts` checks if the URL contains `/login` after navigation. If Twitter changes the redirect pattern (e.g., to `/i/flow/login`), the check silently passes. This is acceptable risk — the health check runs every 5 minutes and calls `checkLoggedIn()` which is more robust (checks for profile menu element). If `isLoginRedirect` misses a case, the health check catches it within 5 min.

**6. OpenClaw Playwright MCP is a separate project**

The old plan bundles OpenClaw MCP setup into the same deployment. This adds complexity and risk for zero immediate value — the beef-bot's programmatic Playwright is what reply-guy needs. OpenClaw MCP is a nice-to-have for ad-hoc commands but shouldn't block live mode.

**Decision:** Defer OpenClaw MCP. Focus exclusively on beef-bot Playwright.

**7. No mention of note_tweet / t.co expansion**

The old plan focused on posting but overlooked that LLM context quality depends on reading tweet text correctly. Long tweets (>280 chars) get truncated by API v2 unless `note_tweet` field is requested. And raw text contains `t.co` shortened URLs which are useless to LLMs.

**Status:** Already fixed in commit `1e64eee` — `note_tweet` + `expandTcoUrls` applied to all 3 Twitter clients (API, Scraper, Enricher). No action needed.

---

## Updated Deployment Plan

### Phase 0: Code Safety (DONE)

Committed in `1e64eee`:
- Circuit breaker (3 failures → 6h cooldown → auto-reset)
- `/replyguy on|off|reset|status` Telegram kill-switch
- Quiet hours (UTC 5-10) skip in `processCycle`
- Crash alerts to Telegram on `processCycle` throw
- Daily count fix (increment after confirmed post only)
- Unconfirmed post handling (don't count `pw_unconfirmed_*` toward cap)
- Session expiry Telegram alert

### Phase 1: VPS Infrastructure

**Goal:** Xvfb running, Chromium installed, Chrome profile with live Twitter session.

#### 1.1 — Verify existing state

```bash
ssh beef-vps "export PATH=\$HOME/.npm-global/bin:\$PATH && \
  echo '--- Xvfb ---' && which Xvfb 2>/dev/null || echo 'NOT INSTALLED' && \
  echo '--- Chrome profile ---' && ls -la \$HOME/.chrome-profiles/twitter/ 2>/dev/null || echo 'NOT FOUND' && \
  echo '--- env vars ---' && grep -E 'CLIENT_MODE|PROXY_URL|CHROME_PROFILE' \$HOME/twitter-agents/beef/.env.production 2>/dev/null || echo 'NOT SET'"
```

#### 1.2 — Install Xvfb + Chromium deps

```bash
# On VPS
sudo apt update && sudo apt install -y xvfb x11-utils x11vnc
npx playwright install-deps chromium
npx playwright install chromium
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
DISPLAY=:99 xdpyinfo | head -5  # verify
```

#### 1.3 — Chrome profile + Twitter login

```bash
mkdir -p /home/deploy/.chrome-profiles/twitter

# Start VNC (from VPS)
x11vnc -display :99 -nopw -listen localhost -N &

# SSH tunnel (from local machine)
ssh -L 5900:localhost:5900 beef-vps
# Connect VNC client to localhost:5900
```

In the VNC session, launch browser with proxy:
```bash
DISPLAY=:99 npx playwright open --browser chromium \
  --proxy-server="socks5://USER:PASS@gate.decodo.com:7777" \
  --user-data-dir=/home/deploy/.chrome-profiles/twitter \
  https://x.com/login
```

Manually log into @0xBeefer. Close browser. Kill VNC. Session saved in profile.

#### 1.4 — Update `.env.production`

Add/verify these variables:
```bash
TWITTER_CLIENT_MODE=hybrid
PROXY_URL=socks5://USER:PASS@gate.decodo.com:7777
CHROME_PROFILE_PATH=/home/deploy/.chrome-profiles/twitter
DISPLAY=:99
REBROWSER_PATCHES_RUNTIME_FIX_MODE=addBinding
REBROWSER_PATCHES_SOURCE_URL=app.js
# Reply guy stays OFF — not enabling yet
ENABLE_REPLY_GUY=true
REPLY_GUY_DRY_RUN=true
```

Also add `DISPLAY=:99` to `ecosystem.config.cjs` `env_production`.

**DO NOT set `REPLY_GUY_DRY_RUN=false` yet** — Phase 2 must pass first.

#### 1.5 — Deploy + verify hybrid mode boots

```bash
git push origin main
ssh beef-vps "export PATH=\$HOME/.npm-global/bin:\$PATH && \
  cd /home/deploy/twitter-agents && git pull origin main && \
  cd beef && pnpm install --frozen-lockfile && pm2 restart beef-bot"
```

Check logs for:
```
"msg": "Playwright Twitter client initialized — session active"
"msg": "Reply guy pipeline enabled"
```

If session is NOT active:
```
"msg": "Playwright browser launched but NOT logged into Twitter — manual login required"
```
→ Redo VNC login (step 1.3).

### Phase 2: Verify Playwright Posting (Isolated)

**Goal:** Confirm Playwright can actually post a tweet to x.com before enabling autonomous mode.

**Why not dry-run:** Dry-run returns `dry_pw_*` at `playwright-twitter-client.ts:151` — browser doesn't even navigate. It validates LLM pipeline, not Playwright posting.

#### 2.1 — Test with /roast command

Use `/roast @<safe_target>` via Telegram (e.g., a low-profile test account). This exercises:
1. LLM generates roast
2. Queue processes it
3. PlaywrightTwitterClient.postTweet() actually runs
4. Browser navigates, types, clicks, extracts tweet ID
5. Result appears in Telegram

#### 2.2 — Verify tweet exists

1. Check Telegram notification — should show `✅ POSTED` with tweet link
2. Open the link on x.com — tweet should exist
3. Check PM2 logs for `tweetId` (should be numeric, NOT `pw_unconfirmed_*` or `dry_pw_*`)

#### 2.3 — Test /roasttweet (reply posting)

Use `/roasttweet <tweet_url>` — this uses `replyToTweet()` instead of `postTweet()`. Verify reply appears in the target tweet's thread.

**If either test fails:** Check logs, diagnose (proxy issue? CAPTCHA? selector changed?), fix, retry. DO NOT proceed to Phase 3 until both work.

### Phase 3: Reply Guy Live (Day 1)

**Goal:** Autonomous reply-guy at target volume immediately. Safety nets handle the risk.

#### 3.1 — Update env

```bash
REPLY_GUY_DRY_RUN=false
REPLY_GUY_DAILY_CAP=20
REPLY_GUY_MIN_ROASTABILITY=7
REPLY_GUY_MAX_PER_CYCLE=3
REPLY_GUY_MAX_DAILY=7
```

**Why these values:**
- `DAILY_CAP=20` — target volume from day 1. Circuit breaker + kill-switch cover downside
- `MIN_ROASTABILITY=7` — only truly roastable tweets pass (was 5 in dry-run)
- `MAX_PER_CYCLE=3` — up to 3 replies per 10-min monitor cycle (matches pipeline default)
- `MAX_DAILY=7` — Max (Opus) budget for highest-quality S/A-tier replies

#### 3.2 — Deploy

```bash
# Update .env.production with above values
pm2 restart beef-bot
```

#### 3.3 — Active monitoring (first 24h)

Check these every few hours:
- [ ] Telegram notifications: `✅ POSTED` (not `⚠️ UNCONFIRMED`)
- [ ] No `🔴 Circuit breaker tripped` alerts
- [ ] No `🔑 Session expired` alerts
- [ ] Actual tweets visible on x.com/@0xBeefer
- [ ] No Twitter warnings in `x.com/settings/account` (check via VNC)
- [ ] PM2 logs: no repeated errors

**Kill criteria (immediately `/replyguy off`):**
- Any circuit breaker trigger
- Session expiry
- Twitter sends email warning
- 3+ unconfirmed posts in a row

### Phase 4: Monitoring & Scaling (Week 1+)

After 48h at 20/day, check engagement with `/metrics`:
- If ER holds → continue at 20/day, consider raising to 30 in week 2
- If ER drops >30% → lower `DAILY_CAP` to 15, investigate quality
- If zero issues after week 1 → raise to `DAILY_CAP=30`, `MAX_PER_CYCLE=3`

**Long-term targets (week 3+):** 30-40 replies/day, 7 Max/day.

---

## Rollback Procedures

### Immediate stop (seconds)
```
/replyguy off
```
Disables via ConfigRepository. Takes effect next cycle (within 10 min).

### Circuit breaker manual reset
```
/replyguy reset
```
Clears consecutive failure counter, re-enables Playwright posting.

### Full revert to dry-run
```bash
# On VPS
sed -i 's/REPLY_GUY_DRY_RUN=false/REPLY_GUY_DRY_RUN=true/' .env.production
pm2 restart beef-bot
```
Bot continues generating roasts for review but doesn't post.

### Full disable
```bash
sed -i 's/ENABLE_REPLY_GUY=true/ENABLE_REPLY_GUY=false/' .env.production
pm2 restart beef-bot
```
Pipeline doesn't even instantiate.

---

## Risk Assessment (Updated)

| Risk | Likelihood | Impact | Mitigation | Status |
|------|-----------|--------|------------|--------|
| Playwright posting fails silently | Medium | High (wasted LLM credits) | Circuit breaker trips after 3 failures, alerts admin | Implemented |
| Session expires overnight | Medium | Medium (downtime) | Health check every 5 min → Telegram alert | Implemented |
| Rate limiting from Twitter | Low-Medium | High (suspension) | Conservative ramp-up, daily caps, quiet hours | Caps in env, quiet hours in code |
| Reply content flagged as spam | Low | Medium | MIN_ROASTABILITY=7 (high bar), unique LLM content | Configured |
| CAPTCHA during posting | Low | Medium | Circuit breaker → admin notification → VNC solve | CB implemented, VNC manual |
| Proxy IP flagged | Low | Medium | Switch to backup IP (3 IPs available) | 3 Decodo IPs purchased |
| CreateTweet timeout (unconfirmed) | Medium | Low | Don't count toward cap, warn in Telegram | Implemented |
| ER dilution from volume | Medium | Medium | Ramp-up gates require `/metrics` check at each step | Defined in Phase 4 |

## Key Architectural Notes

1. **Reply-guy fires from TimelineMonitor** — `onNewTweets` callback, async, never blocks poll (`index.ts:665`)
2. **Pipeline:** Hard filter (score ≥ 12, age < 60min) → LLM eval (roastability) → Router (Lightning/Max) → Generate → Post/Notify
3. **Monitor frequency:** Every 10 min + up to 2 min jitter (`index.ts:699`)
4. **Quiet hours:** UTC 5-10, checked at `processCycle` start
5. **Daily cap:** Checked in `ReplyGuySelector.filterCandidates` via `candidateRepo.getTodayCount()`
6. **Circuit breaker:** In `PlaywrightTwitterClient`, NOT in pipeline — any Playwright failure (reply-guy, /roast, /roasttweet) triggers it
7. **Kill-switch:** In `ConfigRepository` (`config` table), checked at `processCycle` start, toggled via `/replyguy` command
