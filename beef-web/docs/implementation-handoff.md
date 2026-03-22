# Implementation Handoff — Activity Feed Frontend

This document provides all context needed to continue implementation after a session compact. Read this + BOARD.md to pick up where we left off.

## Architecture Decision (2026-03-22)

Backend provides ALL narratives. Frontend just renders. No template resolution on frontend.

Two narrative sources on backend:
1. **Creative events** (roast generation, casual reply): `diaryThought` field in LLM output JSON
2. **Routine events** (wake, sleep, hunt, etc.): template bank in `beef/src/activity/templates.ts`

Backend spec: `beef/docs/activity-feed-spec.md`

## What Exists (built in previous session)

### Components
| Component | File | Status |
|---|---|---|
| Terminal | `src/components/Terminal.tsx` + `.module.css` | Built, working |
| StatusBar | `src/components/StatusBar.tsx` + `.module.css` | Built, working |
| Sidebar | `src/components/Sidebar.tsx` + `.module.css` | Built, working |
| MobileTabBar | `src/components/MobileTabBar.tsx` + `.module.css` | Built, working |
| Feed (old) | `src/components/Feed.tsx` + `.module.css` | Unused, to delete |
| FeedEntry (old) | `src/components/FeedEntry.tsx` + `.module.css` | Unused, to delete |

### Hooks
| Hook | File | Status |
|---|---|---|
| useTypewriter | `src/hooks/useTypewriter.ts` | Built — typewriter animation engine |
| useActivity | `src/hooks/useActivity.ts` | Built — polls feed, tracks new count |
| useAutoScroll | `src/hooks/useAutoScroll.ts` | Unused (Terminal has its own scroll), to delete |

### Services
| File | Purpose |
|---|---|
| `src/services/activity.ts` | Fetches feed from `VITE_FEED_URL` or falls back to sample-feed.json |

### Data
| File | Purpose |
|---|---|
| `src/data/sample-feed.json` | 15 demo events, decent narratives, used in dev mode |
| `src/types/activity.ts` | ActivityEvent, ActivityFeed, EVENT_CONFIG types |

### Design System
| File | Purpose |
|---|---|
| `src/styles/tokens.css` | CSS custom properties (colors, spacing, fonts) |
| `src/styles/global.css` | Reset, scrollbar, grain texture, reduced-motion |

## Key Technical Details

### Feed URL Logic
`src/services/activity.ts` checks `VITE_FEED_URL` env var:
- Not set → returns `sample-feed.json` (dev mode)
- Set → fetches from URL every 5 minutes

### Typewriter Animation
`src/hooks/useTypewriter.ts`:
- Last 7 events animate, older ones are static (opacity 0.55)
- Deterministic effects via `hash(event.id)`: 20% chance of backspace-retype, 40% chance of mid-line pause
- Character-by-character typing with punctuation pauses
- Click anywhere to skip animation

### Terminal Line Format
`HH:MM ICON LABEL(pad10) narrative`
- Time: dim gray
- Label: colored by category (action=red, thinking=amber, result=green, status=muted)
- Narrative: main text color (italic for thinking, dim for status)
- Hanging indent: `padding-left: 18ch; text-indent: -18ch` (desktop)

### RoastCard
Shown below `roast_ready` and `posted` events when `data.roastText` is present:
- Blockquote with red left border
- Verdict badge (WELL-DONE=red, MEDIUM-RARE=amber, RARE=green)
- Score and target

## Frontend Tasks Remaining

### 1. Template Generation (BW-001 to BW-003)
Templates go to backend (`beef/src/activity/templates.ts`), but we generate them here because:
- We have the character file context
- We can iterate on quality without touching backend

Strategy: Use LLM with full $BEEF systemPrompt to generate 50 candidates per event type.
Then curate 20-25 best per type. Write to TS file for backend to consume.

### 2. Sample Data Update (BW-004)
Update `sample-feed.json` to:
- Include all 16 event types (currently missing: burn_request, challenge, milestone)
- Use LLM-quality narratives (matching what backend will produce)
- Add more expandable blocks for research events
- Include edge cases: very short narratives, very long ones, missing data fields

### 3. Cleanup (BW-006)
Delete unused files:
- `src/components/Feed.tsx` + `Feed.module.css`
- `src/components/FeedEntry.tsx` + `FeedEntry.module.css`
- `src/hooks/useAutoScroll.ts`

### 4. Deploy (BW-007 to BW-012)
Create:
- `Dockerfile` — multi-stage build (node:22-alpine for build, nginx:alpine for serve)
- `docker-compose.prod.yml` — with VITE_FEED_URL as build arg
- `nginx.conf` — SPA routing (try_files $uri /index.html), gzip, cache headers
- `.env.example` — document VITE_FEED_URL

Docker build must inject VITE_FEED_URL at build time (Vite inlines env vars):
```dockerfile
ARG VITE_FEED_URL
ENV VITE_FEED_URL=$VITE_FEED_URL
RUN pnpm build
```

### 5. Server Config (BW-012)
Prepare nginx config for cometa-proxy:
```nginx
server {
    server_name app.0xbeef.wtf;
    location / {
        proxy_pass http://beef-web:80;
    }
    # SSL handled by certbot
}
```

## Build & Dev Commands

```bash
pnpm dev          # dev server at localhost:5173
pnpm build        # production build to dist/
pnpm preview      # preview production build
pnpm typecheck    # TypeScript check (zero errors as of last session)
```

Last successful build: 213.89KB JS / 67.61KB gzipped.

## Deploy Flow (when ready)

1. DNS: A record for `app.0xbeef.wtf` → <redacted>
2. SSL: certbot for app.0xbeef.wtf
3. cometa-proxy: add server block for app.0xbeef.wtf
4. Build & push docker image with `VITE_FEED_URL=https://0xbeef.wtf/api/activity`
5. docker-compose up on VPS
6. Verify: `curl -s https://app.0xbeef.wtf/ | head -20`
