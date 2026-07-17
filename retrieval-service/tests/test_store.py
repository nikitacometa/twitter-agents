import asyncio
from datetime import UTC, datetime
from pathlib import Path

import pytest

from retrieval.embedder import HashEmbedder
from retrieval.models import Document
from retrieval.store import SqliteVectorStore, cosine_similarity


def vectors(embedder: HashEmbedder, documents: list[Document]) -> list[list[float]]:
    return asyncio.run(embedder.embed([document.text for document in documents]))


def insert(
    store: SqliteVectorStore,
    documents: list[Document],
    embedder: HashEmbedder | None = None,
) -> None:
    resolved = embedder or HashEmbedder()
    store.upsert(documents, vectors(resolved, documents), resolved.model)


def test_store_roundtrip_and_count(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "roundtrip.db")
    document = Document(id="one", text="Cardano fee revenue", kind="research")
    insert(store, [document])
    assert store.count() == 1
    assert store.lexical_search("fee revenue", 10)[0].document == document
    store.close()


def test_store_persists_across_reopen(tmp_path: Path) -> None:
    path = tmp_path / "persist.db"
    store = SqliteVectorStore(path)
    insert(store, [Document(id="one", text="Solana outage", kind="tweet")])
    store.close()
    reopened = SqliteVectorStore(path)
    assert reopened.count() == 1
    reopened.close()


def test_prepare_upsert_skips_identical_document(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "skip.db")
    document = Document(id="one", text="Base sequencer", kind="research", score=4.0)
    insert(store, [document])
    plan = store.prepare_upsert([document], HashEmbedder().model)
    assert plan.documents == []
    assert plan.skipped == 1
    store.close()


def test_embedding_version_bump_requires_reembed(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "version.db")
    old = HashEmbedder(version="v1")
    document = Document(id="one", text="Ethereum blobs", kind="research")
    insert(store, [document], old)
    plan = store.prepare_upsert([document], HashEmbedder(version="v2").model)
    assert plan.documents == [document]
    assert plan.skipped == 0
    store.close()


def test_metadata_change_requires_upsert(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "metadata.db")
    original = Document(id="one", text="protocol revenue", kind="research", target="Aave")
    insert(store, [original])
    changed = original.model_copy(update={"target": "Maker"})
    assert store.prepare_upsert([changed], HashEmbedder().model).documents == [changed]
    store.close()


def test_upsert_replaces_fts_content(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "replace.db")
    original = Document(id="one", text="Cardano lemonade stand", kind="roast")
    insert(store, [original])
    replacement = original.model_copy(update={"text": "Solana restart department"})
    insert(store, [replacement])
    assert store.lexical_search("lemonade", 10) == []
    assert store.lexical_search("restart", 10)[0].document.id == "one"
    store.close()


def test_lexical_search_handles_fts_syntax_as_plain_text(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "syntax.db")
    insert(store, [Document(id="one", text="token revenue collapse", kind="roast")])
    assert store.lexical_search('token OR "revenue" - collapse:*', 10)
    store.close()


def test_lexical_search_filters_kind_and_target_case_insensitively(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "filters.db")
    insert(
        store,
        [
            Document(id="roast", text="fee revenue", kind="roast", target="Cardano"),
            Document(id="research", text="fee revenue", kind="research", target="Cardano"),
        ],
    )
    hits = store.lexical_search("fee", 10, kind="research", target="cardano")
    assert [hit.document.id for hit in hits] == ["research"]
    store.close()


def test_vector_search_filters_and_ranks(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "vector.db")
    embedder = HashEmbedder()
    documents = [
        Document(id="exact", text="solana outage", kind="tweet", target="Solana"),
        Document(id="other", text="cardano revenue", kind="research", target="Cardano"),
    ]
    insert(store, documents, embedder)
    query = asyncio.run(embedder.embed(["solana outage"]))[0]
    hits = store.vector_search(query, 10, kind="tweet", target="solana")
    assert [hit.document.id for hit in hits] == ["exact"]
    assert hits[0].score == pytest.approx(1.0)
    store.close()


def test_vector_search_ties_are_stable_by_id(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "ties.db")
    documents = [
        Document(id="b", text="same", kind="roast"),
        Document(id="a", text="same", kind="roast"),
    ]
    insert(store, documents)
    query = asyncio.run(HashEmbedder().embed(["same"]))[0]
    assert [hit.document.id for hit in store.vector_search(query, 10)] == ["a", "b"]
    store.close()


def test_store_roundtrips_created_at(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "time.db")
    created_at = datetime(2026, 7, 17, 12, 0, tzinfo=UTC)
    document = Document(id="one", text="timed claim", kind="research", created_at=created_at)
    insert(store, [document])
    assert store.lexical_search("timed", 1)[0].document.created_at == created_at
    store.close()


def test_upsert_rejects_mismatched_lengths(tmp_path: Path) -> None:
    store = SqliteVectorStore(tmp_path / "length.db")
    document = Document(id="one", text="text", kind="roast")
    with pytest.raises(ValueError, match="equal lengths"):
        store.upsert([document], [], "hash")
    store.close()


def test_cosine_similarity_handles_zero_vector() -> None:
    assert cosine_similarity([0.0, 0.0], [1.0, 0.0]) == 0.0


def test_cosine_similarity_rejects_dimension_mismatch() -> None:
    with pytest.raises(ValueError, match="dimensions"):
        cosine_similarity([1.0], [1.0, 2.0])
