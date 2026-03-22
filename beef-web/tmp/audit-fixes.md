# beef-web Audit Fixes — Session 2026-03-23

## Context
Frontend audit of the diary app (app.0xbeef.wtf). 12 findings across 3 milestones.
All fixes committed + code review fixes applied.

## Status: COMPLETE

Commit: `fix beef-web audit issues: error state, dead code, SEO meta, visual polish`
Build: 215KB JS / 68KB gzip, zero TS errors.

## Progress Tracker

### M1: Code Quality
- [x] 1. Error state for initial fetch failure — `Terminal.tsx`, `App.tsx`
- [x] 2. Delete unused `utils/time.ts`
- [x] 3. Remove duplicate CSS in `MobileTabBar.module.css:14-16`
- [x] 4. Move `labelClassMap` to module scope in `Terminal.tsx:116-122`
- [x] 5. Type `VITE_FEED_URL` in `vite-env.d.ts`, remove `as` cast in `activity.ts`
- [x] 6. Commit uptime format change in `sample-feed.json` (was already in prior commit)

### M2: SEO / Meta
- [x] 7. Add favicon to `index.html` (SVG data URI)
- [x] 8. Add `og:image` + `twitter:image` meta tags
- [x] 9. Add `<link rel="canonical">`

### M3: Visual Polish
- [x] 10. Fix uptime overflow in `Sidebar.module.css` (span full row + smaller font)
- [x] 11. Reduce `line-height` 1.8 → 1.6 in `Terminal.module.css`
- [x] 12. Mobile font 12px → 13px in `Terminal.module.css`

## Code Review Fixes (post-commit)
- [x] Fix `og:url` trailing slash mismatch with canonical (code-reviewer finding)
- [x] Remove redundant inline `animationDelay` on loading/error/empty spans (code-reviewer finding)
- [x] OG image cross-subdomain: acknowledged, not fixable without asset duplication — documented

## Backend Finding (out of scope)
- `beef/src/index.ts:555` — `activityLogger.flush()` should be in `finally` block during shutdown (Codex finding). For backend session.

## False Positives Removed
- Auto-scroll `[lines.length]` dep — correct, fires on new line not every char
- `:focus-visible` — no `outline: none` overrides, browser defaults work
- skipHint flash — opacity:0 start, unmounted before visible if short animation
- `[...current]` array copies — micro-optimization, irrelevant at 18-50 items
- `newCount`/`clearNewCount` — 5 lines, needed soon for badge feature
