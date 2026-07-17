"""FastAPI routes for corpus ingestion and retrieval."""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Body, HTTPException, status

from retrieval.embedder import Embedder, EmbedderError
from retrieval.hybrid import HybridRetriever
from retrieval.models import (
    MAX_DOCUMENTS_PER_BATCH,
    Document,
    DuplicateHit,
    HealthResponse,
    IngestResponse,
    SearchHit,
    SearchRequest,
    SearchResponse,
    SimilarRequest,
    SimilarResponse,
    SourceScores,
)
from retrieval.store import StoreError, VectorStore

LOGGER = logging.getLogger(__name__)

DocumentBatch = Annotated[
    list[Document], Body(min_length=1, max_length=MAX_DOCUMENTS_PER_BATCH)
]


@dataclass(frozen=True, slots=True)
class Services:
    store: VectorStore
    embedder: Embedder


def _service_unavailable(operation: str, error: Exception) -> HTTPException:
    LOGGER.error(
        "retrieval operation failed",
        extra={"operation": operation, "error_type": type(error).__name__},
    )
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"{operation} is temporarily unavailable",
    )


def _validate_embeddings(embeddings: Sequence[Sequence[float]], services: Services) -> None:
    if any(len(embedding) != services.embedder.dimension for embedding in embeddings):
        raise EmbedderError(
            f"embedder returned a vector with a dimension other than {services.embedder.dimension}"
        )


def create_router(services: Services) -> APIRouter:
    router = APIRouter()
    retriever = HybridRetriever(services.store)

    @router.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        try:
            documents = services.store.count()
        except StoreError as error:
            raise _service_unavailable("health check", error) from error
        return HealthResponse(
            store=services.store.name,
            embedder=services.embedder.model,
            documents=documents,
        )

    @router.post("/documents", response_model=IngestResponse)
    async def ingest_documents(documents: DocumentBatch) -> IngestResponse:
        try:
            plan = services.store.prepare_upsert(documents, services.embedder.model)
            embeddings = await services.embedder.embed([doc.text for doc in plan.documents])
            _validate_embeddings(embeddings, services)
            ingested = services.store.upsert(
                plan.documents, embeddings, services.embedder.model
            )
        except (EmbedderError, StoreError) as error:
            raise _service_unavailable("document ingestion", error) from error
        return IngestResponse(ingested=ingested, skipped=plan.skipped)

    @router.post("/search", response_model=SearchResponse)
    async def search(request: SearchRequest) -> SearchResponse:
        try:
            embedding: list[float] | None = None
            if request.mode != "lexical":
                vectors = await services.embedder.embed([request.query])
                _validate_embeddings(vectors, services)
                embedding = vectors[0]
            hits = retriever.search(
                query=request.query,
                embedding=embedding,
                k=request.k,
                mode=request.mode,
                kind=request.kind,
                target=request.target,
            )
        except (EmbedderError, StoreError) as error:
            raise _service_unavailable("search", error) from error
        return SearchResponse(
            hits=[
                SearchHit(
                    id=hit.document.id,
                    text=hit.document.text,
                    kind=hit.document.kind,
                    target=hit.document.target,
                    score=hit.score,
                    source_scores=SourceScores(
                        lexical_rank=hit.lexical_rank,
                        vector_rank=hit.vector_rank,
                    ),
                )
                for hit in hits
            ]
        )

    @router.post("/similar", response_model=SimilarResponse)
    async def similar(request: SimilarRequest) -> SimilarResponse:
        try:
            vectors = await services.embedder.embed([request.text])
            _validate_embeddings(vectors, services)
            candidates = services.store.vector_search(
                vectors[0], limit=100, kind=request.kind
            )
        except (EmbedderError, StoreError) as error:
            raise _service_unavailable("similarity search", error) from error
        return SimilarResponse(
            duplicates=[
                DuplicateHit(
                    id=item.document.id,
                    text=item.document.text,
                    similarity=item.score,
                )
                for item in candidates
                if item.score >= request.threshold
            ]
        )

    return router

