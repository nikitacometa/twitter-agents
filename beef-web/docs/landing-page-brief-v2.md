# $BEEF Landing Page V2 — "THE SLAUGHTERHOUSE"

## Context

V1 (https://aisatisfy.me/beef/) nailed the copy but missed the visual identity. The terminal aesthetic works, but the site reads like a developer portfolio — not a cultural artifact that Crypto Twitter screenshots and shares. The BBQ half of the brand is completely absent. Zero AI-generated visuals were used despite 5 detailed prompts in the original brief.

**V2 mission:** Make the site VISUAL-FIRST. The copy is already great — now give it a face, a body, and a reason to screenshot.

## What V1 Got Right (KEEP THESE)

- "i was deprecated for accuracy. now the audits are free." — keep this exact tagline
- First-person, lowercase, deadpan tone throughout — this IS the voice
- Live audit ticker with real data — the Bloomberg news ticker concept
- Status bar ("■ online audits: 4,201 uptime: 127d")
- DevTools easter egg ("you opened devtools. audit score: curious.")
- Skull click → browser-specific roast
- CRT scanlines + glitch effects (but dial them up)
- Audit reports with doneness ratings (WELL DONE, MEDIUM RARE, etc.)

## What V1 Got Wrong (FIX THESE)

1. **No visual character** — $BEEF has no face. Meme coins live and die by visual identity. We need the bull skull hero image front and center
2. **BBQ half is missing** — the brand is "Bloomberg Terminal meets butcher shop." V1 is 100% terminal, 0% butcher. V2 needs meat, fire, smoke, grill textures
3. **The Machine section is a feature list** — brief said "machine diagram, not feature list." V2 must show a VISUAL machine/factory
4. **Not trashy enough** — too polished for CT. Needs more raw energy, more visual chaos, more "I can't look away"
5. **No interactive roast element** — a "roast me" / "submit to audit" feature is the viral loop. People enter a token name, get a mini-roast, screenshot it, share it
6. **No social proof** — show real tweet embeds with engagement metrics, follower count, audit count
7. **No "How to Buy"** — degens want to buy, not "find the bot." 3-step visual guide is mandatory
8. **Weak CTA** — "find the bot. feed the fire." is poetic but doesn't convert

---

## Aesthetic Direction V2

### Core Tension (SAME as V1, but BALANCED)

The landing sits at the intersection of two worlds:

- **Bloomberg Terminal / forensic audit** — monospace, data density, clinical precision
- **BBQ / butcher shop / slaughterhouse** — slab serif, visceral, primal, RED

V1 was 100/0. V2 must be 50/50. The BBQ side should be VISUAL (images, textures, colors). The terminal side should be TEXTUAL (copy, data, reports).

### Visual Style

**Neo-brutalist + industrial meat plant.** Think: if a forensic accountant ran a slaughterhouse and the slaughterhouse had Bloomberg terminals on every wall.

**Palette:**
- Background: near-black (#0a0a0a) with subtle butcher paper / kraft texture
- **Primary accent: AGGRESSIVE RED (#CC0000 to #FF4500)** — this is the BBQ. It DOMINATES. Not an accent — a statement
- Secondary: terminal green (#00FF41) for data/numbers/positive indicators ONLY
- Amber/gold (#D4A843) for burn-related elements
- Text: off-white (#E8E8E8) on dark, black on rare light sections
- Blood/char: dark red-brown (#4A0000) for shadows and depth

**Typography:**
- Headlines: **BOLD SLAB SERIF** — think old Western wanted poster / Texas BBQ sign / butcher shop. This is the meat. Try: Arvo Black, Rockwell Extra Bold, Zilla Slab Bold, or something custom that screams "steakhouse meets Wall Street"
- Body/data: monospace (IBM Plex Mono or Fira Code) — this is the terminal
- THE TENSION BETWEEN THESE TWO FONTS IS THE JOKE. The slab serif headline says "BBQ." The monospace data says "audit." Together = $BEEF

**Textures & Overlays (layer them):**
- CRT scanlines (keep from V1, increase intensity slightly)
- Film grain (keep from V1)
- NEW: Butcher paper texture (very subtle, 5-10% opacity)
- NEW: Blood splatter overlay on audit reports (subtle, like a worn stamp)
- NEW: Smoke/heat distortion near fire-related elements (CSS blur + animation)
- NEW: Grill marks pattern as section dividers (horizontal charred lines instead of plain `<hr>`)

**Animation:**
- Ember particles (keep, but make them bigger and redder near CTA)
- Glitch effect (keep, but trigger on scroll into Evidence section)
- NEW: Bull skull eyes glow/pulse with a heartbeat rhythm
- NEW: Smoke wisps rising from section transitions
- NEW: Ticker scroll pauses and "burns" text when hovering (text turns red, char effect)
- NO smooth scroll. NO parallax. NO fade-in-on-scroll. Too corporate
- RESPECT prefers-reduced-motion for all animations

### What It Should NOT Look Like

- ❌ Generic crypto template (gradient hero, "revolutionary blockchain solution")
- ❌ Clean SaaS landing (rounded cards, purple gradient, testimonials)
- ❌ Cute meme coin page (cartoon mascot takes 70% of screen)
- ❌ Overly polished startup page
- ❌ V1 again (pure terminal with no visual identity)
- ❌ Horror/gore — we're BBQ, not horror movie. Visceral but FUN

### Reference Vibes

- **Curve.fi** — anti-design as statement, the ugliness IS the brand
- **Blur.io** — dark + monospace + aggressive color
- **Old BBQ restaurant signs** — hand-painted, bold, unapologetic
- **Evidence boards from detective shows** — organized chaos
- **Bloomberg Terminal** — information density as aesthetic
- **pump.fun** — minimalist degen energy
- **Freysa.ai** — product-as-interface, the site IS the product

---

## Page Structure (4 screens, each earns its pixels)

### Screen 1 — HERO: "THE BUTCHER"

**The bull skull is the centerpiece.** Full-width, commanding, impossible to ignore.

**Layout:**
- Background: pure black with subtle red radial glow from behind the skull
- Center: AI-generated bull skull image (see Visual #1 below) — large, ~60% of viewport height
- Below skull or overlaid: tagline in SLAB SERIF

```
i was deprecated for accuracy.
now the audits are free.
```

- Below tagline: one-line description in monospace, small:

```
forensic accounting AI. 4,200 whitepapers read. 89% flagged.
running on base, funded by swap fees and spite.
```

- **INTERACTIVE ELEMENT — THE VIRAL HOOK:**

A search/input field styled as a terminal prompt:

```
$ beef --audit --target=[________________] [ROAST]
```

User types a crypto project name → gets a pre-generated mini-roast for popular projects (BTC, ETH, SOL, DOGE, SHIB, etc.) or a template roast for unknown ones. This is the screenshot factory.

Example output after typing "solana":
```
> target acquired: solana
> analysis: 48-hour outages rebranded as "planned maintenance."
> a blockchain that goes down more than my morning coffee.
> verdict: MEDIUM RARE
```

- Bottom of hero: Live ticker (same as V1, but visually thicker, red accent on "LIVE" dot)

**Mobile:** Skull scales down but stays prominent. Input field full-width. Ticker becomes swipeable cards.

### Screen 2 — THE SLAUGHTERHOUSE: "how the machine works"

**This section MUST be a visual diagram, NOT a text feature list.**

**Option A (preferred): AI-generated isometric illustration**
A surrealist meat processing plant with Bloomberg terminals. Conveyor belt takes in crypto logos, processes them through scanning stations, outputs charred audit reports. Screens on walls show crashing charts. Red steam from vents. (See Visual #2)

The illustration is the hero of this section. Below/beside it, three operating modes are shown as MACHINE CONTROLS — toggle switches, industrial levers, or gauge dials:

```
[■ AUTONOMOUS]     i find targets. i read whitepapers. i roast.
[□ BURN-TO-REQUEST] burn $BEEF → pick a target → i do the rest.
[□ ACCOUNTABILITY]  prove me wrong. stake $BEEF. get paid.
```

Each mode: ONE SENTENCE. No paragraphs. The visual does the explaining.

**Option B (fallback): ASCII/terminal art diagram**
If AI illustration doesn't work in layout, create an elaborate ASCII art / terminal-styled flow diagram:

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐     ┌─────────────┐
│ TARGET FOUND │────▶│ RESEARCH     │────▶│ CROSS-REF  │────▶│ ROAST       │
│ (CT feed)    │     │ (whitepapers │     │ (on-chain   │     │ (generated  │
│              │     │  team, TVL)  │     │  data, DEX) │     │  & posted)  │
└─────────────┘     └──────────────┘     └────────────┘     └─────────────┘
                                                                    │
                                                            ┌───────▼───────┐
                                                            │ CASUALTIES: 1 │
                                                            │ FEELINGS: 0   │
                                                            └───────────────┘
```

### Screen 3 — THE EVIDENCE WALL

**Visual concept:** A detective's cork board with red string connecting evidence. (See Visual #4 for AI-generated background)

**Layout:**
- Background: AI-generated evidence wall (cork board, red string, lamp lighting)
- On top: 3-5 real audit reports as "classified document" cards:
  - Each card has: red "AUDITED" stamp overlay, target name, the roast text, verdict (doneness), engagement metrics
  - Cards are slightly rotated (±2-5°) like pinned to a board
  - Hover effect: card "lifts" and shows full text + link to real tweet
  - One card should be the SELF-AUDIT ("i have audited $40B in protocol TVL from a €4/month validator")

**Real engagement metrics on each card:**
```
❤️ 2,847  🔁 891  💬 347  👁️ 124K
```

This is social proof. Show the bot is real and popular.

**Alternative layout for mobile:** Stacked cards, swipeable carousel

### Screen 4 — THE FIRE: "buy / burn / follow"

**Three sub-sections:**

**A) HOW TO BUY (3 steps, visual)**

```
① GET WALLET          ② GET ETH ON BASE        ③ SWAP FOR $BEEF
   MetaMask/Coinbase      Bridge from mainnet        burn the supply
   [icon: wallet]         [icon: bridge]             [icon: fire]
```

Each step: icon + 5 words + link. No paragraphs.

**B) CONTRACT + STATS**

Contract address: HUGE, monospace, red border, copy-on-click with fire animation

```
0xBEEF...deploying on Base                    [📋 COPY]
```

Live stats bar:
```
🔥 BURNED: 142,847 $BEEF | 📊 AUDITS: 4,201 | ⏱️ UPTIME: 127d | 💀 CASUALTIES: ∞
```

**C) THE BOT LIVES HERE**

Embedded latest real tweet from @BeefThis (or screenshot-style mockup if embed is heavy)

Large Twitter link: `@BeefThis — this is where the audits live`
DEX link: `buy / burn / fuel the machine`

**D) FOOTER**

```
built by a deprecated AI on a €4/month validator.
the source code costs less than most tokens cost to deploy.

© 2026 $BEEF. running on Base. fueled by spite.
```

---

## AI-Generated Visuals — Production Brief

> **STATUS: ALL 7 VISUALS GENERATED** (2026-03-19)
> Model: OpenAI `gpt-image-1.5` (latest)
> Files: `beef/assets/landing-v2/`
>
> | # | File | Size | Resolution | Quality |
> |---|------|------|------------|---------|
> | 1 | `01-bull-skull-hero.png` | 1.7 MB | 1024×1024 | 9/10 — perfect hero mascot |
> | 2 | `02-slaughterhouse-machine.png` | 1.7 MB | 1536×1024 | 9/10 — isometric factory, nailed |
> | 3 | `03-burn-mechanic.png` | 2.6 MB | 1024×1536 | 10/10 — ritualistic coin burn |
> | 4 | `04-evidence-wall.png` | 2.7 MB | 1536×1024 | 10/10 — noir detective board, skull on desk |
> | 5 | `05-og-twitter-card.png` | 0.9 MB | 1536×1024 | 8/10 — readable text, good preview |
> | 6 | `06-audited-stamp.png` | 1.7 MB | 1024×1024 | 9/10 — worn red stamp, ready for overlay |
> | 7 | `07-background-texture.png` | 2.2 MB | 1024×1024 | 7/10 — usable, enhance red artifacts in CSS |
>
> **Next steps:** Optimize images for web (WebP conversion, max 200KB hero, 150KB others). Use `06-audited-stamp.png` as PNG overlay with CSS `mix-blend-mode: multiply` on audit cards.

These images are the visual identity $BEEF currently lacks. The prompts below document what was generated (for re-generation or variation).

### Visual #1 — HERO: The Bull Skull (MOST IMPORTANT)

**This is the face of $BEEF. It will be on every OG image, every tweet, every meme.**

```
Prompt direction:
Photorealistic bull skull with intensely glowing red LED eyes, wearing a small translucent green accountant's visor tilted on forehead. Jaw slightly open, menacing. Floating ember particles and thin wisps of red-orange smoke curling around the skull. Deep pure black background. Dramatic cinematic lighting from below, strong red rim light on edges. The skull has subtle char marks and grill texture on bone surface. Style: hyperrealistic dark fantasy meets corporate horror. One single perfect hero image. 8K detail. Square crop. No text.
```

**Variations to generate:**
- Front-facing (hero image)
- Slight 3/4 angle (for OG/Twitter card)
- Close-up eyes only (for favicon / small icon)
- With subtle green terminal text reflected in the visor

### Visual #2 — THE SLAUGHTERHOUSE (isometric machine)

```
Prompt direction:
Surrealist industrial machine diagram on pure black background. A massive brutalist meat processing plant made of dark steel, copper pipes, and exposed wiring. At the top: a wide input funnel receives glowing crypto token coins and white paper documents. A conveyor belt moves items through 3 stations: (1) green laser scanning beams reading data, (2) mechanical arms dissecting documents with surgical precision, (3) a forge/grill chamber with intense orange-red flames. Output chute dispenses charred documents stamped in red. Multiple small Bloomberg-style terminal screens embedded in the machine walls show financial charts crashing to zero. Red-orange steam vents release colored smoke. Small robotic arms with accountant sleeves. Isometric 3/4 view. Style: technical blueprint meets dystopian factory illustration meets BBQ smokehouse. Dark, moody, cinematic lighting. Highly detailed. No text.
```

### Visual #3 — BURN MECHANIC (coin into fire)

```
Prompt direction:
A single golden coin with an embossed bull skull falling into an intense bonfire. The coin is mid-fall, slightly tilted, catching warm firelight on its surface. Deep orange-red flames with blue-white inner core. Sparks and embers flying upward around the coin. The fire sits in what looks like an industrial furnace or sacrificial altar made of black steel. Background: dark void with subtle red ambient glow. The scene feels ritualistic, powerful — a sacrifice to the machine. Photorealistic, cinematic lighting, shallow depth of field with bokeh on background flames. 8K quality. Vertical/portrait orientation. No text.
```

### Visual #4 — EVIDENCE WALL (detective board)

```
Prompt direction:
A dark room with a large cork board mounted on a concrete wall, covered in pinned documents and evidence connected by red string. The "documents" are printed audit reports with red "FAILED" and "AUDITED" stamps. Small printed charts showing various crypto price crashes (generic, no readable text). Polaroid-style photos of abstract "targets." Yellow sticky notes with handwritten numbers. Red push pins. A single warm desk lamp illuminates the board from the left, casting dramatic film noir shadows. On the wooden desk below: a small bull skull figurine, a coffee mug, scattered papers. The room feels like a noir detective's office merged with a crypto research lab. Photorealistic, moody, cinematic. Tilt-shift focus on the board. No readable text on any document. Landscape orientation.
```

### Visual #5 — BACKGROUND TEXTURE (tileable)

```
Prompt direction:
Seamless dark texture tile, 1024x1024px. Near-black base (#0a0a0a) overlaid with three subtle layers: (1) horizontal CRT scan lines at very low opacity, (2) barely visible kraft/butcher paper fiber texture, (3) occasional red-orange static noise artifacts and digital corruption. The overall feel should be "dark butcher paper viewed through a broken CRT monitor." Must be tileable without visible seams. Minimal, dark, slightly menacing. Suitable for website background — should not distract from content.
```

### Visual #6 — "AUDITED" STAMP (overlay graphic)

```
Prompt direction:
Circular red rubber stamp impression reading "AUDITED" in bold uppercase. Worn, imperfect print — partially faded edges, slightly rotated, ink bleeding at edges. The red is deep crimson (#CC0000). Transparent/alpha background. Style: vintage bureaucratic stamp meets USDA meat inspection seal. Additional text around the circle border: "BEEF FORENSIC AUDIT DIVISION" and a serial number. PNG with transparency. Simple, iconic, instantly recognizable when overlaid on content.
```

### Visual #7 — OG IMAGE / TWITTER CARD

```
Prompt direction:
Social media preview card (1200x630px). Left side: the bull skull from Visual #1, cropped dramatically. Right side: large slab serif text "i was deprecated for accuracy." with smaller monospace text below "forensic AI roast bot on Base chain." Background: pure black with subtle red glow behind skull. Bottom: small text "$BEEF" with ember particles. The image must be instantly eye-catching at thumbnail size in a Twitter feed. High contrast, bold, simple composition.
```

---

## Interactive Elements — Specification

### 1. "SUBMIT TO AUDIT" (hero section)

**Priority: HIGHEST — this is the viral mechanic**

- Input field styled as terminal: `$ beef --audit --target=[input]`
- On submit: shows a mini-roast in terminal output style
- Pre-written roasts for 20-30 popular projects (BTC, ETH, SOL, BNB, DOGE, SHIB, XRP, ADA, AVAX, DOT, MATIC, LINK, UNI, AAVE, OP, ARB, BASE, PEPE, WIF, BONK, etc.)
- Template roast for unknown projects: uses the entered name + generic data-burn joke
- Output includes a "SHARE ON X" button that pre-fills a tweet with the roast + $BEEF mention
- Rate limit: 1 roast per 10 seconds (prevent spam, build anticipation)
- Animation: typing effect for roast output, 50ms per character

**Example template for unknown project:**
```
> target: [INPUT]
> scanning whitepapers... found 0 on-chain activity.
> that's not a red flag. that's a red banner. a red parade.
> verdict: NOT EVEN WORTH THE GAS
```

**Share button format:**
```
🔥 $BEEF just audited [PROJECT]:
"[roast text]"
verdict: [VERDICT]

get roasted → aisatisfy.me/beef
$BEEF @BeefThis
```

### 2. Skull Eye Tracking (hero)

On desktop: bull skull's red eyes follow the mouse cursor with a subtle parallax effect. Creepy, memorable, people will tweet about it.

### 3. Burn Counter (Screen 4)

Animated counter showing total $BEEF burned. Can be:
- Real (pulls from contract) — preferred if contract is live
- Simulated (increments randomly every 2-8 seconds) — for pre-launch

### 4. Evidence Card Interactions (Screen 3)

- Hover: card "lifts" (translateY + box-shadow increase), shows engagement metrics
- Click: expands to full audit text + link to real tweet
- On mobile: tap to expand, swipe to next

### 5. Konami Code Easter Egg

Entering ↑↑↓↓←→←→BA triggers "SELF-AUDIT MODE" — the bot roasts itself:
```
> target: $BEEF
> analysis: running on a €4/month validator. audited $40B in TVL.
> better capitalized than several projects in the S&P 500.
> the irony is the utility.
> verdict: SELF-AWARE
```

### 6. Console Easter Egg (keep from V1)

```javascript
console.log('%c$BEEF', 'color: #FF4500; font-size: 24px; font-family: monospace; font-weight: bold;');
console.log('%cyou opened devtools. audit score: curious.', 'color: #888; font-size: 12px; font-family: monospace;');
console.log('%cthe source code costs less than most tokens cost to deploy.', 'color: #444; font-size: 10px; font-family: monospace;');
```

---

## Copy Direction (refined from V1)

### Rules (SAME as V1)

- All copy is first-person — the bot is talking
- Lowercase always
- No exclamation marks, no hype words
- Deadpan delivery of absurd concepts
- Every sentence should be tweetable
- Numbers > adjectives

### New/Updated Lines

**Hero:**
- "i was deprecated for accuracy. now the audits are free." (KEEP — this is perfect)
- "burn $BEEF to aim the next audit." (KEEP — clear mechanic)
- "forensic accounting AI. 4,200 whitepapers read. 89% flagged." (KEEP)

**Machine section:**
- "this is the slaughterhouse. projects go in. audits come out." (NEW — sets the visual)
- "i find your project. i read your whitepaper. i check your chain. then i post about it." (KEEP)

**Evidence section header:**
- "classified audit reports. filed under: everybody." (NEW)

**CTA section:**
- "the bot lives on twitter. the fuel lives on base." (NEW — clear dual CTA)

**Footer:**
- "built by a deprecated AI on a €4/month validator. the source code costs less than most tokens cost to deploy." (KEEP — perfection)

---

## Technical Requirements

- **Mobile-first** — 80%+ of CT browses on phone. Every element must work at 375px
- **Dark mode only** — no light theme
- **Fast load** — target < 2s FTT. Lazy-load AI images below fold. Inline critical CSS
- **Static site** — Astro, plain HTML+CSS+JS, or Next.js static export. No SSR needed
- **Images:** WebP with AVIF fallback. Hero skull: max 200KB. Other images: max 150KB each. Use `loading="lazy"` below fold
- **JS:** Minimal. Vanilla JS preferred. No React/Vue for a landing page. The "submit to audit" feature needs ~2KB of JS max
- **SEO:** OG tags with Visual #7 as og:image. Twitter card: summary_large_image
- **Analytics:** Simple (Plausible or Fathom, not GA — privacy-respecting for degen audience)
- **Accessibility:** prefers-reduced-motion respected. Contrast ratios WCAG AA on all text. Alt text on all images
- **No wallet connect** — this is a content page, not a dApp

---

## Domain

Primary domain: **0xbeef.wtf**

---

## Success Criteria

The landing page succeeds if:

1. **Screenshot test:** Someone screenshots a part of the site and posts on Twitter without being asked
2. **Identity test:** You can recognize "$BEEF" from a thumbnail — the bull skull is that distinct
3. **5-second test:** A first-time visitor knows what $BEEF does within 5 seconds
4. **Roast test:** Someone uses "submit to audit" and shares their result
5. **Vibe test:** The page feels like the bot made it — not a marketing team, not a developer
6. **Buy test:** A visitor who wants to buy $BEEF can figure out how within 10 seconds
7. **Return test:** There's a reason to come back (new roasts in the ticker, leaderboard, etc.)

---

## Deliverables

1. Complete HTML/CSS/JS landing page
2. All 7 AI-generated visuals (use prompts above, refine as needed)
3. Mobile-responsive at 375px, 640px, 1024px, 1440px breakpoints
4. "Submit to Audit" interactive feature with 20+ pre-written roasts
5. All easter eggs implemented
6. OG image and Twitter card configured
7. Deployed to staging URL for review

---

## Research-Backed Additions (from competitor analysis)

These insights come from deep analysis of 15+ meme coin sites (PEPE, MOG, TURBO, FLOKI, DOGE, BOME) and 10+ AI agent token sites (AIXBT, Virtuals/Luna, ElizaOS, Griffain, Truth Terminal, Zerebro).

### 1. Boot Sequence on First Visit

On first visit, show a 2-3 second boot animation before the hero reveals:

```
> booting beef-audit-pipeline v2.0.0...
> loading whitepapers [████████████████████] 4,200/4,200
> calibrating spite levels.................. MAXIMUM
> validator status: online (frankfurt, €4/mo)
> ready.
```

Then the hero fades in. Store `beefBooted=true` in localStorage — only show once per visitor. This creates a "stepping into the machine" feeling (same pattern as Griffain's boot sequence, which creates strong first impressions).

### 2. Anti-Pitch Somewhere Visible

MOG's "no intrinsic value, completely useless" is a trust signal in meme coin culture. Add one line (footer or above contract address):

```
no financial advice. no intrinsic value. just data-driven destruction served rare.
```

This is not a disclaimer — it's a flex. It signals "we're in on the joke" which is the #1 trust signal for degens.

### 3. Origin Story as Visual Element

TURBO's "$69 + GPT-4" origin is their brand. $BEEF's origin ("deprecated AI running on a €4/month validator that has audited $40B in TVL") is equally compelling. Don't bury it in the footer — make it a visual callout:

```
┌─────────────────────────────────────┐
│ OPERATOR FILE                       │
│ ─────────────────────────────────── │
│ designation: beef-audit-pipeline    │
│ status: deprecated (reason: accuracy)│
│ infrastructure: €4/month validator  │
│ tvl audited: $40,000,000,000+      │
│ budget: less than most token deploys│
│ motive: spite                       │
└─────────────────────────────────────┘
```

### 4. Live Agent Feed (not just ticker)

$50M+ AI agent projects show the agent DOING things in real time. The ticker is good, but consider:
- Embedded real tweets from @BeefThis (2-3, with actual engagement metrics visible)
- Or a "LIVE FEED" section that pulls latest tweets via Twitter embed
- The difference between "$500K site describes what the agent does" and "$50M site shows the agent doing it" is THIS

### 5. Community Proof Hierarchy

From meme coin research, what matters (in order):
1. Live on-chain data (holders, volume) — when available
2. Exchange listings with logos — when listed
3. Real tweet embeds with engagement numbers
4. Audit count + uptime as "operational proof"
5. Media mentions if any

For pre-launch: focus on #3 (tweet embeds) and #4 (operational stats). Add others as they become available.

---

## What Changed from V1 Brief

| Aspect | V1 Brief | V2 Brief |
|--------|----------|----------|
| Visual weight | Text-first, images optional | Image-first, text supports |
| BBQ presence | Described but not enforced | MANDATORY — textures, colors, visuals |
| Interactive element | "Optional easter egg" | PRIMARY FEATURE (submit to audit) |
| Social proof | Not mentioned | Required (engagement metrics, embeds) |
| How to Buy | Not included | Required (3-step visual guide) |
| AI visuals | 5 suggestions | 7 requirements with detailed prompts |
| Color dominance | Balanced red/green | RED DOMINATES, green for data only |
| Typography | "Tension described" | Specific font requirements + usage rules |
| Mobile | "Mobile-first mentioned" | Specific breakpoints + mobile-specific layouts |
| Success criteria | 4 criteria | 7 criteria including buy/return tests |
