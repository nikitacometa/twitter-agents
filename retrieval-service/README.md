# $BEEF retrieval service

This service is the semantic retrieval leg of the [$BEEF system](../beef). It indexes roasts,
research claims, and observed tweets, then exposes lexical BM25, vector cosine, and hybrid search
over HTTP. Hybrid results combine the two ranked lists with Reciprocal Rank Fusion (RRF). The Node
orchestrator treats this service as optional and falls back to its local FTS5 duplicate detection
when retrieval is unavailable.

## Architecture

```text
Node orchestrator
      │ HTTP
      ▼
FastAPI validation ──► Embedder protocol ──► Hash (offline) / OpenAI
      │
      ▼
Hybrid retriever ──► FTS5 BM25 ─┐
      │                          ├─► RRF ─► ranked hits
      └──────────► cosine ───────┘
                     │
                     ▼
          VectorStore protocol
             ├─ SQLite (default)
             └─ Qdrant (optional swap)
```

The SQLite backend stores document metadata, an external-content FTS5 index, and packed float32
embeddings in one WAL-mode database. `EMBEDDING_MODEL` is stored per document; an otherwise
unchanged document is re-embedded when that version changes.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Backend names and indexed document count |
| `POST` | `/documents` | Idempotent batch upsert of roast, research, or tweet documents |
| `POST` | `/search` | Lexical, vector, or RRF-fused hybrid retrieval |
| `POST` | `/similar` | Semantic near-duplicate detection with an inclusive threshold |

Documents use `{id, text, kind, target?, score?, created_at?}`, where `kind` is `roast`,
`research`, or `tweet`. Search accepts `{query, k, mode, kind?, target?}`. See the generated
FastAPI schema at `/docs` for validation bounds and complete response shapes.

## Quickstart

Python 3.12 and [`uv`](https://docs.astral.sh/uv/) are required.

```bash
uv sync
uv run uvicorn retrieval.main:create_app --factory --reload
```

The default `HashEmbedder` is deterministic and offline, which makes local plumbing easy to test.
It only preserves token overlap; it is not a meaningful semantic model. For real semantic search:

```bash
EMBEDDER=openai OPENAI_API_KEY=... \
  uv run uvicorn retrieval.main:create_app --factory --host 0.0.0.0 --port 8000
```

Configuration is environment-driven:

| Variable | Default | Meaning |
| --- | --- | --- |
| `RETRIEVAL_DB_PATH` | `data/retrieval.db` | SQLite database path |
| `EMBEDDER` | `hash` | `hash` or `openai` |
| `OPENAI_API_KEY` | unset | Required when `EMBEDDER=openai` |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Stored embedding model/version |
| `QDRANT_URL` | unset | Use the optional Qdrant vector backend |

Build the production image with:

```bash
docker build -t beef-retrieval .
```

The image uses a frozen `uv.lock`, copies only the production virtual environment into a slim
runtime stage, and runs as an unprivileged user. Mount `/data` for the default database.

## Why SQLite brute-force and not a hosted vector DB

The expected corpus is roughly 1,000-10,000 rows. A 1,536-dimensional float32 vector is about
6 KiB, so 10,000 vectors are roughly 59 MiB before metadata. Loading and scanning that locally is
simple, predictable, and usually cheaper than adding a network hop and operating another service.
At this size, brute-force cosine also avoids index build and tuning costs.

This is a scale-specific decision, not a claim that brute force scales indefinitely. Around
100,000 rows, the scan cost and memory footprint become material. `VectorStore` is the explicit
swap seam, and `QdrantStore` is the thin optional production path. SQLite remains the full
BM25-plus-vector default; when Qdrant is configured, it supplies vector ranking while a SQLite
sidecar retains the small, dependable FTS5/BM25 leg needed for hybrid retrieval.

## Evaluations

`evals/golden.jsonl` contains roast-domain queries and relevant document IDs covering crypto
projects, research claims, and recurring roast angles. The runner builds an isolated corpus from
that file and compares lexical, vector, and hybrid retrieval.

```bash
# Offline plumbing check; these vectors are not semantically meaningful.
uv run python evals/run_evals.py --embedder hash

# Manual semantic-quality run; requires a network call and an API key.
OPENAI_API_KEY=... uv run python evals/run_evals.py --embedder openai
```

- **Recall@5 / Recall@10**: the fraction of labeled relevant documents present in the first 5 or
  10 results, averaged across queries.
- **MRR**: the mean reciprocal rank of the first relevant result; it rewards putting a useful
  roast or claim near the top.

Measured on the 20-query golden set with `text-embedding-3-small`:

| Mode | Recall@5 | Recall@10 | MRR |
| --- | ---: | ---: | ---: |
| Lexical | 0.900 | 0.900 | 0.842 |
| Vector | **1.000** | **1.000** | **0.975** |
| Hybrid | 0.950 | **1.000** | 0.931 |

**Vector beats hybrid here, and that is worth stating plainly rather than hiding.** The golden set is
deliberately paraphrase-heavy — it asks "project valued in billions despite tiny annual fee revenue"
and expects a document that never uses those words. That is the case embeddings win outright, so
fusing in a weaker lexical ranking only costs RRF rank positions.

The default stays `hybrid` regardless, because the queries this service sees in production are not
all paraphrases: tickers (`$BEEF`), handles (`@0xBeefer`), and contract addresses are exact-token
lookups where BM25 is strictly better and an embedding of a hex string is noise. Hybrid trades a
little measured MRR on paraphrase queries for robustness on the token-exact ones the golden set
under-represents. Extending the set with ticker/handle queries is the obvious next measurement — if
hybrid does not win there, the honest move is to route by query shape instead of fusing blindly.

## Testing and quality

The test suite contains 49 passing cases covering validation failures, SQLite round trips,
filtering, exact RRF math, similarity thresholds, idempotency, and embedding-version changes. All
normal tests use `HashEmbedder`, temporary SQLite databases, and no network calls. The live Qdrant
smoke test is the one additional skipped case unless `QDRANT_URL` is explicitly set.

```bash
uv run ruff check .
uv run mypy src
uv run pytest -q
```

Mypy runs in strict mode, Ruff uses a 100-character line limit, and the test suite performs no
implicit downloads or API requests.
