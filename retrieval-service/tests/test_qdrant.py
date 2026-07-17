import os

import pytest

from retrieval.models import Document
from retrieval.store import QdrantStore, _document_payload


@pytest.mark.parametrize(
    ("target", "expected"),
    [("CarDano", "cardano"), (None, None)],
)
def test_document_payload_casefolds_target(target: str | None, expected: str | None) -> None:
    document = Document(id="one", text="target payload", kind="research", target=target)

    payload = _document_payload(document, "test-model")

    assert payload["target"] == target
    assert payload["target_casefold"] == expected


@pytest.mark.qdrant
@pytest.mark.skipif(not os.getenv("QDRANT_URL"), reason="QDRANT_URL is not configured")
def test_qdrant_store_smoke() -> None:
    store = QdrantStore(os.environ["QDRANT_URL"], dimension=256, collection_name="beef_test")
    assert store.name == "qdrant"
    assert store.count() >= 0
    store.close()
