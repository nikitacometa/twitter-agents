from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from retrieval.config import Settings
from retrieval.embedder import HashEmbedder
from retrieval.main import create_app
from retrieval.store import SqliteVectorStore


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    store = SqliteVectorStore(tmp_path / "retrieval.db")
    settings = Settings(RETRIEVAL_DB_PATH=tmp_path / "unused.db", EMBEDDER="hash")
    app = create_app(settings, store=store, embedder=HashEmbedder())
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def sample_documents() -> list[dict[str, object]]:
    return [
        {
            "id": "roast-cardano-revenue",
            "text": "Cardano annual revenue is a peer-reviewed lemonade stand.",
            "kind": "roast",
            "target": "Cardano",
            "score": 4.7,
        },
        {
            "id": "research-cardano-revenue",
            "text": "Cardano generated low fee revenue relative to its market capitalization.",
            "kind": "research",
            "target": "Cardano",
        },
        {
            "id": "tweet-solana-uptime",
            "text": "Solana validators reported another period of degraded uptime.",
            "kind": "tweet",
            "target": "Solana",
        },
    ]

