# $BEEF Full System Audit

**Date:** 2026-03-26  
**Scope:** `beef`, `beef-web`, shared runtime contracts, prompt pipeline, data model, operator flows  
**Method:** code audit, architecture review, prompt/runtime consistency check, local verification (`test`, `typecheck`, `build`, `lint`)  

## Executive Summary

Проект в хорошем техническом состоянии: backend проходит **539/539 tests**, `beef` и `beef-web` проходят `typecheck`, `beef-web` собирается. База сильная: строгая типизация, SQLite persistence, неплохое покрытие core-репозиториев и явная product direction.

Главные проблемы уже не в "общем качестве кода", а в **correctness на границах системы**: request identity для mention/reply, recovery после рестартов, drift между docs/prompts/runtime и ослабленные quality gates. Критичного data-loss бага не найдено, но есть **5 High** и **3 Medium** findings, которые прямо влияют на поведение бота, операторский workflow и качество обучения.

## Findings

| # | Severity | Issue | Location | Impact | Fix |
|---|---|---|---|---|---|
| 1 | **High** | Target-level idempotency гасит легитимные mention/reply запросы | `beef/src/queue/queue-manager.ts:245`, `beef/src/twitter/mention-handler.ts:177`, `beef/src/twitter/mention-handler.ts:220` | Два разных user requests на один target могут схлопнуться в один, второй пользователь не получит ответ | Применять `findRecentByTarget()` только к `autonomous`; для mention/reply дедупить по `reply_to_id` / `mention_tweet_id` / `conversation_id` или по отдельному `request_fingerprint` |
| 2 | **High** | Startup recovery автоматически `reject`-ит валидные pending approvals по одному `target_name` | `beef/src/index.ts:614`, `beef/src/storage/repositories/roast.repository.ts:111` | После рестарта можно потерять корректный pending roast, если есть второй pending на тот же target в другом thread/request | Удалить destructive dedup по `target_name`; если dedup нужен, делать по `source + reply_to_id + conversation_id`, либо вообще оставить оператору ручной выбор |
| 3 | **High** | Approval metadata хранится только в памяти и теряется после PM2 restart | `beef/src/queue/queue-manager.ts:942`, `beef/src/queue/queue-manager.ts:975`, `beef/src/queue/queue-manager.ts:1003`, `beef/src/index.ts:620` | Ломается fallback c parent tweet на mention tweet, теряется markProcessed для originating mention, ухудшается recovery pending state | Сохранить `mention_tweet_id` и `stockpile_id` в `roasts` или в отдельной `roast_pending_meta`; на старте гидрировать approval state из БД |
| 4 | **High** | FUNNY consensus veto реализован с off-by-one и пропускает weak roasts | `beef/src/evaluation/evaluator.ts:56` | Комментарий обещает veto при `3/5` и `2/3`, а код требует `4/5` и `3/3`, из-за чего quality gate слабее заявленного | Заменить `Math.ceil(results.length / 2) + 1` на `Math.floor(results.length / 2) + 1` |
| 5 | **High** | Analytics/training data уже записываются с ложными `targetType` и `strategy` | `beef/src/admin/roast-generator.ts:107`, `beef/src/roast/prompt-builder.ts:595`, `beef/docs/full-system-audit-2026-03-23.md:14`, `beef/docs/craft-roast-prompt-design.md:16` | Reject-learning, strategy analytics и future calibration опираются на недостоверные данные; docs и метрики описывают систему, которой больше нет | Писать в `farm_attempts` фактический `targetType`, а `strategy` ставить `unified`; отдельно обновить docs и historical assumptions под current runtime |
| 6 | **Medium** | External curated examples загружаются, но не попадают в prompt | `beef/src/roast/creative-memory.ts:143`, `beef/src/roast/prompt-builder.ts:107` | Оператор думает, что curated external examples улучшают generation, но runtime их фактически игнорирует | Либо смешать `memory.externalExamples` в examples block с явным лимитом, либо убрать этот канал из memory до реального wiring |
| 7 | **Medium** | Safety knob `MENTION_POLL_INTERVAL_MS` не влияет на runtime | `beef/src/common/config/env.validation.ts:46`, `beef/src/index.ts:451` | Operator ожидает, что poll cadence управляется env, но runtime всегда работает по `*/5`; это ухудшает Twitter safety tuning и вводит в заблуждение | Вычислять cron/jitter из `MENTION_POLL_INTERVAL_MS` или убрать переменную из schema и docs |
| 8 | **Medium** | Frontend fail-open и может показать demo feed в production | `beef-web/src/services/activity.ts:4`, `beef-web/docs/implementation-handoff.md:53` | При сборке без `VITE_FEED_URL` app выглядит “живой”, но показывает `sample-feed.json`, что бьёт по trust и эксплуатации | В production падать без `VITE_FEED_URL`; dev fallback оставить только для local/dev |

## Recommendations

### P0 — Correctness / Recovery

1. Ввести **request identity** для mention/reply flow.
   Стоимость: medium
   Эффект: убирает потерю пользовательских запросов и делает dedup корректным.

2. Перенести **approval metadata** из памяти в persistent storage.
   Стоимость: medium
   Эффект: делает restart-safe весь operator workflow и 403 fallback.

3. Убрать destructive startup dedup по `target_name`.
   Стоимость: quick
   Эффект: перестаёт ломать pending approvals после перезапуска.

4. Починить **FUNNY consensus veto**.
   Стоимость: quick
   Эффект: немедленно усиливает quality gate без архитектурных изменений.

### P1 — Data Integrity / Prompt System

1. Привести `farm_attempts.strategy` и `target_type` к реальному runtime.
   Стоимость: quick
   Эффект: делает learning/analytics снова пригодными для принятия решений.

2. Обновить docs под actual runtime (`unified` вместо pseudo-multi-strategy).
   Стоимость: medium
   Эффект: убирает ложные ожидания у операторов и будущих аудитов.

3. Либо реально подключить `externalExamples` в prompt, либо вырезать мёртвый канал.
   Стоимость: quick
   Эффект: снижает архитектурный шум и делает memory pipeline честным.

### P2 — Ops / Product Reliability

1. Сделать `beef-web` **fail-closed** без `VITE_FEED_URL` в production.
   Стоимость: quick
   Эффект: исключает тихую подмену live feed demo-данными.

2. Привязать mention polling к конфигу, а не к hardcoded cron.
   Стоимость: medium
   Эффект: даёт управляемость Twitter safety без кодовых изменений.

3. Довести `lint` до green.
   Стоимость: quick
   Эффект: CI станет честным gate, а не “типа всё зелёное кроме линта”.

## Verification

- `beef`: `pnpm test` — **539/539 passed**
- `beef`: `pnpm typecheck` — **passed**
- `beef`: `pnpm lint:check` — **fails**
- `beef-web`: `pnpm typecheck` — **passed**
- `beef-web`: `pnpm build` — **passed**

### Current lint failures

| File | Problem |
|---|---|
| `beef/src/activity/templates.ts:392` | `String(value)` на `unknown object` without guard |
| `beef/src/agent/claude-code.provider.ts:162` | unused `_` after env destructuring |
| `beef/src/index.ts:516` | `async handler` without `await` |

## Notes

- Предыдущий аудит от 2026-03-23 остаётся полезным, но часть его prompt/strategy assumptions устарела после перехода на unified runtime.
- Наиболее сильная часть проекта сейчас: **core engineering discipline**.
- Наиболее слабая часть проекта сейчас: **state correctness across restarts and operator flows**.
