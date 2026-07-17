# Twitter Agents

Umbrella repo for AI-powered Twitter agents in the crypto space. Each agent lives in its own subdirectory with independent configuration, characters, and deployment.

This repo is **public** — see the [README](README.md) for the full write-up. Never commit secrets, real IPs, server hostnames, or personal identifiers.

## Structure

```
twitter-agents/
├── beef/              # $BEEF — autonomous AI roast bot (Node/TypeScript)
│   ├── src/           # Orchestrator, LLM providers, evaluation panel, Twitter clients
│   ├── characters/    # Bot personality configuration
│   └── docs/          # Research, strategy, audits, metrics reports (many are historical)
├── beef-web/          # $BEEF web presence — landing + React app + card renderer
│   ├── public/        # Static landing pages (0xbeef.wtf)
│   └── src/           # Vite/React app + satori card templates
└── retrieval-service/ # Semantic retrieval (Python/FastAPI) — hybrid BM25+vector, RRF, evals
    ├── src/retrieval/ # API, embedders, vector stores, fusion
    └── evals/         # Golden set + recall@k / MRR runner
```

## Components

| Component | What it is | Status |
|-----------|-----------|--------|
| **$BEEF** | Autonomous roast agent — LLM orchestration, 5-judge eval panel, human-feedback learning loop | Paused (June 2026) |
| **$BEEF Web** | Landing + bot-diary app + card renderer — [0xbeef.wtf](https://0xbeef.wtf) | Live |
| **retrieval-service** | Optional semantic retrieval leg consumed by the bot over HTTP | Active |

**No token was ever launched and there is no financial mechanism.** Design docs under `beef/docs/` describing burn-to-request or challenge-staking mechanics are historical planning records, not descriptions of the system.

## Conventions

- Each component is self-contained with its own CLAUDE.md — see [`beef/CLAUDE.md`](beef/CLAUDE.md) for the bot's conventions and constraints
- The bot targets **Base chain** (L2) and uses a **reply-only** Twitter strategy (proactive tagging = ban risk)
- Commit messages: English, lowercase verb, single concise line, no AI attribution
- CI runs on every push: typecheck + lint + tests for the bot, `ruff` + `mypy --strict` + `pytest` for the retrieval service, typecheck + build for the web

## Toolchains

| Component | Commands |
|-----------|----------|
| `beef/` | `pnpm typecheck` · `pnpm lint:check` · `pnpm test` |
| `beef-web/` | `pnpm typecheck` · `pnpm build` |
| `retrieval-service/` | `uv run ruff check .` · `uv run mypy src` · `uv run pytest -q` |
