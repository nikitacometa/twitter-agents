import pytest

from retrieval.hybrid import HybridRetriever, reciprocal_rank_fusion
from retrieval.models import Document
from retrieval.store import ScoredDocument, SqliteVectorStore


def scored(document_id: str, score: float = 1.0) -> ScoredDocument:
    return ScoredDocument(
        Document(id=document_id, text=f"text for {document_id}", kind="roast"), score
    )


def test_rrf_math_is_exact() -> None:
    hits = reciprocal_rank_fusion([scored("a"), scored("b")], [scored("b"), scored("c")])
    by_id = {hit.document.id: hit for hit in hits}
    assert by_id["a"].score == 1 / 61
    assert by_id["b"].score == 1 / 62 + 1 / 61
    assert by_id["c"].score == 1 / 62
    assert hits[0].document.id == "b"


def test_rrf_records_source_ranks() -> None:
    hit = reciprocal_rank_fusion([scored("a")], [scored("a")])[0]
    assert hit.lexical_rank == 1
    assert hit.vector_rank == 1


def test_rrf_deduplicates_repeated_ids_within_a_source() -> None:
    hits = reciprocal_rank_fusion([scored("a"), scored("a")], [])
    assert len(hits) == 1
    assert hits[0].score == 1 / 61


def test_rrf_uses_stable_id_order_for_ties() -> None:
    hits = reciprocal_rank_fusion([scored("b"), scored("a")], [scored("a"), scored("b")])
    assert [hit.document.id for hit in hits] == ["a", "b"]


def test_rrf_rejects_negative_rank_constant() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        reciprocal_rank_fusion([], [], rank_constant=-1)


def test_vector_mode_requires_an_embedding(tmp_path: object) -> None:
    store = SqliteVectorStore(":memory:")
    retriever = HybridRetriever(store)
    with pytest.raises(ValueError, match="embedding"):
        retriever.search("query", None, 10, "vector")
    store.close()

