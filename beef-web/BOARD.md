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
- [x] BW-012: Prepare cometa-proxy nginx config for app.beefthis.wtf

### Integration (after backend deploys)
- [!] BW-013: Connect to real feed URL (VITE_FEED_URL=https://beefthis.wtf/api/activity) — blocked by backend
- [!] BW-014: Deploy to VPS and verify end-to-end — blocked by BW-007..012 + backend

---

## Backlog
- [ ] BW-020: Landing page CTA "peek into my brain" linking to app
- [ ] BW-021: DNS + SSL setup for app.beefthis.wtf subdomain
- [ ] BW-022: Add error state UI when feed fetch fails
- [ ] BW-023: Add favicon and OG meta for app subdomain
