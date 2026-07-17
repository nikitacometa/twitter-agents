from collections.abc import Sequence
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from retrieval.config import Settings
from retrieval.embedder import HashEmbedder
from retrieval.main import create_app
from retrieval.store import SqliteVectorStore


def test_health_reports_backends_and_count(client: TestClient) -> None:
    assert client.get("/health").json() == {
        "status": "ok",
        "store": "sqlite",
        "embedder": "hash-256-v1",
        "documents": 0,
    }


def test_batch_ingestion(client: TestClient, sample_documents: list[dict[str, object]]) -> None:
    response = client.post("/documents", json=sample_documents)
    assert response.status_code == 200
    assert response.json() == {"ingested": 3, "skipped": 0}
    assert client.get("/health").json()["documents"] == 3


def test_idempotent_reingest(client: TestClient, sample_documents: list[dict[str, object]]) -> None:
    assert client.post("/documents", json=sample_documents).status_code == 200
    assert client.post("/documents", json=sample_documents).json() == {
        "ingested": 0,
        "skipped": 3,
    }


def test_bad_kind_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/documents", json=[{"id": "bad", "text": "text", "kind": "memo"}]
    )
    assert response.status_code == 422


def test_empty_batch_is_rejected(client: TestClient) -> None:
    assert client.post("/documents", json=[]).status_code == 422


def test_oversized_text_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/documents", json=[{"id": "long", "text": "x" * 20_001, "kind": "roast"}]
    )
    assert response.status_code == 422


def test_unknown_search_mode_is_rejected(client: TestClient) -> None:
    assert client.post("/search", json={"query": "fees", "mode": "magic"}).status_code == 422


def test_blank_query_is_rejected(client: TestClient) -> None:
    assert client.post("/search", json={"query": "   "}).status_code == 422


@pytest.mark.parametrize("k", [0, 101])
def test_search_k_bounds_are_enforced(client: TestClient, k: int) -> None:
    assert client.post("/search", json={"query": "fees", "k": k}).status_code == 422


def test_extra_request_fields_are_rejected(client: TestClient) -> None:
    response = client.post("/search", json={"query": "fees", "surprise": True})
    assert response.status_code == 422


def test_lexical_search(client: TestClient, sample_documents: list[dict[str, object]]) -> None:
    client.post("/documents", json=sample_documents)
    response = client.post(
        "/search", json={"query": "fee revenue", "mode": "lexical", "k": 2}
    )
    assert response.status_code == 200
    ids = [hit["id"] for hit in response.json()["hits"]]
    assert ids == ["research-cardano-revenue", "roast-cardano-revenue"]
    assert response.json()["hits"][0]["source_scores"] == {
        "lexical_rank": 1,
        "vector_rank": None,
    }


def test_vector_search(client: TestClient, sample_documents: list[dict[str, object]]) -> None:
    client.post("/documents", json=sample_documents)
    response = client.post(
        "/search", json={"query": "Solana validators uptime", "mode": "vector", "k": 1}
    )
    assert response.status_code == 200
    assert response.json()["hits"][0]["id"] == "tweet-solana-uptime"
    assert response.json()["hits"][0]["source_scores"]["vector_rank"] == 1


def test_hybrid_search_exposes_both_ranks(
    client: TestClient, sample_documents: list[dict[str, object]]
) -> None:
    client.post("/documents", json=sample_documents)
    response = client.post(
        "/search", json={"query": "Cardano fee revenue", "mode": "hybrid", "k": 3}
    )
    first = response.json()["hits"][0]
    assert first["id"] == "research-cardano-revenue"
    assert first["source_scores"]["lexical_rank"] is not None
    assert first["source_scores"]["vector_rank"] is not None


def test_search_filters_kind_and_target(
    client: TestClient, sample_documents: list[dict[str, object]]
) -> None:
    client.post("/documents", json=sample_documents)
    response = client.post(
        "/search",
        json={
            "query": "revenue",
            "mode": "lexical",
            "kind": "roast",
            "target": "cardano",
        },
    )
    assert [hit["id"] for hit in response.json()["hits"]] == ["roast-cardano-revenue"]


def test_similar_finds_exact_duplicate(
    client: TestClient, sample_documents: list[dict[str, object]]
) -> None:
    client.post("/documents", json=sample_documents)
    response = client.post(
        "/similar",
        json={
            "text": "Cardano annual revenue is a peer-reviewed lemonade stand.",
            "threshold": 0.99,
            "kind": "roast",
        },
    )
    assert response.status_code == 200
    assert response.json()["duplicates"][0]["id"] == "roast-cardano-revenue"


def test_similar_threshold_is_inclusive(client: TestClient) -> None:
    document = {"id": "same", "text": "protocol fee revenue", "kind": "research"}
    client.post("/documents", json=[document])
    response = client.post(
        "/similar", json={"text": "protocol fee revenue", "threshold": 1.0}
    )
    assert [hit["id"] for hit in response.json()["duplicates"]] == ["same"]


@pytest.mark.parametrize("threshold", [-0.01, 1.01])
def test_similar_threshold_bounds_are_enforced(
    client: TestClient, threshold: float
) -> None:
    response = client.post("/similar", json={"text": "protocol", "threshold": threshold})
    assert response.status_code == 422


def test_embedding_version_bump_reembeds_through_api(tmp_path: Path) -> None:
    path = tmp_path / "version-api.db"
    document = {"id": "one", "text": "Ethereum blob fees", "kind": "research"}

    first_store = SqliteVectorStore(path)
    first_app = create_app(store=first_store, embedder=HashEmbedder(version="v1"))
    with TestClient(first_app) as first_client:
        assert first_client.post("/documents", json=[document]).json()["ingested"] == 1

    second_store = SqliteVectorStore(path)
    second_app = create_app(store=second_store, embedder=HashEmbedder(version="v2"))
    with TestClient(second_app) as second_client:
        assert second_client.post("/documents", json=[document]).json() == {
            "ingested": 1,
            "skipped": 0,
        }


def test_openai_settings_without_key_fail_fast() -> None:
    with pytest.raises(ValidationError, match="OPENAI_API_KEY"):
        Settings(EMBEDDER="openai", OPENAI_API_KEY=None)


class WrongDimensionEmbedder:
    model = "wrong-dimension"
    dimension = 3

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [[1.0, 0.0] for _ in texts]


def test_embedder_dimension_failure_returns_503(tmp_path: Path) -> None:
    app = create_app(
        store=SqliteVectorStore(tmp_path / "bad-embedder.db"),
        embedder=WrongDimensionEmbedder(),
    )
    with TestClient(app) as test_client:
        response = test_client.post(
            "/documents", json=[{"id": "one", "text": "text", "kind": "roast"}]
        )
    assert response.status_code == 503
    assert response.json()["detail"] == "document ingestion is temporarily unavailable"
