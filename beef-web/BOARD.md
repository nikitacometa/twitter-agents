# beef-web Task Board

## Format
- `[x]` done | `[-]` in progress | `[ ]` pending | `[!]` blocked
- IDs: BW-001, BW-002, ...

---

## Active Sprint: Activity Feed + Deploy

### Template Generation (backend deliverable, generated here)
- [x] BW-001: Generate diary templates via LLM for all 16 event types (50 candidates each)
- [x] BW-002: Curate templates — select best 20-25 per type, verify $BEEF voice consistency
- [x] BW-003: Write final templates.ts for backend (beef/src/activity/templates.ts)

### Frontend Polish
- [x] BW-004: Update sample-feed.json with diverse event types and realistic LLM-style narratives
- [ ] BW-005: Verify Terminal renders all 16 event types correctly (test with updated sample data)
- [x] BW-006: Clean up unused components (Feed.tsx, FeedEntry.tsx, useAutoScroll.ts)

### Deploy Preparation
- [x] BW-007: Create Dockerfile (multi-stage: build with node, serve with nginx)
- [x] BW-008: Create docker-compose.prod.yml
- [x] BW-009: Create nginx.conf for SPA routing + static file serving
- [x] BW-010: Create .env.example with VITE_FEED_URL documentation
- [x] BW-011: Update CLAUDE.md deploy section for standalone container deploy
- [x] BW-012: Prepare cometa-proxy nginx config for app.0xbeef.wtf

### Integration (after backend deploys)
- [!] BW-013: Connect to real feed URL (VITE_FEED_URL=https://0xbeef.wtf/api/activity) — blocked by backend
- [!] BW-014: Deploy to VPS and verify end-to-end — blocked by BW-007..012 + backend

---

## Backlog: Web Strategy (research-backed, 2026-03-23)

### Tier 1 — Pre-token (do now)
- [ ] BW-030: Shareable Roast Card — visual card from "Submit to Audit" with Share on X (3-4d)
- [ ] BW-031: Roast Archive / Hall of Fame page — grid of best roasts by engagement (2-3d)
- [ ] BW-032: Live Stats Strip in app header — daily roasts, impressions, queue count (0.5d)
- [ ] BW-033: Pipeline Visualizer — horizontal phase bar SCAN→RESEARCH→COOK→JUDGE→POST (1-2d)

### Tier 2 — Next sprint
- [ ] BW-034: Guilty/Not Guilty voting on roasts (3-4d)
- [ ] BW-035: Public Audit Queue / next targets page (3-4d)
- [ ] BW-036: WebSocket/SSE for diary feed — replace 5min polling (2-3d)
- [ ] BW-037: BEEF voice for all UI messages (1d)

### Tier 3 — Token launch
- [ ] BW-038: Wallet Connect + Burn-to-request UI (5-7d)
- [ ] BW-039: Token-gated "Inner Monologue" mode (3-4d)
- [ ] BW-040: "Beef Wrapped" — portfolio roast card (8-12d)
- [ ] BW-041: Targets Leaderboard — burn rankings (3-4d)

## Backlog: Infrastructure
- [ ] BW-020: Landing page CTA "peek into my brain" linking to app
- [ ] BW-021: DNS + SSL setup for app.0xbeef.wtf subdomain
- [ ] BW-022: Add error state UI when feed fetch fails
- [ ] BW-023: Add favicon and OG meta for app subdomain
