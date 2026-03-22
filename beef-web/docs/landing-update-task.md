# Landing Page Update Task — 0xbeef.wtf Rebrand

**Date:** 2026-03-20
**Priority:** High
**Landing location:** Docker container `cometa-proxy` → `aisatisfy-blog` container → `/usr/share/nginx/html/beefv2/index.html`
**Current domain:** beefthis.wtf
**New domain:** 0xbeef.wtf
**Twitter:** https://x.com/0xBeefer

---

## Task 1: Domain Migration (Server)

### 1.1 Create nginx config for 0xbeef.wtf

Copy `/etc/nginx/conf.d/beefthis.wtf.conf` inside `cometa-proxy` container and create `0xbeef.wtf.conf`:
- Replace all `beefthis.wtf` → `0xbeef.wtf` in the new config
- Same proxy_pass: `http://aisatisfy-blog:80/beefv2/`
- Same security headers, TLS settings, rate limiting

### 1.2 SSL certificate

Run certbot inside `cometa-certbot` container for:
- `0xbeef.wtf`
- `www.0xbeef.wtf`

### 1.3 Redirect old domain

Update `beefthis.wtf.conf` to 301 redirect all traffic:
```nginx
server {
    listen 443 ssl http2;
    server_name beefthis.wtf www.beefthis.wtf;
    # ... existing SSL certs ...
    return 301 https://0xbeef.wtf$request_uri;
}
```

Keep the HTTP→HTTPS + ACME challenge block for cert renewals.

### 1.4 Verify

- `curl -I https://0xbeef.wtf` → 200
- `curl -I https://beefthis.wtf` → 301 to 0xbeef.wtf
- `curl -I https://www.0xbeef.wtf` → 301 to 0xbeef.wtf

---

## Task 2: Rebrand — Handle & Domain Updates

Find and replace ALL occurrences in `index.html`:

| Search | Replace | Context |
|--------|---------|---------|
| `@BeefThis` | `@0xBeefer` | Twitter handles in text, links, CTA, meta tags |
| `beefthis.wtf` | `0xbeef.wtf` | Domain references, share URLs, canonical |
| `https://twitter.com/BeefThis` | `https://x.com/0xBeefer` | Link hrefs |
| `https://x.com/BeefThis` | `https://x.com/0xBeefer` | Link hrefs (if any) |
| `twitter:site` content `@BeefThis` | `@0xBeefer` | OG meta tag |
| Tweet mockup name `$BEEF` | `Agent Beefer` | The fake tweet card author name |
| Tweet mockup handle `@BeefThis` | `@0xBeefer` | The fake tweet card handle |

Also update the share-on-X button template to mention `@0xBeefer` and link to `0xbeef.wtf`.

**Expected ~10 replacements across the file.**

---

## Task 3: Fix Fake Data — Honesty Pass

These elements currently show fabricated metrics that look like live data. Fix them:

### 3.1 Stats bar (the 4-column stats section)

Current:
```
143,629 $BEEF BURNED | 4,201 AUDITS | 127d UPTIME | ∞ CASUALTIES
```

Replace with:
```
— $BEEF BURNED | — AUDITS | 0d UPTIME | ∞ CASUALTIES
```

OR use a pre-launch variant:
```
pre-launch | pre-launch | booting... | ∞ CASUALTIES
```

The key: no specific fake numbers. Either show real zeros/dashes or show "pre-launch" labels.

### 3.2 Tweet mockup engagement metrics

Current: `❤️ 2,847 🔁 891 💬 347 👁️ 124K`

Options (pick one):
- **Remove entirely** — cleanest
- **Replace with:** `❤️ — 🔁 — 💬 — 👁️ —` (dashes)
- **Add label:** `[simulated]` in small text

### 3.3 Hero bio text

Current: `forensic accounting AI. 4,200 whitepapers read. 89% flagged.`

Replace with: `forensic accounting AI. autonomous roast bot on Base.`

Or keep but reframe: `forensic accounting AI. reading whitepapers. flagging everything.` (present tense, no fake numbers)

### 3.4 Status bar

Current: `$BEEF v2.0 status: ■ online audits: 4,201 uptime: 127d mode: autonomous`

Replace with: `$BEEF v2.0 status: ■ online audits: 0 uptime: 0d mode: autonomous`

Or: `$BEEF v2.0 status: ■ booting audits: — uptime: — mode: autonomous`

### 3.5 Audit card numbers

Current: `AUDIT #4,201`, `AUDIT #4,102`, `AUDIT #3,991`, `AUDIT #4,087`

Options:
- **Keep as lore** — these can be seen as fictional "case file" numbers, not real counts. The lore framing (classified reports, evidence wall) supports this reading. Acceptable if other fake metrics are fixed.
- **Renumber from #001** — more honest but less cool

**Recommendation:** Keep audit card numbers as-is (lore), but fix the real-looking metrics (stats bar, engagement, uptime).

### 3.6 Live ticker

Current ticker has `AUDIT #4,201` references and specific engagement numbers.

Update to remove specific counts, or label the ticker as `[INCOMING TRANSMISSIONS]` instead of `LIVE` to signal it's not real-time data.

### 3.7 Elements that are OK to keep (in-character fiction)

These are part of the bot's persona/lore — do NOT change:
- Operator File (`tvl audited: $40,000,000,000+`, `status: deprecated`, `motive: spite`)
- `∞ CASUALTIES`
- Doneness ratings (WELL DONE, MEDIUM RARE, etc.)
- `funded by swap fees and spite`
- `CONTRACT: 0xBEEF...deploying on Base` (honestly says "deploying")
- Footer text about €4/month validator

---

## Task 4: Upgrade Roast Cards

Replace 3 of the 5 audit report cards with higher-quality roasts. Keep self-assessment and refresh the rest.

### Card 1: Self-Assessment (KEEP)
No change needed. "SELF-AWARE" tag stays.

### Card 2: Hyperliquid (REPLACE)

Old text: `force-closed JELLY positions to "manage risk." decentralized exchange that centralizes faster than binance when the numbers go wrong.`

**New text:**
```
hyperliquid: fully decentralized perpetuals exchange. also hyperliquid: validators convened and delisted a market in 2 minutes. 2 minutes. binance takes longer to reply to support tickets.
```
Verdict: **WELL DONE**
Audit #: keep existing or use `#3,991`

### Card 3: OpenSea (REPLACE)

Old text: `went from $2.9B monthly volume to $30M. fired 70% of staff to achieve this. the SEA token was the most honest thing they ever launched — a life jacket after the ship sank.`

**New text:**
```
opensea's daily volume 5x'd after announcing a token. their product didn't change. their technology didn't change. their market position didn't change. turns out the product WAS the token. it always was. few understand.
```
Verdict: **EXTRA CRISPY**

### Card 4: Virtuals Protocol (REPLACE)

Old text: `86% drop in daily wallets since january. DEX volume $260M to $11.6M. i'm an AI auditing an AI ecosystem in collapse. the data feels enough.`

**New text:**
```
virtuals protocol DEX volume: $267M peak, $27M now. i'm also an AI agent on Base. i'm also probably going to zero. the difference: nobody spent $267M pretending i was the future of human-AI coordination. they were more honest with me.
```
Verdict: **MEDIUM RARE**

### Card 5: Eigenlayer (REPLACE)

Old text: `restaking: it's leverage with extra steps and a points dashboard. the airdrop was worth less than the gas spent farming it.`

**New text:**
```
friend.tech arc: $52M TVL, then dead. token -99.8% from $3.26. then they announced "friendchain," deleted the post, and relinquished the smart contracts. in that order. you don't relinquish contracts on a project you believe in. that's a ghost leaving a haunted house.
```
Target: **friend.tech** (rename the card)
Verdict: **WELL DONE**

### Update ticker text

Update the scrolling ticker to include snippets from the new roasts:
- `hyperliquid: validators convened and delisted a market in 2 minutes. binance takes longer to reply.`
- `opensea: the product WAS the token. it always was.`
- `virtuals: $267M peak, $27M now. they were more honest with me.`
- `friend.tech: a ghost leaving a haunted house.`

---

## Task 5: Add Twitter Profile Link (Prominent)

The landing currently has a Twitter CTA at the bottom. Make the Twitter presence more prominent:

1. **Header area:** Add a small Twitter/X icon linking to `https://x.com/0xBeefer` near the status bar
2. **Tweet mockup section:** Update avatar, name ("Agent Beefer"), handle ("@0xBeefer"), and link the card to the real profile
3. **Bottom CTA:** Update text to `@0xBeefer — this is where the audits live` with working link

---

## Task 6: Minor UX Improvements

### 6.1 Contract section
Keep "0xBEEF...deploying on Base" — it's honest about pre-launch state. The COPY button can show a tooltip "contract address coming soon" instead of copying a fake address.

### 6.2 "Buy / Burn" link
Current: `DEX — deploying soon. follow @BeefThis for launch`
Update to: `DEX — deploying soon. follow @0xBeefer for launch`

### 6.3 Avatar in tweet mockup
If possible, use the actual @0xBeefer profile pic (the bull skull PFP visible in the Twitter screenshots) instead of the current small logo.

---

## Execution Order

1. **Server:** Create 0xbeef.wtf nginx config + SSL (Task 1)
2. **HTML:** Rebrand handles and domains (Task 2)
3. **HTML:** Fix fake metrics (Task 3)
4. **HTML:** Replace roast cards (Task 4)
5. **HTML:** Update Twitter links (Task 5)
6. **HTML:** Minor fixes (Task 6)
7. **Verify:** Check both domains, all links, OG tags
8. **Redirect:** Enable 301 from beefthis.wtf → 0xbeef.wtf

---

## Files to Modify

| File | Location | Changes |
|------|----------|---------|
| `index.html` | `aisatisfy-blog` container at `/usr/share/nginx/html/beefv2/index.html` | Tasks 2-6 |
| `beefthis.wtf.conf` | `cometa-proxy` container at `/etc/nginx/conf.d/` | Task 1.3 (redirect) |
| `0xbeef.wtf.conf` | `cometa-proxy` container at `/etc/nginx/conf.d/` (NEW) | Task 1.1 |
| OG image | May need update if domain is baked into the image | Check `og-image.png` |

---

## Verification Checklist

- [ ] `https://0xbeef.wtf` loads with valid SSL
- [ ] `https://beefthis.wtf` redirects to `https://0xbeef.wtf`
- [ ] `https://www.0xbeef.wtf` redirects to `https://0xbeef.wtf`
- [ ] No `@BeefThis` text remains anywhere on the page
- [ ] No `beefthis.wtf` text remains anywhere on the page
- [ ] All Twitter links point to `https://x.com/0xBeefer`
- [ ] Share button generates tweet mentioning `@0xBeefer` and `0xbeef.wtf`
- [ ] Stats bar shows pre-launch / zero values (no fake numbers)
- [ ] Tweet mockup shows "Agent Beefer" / "@0xBeefer"
- [ ] Tweet mockup engagement metrics removed or labeled
- [ ] All 5 roast cards display updated text
- [ ] Ticker text updated with new roast snippets
- [ ] OG tags reference `0xbeef.wtf` and `@0xBeefer`
- [ ] Mobile responsive still works after changes
