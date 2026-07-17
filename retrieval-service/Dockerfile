FROM ghcr.io/astral-sh/uv:0.11.26 AS uv

FROM python:3.12-slim AS builder

COPY --from=uv /uv /uvx /bin/
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

COPY pyproject.toml uv.lock README.md ./
COPY src ./src
# --no-editable matters: the default editable install only drops a .pth pointing
# at /app/src, which the runtime stage does not copy — the package must be built
# into site-packages so shipping .venv alone is sufficient.
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim AS runtime

RUN groupadd --system retrieval \
    && useradd --system --gid retrieval --home-dir /app retrieval \
    && mkdir -p /data \
    && chown retrieval:retrieval /data

WORKDIR /app
COPY --from=builder --chown=retrieval:retrieval /app/.venv /app/.venv

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    RETRIEVAL_DB_PATH=/data/retrieval.db

USER retrieval
EXPOSE 8000

CMD ["uvicorn", "retrieval.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]

