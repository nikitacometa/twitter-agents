"""Application factory and local uvicorn entry point."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from retrieval.api import Services, create_router
from retrieval.config import Settings
from retrieval.embedder import Embedder, HashEmbedder, OpenAIEmbedder
from retrieval.store import QdrantStore, SqliteVectorStore, VectorStore

LOGGER = logging.getLogger(__name__)


def _build_embedder(settings: Settings) -> Embedder:
    if settings.embedder == "hash":
        return HashEmbedder()
    if settings.openai_api_key is None:
        # Settings validates this; the guard keeps the dependency boundary explicit for mypy.
        raise ValueError("OPENAI_API_KEY is required when EMBEDDER=openai")
    return OpenAIEmbedder(
        api_key=settings.openai_api_key.get_secret_value(),
        model=settings.embedding_model,
    )


def create_app(
    settings: Settings | None = None,
    *,
    store: VectorStore | None = None,
    embedder: Embedder | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings()
    resolved_embedder = embedder or _build_embedder(resolved_settings)
    resolved_store = store or (
        QdrantStore(
            resolved_settings.qdrant_url,
            resolved_embedder.dimension,
            lexical_path=resolved_settings.db_path,
        )
        if resolved_settings.qdrant_url
        else SqliteVectorStore(resolved_settings.db_path)
    )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        LOGGER.info(
            "retrieval service started",
            extra={"store": resolved_store.name, "embedder": resolved_embedder.model},
        )
        yield
        resolved_store.close()

    app = FastAPI(
        title="$BEEF retrieval service",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.include_router(create_router(Services(resolved_store, resolved_embedder)))
    return app


def run() -> None:
    logging.basicConfig(level=logging.INFO)
    uvicorn.run("retrieval.main:create_app", factory=True, host="0.0.0.0", port=8000)


if __name__ == "__main__":
    run()
