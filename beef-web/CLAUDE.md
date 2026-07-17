# $BEEF Web — Frontend & Landing Pages

Web presence for the $BEEF crypto project. Landing pages, interactive features, and future web application.

**Live:** [0xbeef.wtf](https://0xbeef.wtf) (also accessible at aisatisfy.me/beefv2/)
**Twitter:** [@0xBeefer](https://twitter.com/0xBeefer)
**Bot backend:** `../beef/` (TypeScript, PM2, SQLite)

## Project Structure

```
beef-web/
├── CLAUDE.md              # This file
├── public/                # Static landing pages
│   ├── index.html         # V2 landing (served at 0xbeef.wtf)
│   ├── img/               # AI-generated visuals (WebP)
│   └── v1/                # V1 landing (archive)
│       ├── index.html     # Original terminal-style landing
│       └── launch/
│           └── index.html # Launch playbook (noindex, private)
├── docs/                  # Design briefs and references
│   ├── landing-page-brief-v2.md
│   └── landing-update-task.md
└── (future: src/, package.json for Next.js/React app)
```

## Current State

V2 landing — "Bloomberg Terminal meets butcher shop":
- IBM Plex Mono + Zilla Slab, red-dominant palette (`#cc0000`)
- 33 pre-written crypto roasts + 5 template fallbacks
- Interactive "Submit to Audit" terminal input (type project, get roast, share on X)
- Boot sequence (localStorage, shows once), Konami code easter egg, eye tracking on skull
- 7 AI-generated images (gpt-image-1.5), WebP optimized, ~370KB total
- FAQPage JSON-LD, full OG/Twitter meta

## Deploy

### Landing page (0xbeef.wtf)

Landing deploys through the aisatisfy-blog Hugo pipeline:

```bash
ssh beef-vps 'cd ~/aisatisfy-blog && git pull && docker compose -f docker-compose.prod.yml up -d --build'
curl -s -o /dev/null -w '%{http_code}' https://0xbeef.wtf/
```

### App (app.0xbeef.wtf) — Standalone Container

```bash
# 1. DNS: A record app.0xbeef.wtf → <redacted>
# 2. Copy proxy config
scp deploy/cometa-proxy.conf beef-vps:/home/deploy/cometa/proxy/conf.d/app.0xbeef.wtf.conf
ssh beef-vps 'cd ~/cometa && docker compose exec proxy nginx -s reload'

# 3. SSL
ssh beef-vps 'certbot --nginx -d app.0xbeef.wtf'

# 4. Deploy
cp .env.example .env  # edit VITE_FEED_URL if needed
docker compose -f docker-compose.prod.yml up -d --build

# Verify
curl -s -o /dev/null -w '%{http_code}' https://app.0xbeef.wtf/
```

**Infrastructure:**
- Domain: 0xbeef.wtf (Namecheap, A records → <redacted>)
- Landing: cometa-proxy → `aisatisfy-blog:80/beefv2/`
- App: cometa-proxy → `localhost:3080` (beef-web container)
- SSL: Let's Encrypt via certbot, auto-renew
- Config: `/home/deploy/cometa/proxy/conf.d/`
- Security: HSTS, X-Frame-Options DENY, rate limit 60 req/min

## Local Development

```bash
# Static landing — any local server works
npx serve public/          # → localhost:3000
python3 -m http.server -d public/  # → localhost:8000

# Future app (when Next.js is set up)
pnpm dev                   # → localhost:3000
```

## Key Files

| File | Purpose |
|------|---------|
| `public/index.html` | V2 landing (single-file, inline CSS/JS, ~76KB) |
| `public/img/og-image.png` | OG preview 1200x630 |
| `public/img/skull-hero.webp` | Hero bull skull visual |
| `docs/landing-page-brief-v2.md` | Original design brief for V2 |

---

# Design System

## Two Approaches

**Standard (SaaS / product landings):**
- Tailwind CSS v4 Play CDN: `<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>`
- **Avoid Inter** — overused AI-default font. Alternatives: Instrument Sans, Plus Jakarta Sans, Onest, General Sans
- Indigo `#6366f1` / Emerald `#10b981` palette, dark bg `#0f0f1a`
- 60/30/10 rule: dark bg (60%), primary color (30%), accent (10%)
- Best for: tech products, SaaS, agent tools

**Custom (brand / artisanal landings):**
- Vanilla CSS with custom properties (`:root { --gold: #d4a543; ... }`)
- Serif headings (Cormorant Garamond, Playfair Display, Fraunces, Newsreader) + sans body
- Unique palette per brand
- Best for: lifestyle brands, schools, physical products, anything needing "soul"

**$BEEF uses custom approach:** IBM Plex Mono (terminal/data) + Zilla Slab (headlines), red `#cc0000` dominant, dark bg.

## Typography Rules

| Element | Size | Weight | Notes |
|---------|------|--------|-------|
| h1 (hero) | `clamp(38px, 7vw, 68px)` | 500-800 | Max 8 words, benefit-focused |
| h2 (sections) | `clamp(28px, 5vw, 48px)` | 500-700 | |
| Body | 16-18px | 300-400 | `line-height: 1.6-1.7` |
| Labels/tags | 10-12px | 600 | Uppercase, `letter-spacing: 0.08-0.12em` |

- Max 2 font families per landing (often 1 is enough — weight variation creates hierarchy)
- Heading letter-spacing: `-0.01em` to `-0.04em` for large display text
- Font loading: `font-display: swap` + `<link rel="preconnect" href="https://fonts.googleapis.com">`
- Use `tabular-nums` font-feature for price tables and numeric data
- **Avoid**: Inter, Roboto, Open Sans, Lato, Montserrat — overused AI defaults

## Spacing

- Base unit: 8px
- Section padding: `80-128px` vertical
- Content max-width: `1100-1200px`
- Card padding: `20-28px`
- Element gaps: `16-24px`
- `scroll-margin-top: 80px` on section anchors (fixed header offset)

## Anti-AI Slop Rules

Every page must pass: "If someone said 'AI made this,' would they believe immediately?" If yes — redesign.

**AI fingerprints to avoid:**
- Purple-to-blue gradients, cyan-on-dark color palette
- Glassmorphism used decoratively (blur cards without purpose)
- Hero metric layout (big number + small label + gradient accent)
- Identical card grids (same-sized cards with icon + heading + text, repeated)
- Gradient text on headings/metrics — decorative, not meaningful
- Neon accents on dark backgrounds
- Rounded rectangles with generic drop shadows
- Monospace typography as lazy shorthand for "tech/developer"
- Large rounded icons above every heading — templated look
- Center-aligning everything — left-aligned text feels more designed

**What to do instead:** Commit to a BOLD aesthetic direction. Asymmetric layouts, extreme type scale contrast (3x-5x ratio), dominant color (not evenly distributed), intentional decorative elements that reinforce brand. Each page should be visually unique — never converge on the same formula.

## Color Rules

- **Tinted neutrals:** Never use pure gray (`#808080`). Add subtle hue tint — `oklch(0.5 0.01 250)`. Even 0.01 chroma creates subconscious cohesion
- **Never pure black/white:** `#000` and `#fff` don't exist in nature. Tint toward brand hue
- **Never gray text on colored backgrounds:** Use a shade of the background color or transparency instead
- **60-30-10 by visual weight,** not pixel count. Accent works because it's rare
- **2-4 colors max** beyond neutrals. More = visual chaos
- **OKLCH preferred** for palette generation — perceptually uniform, equal lightness steps look equal
- **Dark mode ≠ inverted light mode:** Slightly desaturate accents, different shadow approach, adjust font weights (+100 for thin fonts)

## Motion & Animation Rules

**Timing:**
- 100-150ms: micro-feedback (button press, toggle)
- 200-300ms: state changes (expand/collapse, tab switch)
- 300-500ms: layout changes (reorder, resize)
- 500-800ms: page entrances, hero animations
- Exit animations: ~75% of enter duration

**Easing:** `ease-out-quart` (recommended default), `ease-out-quint`, `ease-out-expo`. Never `bounce` or `elastic` — dated and tacky.

**GPU performance:** Only animate `transform` and `opacity`. For height animations → `grid-template-rows` transition. Never animate `width`, `height`, `padding`, `margin`.

**`prefers-reduced-motion` is mandatory** — ~35% of adults >40 have vestibular sensitivity.

## Premium CSS Patterns (use at least 3 per page)

```css
/* 1. Glassmorphism — USE SPARINGLY (nav bar only, not cards/sections) */
background: rgba(255,255,255,0.05);
backdrop-filter: blur(16px);
border: 1px solid rgba(255,255,255,0.08);
border-radius: 16-20px;

/* 2. Gradient mesh / aurora background */
background:
  radial-gradient(ellipse at 20% 50%, rgba(primary, 0.15) 0%, transparent 50%),
  radial-gradient(ellipse at 80% 20%, rgba(accent, 0.1) 0%, transparent 50%);

/* 3. Gradient text — USE ONLY on brand logotype or one hero element, NOT on metrics/headings */
background: linear-gradient(135deg, color1, color2);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;

/* 4. Scroll-reveal animations */
.fade-up.will-animate {
  opacity: 0; transform: translateY(16px);
  transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1);
}
.fade-up.will-animate.visible { opacity: 1; transform: translateY(0); }
/* JS: IntersectionObserver with unobserve after trigger */

/* 5. Glow effect on CTA */
box-shadow: 0 4px 24px rgba(primary, 0.25);
/* hover: */ box-shadow: 0 8px 40px rgba(primary, 0.35);

/* 6. Card hover lift */
transition: transform 0.25s, border-color 0.25s, box-shadow 0.25s;
/* hover: */ transform: translateY(-4px to -6px);

/* 7. Grain texture overlay (organic feel) */
background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256'...feTurbulence...%3E");
opacity: 0.03; pointer-events: none;

/* 8. Golden/colored line dividers */
background: linear-gradient(90deg, transparent, rgba(color, 0.4), transparent);
height: 1px;
```

---

# Page Architecture

Standard section order (adapt per project):

| # | Section | Purpose | Must-have |
|---|---------|---------|-----------|
| 1 | **Hero** | Value prop in 5 seconds, CTA above fold | Headline ≤8 words, primary + secondary CTA, visual hook |
| 2 | **Social proof strip** | Trust signals | Stats, client logos, or industry numbers with source |
| 3 | **Product/Features** | What you sell | Cards with images, pricing, key specs |
| 4 | **People/Story** | Human connection | Founders, team, or "How it works" |
| 5 | **Pricing/Options** | Conversion | Tiered cards, anchor pricing, comparison |
| 6 | **FAQ + CTA** | Objection handling + final push | 3-5 FAQs, strong closing CTA |
| 7 | **Footer** | Navigation + legal | Minimal |

### Hero rules:
- Headline: max 8 words, benefit-focused, specific
- CTA above fold, always
- Social proof micro-copy under CTA: "No credit card required" / "Без привязки карты"
- 4-8 CTA touchpoints total across the page

### Pricing strategy:
- **Anchor pricing**: show competitor range first (struck through / red context), then your price
- **Decoy effect**: 3 tiers — Free/Basic/Pro with "Most Popular" on middle
- **Mobile order**: surface "Most Popular" tier first via CSS `order`
- Include currency relevant to market (THB, USD, EUR, RUB)

---

# Social Proof — Critical Rules

**NEVER fabricate for pre-launch / unverified products:**
- Named testimonials with specific claims
- User counts ("1,200+ businesses") when 0 actual users
- Platform ratings (G2, Capterra) for unlisted products
- Revenue figures not backed by real data
- Certifications not actually achieved (SOC 2, HIPAA, ISO)
- Performance metrics from non-existent testing

**Fabricated social proof = automatic quality FAIL. FTC 16 CFR Part 255 violation risk.**

**Allowed alternatives:**
- Industry statistics with source citations ("92% of consumers read reviews — Bazaarvoice 2024")
- Waitlist framing ("Be among the first 50")
- Real user counts only if truthful
- Trust badges for real integrations only
- `<!-- TODO: Add real testimonials after beta -->` as placeholder
- "Illustrative example based on industry benchmarks" visible label

---

# Copy Guidelines

- Headlines: short, benefit-focused, specific. "15 минут вместо 2 часов" > "Save time"
- Body: second person ("you"/"вы"), conversational, specific outcomes
- CTAs: action verbs — "Start Free Trial", "Попробовать бесплатно", "Buy a Handpan"
- Anti-barrier copy under every CTA
- FAQ: 3-6 items, substantive answers with data. Not filler
- Every stat on page must have a verifiable source. No stat without source = no stat
- Market-appropriate language: RU landing = Russian text, US = English, brand = per audience

---

# Technical Requirements Checklist

## SEO (required before going live)

- [ ] `<title>` — keyword-rich, under 60 chars
- [ ] `<meta name="description">` — unique, with differentiator
- [ ] `<meta property="og:title/description/image/type/url">` — OG image 1200x630px
- [ ] `<meta name="twitter:card/title/description">` — summary_large_image
- [ ] `<link rel="canonical">` — prevents duplicate content
- [ ] `lang` attribute on `<html>`
- [ ] `theme-color` meta
- [ ] Schema.org JSON-LD (FAQPage at minimum — easy rich results)

**Missing OG image = no link preview on Telegram/social = killed click-through.**

## Performance

- [ ] Page weight <200KB (HTML + inline CSS/JS, images separate)
- [ ] Images: max 800px width, JPEG quality 80, WebP when possible
- [ ] Optimize images via `sips` before commit: `sips -Z 800 --setProperty formatOptions 80 img.jpg`
- [ ] `<link rel="preconnect">` for Google Fonts
- [ ] `loading="lazy"` on below-fold images, `loading="eager"` on hero
- [ ] No external JS dependencies (vanilla JS only) for static landings

## Accessibility

- [ ] Semantic HTML5 (`<header>`, `<main>`, `<nav>`, `<section>`, `<footer>`)
- [ ] `alt` text on all images
- [ ] WCAG AA contrast ratios
- [ ] `prefers-reduced-motion` guard on all animations
- [ ] Tap targets ≥44px on mobile
- [ ] Body font ≥16px
- [ ] `rel="noopener noreferrer"` on external links

## Mobile

- [ ] Base viewport: 375px
- [ ] Responsive breakpoints: 640px, 768px, 1024px
- [ ] Hamburger menu on mobile (test nav at 375px)
- [ ] No horizontal overflow
- [ ] CTAs full-width on mobile
- [ ] Tables: `overflow-x: auto` if present

---

# Quality Rubric (10 Dimensions)

Self-review every page against this before committing:

| # | Dimension | Weight | What to check |
|---|-----------|--------|---------------|
| 1 | Visual Polish | 15% | Gradient/glass quality, color harmony 60/30/10, premium feel |
| 2 | Copy Quality | 15% | Every claim data-backed, benefit framing, natural language |
| 3 | Conversion Flow | 12% | 4-8 CTAs, anchor pricing, trust signals, urgency |
| 4 | Hero Impact | 12% | Value prop clear in 5s, CTA above fold, visual hook |
| 5 | Typography | 10% | ≤2 fonts, consistent scale, heading impact |
| 6 | Spacing & Layout | 10% | 8px grid, section padding 80-128px, whitespace balance |
| 7 | Mobile Experience | 8% | 375px test, tap targets, readable fonts |
| 8 | Technical Quality | 8% | SEO meta, semantic HTML, <200KB, favicon |
| 9 | Animation | 5% | Scroll reveals, hover effects, reduced-motion guard |
| 10 | Wow Factor | 5% | One signature element that makes someone want to share it |

**Thresholds:** ≥8.5 STRONG PASS, ≥8.0 PASS (ship it), 7.0-7.9 PARTIAL (fix first), <7.0 FAIL.

**Calibration:** before scoring, mentally compare against Linear.app, Vercel.com, Framer.com. Score relative to industry standard, not "does it work."

---

# Common Mistakes (from 10+ real reviews)

| Mistake | Severity | Fix |
|---------|----------|-----|
| Fabricated social proof | CRITICAL | Only real data or "illustrative example" label |
| Missing OG/Twitter meta | MAJOR | Always add — no preview = no social clicks |
| Tailwind CDN in production | MEDIUM | OK for personal/low-traffic; compile for high-traffic |
| Dead nav links (`href="#"`) | MEDIUM | Point to real sections or remove |
| No mobile hamburger menu | MEDIUM | Always test at 375px |
| Hero mockup hidden on mobile | MEDIUM | Show smaller version — most users browse on phone |
| Copyright year wrong | LOW | Use current year |
| `step-line` connectors visible on mobile | LOW | `display: none` below 768px |
| Dark mode for non-tech audience | STRATEGIC | US local businesses prefer light/blue/amber |
| Claims contradicting source material | CRITICAL | Verify every number against original source |

---

# Lessons Learned

## What works
- **Anchor pricing**: show competitor range first, then your price → proven conversion lift
- **Terminal/mockup in hero**: showing live data flow (input → AI → output) immediately proves value
- **Before/after with relatable scenarios**: memorable and shareable
- **Anti-barrier copy under every CTA**: "No credit card / 2-minute setup"
- **FAQ open-by-default on #1 objection**: addresses hesitation immediately
- **Comparison tables**: ✓/✗/~ format, 5+ competitors, 8+ parameters

## What fails
- **"единственный / only"** claims without verification → trust destroyer if false
- **Landing built before competitive shift** → must rebuild if market changed
- **Broken form handlers** ("Redirecting...") → worse than no form
- **Price mismatch** between landing and actual product → onboarding confusion
- **Random personas for non-tech audience** → dark indigo reads as "dev tool" to restaurant owners

---

# Interaction States (for interactive elements)

Every interactive element needs 8 states. Missing states = broken experience:

| State | Purpose | Example |
|-------|---------|---------|
| Default | Resting | Normal button |
| Hover | Pointer feedback | Color shift, subtle lift |
| Focus | Keyboard navigation | `:focus-visible` ring, never `outline: none` |
| Active | Click/tap feedback | Slight scale-down |
| Disabled | Non-interactive | 50% opacity, `cursor: not-allowed` |
| Loading | Async action | Spinner or skeleton |
| Error | Validation failure | Red border + message |
| Success | Completion | Green checkmark + message |

**CTAs:** Verb + object ("Save changes", "Create account"), never "OK", "Submit", "Yes/No".
**Error messages:** What happened + Why + How to fix → "Email needs @ symbol. Try: name@example.com"
**Empty states:** Acknowledge + explain value + provide action — not just "nothing here".

---

# Design Quality Workflow

Use impeccable skills (`/i-*`) for systematic quality improvement:

```
/i-audit [area]      → diagnose issues (DO NOT fix — document only)
/i-critique [area]   → UX design review as design director
/i-normalize         → align with design system
/i-distill           → remove unnecessary complexity
/i-bolder            → amplify weak/safe designs
/i-quieter           → tone down aggressive designs
/i-colorize          → add strategic color
/i-animate           → add purposeful motion
/i-clarify           → improve UX copy
/i-harden            → production resilience (edge cases, i18n, errors)
/i-polish            → final quality pass (LAST step, not first)
/i-extract           → consolidate into design system
/i-frontend-design   → create new pages/components from scratch
/i-adapt             → responsive design across devices
/i-onboard           → onboarding flows and first-time UX
/i-delight           → add moments of joy and personality
/i-optimize          → performance optimization
```

**Workflow:** audit → fix issues → polish → ship. Never polish before functionally complete.

---

# Image Optimization

Before committing images, optimize via macOS `sips`:

```bash
# Resize to max 800px width (maintains aspect ratio)
sips -Z 800 image.jpg

# Set JPEG quality to 80%
sips --setProperty formatOptions 80 image.jpg

# Convert to WebP (smaller, modern)
sips -s format webp image.jpg --out image.webp

# Create favicon from logo
sips -z 32 32 logo-symbol.png --out favicon-32.png
sips -z 180 180 logo-symbol.png --out favicon-180.png
```

---

# TypeScript / App Development

When transitioning from static landing to full app:

## Recommended Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | Next.js 15 (App Router) | SSR/SSG, React Server Components, built-in optimization |
| **Styling** | Tailwind CSS v4 | Utility-first, consistent with design system |
| **Language** | TypeScript (strict mode) | Type safety, better DX |
| **Package manager** | pnpm | Fast, disk-efficient, consistent with beef bot |
| **Testing** | Vitest + Testing Library | ESM-native, React component testing |
| **Linting** | ESLint + Prettier | Consistent with beef bot conventions |

## TypeScript Conventions (shared with beef bot)

- **Strict mode is non-negotiable.** `strict: true` + `noUncheckedIndexedAccess`
- `import type { Foo }` for type-only imports
- Prefer `unknown` over `any` — use type guards
- Declare return types on exported/public functions
- Use path aliases: `@/*` for src imports

## Pre-commit Checklist

1. `pnpm typecheck` — zero errors
2. `pnpm lint:check` — zero errors
3. `pnpm test` — all pass
4. No `console.log` in production code
5. No hardcoded API keys or secrets

## Commit Discipline

- Start with lowercase verb: `add`, `fix`, `implement`, `update`, `remove`, `refactor`
- Single concise line
- Push after committing
- After completing a task tracked in BOARD.md: update status before committing
