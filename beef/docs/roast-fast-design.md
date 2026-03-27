# Roast Fast — Design Document

## Concept

**Volume + Selection**: 5 параллельных Sonnet-вызовов × 5 вариантов = 25 роустов → фильтр → ранжирование → топ-3. Качество через количество и отбор, а не через один дорогой вызов Opus.

## Architecture

```
T=0   ──┬── Research (Sonnet + Perplexity, ~40s)
        └── Gen Call 0 "Surgeon" (без research, с enrichment context)
T=40  ──┬── Gen Call 1 "CT Native"    ┐
        ├── Gen Call 2 "Comedian"     ├── все с research notes
        └── Gen Call 3 "Psychopath"   ┘
T=45  ──── Gen Call 4 "Chaos Agent"   ← дождался слота
T=60  ──── Все generation calls done
            25 вариантов → pre-filter → dedup → ~15-18 кандидатов
T=62  ──── Batch Ranking (1 вызов Sonnet, все кандидаты в одном промпте)
T=80  ──── Done. Топ-3 с оценками.
```

**~80s с research, ~45s без** (текущий Opus flow: ~120-300s за 3 варианта).

## 5 Generation Calls — "Fight Club"

Каждый вызов — отдельная "личность" с уникальным стилем, мутациями и углами атаки. 12 основных углов распределяются без повторов (по 2-3 на вызов).

| # | Codename | Creativity | Style | Mutation Type |
|---|----------|-----------|-------|---------------|
| 0 | **Surgeon** | 2/5 | Data-driven, хирургическая точность. Каждое слово — скальпель | constraint |
| 1 | **CT Native** | 3/5 | Maximum degen energy, CT slang, как будто пишет анон с 50K фолловеров | voice |
| 2 | **Comedian** | 3/5 | Pure comedy craft — setup, misdirection, surprise. SNL Weekend Update energy | perspective |
| 3 | **Psychopath** | 4/5 | Ice cold, understated, devastating. Тишина после удара — и есть панчлайн | voice: ice-cold |
| 4 | **Chaos Agent** | 5/5 | Maximum unhinged. Трэш-угар. Absurdist. Всегда с unhinged override. Без тормозов | wildcard |

**Chaos Agent** (Call 4) — всегда получает unhinged override + trash-tier мутацию. Это "генератор безумия" — 80% его вариантов будут отфильтрованы, но оставшиеся 20% будут самыми запоминающимися.

## New Trash-Tier Mutations

Добавляются к существующим 17 мутациям — специально для fast pipeline:

| ID | Type | Description |
|----|------|-------------|
| `breakdown` | wildcard | Write as a crypto community manager having a public mental breakdown about this. Not satire — genuine emotional collapse |
| `copypasta` | wildcard | Write a crypto copypasta destined for quote tweets. The kind of text people screenshot with "💀💀💀" |
| `obituary` | voice | Write a deadpan 2-line obituary for this project/take/career. Clinical. Final |
| `investor-call` | perspective | Write the devastating one-liner a VC would say in a partner meeting after reviewing this |
| `3am-take` | wildcard | The 3am delirious take that somehow has more insight than any sober analysis |
| `anime-villain` | voice | Deliver the roast like an anime villain who finds their opponent disappointing. The condescension IS the comedy |

## Batch Ranking (Not Individual Evaluation)

**Key improvement over v1 plan.** Вместо 8 отдельных judge-вызовов — 1 ranking prompt.

Один judge (comedy_writer) получает все ~15-18 post-filter вариантов и ранжирует их:

```
Rate each roast 1-5 and rank from best to worst.
For each: FUNNY (would someone laugh out loud?), IMPACT (would they stop scrolling?), ORIGINAL (never seen this angle before?).
```

**Преимущества:**
- 1 вызов (~20s) вместо 8 (~45s) = экономия 25s
- Судья видит все варианты сразу → лучшее сравнительное суждение
- Менее подвержен score inflation (видит "плохой" рядом с "хорошим")

## Similarity Dedup

Между pre-filter и ranking — простая дедупликация:
- Jaccard similarity на word-level bigrams
- Порог: >60% сходства с более высоко-оценённым (по self-score) вариантом → удалить
- Защита от ситуации когда 3 из 5 calls генерируют похожие "очевидные" роусты

## Parallel Research Trick

Gen Call 0 ("Surgeon") стартует одновременно с research call, используя только enrichment context (Twitter profile, tweet text, metrics). Он не ждёт research — работает с тем что есть.

Остальные 4 calls ждут research notes и получают полный контекст.

Это экономит ~20s wall time: пока research работает, уже генерируются 5 вариантов.

## Profile Configuration

```typescript
'roast-fast-research': {
  model: 'sonnet', effort: 'medium',
  tools: RESEARCH_TOOLS, maxTurns: 5, timeoutMs: 120_000,
  fallbackModel: 'haiku',
},
'roast-fast-gen': {
  model: 'sonnet', effort: 'medium',
  tools: [], maxTurns: 1, timeoutMs: 60_000,
  fallbackModel: 'haiku',
},
```

## Telegram Command

```
/roastfast <target>
optional operator context on second line
```

Роутинг как у `/roast`: tweet URL → tweet mode, @handle → person, freeform → generic.

### Output

```
⚡ @target — 25→17→3, 82s

1. QUOTE_FLIP  ★ 4.3
<pre>roast text</pre>

2. DATA_BOMB  ★ 4.1
<pre>roast text</pre>

3. BATHOS  ★ 3.8
<pre>roast text</pre>

📊 5 calls · 25 gen · 17 passed · 3 selected
```

## File Changes

| File | What Changes |
|------|-------------|
| `agent/agent.types.ts` | +2 TaskProfile values, +1 output interface |
| `agent/claude-cli.config.ts` | +2 presets |
| `roast/prompt-builder.ts` | +`buildFastResearchPrompt()`, +`buildFastGenPrompt()`, +`FAST_CALL_CONFIGS`, +`distributeFastAngles()` |
| `roast/roast-engine.ts` | +`generateRoastFast()` method |
| `evaluation/evaluator.ts` | +`rankBatch()` method (1-call ranking) |
| `farm/mutations.ts` | +6 trash-tier mutations |
| `admin/roast-generator.ts` | +`generateRoastsFast()` function |
| `admin/bot.ts` | +`/roastfast` command + handlers |
| `index.ts` | maxConcurrent: 2 → 3 |

**Полностью аддитивный** — ни одна существующая функция не модифицируется.

## What This Does NOT Change

- `/roast`, `/farm`, `/roasttweet` — untouched
- Existing mutations, angles, judge personas — untouched
- Evaluation weights, thresholds, pre-filter patterns — untouched
- Opus profiles — untouched
