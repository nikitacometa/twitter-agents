"""Lexical/vector retrieval and Reciprocal Rank Fusion."""

from dataclasses import dataclass
from typing import Literal

from retrieval.models import Document, DocumentKind, SearchMode
from retrieval.store import ScoredDocument, VectorStore


@dataclass(frozen=True, slots=True)
class RetrievalHit:
    document: Document
    score: float
    lexical_rank: int | None = None
    vector_rank: int | None = None


def reciprocal_rank_fusion(
    lexical: list[ScoredDocument],
    vector: list[ScoredDocument],
    rank_constant: int = 60,
) -> list[RetrievalHit]:
    """Fuse ranked lists using RRF, with deterministic document-id tie breaking."""

    if rank_constant < 0:
        raise ValueError("rank_constant must be non-negative")

    documents: dict[str, Document] = {}
    scores: dict[str, float] = {}
    lexical_ranks: dict[str, int] = {}
    vector_ranks: dict[str, int] = {}

    for source, ranks in (("lexical", lexical), ("vector", vector)):
        seen: set[str] = set()
        for rank, item in enumerate(ranks, start=1):
            document_id = item.document.id
            if document_id in seen:
                continue
            seen.add(document_id)
            documents.setdefault(document_id, item.document)
            scores[document_id] = scores.get(document_id, 0.0) + 1.0 / (
                rank_constant + rank
            )
            if source == "lexical":
                lexical_ranks[document_id] = rank
            else:
                vector_ranks[document_id] = rank

    hits = [
        RetrievalHit(
            document=document,
            score=scores[document_id],
            lexical_rank=lexical_ranks.get(document_id),
            vector_rank=vector_ranks.get(document_id),
        )
        for document_id, document in documents.items()
    ]
    hits.sort(key=lambda hit: (-hit.score, hit.document.id))
    return hits


class HybridRetriever:
    def __init__(self, store: VectorStore) -> None:
        self._store = store

    def search(
        self,
        query: str,
        embedding: list[float] | None,
        k: int,
        mode: SearchMode,
        kind: DocumentKind | None = None,
        target: str | None = None,
    ) -> list[RetrievalHit]:
        candidate_limit = min(100, max(20, k * 3))
        lexical: list[ScoredDocument] = []
        vector: list[ScoredDocument] = []
        if mode in ("hybrid", "lexical"):
            lexical = self._store.lexical_search(query, candidate_limit, kind, target)
        if mode in ("hybrid", "vector"):
            if embedding is None:
                raise ValueError("an embedding is required for vector retrieval")
            vector = self._store.vector_search(embedding, candidate_limit, kind, target)

        if mode == "hybrid":
            return reciprocal_rank_fusion(lexical, vector)[:k]
        source: Literal["lexical", "vector"] = mode
        ranking = lexical if source == "lexical" else vector
        return [
            RetrievalHit(
                document=item.document,
                score=item.score,
                lexical_rank=rank if source == "lexical" else None,
                vector_rank=rank if source == "vector" else None,
            )
            for rank, item in enumerate(ranking[:k], start=1)
        ]

