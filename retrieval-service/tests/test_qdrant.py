import os

import pytest

from retrieval.store import QdrantStore


@pytest.mark.qdrant
@pytest.mark.skipif(not os.getenv("QDRANT_URL"), reason="QDRANT_URL is not configured")
def test_qdrant_store_smoke() -> None:
    store = QdrantStore(os.environ["QDRANT_URL"], dimension=256, collection_name="beef_test")
    assert store.name == "qdrant"
    assert store.count() >= 0
    store.close()
