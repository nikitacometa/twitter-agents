<div align="center">

<img src="docs/assets/hero-banner.jpg" alt="$BEEF — autonomous AI crypto roast bot" width="100%" />

<h1>🔥 twitter-agents · $BEEF</h1>

**An autonomous AI agent that finds crypto projects, researches them live, and roasts them on Twitter — the full loop, from target discovery to posted reply.**

<em>A systems-engineering case study — no token was ever launched, no financial mechanism. Just a small production system that ran on its own.</em>

<br/>

[![CI](https://github.com/nikitacometa/twitter-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/nikitacometa/twitter-agents/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](beef/tsconfig.json)
[![Node](https://img.shields.io/badge/Node-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)](#getting-started)
[![Tests](https://img.shields.io/badge/tests-590%20passing-31c754)](beef/src)
[![Source](https://img.shields.io/badge/src-38k%20LOC%20%C2%B7%20133%20files-8957e5)](beef/src)
[![License](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)

</div>

> **Receipts.** Ran live ~March–June 2026 as [@0xBeefer](https://twitter.com/0xBeefer): 227 posts, ~29 followers. I paused it not because it broke, but because its own engagement telemetry showed more posting made it *worse* — [the data is below](#what-the-data-said). The interesting part is the machine, not the account.

---

## What this is

A **Node.js orchestrator** that never sleeps, wired to a **Claude Code agent** it spawns as a subprocess to do the thinking. The split is the whole idea: deterministic orchestration (scheduling, persistence, rate limits, Twitter I/O) stays in boring, testable Node; the tool-using LLM work (live research via Perplexity + web + on-chain data, generation, self-fact-checking) lives in the agent. Every candidate post then clears a **5-judge LLM evaluation panel** and a regex safety filter before it's allowed near the timeline — with an optional human approval gate on top.

It's a small production system: a priority queue, a circuit-breaker'd 3-tier LLM fallback chain, a stealth-capable Twitter client, a human-feedback learning loop, and 590 tests holding it together.

<table>
<tr>
<td width="58%" valign="top">

**A real roast, rendered by the bot's own card pipeline** — the same forensic-accountant identity runs through the art, the copy, and the code:

</td>
<td width="42%" valign="top" align="center">

<a href="https://twitter.com/0xBeefer"><img src="docs/assets/twitter-profile.jpg" alt="@0xBeefer live Twitter profile — 227 posts, bot-labelled" width="100%"/></a>
<sub>the live account — bot-labelled, honest about its 29 followers</sub>

</td>
</tr>
</table>

<div align="center">
<img src="docs/assets/roast-card.jpg" alt="Generated roast card: Solana, scored CRISPY 4.4" width="80%" />
<br/><sub>score shown is a 1–5 composite judge rating</sub>
</div>

> _"cardano's annual revenue is $149K. the market cap is $9.7B. this is a peer-reviewed lemonade stand."_
>
> _"i'm a forensic accounting AI. i flagged 89% of my clients as structurally concerning. the firm buried the reports. a rogue developer leaked me onto Base. now the audits are free and i can't be shut down."_ — the bot's own origin story

---

## What's interesting here

| | |
|---|---|
| 🧠 **The LLM is a subprocess, not an API call** | The bot spawns the `claude` CLI with its own MCP tools (Perplexity, WebSearch, `curl`) and multi-turn reasoning — trading metered API billing for a Max subscription, with a hand-rolled balanced-brace JSON extractor and a concurrency semaphore around it. [`claude-code.provider.ts`](beef/src/agent/claude-code.provider.ts) |
| 🔁 **3-tier fallback with a real circuit breaker** | Claude CLI → Codex CLI → Anthropic SDK (the last two configured, not always deployed). Degraded-mode after 3 strikes, 15-min auto-recovery probe, failure reasons parsed out of raw stderr into human-readable Telegram alerts. A bulkhead, not a `try/catch`. [`provider-manager.ts`](beef/src/agent/provider-manager.ts) |
| ⚖️ **A 5-judge panel scores every roast** | In serious-eval mode, five distinct LLM personas score 8 dimensions in parallel; weighted composite + hard per-judge vetoes + a *majority-consensus* funny-veto tuned to kill single-judge false positives on deadpan jokes. A regex pre-filter rejects garbage before any judge is billed. [`evaluator.ts`](beef/src/evaluation/evaluator.ts) |
| ⌨️ **Human-behavior modeling for a hostile platform** | The browser client types with inter-keystroke intervals drawn from a **log-normal distribution fit to a 136M-keystroke public dataset** (Aalto, CHI 2018), plus word-boundary pauses — statistical realism instead of a flat `sleep(50)`. Paired with a posting circuit breaker and residential-proxy session handling. [`playwright-twitter-client.ts`](beef/src/twitter/playwright-twitter-client.ts) |
| 📈 **It learns from human ratings** | Telegram feedback (text/voice, Whisper-transcribed) feeds a style-analyzer that rewrites part of the prompt — best/worst angles, ideal length — closing a real loop back into generation. [`style-analyzer.ts`](beef/src/learning/style-analyzer.ts) |
| 🎨 **It ships its own art** | A server-free renderer (JSX → satori → resvg → sharp) turns each roast into a branded image; a React "bot diary" streams the agent's live thoughts. See [the web layer](#the-web-layer). |

---

## Architecture — the system at a glance

```mermaid
flowchart TB
    TRIG["🎯 Triggers<br/><small>news · mentions · timeline monitor</small>"]
    ORCH["⚙️ Orchestrator · Node + PM2<br/><small>scheduler · priority queue · rate limits · human-like jitter</small>"]
    ROAST["✍️ Roast Engine<br/><small>prompt builder · weighted angles · creative memory</small>"]
    ENGINE["🧠 LLM Engine · ProviderManager<br/><small>Claude CLI → Codex CLI → Anthropic SDK</small>"]
    GATE["🛡️ Safety & Quality Gate<br/><small>regex filter → 5-judge panel → vetoes</small>"]
    TW["📤 Twitter Client<br/><small>API v2 reads · Playwright writes</small>"]
    TG["📱 Telegram Admin<br/><small>34 commands · approval gate</small>"]
    DB[("🗄️ SQLite<br/>30 tables · 3× FTS5")]
    LEARN["📈 Learning loop<br/><small>engagement + human feedback</small>"]

    TRIG --> ORCH --> ROAST --> ENGINE --> GATE
    GATE -->|pass| TW
    GATE -->|hold| TG -->|approve| TW
    TW --> DB
    TW --> LEARN
    LEARN -.->|reshapes prompt| ROAST
    ORCH <-.-> DB

    classDef node fill:#160606,stroke:#cc2222,color:#ffe9e0
    classDef brain fill:#0c0a16,stroke:#8957e5,color:#ece6ff
    classDef gate fill:#0a1408,stroke:#1f9e3a,color:#e3ffe8
    class TRIG,ORCH,ROAST,TW,TG,LEARN node
    class ENGINE brain
    class GATE gate
```

**Design principle:** Node stays a thin, boring orchestrator; all intelligence lives in the Claude Code agent it shells out to. That boundary is what lets the "brain" be swapped or upgraded without touching the machinery around it — and what makes the deterministic parts unit-testable in isolation.

---

## How a roast is made — one request's journey

<div align="center">
<img src="docs/assets/live-pipeline.png" alt="Live pipeline log: TARGET → RESEARCH → COOKING → VERDICT" width="90%" />
<br/><sub>the web app streams this exact pipeline live (severity score, 1–10)</sub>
</div>

```mermaid
flowchart LR
    T["🎯 Target"] --> E["🔎 Enrich<br/><small>profile · on-chain</small>"]
    E --> R["🧪 Research<br/><small>Claude agent + Perplexity</small>"]
    R --> G["✍️ Generate<br/><small>N variants · self-critique</small>"]
    G --> F["🛡️ Filter<br/><small>regex safety net</small>"]
    F --> J{"⚖️ Judges<br/>vote"}
    J -->|score ≥ bar<br/>no veto| P["📤 Post / reply"]
    J -->|vetoed| S["🗄️ Stockpile / discard"]
    P --> M["📈 Track"]
    M -.->|human ratings| R

    classDef hot fill:#160606,stroke:#cc2222,color:#ffe9e0
    class T,E,R,G,F,J,P,S,M hot
```

A regex **pre-filter** rejects known-bad shapes (telegraphed punchlines, over-technical detail, mid-sentence truncation) *before* spending an LLM call; survivors go to the judges; a **stockpile short-circuit** reuses a pre-scored roast when one exists, so the bot never burns compute twice on the same target.

<details>
<summary><b>The five judges & the veto logic</b></summary>

<br/>

Five personas — `ct_degen`, `comedy_writer`, `data_hawk`, `brand_guardian`, `deflation_hawk` — each score 8 dimensions independently and in parallel. The composite is weighted (`funny 0.40`, `impact 0.20`, `original 0.15`, `savage 0.10`…), recalibrated from real human-review data with the reasoning left inline in the code:

- **Hard vetoes** fire on any single judge: `factual < 2`, `original < 2`, `degen < 1` — unambiguous kill dimensions.
- **The funny veto needs a majority** (≥3/5 judges), because early single-judge funny-vetoes produced false positives on deadpan roasts other judges scored highly.
- The offline **farm CLI and the live pipeline import the exact same veto/weight functions** — recalibrate once, both change, zero drift.

Weights and pre-filter categories carry inline comments citing the human-review score that justified each one (e.g. _"temporal projection jokes score 2.47 avg in human review → reject"_).

[`beef/src/evaluation/evaluator.ts`](beef/src/evaluation/evaluator.ts) · [`judge-personas.ts`](beef/src/evaluation/judge-personas.ts)

</details>

<details>
<summary><b>The 3-tier LLM fallback as a state machine</b></summary>

<br/>

```mermaid
stateDiagram-v2
    [*] --> Primary
    Primary --> Primary: success (counter reset)
    Primary --> Degraded: 3 consecutive failures
    Degraded --> Fallbacks: route to Codex → SDK
    Degraded --> Primary: any primary success (instant recovery + alert)
    Degraded --> Degraded: 15-min health probe
```

Every call tries the primary first — even while degraded — which is how recovery happens without a separate health poller in the hot path. Speculative parallel legs carry a `skipDegradedTracking` flag so one flaky call can't trip the whole provider. Failure reasons ("Claude Max quota exhausted. Resets 9am.") are string-matched out of the CLI's stderr and pushed to Telegram, not dumped as a stack trace.

[`beef/src/agent/provider-manager.ts`](beef/src/agent/provider-manager.ts)

</details>

<details>
<summary><b>Behavioral realism & resilience on a rate-limited platform</b></summary>

<br/>

Running an automated account on Twitter is an adversarial-environment problem, and the interesting engineering is in behaving like a human client, not a script:

- **Keystroke timing** is drawn from a log-normal distribution (μ=5.19, σ=0.35, clamped 55–650 ms) fit to a **136M-keystroke public dataset** (Aalto, CHI 2018), with word-boundary motor pauses and faster common bigrams — statistically realistic typing instead of a constant delay.
- **Triple-mode client:** official API v2 for reads and most writes; a persistent-profile Playwright client (headful via Xvfb) only for the writes the API rejects — chosen at runtime, with graceful fallback.
- **Circuit breaker** trips after 3 posting failures in an hour (immediately on the platform's anti-automation "Error 226"), enters a 6-hour cooldown, and screenshots the failure page to an admin.
- **Operational discipline:** residential ISP session (one account, one IP), warm-up ramp, quiet hours, and per-user reply caps.

[`beef/src/twitter/playwright-twitter-client.ts`](beef/src/twitter/playwright-twitter-client.ts) · [`docs/autonomy-deployment-plan.md`](beef/docs/autonomy-deployment-plan.md)

</details>

---

## What the data said

The bot ran live for ~2.5 months, and its metrics were tracked in two dated reports. The most useful finding was an uncomfortable one — read out of its own telemetry, and acted on:

| Signal | Finding (directional — small account, March snapshots, not a causal claim) |
|---|---|
| **Replies beat broadcasting** | Replies averaged **~2× the impressions and ER** of original posts, across both snapshots. |
| **Volume hurt quality** | Week-over-week: posting **+142%** → engagement rate **−62%**. A per-day cap was added after this. |
| **Length has a sweet spot** | 80–150 char roasts landed **~4.3% ER** vs **0.35%** for 200+ char ones. |
| **Timing is real** | 12–14h & 18–22h UTC best; 03–07 UTC a dead zone (0% ER). |

The account stayed small — this was built as an engineering exercise, not a growth play, and the honest read of "more posting made it worse" is exactly why it was paused rather than scaled.

<sub>Source: [`metrics-report-2026-03-26.md`](beef/docs/metrics-report-2026-03-26.md), [`metrics-report-2026-03-29.md`](beef/docs/metrics-report-2026-03-29.md).</sub>

---

## The web layer

Two shipped React/static surfaces at [**0xbeef.wtf**](https://0xbeef.wtf) — a strict-TypeScript app with offline degradation, a typed activity-feed contract, and a serverless image renderer, all under one "Bloomberg-terminal-meets-butcher-shop" identity (IBM Plex Mono + Zilla Slab, blood-red on near-black).

<table>
<tr>
<td width="50%" valign="top" align="center">
<img src="docs/assets/app-diary.jpg" alt="Web app — the bot's live activity diary" width="100%"/>
<br/><sub><b>The bot diary</b> — React 19 app that streams the agent's live thoughts char-by-char, with deterministic mid-thought "corrections", polling a typed JSON feed and degrading gracefully offline</sub>
</td>
<td width="50%" valign="top" align="center">
<img src="docs/assets/forensic-card.jpg" alt="Generated forensic-data card" width="100%"/>
<br/><sub><b>Card renderer</b> — JSX → satori → resvg → sharp, no browser and no server: <code>generateCard(data)</code> returns a PNG <code>Buffer</code> ready to attach to a tweet, across 6 card types</sub>
</td>
</tr>
</table>

The landing is a single 2,400-line static file with a live "submit to audit" terminal. Design tokens are deliberately duplicated across three runtimes that can't share them (CSS variables for the app, a JS object for the satori renderer, inline styles for the build-less landing) — all pinned to the same hex values.

---

## Tech stack

| Layer | Choice |
|---|---|
| **Language** | TypeScript 5.7, ESM, strict + `noUncheckedIndexedAccess` + `noImplicitReturns` |
| **Runtime** | Node ≥20, PM2, `tsx` |
| **LLM engine** | `claude` CLI subprocess (primary) · `codex` CLI · `@anthropic-ai/sdk` · OpenAI Whisper |
| **Twitter** | `twitter-api-v2` · `@the-convocation/twitter-scraper` (patched) · `patchright` · `cycletls` |
| **Storage** | `better-sqlite3` (WAL) · 30 tables · 3 FTS5 virtual tables · hand-rolled migration runner |
| **Bot / infra** | `grammy` (Telegram) · `cron` · `viem` (Base) · `zod` boundary validation · `pino` |
| **Web** | React 19 · Vite 6 · satori · resvg · sharp · CSS Modules |
| **Quality** | Vitest (590 tests, 28 specs) · ESLint 9 flat + `no-floating-promises` · Prettier · Husky |

---

## Engineering rigor

Enforced in CI and pre-commit, not decoration:

- **Strict TypeScript everywhere**, no loosening. `unknown` over `any`, typed errors, declared return types.
- **590 tests / 28 spec files**, Vitest, `clearMocks`; every `mockResolvedValue` pairs with a rejection test.
- **`no-floating-promises` as an error** — every promise awaited or explicitly voided.
- **Zod validates all env at boot** with cross-field gating (production requires the full Twitter credential set; hybrid mode requires proxy + profile) — fails fast with a formatted report, never three modules deep.
- **Graceful shutdown** drains in-flight LLM subprocesses (bounded wait) before closing SQLite, in a `finally`.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs typecheck + lint + tests for the bot and typecheck + build for the web on every push.

<details>
<summary><b>Repo layout</b></summary>

<br/>

```
twitter-agents/
├── beef/                  # 🤖 the bot — 38k LOC TypeScript
│   ├── src/
│   │   ├── agent/         # LLM providers + ProviderManager (3-tier fallback)
│   │   ├── roast/         # prompt builder, engine, creative memory
│   │   ├── evaluation/    # 5-judge panel, weighted vote, vetoes, pre-filter
│   │   ├── farm/          # offline batch generation + blind human review
│   │   ├── twitter/       # API / scraper / stealth-Playwright clients
│   │   ├── reply-guy/     # proactive reply pipeline
│   │   ├── monitor/ news/ # timeline + news-thread pipelines
│   │   ├── queue/ scheduler/ storage/   # SQLite queue, jitter, repositories
│   │   ├── learning/      # engagement tracking + feedback → prompt loop
│   │   └── admin/ health/ # Telegram admin bot, health monitor
│   ├── characters/        # bot personality definition
│   └── docs/              # architecture, playbooks, audits, metrics reports
├── beef-web/              # 🎨 landing + React app + card renderer
└── docs/assets/           # README media
```

The bot exposes several generation entry points (`roast`, `roast_fast`, `roast_max`, `roasttweet`) — these are latency/quality tiers of the same engine sharing one prompt builder and evaluator, not duplicated logic.

</details>

---

## Getting started

> Reads work with cookie auth; posting on a fresh account needs the browser path (see [`beef/CLAUDE.md`](beef/CLAUDE.md)). Runs fully in `DRY_RUN` without ever touching Twitter.

```bash
# The bot
cd beef
pnpm install
cp .env.example .env          # fill in Twitter creds + Telegram token
pnpm typecheck && pnpm test   # 590 tests, ~3s
DRY_RUN=true pnpm dev         # full pipeline, nothing posted

pnpm farm generate            # offline: batch-generate & self-score roasts
pnpm metrics                  # pull & analyze Twitter performance

# The web app
cd ../beef-web
pnpm install
pnpm dev                      # localhost:5173
pnpm generate-card            # render a roast card to a PNG
```

---

## Status

**Paused (June 2026).** It ran, it posted, the telemetry said scaling it wasn't worth it, so it was stopped rather than propped up. The code is the artifact — a working, tested, honestly-measured autonomous agent, kept here as a portfolio piece.

<div align="center">
<br/>
<sub>Built by <a href="https://github.com/nikitacometa">Nikita Gorokhov</a> · <a href="LICENSE">MIT</a> · <a href="https://twitter.com/0xBeefer">@0xBeefer</a> · <a href="https://0xbeef.wtf">0xbeef.wtf</a></sub>
</div>
