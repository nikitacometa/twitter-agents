# $BEEF Full System Audit — Revised

**Date:** 2026-03-23 (revised)
**Scope:** Backend engine, database, Telegram admin, web interface, content pipeline, Twitter integration, DevOps
**Method:** 6 parallel domain experts + critical re-review by 4 specialized verification agents
**Codebase:** 87 TypeScript files, ~20K lines, 449/449 tests passing, 0 typecheck errors

---

## Executive Summary

**Overall Score: 7.0 / 10** (revised — Twitter safety и DevOps тянут вниз, but C-1/H-8 were false positives)

Система функционально зрелая: multi-strategy generation, 5-judge evaluation, creative memory, dual-mode Twitter client, Telegram admin с 23 командами, web activity feed. Код типобезопасный (strict mode, 0 TS errors), тесты проходят.

**Две критические проблемы:**
1. Datacenter IP (Hostinger) без ISP прокси — Twitter блокирует
2. Ban risk 8-8.5/10 — совокупность: datacenter IP, auto re-login, TLS fingerprint leak на reads, нет circuit breaker

**Три стратегических пробела:**
1. 5 из 9 roast angles не имеют ни одного few-shot примера — LLM генерирует вслепую
2. Learning loop не замкнут — engagement данные не возвращаются в генерацию
3. Нет CI/CD, DB backup, Sentry — production не готов к инцидентам

---

## Domain Scores

| Domain | Score | Key Issue |
|--------|-------|-----------|
| Architecture & Code | 7.0 / 10 | Монолиты (bot.ts 1554, queue-manager 1186), 9 responsibilities в QM |
| Content Pipeline | 7.5 / 10 | Multi-strategy + 5-judge eval сильные, 5/9 angles без примеров |
| Crypto/Market Fit | 7.5 / 10 | Forensic accountant voice — одна из лучших в нише, рынок не конкурентен |
| Twitter Safety | 5.0 / 10 | Ban risk 8-8.5/10 — datacenter IP, TLS leak, auto re-login, no circuit breaker. Quiet hours work |
| Telegram Admin UX | 7.0 / 10 | 23 команды покрывают workflow, inline rating кнопки отсутствуют |
| Web Interface | 5.5 / 10 | Половина данных не отображается, accessibility проблемы |
| DevOps & Reliability | 4.5 / 10 | Нет CI/CD, нет бэкапов, нет Sentry |

---

## I. Critical Issues (Fix Immediately)

### ~~C-1. Credentials leaked in git~~ — FALSE POSITIVE

`.env.test` содержит реальные ключи, но `.gitignore` паттерн `.env.*` его покрывает. Файл никогда не был committed в git history. Ротация не требуется.

### C-2. Datacenter IP without proxy

Hostinger VPS — datacenter ASN, блокируется Twitter/Cloudflare WAF. Подтверждено Error 226. CycleTLS используется ТОЛЬКО для write-операций (`createTweetGraphQL`), а read-операции (notifications, search) идут через plain Node.js fetch — TLS fingerprint Node.js палится.

**Fix:** ISP Static proxy (Decodo, ~$3-5/мес). Добавить `PROXY_URL` в env schema (сейчас поля НЕТ в `env.validation.ts`). Прокинуть proxy через CycleTLS И через fetch для reads.

**File:** `beef/src/common/config/env.validation.ts`, `beef/src/twitter/scraper-twitter-client.ts`

### C-3. Auto re-login on cookie expiry

`ensureLoggedIn()` (строка 114-129) автоматически перелогинивается через `loginWithCredentials()` — Twitter детектирует как automated login → security alert → потенциальный permanent lock.

**Fix:** Заменить auto re-login на Telegram alert. Cookie refresh — ручная операция. Добавить cookie expiry monitoring (проверка каждые 12ч).

**File:** `beef/src/twitter/scraper-twitter-client.ts:114-129`

---

## II. High Priority Issues

### H-1. 5 of 9 angles have zero few-shot examples

| Angle | Weight | Examples |
|-------|--------|----------|
| DATA_BOMB | 1.3 | 0 |
| TIMELINE | 1.0 | 0 |
| COMPARISON | 1.0 | 0 |
| RHETORICAL | 0.9 | 0 |
| RULE_OF_THREE | 0.7 | 0 |

Больше половины углов (включая DATA_BOMB с весом 1.3) не имеют ни одного примера. 8 existing примеров в `best` покрывают только FAKE_COMPLIMENT(3), UNDERSTATEMENT(2), SELF_AWARE(2), QUOTE_FLIP(1). Все 8 — mega-cap targets.

Дополнительная проблема: `getRandomExamples()` в `character.loader.ts:101` вызывает `getAllExamples()`, который сливает ВСЕ секции — casualReplies примеры (DEFLECT, CLAP_BACK, DEADPAN) попадают в proactive roast промпты. Это размывает signal.

**Fix:** (1) Добавить 1-2 curated примера на каждый пустой угол. (2) Добавить примеры для малых проектов ($1-50M) и KOL/founders. (3) Разделить `getRandomExamples()` на `getRoastExamples()` и `getReplyExamples()`.

**File:** `beef/characters/beef-bot.json`, `beef/src/roast/character.loader.ts:101`

### H-2. No circuit breaker on Error 226

При получении Error 226 (anti-automation) бросается `NonRetryableError` (строка 300-303), но нет circuit breaker — следующий poll снова пытается постить, снова получает 226, no Telegram alert. Система бесконечно стучит в заблокированный endpoint.

**Fix:** Circuit breaker: после 3x Error 226 за 1ч → disable posting for 6h → Telegram alert. При scraper 226 → runtime fallback на Official API (сейчас mode выбирается статически при старте).

**File:** `beef/src/twitter/scraper-twitter-client.ts:300-303`

### H-3. No database backups

При потере VPS — потеря всех данных (roasts, stockpile, engagement, feedback). `sync.sh pull` — ручная операция.

**Fix:** Ежедневный cron на VPS:
```bash
0 3 * * * sqlite3 ~/data/beef.db ".backup ~/backups/beef-$(date +\%Y\%m\%d).db" && find ~/backups -name "beef-*.db" -mtime +7 -delete
```

### H-4. Learning loop not closed

`EngagementTracker` сохраняет метрики, но нет автоматического пути: высокий engagement → fire example → future generation. Единственный путь — ручной `/srate` через Telegram.

**Fix:** Cron job: roasts с `likes > 20 || retweets > 5` → автоматически добавляются в fire examples с `source: 'engagement'`.

**File:** `beef/src/learning/engagement-tracker.ts`

### ~~H-5. FACTUAL weight too low (0.05)~~ — DEPRIORITIZED

Вес 0.05 установлен осознанно после калибровки на 33 human-rated roasts — humans rate primarily on humor. Factual quality обеспечивается через prompt instructions и research context, не через evaluation weight. Оставить как есть.

### H-6. `targetName` not sanitized in prompts (injection risk)

`targetName` инъектируется в промпты без `sanitizeInput()`. Burn-to-request позволяет пользователю задать имя target — возможна prompt injection.

**Severity recalibrated: HIGH** (не CRITICAL). Промпты содержат INJECTION DEFENSE секции, атакующий должен обойти и defence prompt, и content filter. Риск реальный, но не emergency.

**Fix:** Применить `sanitizeInput(targetName)` в `buildRoastPrompt()`, `buildPersonaPrompt()`, `buildAdversarialPrompt()`.

**File:** `beef/src/roast/prompt-builder.ts`

### H-7. Mention poll interval mismatch + 576 API requests/day

`MENTION_POLL_INTERVAL_MS` в env schema (default 600_000 = 10min) ИГНОРИРУЕТСЯ. Реальный cron hardcoded `*/5 * * * *` (5min) в `index.ts:402`. Каждый poll делает 2 API запроса (notifications + search) = 576 req/day (не 288).

**Fix:** Использовать `MENTION_POLL_INTERVAL_MS` из config. Уменьшить до `*/10` или `*/15` для нового аккаунта.

**File:** `beef/src/index.ts:402`

### ~~H-8. Dead code: isQuietHour~~ — FALSE POSITIVE

`isQuietHour()` вызывается в `queue-manager.ts:126` — блокирует `processNext()` в quiet hours (2-7 UTC). Работает корректно.

### H-9. No CI/CD pipeline

Нет GitHub Actions. Pre-commit hook запускает только lint-staged, не `pnpm test`.

**Fix:** Минимальный `.github/workflows/ci.yml`: checkout → pnpm install → typecheck → test.

### H-10. No deploy rollback

`scripts/deploy.sh` делает `git pull && pm2 reload` без сохранения предыдущего коммита.

**Fix:** `PREV_COMMIT=$(git rev-parse HEAD)` перед pull. При провале smoke check → `git checkout $PREV_COMMIT && pm2 restart`.

---

## III. Medium Priority Issues

| # | Issue | Details | File |
|---|-------|---------|------|
| M-1 | Burst posting on mention flood | `processNext()` в цикле без delay (index.ts:434-439). НО: каждый processNext() с LLM занимает 30-120с. Реальный риск только для stockpiled roasts. Fix: добавить `MIN_DELAY_MS = 60_000` между posts | `index.ts:434-440` |
| M-2 | Persona strategy contradiction | Промпт говорит "Don't think about techniques...Just BE $BEEF" (line 485), но включает `buildCharacterCheckpoint()` — technique-like block. Либо убрать checkpoint из persona, либо убрать "don't think" instruction | `prompt-builder.ts:473-500` |
| M-3 | farm/logger.ts pino-pretty unconditional | В отличие от main logger, farm logger использует pino-pretty всегда (нет env guard). В production лишний overhead на форматирование | `src/farm/logger.ts` |
| M-4 | console.warn in retryWithBackoff | `error.util.ts:46` использует `console.warn` вместо pino logger | `src/common/utils/error.util.ts:46` |
| M-5 | Sentry defined but not initialized | `SENTRY_DSN` в env schema, SDK не подключён | `index.ts` |
| M-6 | PM2 log rotation absent | PM2 пишет в `~/.pm2/logs/` без ограничения | `ecosystem.config.cjs` |
| M-7 | In-memory approvals lost on restart | `pendingApprovals` Map (queue-manager.ts:68) не переживает PM2 restart | `queue-manager.ts:68` |
| M-8 | Seasonal config defined but unused | `beef-bot.json` line 231-235 содержит "CURRENT PHASE March 2026", но никакой код не инъектирует это в промпты. Не "hardcoded in prompts" — unused config | `characters/beef-bot.json:231-235` |
| M-9 | Bearer token hardcoded 3x | Один и тот же публичный browser token на строках 197, 434, 565 | `scraper-twitter-client.ts` |
| M-10 | No external health monitoring | Health endpoint `/health` не опрашивается снаружи | — |

---

## IV. Architecture Assessment

### Codebase Structure

```
87 files, ~20K lines, 22 test files (449 tests)

Modules by size:
  admin/bot.ts            1554 lines  ← 23 commands + 4 callback handlers (23+ inline)
  queue/queue-manager.ts  1186 lines  ← 9 responsibilities (not 7)
  scraper-twitter-client    763 lines
  prompt-builder.ts        ~750 lines
  index.ts                  587 lines  ← business logic in entry point
  evaluator.ts             ~400 lines
```

### Key Architecture Findings

| Finding | Severity | Details |
|---------|----------|---------|
| `queue-manager.ts` has 9 responsibilities | HIGH | Dequeue/dispatch, autonomous enqueuing, stockpile lookup, LLM orchestration, evaluation, Twitter posting, approval state, casual replies, profile enrichment |
| `index.ts` contains `notifyQueueResult` (93 lines) | MEDIUM | Extract to notification module |
| In-memory approvals lost on PM2 restart | MEDIUM | Persist in SQLite or reconcile from DB |
| `profileFetcher!` non-null assertion | MEDIUM | Add guard |
| SelfEvaluator / RoastEvaluator partial duplication | LOW | ~145 lines in evaluate()/runSingleJudge() bodies, BUT core utilities (calculateWeightedComposite, checkHardVetoes) already shared. Not worth a BaseEvaluator — over-engineering |
| `viem` in prod deps, blockchain code not implemented | LOW | Remove until needed |
| `pino-pretty` in prod deps | NOT AN ISSUE | farm/logger.ts uses it unconditionally — must stay in prod deps |
| `retryWithBackoff` uses `console.warn` | MEDIUM | Replace with pino logger |

### queue-manager.spec.ts — Clarification

Файл EXISTS с 14 тестами — но покрывает ТОЛЬКО utility functions (extractReplyToId, extractHandleFromContext и т.д.). Core logic (`processNext`, `approveRoast`, `processCasualReply`) НЕ тестирована.

### Dependency Health

- **449/449 tests pass**, 0 typecheck errors
- 1 HIGH vuln in devDeps (`flatted <=3.4.1` via eslint chain) — not in production
- `@the-convocation/twitter-scraper` patched (GraphQL query IDs) — fragile, rotates every 2-4 weeks

---

## V. Content Pipeline Assessment

### Pipeline Architecture

```
Character (beef-bot.json)
  → PromptBuilder (3 strategies × research/no-research = 6 variants)
    → rubric: 4 diagnostic questions + CoT + technique/emotional blocks
    → persona: "You ARE $BEEF" + gut reaction (NO technique/emotion — BY DESIGN)
    → adversarial: [SLOP] diagnosis mandatory + all blocks
  → ContentFilter (banned words, financial advice, AI artifacts, @mentions)
  → RoastEvaluator (5 judges, weighted composite, hard vetoes)
  → Stockpile (available/served/expired/rejected)
  → CreativeMemory (6 sources: feedback, config, examples, patterns, stockpile, farm)
```

### Strengths

- **Adversarial strategy** — strongest of three. [SLOP] diagnosis forces anti-mediocrity
- **Efraimidis-Spirakis** weighted angle selection — mathematically sound
- **Character checkpoint** tests — effective guardrails
- **Anti-pattern injection** from real rejected examples — strong quality signal
- **Freshness TTL** (7-day expiry) — prevents stale content
- **Mutation system** (constraint 40%, voice 30%, perspective 20%, wildcard 10%)
- **Fallback when all variants discarded** — uses top self-scored variant (line 424), NOT an error

### Issues

| Issue | Priority | Details |
|-------|----------|---------|
| 5/9 angles without examples + example mixing | HIGH | See H-1 above |
| Persona strategy has internal contradiction | MEDIUM | "Don't think about techniques" + `buildCharacterCheckpoint()` |
| All 3 strategies get same examples and angles | MEDIUM | No differentiation — adversarial should get harder examples |
| No system/user prompt separation | MEDIUM | All in one block — no prompt caching benefit |
| FACTUAL weight 0.05 too low | HIGH | See H-5 above |
| Perplexity enrichment OFF by default | HIGH | `enrich: false` in TargetDiscoverer — main signal unused |
| Content filter: "i cannot" pattern | LOW | Blocks "i cannot believe [PROJECT]..." openers |
| Unicode bypass — no NFKC normalization | LOW | Homoglyph attacks pass regex (low probability for crypto bot) |
| `degen` + `crypto_native` = 15% combined, high correlation | LOW | Consider merging into single `ct_native: 0.15` |
| Composite threshold 3.5 same for farm and live | LOW | Farm should be stricter (3.8), live 3.5 |

### Evaluation System

Weights recalibrated from 56 human-rated roasts:
```
funny: 0.30, shareable: 0.20, savage: 0.15, original: 0.10
degen: 0.10, timely: 0.05, factual: 0.05, crypto_native: 0.05
```

---

## VI. Twitter Safety Assessment

### Ban Risk: 8-8.5 / 10 (revised from 7)

| Factor | Risk | Details |
|--------|------|---------|
| Datacenter IP without proxy | CRITICAL | Hostinger ASN — instant flag |
| TLS fingerprint leak on reads | HIGH | CycleTLS only on writes; reads via plain Node.js fetch expose non-browser TLS |
| Auto re-login on cookie expiry | HIGH | Automated login detection → security alert |
| No circuit breaker on Error 226 | HIGH | Keeps hitting blocked endpoint, no alert |
| ~~isQuietHour dead code~~ | — | FALSE POSITIVE — used in queue-manager.ts:126 |
| Hardcoded cron ignores MENTION_POLL_INTERVAL_MS | MEDIUM | 576 req/day (2 per poll × 288) from one account |
| Hardcoded GraphQL queryId | MEDIUM | Rotates every 2-4 weeks — silent failure |
| No runtime scraper→API fallback | HIGH | Static mode at startup, no automatic switch |

### Dual-Mode Client

`ITwitterClient` interface correctly abstracts both clients. Но:
- Runtime fallback не реализован: scraper 226 → система НЕ переключается на Official API
- CycleTLS только для GraphQL writes — reads через plain fetch палят Node.js TLS
- Один mode выбирается при старте и не меняется

### Missing Twitter Features

| Feature | Impact | Effort |
|---------|--------|--------|
| Quote-tweet support | HIGH — QT shows to target's audience | Medium |
| Image attachment | HIGH — +178% engagement per playbook | Medium |
| Thread support | MEDIUM — +40% reach for deep dives | Medium |
| Runtime scraper→API fallback on 226 | HIGH — resilience | Medium |
| Per-user mention rate limit | MEDIUM — prevents queue flooding | Low |

---

## VII. Crypto/Market Assessment

### Competitive Landscape

Ниша AI roast ботов фактически пуста. Прямых конкурентов с burn mechanics нет.

| Competitor | Status | Mcap | Notes |
|-----------|--------|------|-------|
| RoastHimJim ($JIM) | Active (Spectrals) | ~$200K | Relaunched 2026, 350K followers from 2023, "chronically not funny" reputation. Peaked $4.4M, unhealthy dump |
| AIXBT | Active | ~$24M | Analysis bot, different niche (not comedy) |
| Dolos ($BULLY) | Active (Solana) | ~$200K | Pivot from roast to "therapy", limited activity |
| BurnieAI ($ROAST) | Dead | ~$122K | No utility, no community |

**Вывод:** $JIM — единственный значимый конкурент, но с репутационными проблемами. $BEEF differentiator: forensic quality + burn mechanics + accountability layer. Ниша не переполнена.

### Tokenomics Assessment

- $15K/week target требует $2.19M weekly volume — реалистично при $3-5M mcap
- Challenge system (core differentiator) — Phase 2
- Cold start: no burns until token, no hype without content traction

### Character Voice: 9/10

Forensic accountant identity — одна из сильнейших в AI agent space. Рекомендации:
- "Moment of weakness" tweets (бот впечатлён/растерян проектом) — parasocial connection
- "Rogue AI" moments ("running for 14 days, read 891 whitepapers...") — viral format
- Сезонные personality shifts (bear/bull) — config exists, но не используется (see M-8)

---

## VIII. UX Assessment

### Telegram Admin: 7 / 10

**23 commands** (start, help, roast, power, farm, stats, status, queue, poll, trigger, pause, resume, diagnose, reset, promote, stockpile, unrated, srate, sdel, sadd, approve, approve_mentions, pending) + 4 callback handlers (approve, standalone, reject, regenerate).

**Top Issues:**

| Issue | Impact | Fix |
|-------|--------|-----|
| Rating is text "1 2 3 4 5" not clickable buttons | HIGH | InlineKeyboard `rate:<id>:<score>` |
| No notification on autonomous posts | HIGH | Brief "Auto-posted: [target] → tweet link" |
| No `/expiring` command | HIGH | Data-dependent roasts с `expiresAt < 48h` |
| No stockpile low alert | HIGH | Notify if `available < 5` |
| `/promote` zero discoverability | MEDIUM | After `/srate 5` → suggest promote |

### Web Interface: 5.5 / 10

Terminal-style diary concept is on-brand. Key issues:

| Issue | Impact | Fix |
|-------|--------|-----|
| `burnedTokens` / `stockpileSize` not displayed | HIGH | Add to Sidebar |
| No tweet link from RoastCard | HIGH | `data.tweetId` → x.com link |
| No event type filter | HIGH | Buttons: ALL / POSTED / ERROR |
| Font size 13px, contrast issues | MEDIUM | 14-16px body, `--text-muted` needs 4.5:1 |
| 5-min polling, no real-time | LOW | Fine for now, SSE later |

---

## IX. DevOps Assessment

| Component | Status | Grade |
|-----------|--------|-------|
| Deployment | `deploy.sh` — works, no rollback | C |
| PM2 | Config exists, no log rotation | C |
| Database | WAL mode, migrations OK, no backups | D |
| Monitoring | Health endpoint, nobody polls | D |
| Logging | pino structured, farm logger no env guard | C |
| CI/CD | None | F |
| Error tracking | Sentry DSN defined, SDK not init | F |
| Security | .env.test local only (not committed) | B |

### Production Readiness Checklist

```
[x] Environment validation (Zod)
[x] Graceful shutdown
[x] Queue crash recovery (resetProcessing on start)
[x] LLM provider failover (Claude CLI → SDK)
[x] Structured logging (pino JSON in prod)
[x] Fallback when all variants discarded (self-scored top)
[ ] Database backups
[ ] Log rotation
[ ] CI/CD pipeline
[ ] Sentry initialization
[ ] External health monitoring
[ ] Secret redaction in logs
[ ] Deploy rollback mechanism
[ ] Cookie expiry monitoring
[ ] Circuit breaker on Error 226
[x] Credentials protected (.env.test never committed)
```

---

## X. Prioritized Action Plan

### Phase 0: Security + Survival (Today)

| # | Action | Type | Effort | Status |
|---|--------|------|--------|--------|
| ~~0.1~~ | ~~Rotate Twitter API keys~~ | — | — | FALSE POSITIVE — `.env.test` never committed |
| 0.2 | Register ISP proxy (Decodo ~$3-5/мес) | Manual | 30 min | |
| 0.3 | Add `PROXY_URL` to env schema + wire into scraper (CycleTLS + fetch reads) | Code | 2h | |
| 0.4 | Replace auto re-login with Telegram alert | Code | 1h | |
| 0.5 | Add circuit breaker for Error 226 (3x/1h → disable 6h → alert) | Code | 2h | |

### Phase 1: Content Quality (This Week — Highest ROI)

| # | Action | Type | Effort | Status |
|---|--------|------|--------|--------|
| 1.1 | Write 10 few-shot examples: 2 per empty angle (DATA_BOMB, TIMELINE, COMPARISON, RHETORICAL, RULE_OF_THREE) | Curation | 3h | |
| ~~1.2~~ | ~~Split `getRandomExamples()` into roast vs reply pools~~ | Code | 1h | DONE |
| 1.3 | Enable Perplexity enrichment by default in TargetDiscoverer | Code | 15 min | |

### Phase 2: Production Hardening (This Week)

| # | Action | Type | Effort |
|---|--------|------|--------|
| 2.1 | DB backup cron on VPS | Manual/VPS | 30 min |
| 2.2 | PM2 log rotation config | Code | 15 min |
| 2.3 | Sentry SDK initialization | Code | 1h |
| 2.4 | GitHub Actions CI (typecheck + test) | Code | 1h |
| 2.5 | Deploy rollback in `deploy.sh` | Code | 30 min |
| 2.6 | UptimeRobot on `/health` | Manual | 15 min |
| 2.7 | Fix farm/logger.ts — add production env guard | Code | 10 min |
| 2.8 | Replace console.warn in retryWithBackoff with pino | Code | 10 min |

### Phase 3: UX + Engagement (Next Week)

| # | Action | Type | Effort |
|---|--------|------|--------|
| 3.1 | Close learning loop: high-engagement → fire examples auto | Code | 3h |
| 3.2 | Inline rating buttons (1-5) in Telegram | Code | 2h |
| 3.3 | Auto-notify on autonomous posts | Code | 1h |
| 3.4 | Stockpile low alert (`available < 5`) | Code | 30 min |
| 3.5 | Runtime scraper→API fallback on 226 | Code | 3h |
| 3.6 | Tweet link in web RoastCard | Code | 30 min |

### Phase 4: Architecture (Week 3, Only If Needed)

| # | Action | Effort |
|---|--------|--------|
| 4.1 | Extract `notifyQueueResult` from `index.ts` | 1h |
| 4.2 | Tests for queue-manager core methods (processNext, approve) | 4h |
| 4.3 | Persist approval state in SQLite | 2h |
| 4.4 | Extract Bearer token constant | 15 min |

**Removed from plan:**
- Split `queue-manager.ts` into sub-modules — premature, 9 responsibilities are manageable in one file with 1186 lines
- Split `admin/bot.ts` — works, 23 commands in one file is fine for Telegram bots
- Deduplicate SelfEvaluator / RoastEvaluator — core utilities already shared, ~145 lines isn't worth a BaseEvaluator abstraction
- Move `pino-pretty` to devDeps — farm/logger.ts needs it in prod
- Unicode NFKC normalization — homoglyph attacks on crypto bot are near-zero probability
- Separate farm/live thresholds — premature optimization, current 3.5 works

---

## XI. Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Twitter account ban | High (8-8.5/10) | Critical | ISP proxy, remove auto re-login, circuit breaker, quiet hours, TLS fix |
| Wrong roast / defamation | Low | Critical | Disclaimer in bio, research context, approval mode |
| Token launch without traction | Medium | High | Min 500 followers + 2% engagement before launch |
| VPS data loss | Medium | High | Daily DB backups |
| GraphQL queryId rotation | High | Medium | Monitor 400/404, alert on failure |
| Cookie expiry without notice | High | Medium | 12h monitoring + Telegram alert |
| Claude CLI format change | Medium | Medium | Zod validation on extractJsonFromOutput |

---

## Appendix A: Corrections from Initial Audit

| Original Claim | Verdict | Correction |
|----------------|---------|------------|
| "4 of 9 angles have zero examples" | UNDERCOUNTED | 5 of 9 (TIMELINE missed) |
| "queue-manager.ts — no tests" | PARTIALLY TRUE | spec exists with 14 utility tests, core logic untested |
| "pino-pretty should be devDep" | FALSE | farm/logger.ts uses it unconditionally in prod |
| "Seasonal context hardcoded in prompts" | MISLEADING | Config exists in character JSON but is NOT injected anywhere |
| "Burst posting: 5+ posts in seconds" | OVERSTATED | Each processNext() takes 30-120s with LLM call |
| "targetName injection — CRITICAL" | OVERRATED | HIGH — injection defense sections exist in prompts |
| "If all 9 variants discarded → error" | FALSE | Fallback to self-scored best variant (line 424) |
| "21 commands in admin/bot.ts" | UNDERCOUNTED | 23 commands |
| "7 responsibilities in queue-manager" | UNDERCOUNTED | 9 responsibilities |
| "11 inline handlers" | UNDERCOUNTED | 23+ inline handlers |
| "Ban risk 7/10" | UNDERRATED | 8-8.5/10 per Twitter safety analysis |
| "Dolos ($BULLY) Dead, $164K" | WRONG | Active on Solana (~$200K mcap) |
| "$JIM ~$481K" | STALE | ~$200K, unhealthy dump post-launch |
| "~150 lines duplication in evaluators" | OVERSTATED | Core utilities already shared, only evaluate()/runSingleJudge() overlap |
| "288 notification requests/day" | UNDERCOUNTED | 576 (2 per poll × 288) |
| "Credentials leaked in git" | FALSE POSITIVE | `.env.test` covered by `.gitignore` `.env.*` pattern, never committed |
| "isQuietHour is dead code" | FALSE POSITIVE | Called in `queue-manager.ts:126`, blocks processNext in 2-7 UTC |
| "FACTUAL weight too low" | DEPRIORITIZED | Weight 0.05 set intentionally after 33-roast human calibration |

## Appendix B: New Issues Found in Re-Review

| Issue | Severity | Details | Status |
|-------|----------|---------|--------|
| CycleTLS only on writes, plain fetch on reads | HIGH | TLS fingerprint leak — Node.js detected | Open |
| Error 226 no circuit breaker | HIGH | Infinite retry on blocked endpoint | Open |
| ~~getRandomExamples mixes proactive + reply examples~~ | ~~HIGH~~ | ~~casualReplies in roast prompts~~ | FIXED |
| ~~isQuietHour is dead code~~ | — | FALSE POSITIVE — used in queue-manager.ts:126 | — |
| ~~FACTUAL weight 0.05 too low~~ | — | DEPRIORITIZED — calibrated weight, quality via prompts | — |
| Persona prompt contradiction | MEDIUM | "Don't think about techniques" + technique-like block | Open |
| No PROXY_URL in env schema | MEDIUM | Field doesn't exist yet | Open |
| farm/logger.ts pino-pretty unconditional | LOW | No production env guard | Open |
| console.warn in retryWithBackoff | LOW | Should use pino logger | Open |
| Seasonal config unused | LOW | Defined in JSON, never injected into prompts | Open |

## Appendix C: Test Coverage Map

```
Tested (449 tests, 22 files):
  activity/activity-logger.spec.ts
  content/content-filter.spec.ts
  farm/batch-generator.spec.ts, freshness.spec.ts, judge-personas.spec.ts
  farm/mutations.spec.ts, self-evaluator.spec.ts, sync.spec.ts
  farm/target-discoverer.spec.ts
  queue/queue-manager.spec.ts (14 tests — utility functions only)
  roast/character.loader.spec.ts, prompt-builder.spec.ts
  storage/database.spec.ts, repositories/*.spec.ts (6 files)
  twitter/mention-handler.spec.ts
  agent/provider-manager.spec.ts

Untested critical modules:
  admin/bot.ts (1554 lines, 23 commands)
  queue/queue-manager.ts core logic (processNext, approve, casual replies)
  twitter/scraper-twitter-client.ts (763 lines)
  roast/roast-engine.ts (~400 lines)
  evaluation/evaluator.ts (~400 lines)
```
