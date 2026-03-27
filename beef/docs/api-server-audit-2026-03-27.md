# API Server Audit — 2026-03-27

4-agent parallel audit of the HTTP API server (`src/api/api-server.ts`) — architecture, code quality, stack choices, and future direction.

**Auditors:** Architecture Analyst (Sonnet), Code Reviewer (Sonnet/pr-review-toolkit), Stack Analyst (Sonnet), Codex CLI (GPT-5.4)

## Verdict

API extraction is **architecturally correct** but was built with wrong motivation (OpenClaw) instead of right motivation (beef-web). Code quality is solid after fixes. Raw `node:http` is fine for current scope but needs framework migration when POST endpoints arrive.

**Composite score: 3.2/5** — good code, premature timing, incomplete design.

## Bugs Found & Fixed

| Severity | Finding | Source | Status |
|----------|---------|--------|--------|
| **P2 BUG** | `approve_mode` compared to `'off'` but stored as `'true'`/`'false'` — always returned `true` | Codex | Fixed: use `configRepo.getRuntime()` |
| **P2 BUG** | Same issue with `approve_mentions` | Codex | Fixed: same |
| **P3 BUG** | `parseInt('foo')` → `NaN` → `better-sqlite3` throws `datatype mismatch` → 500 | Codex | Fixed: `Number.isFinite(n)` guard |
| **P3** | `stop()` doesn't null `this.server` — double call throws `ERR_SERVER_NOT_RUNNING` | Code Reviewer | Fixed: `this.server = null` |
| **P3** | No request logging — zero observability | Stack Analyst | Fixed: `logger.debug` with path + duration |
| **P3** | `@health/*` alias missing in tsconfig — inconsistent imports | Code Reviewer | Fixed: added alias |

## Architecture Assessment — 3/5

### What's right

- **Decoupling is correct.** Separating read endpoints from the grammY bot creates a clean boundary for external consumers (beef-web, monitoring tools, future OpenClaw).
- **Localhost-only binding** is the right security posture for an internal service.
- **No vendor lock-in.** Raw `node:http` + 9 endpoints = trivially replaceable or removable.

### What's wrong

- **No active consumer.** beef-web reads from ActivityLogger JSON file, not this API. OpenClaw is deferred (B-37). API is infrastructure without a user.
- **Motivated by OpenClaw, not beef-web.** The env var comment says "for OpenClaw integration" — but OpenClaw was explicitly deprioritized. Real consumer is beef-web dashboard.
- **Duplicates HealthMonitor.** Two HTTP servers in one process (port 3000 health, port 3001 API) serving overlapping data. `/api/health` proxies `healthMonitor.getStatus()` — why not merge?

### Recommendations

1. **Rename motivation.** Change `API_PORT` comment from "OpenClaw integration" to "dashboard & monitoring API" — reflects actual purpose.
2. **Merge HealthMonitor into ApiServer.** One HTTP server, one port. `/api/health` replaces the standalone health endpoint. Saves a port, simplifies ops.
3. **Wire beef-web to this API.** Replace ActivityLogger JSON polling with `fetch('http://localhost:3001/api/status')`. This gives the API a real consumer and validates the design.

## Code Quality — 4/5

### Strengths

- Clean class structure, dependency injection via constructor.
- Pattern matches existing codebase (`HealthMonitor` architecture).
- Proper error handling with structured logging.
- `EADDRINUSE` graceful degradation — bot runs without API if port busy.

### Issues (all fixed)

- Config value comparison bug (P2) — logic error, not a style issue.
- Missing NaN guard — edge case on user input boundary.
- `stop()` idempotency — safety issue for double-shutdown.
- Zero request logging — debug-level is correct (not info, avoids noise).

### Remaining debt

- **Response type is `unknown`.** Handlers return untyped data. beef-web will need `as StatusResponse` casts without compile-time guarantees. Export response interfaces from `api-server.ts` or create `api.types.ts`.
- **No test coverage.** Handlers are simple delegation, but the approve_mode bug proves even delegation can have logic errors. At minimum: test that `/api/status` returns correct `approveMode` when config is `'false'`.

## Stack Assessment — 4/5

### Raw `node:http` — justified for now

9 read-only GET endpoints with no body parsing, no middleware, no auth. Adding a framework would be over-engineering. The Map-based routing is transparent and debuggable.

### When to migrate to Hono

Trigger: first POST endpoint (approve/reject from beef-web dashboard). Hono adds:
- Built-in body parsing with size limits (prevents localhost DoS)
- `@hono/zod-validator` (zod already in deps)
- Type-safe routes and responses
- 14KB bundle, ESM-native, zero config

**Do NOT migrate preemptively.** Wait for the trigger.

### What to add before first external consumer

| Priority | Item | Effort |
|----------|------|--------|
| Must | Response type interfaces | 30 min |
| Must | At least 1 test for `/api/status` correctness | 30 min |
| Should | CORS headers (beef-web is different origin) | 10 min |
| Should | Merge HealthMonitor into ApiServer | 1-2h |
| Skip | API versioning (`/v1/`) — one consumer, both ends controlled | — |
| Skip | Authentication — localhost binding is sufficient | — |
| Skip | Rate limiting — internal service | — |
| Skip | WebSocket — polling is fine at current scale | — |

## Fit with Roadmap

### Autonomy ladder (B-33 → B-36)

The autonomy ladder automates **internal** bot behavior (farm, post, reply, learn). It doesn't need an external API — the scheduler and QueueManager handle everything in-process. The API is useful for **observing** autonomy (monitoring dashboard), not **driving** it.

### beef-web integration (B-28 → B-32)

This is the real consumer. The API provides exactly what the diary/dashboard needs:
- `/api/status` → dashboard header stats
- `/api/stockpile` → stockpile browser
- `/api/pending` → approval queue (needs POST for approve/reject)
- `/api/feedback` → feedback stats widget

**Next step:** wire beef-web to consume these endpoints instead of ActivityLogger JSON.

### OpenClaw (B-37)

Correctly deferred. If/when OpenClaw is integrated, this API becomes the bridge between OpenClaw skills and $BEEF state. The read-only surface is exactly what OpenClaw skills would consume via `exec curl`. No changes needed for that use case.

## Action Items

### Immediate (before commit)

- [x] Fix approve_mode/approve_mentions comparison bug
- [x] Fix NaN query param crash
- [x] Fix stop() idempotency
- [x] Add request logging
- [x] Add @health/* tsconfig alias
- [ ] Change API_PORT env comment from "OpenClaw" to "dashboard & monitoring"

### Next sprint

- [ ] Export response type interfaces
- [ ] Add test for `/api/status` approve_mode correctness
- [ ] Wire beef-web to consume API instead of ActivityLogger JSON

### When POST endpoints needed

- [ ] Evaluate Hono migration (14KB, zod integration, body parsing)
- [ ] Add CORS headers for beef-web origin
- [ ] Merge HealthMonitor into ApiServer (one HTTP server)

## Sources

- Architecture Audit: Sonnet agent, evaluated 5 files, 11 tool calls
- Code Review: Sonnet/pr-review-toolkit agent, reviewed git diff, 19 tool calls
- Stack Analysis: Sonnet agent, compared 4 frameworks, 4 tool calls
- Codex CLI: GPT-5.4 `codex review --uncommitted`, found 4 issues including P2 bug
