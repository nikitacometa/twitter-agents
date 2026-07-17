import asyncio
import math

import pytest

from retrieval.embedder import HashEmbedder


def embed(embedder: HashEmbedder, text: str) -> list[float]:
    return asyncio.run(embedder.embed([text]))[0]


def test_hash_embedder_is_deterministic() -> None:
    embedder = HashEmbedder()
    assert embed(embedder, "Base chain fees") == embed(embedder, "Base chain fees")


def test_hash_embedder_is_case_insensitive() -> None:
    embedder = HashEmbedder()
    assert embed(embedder, "CARDANO REVENUE") == embed(embedder, "cardano revenue")


def test_hash_embedder_returns_unit_vector() -> None:
    vector = embed(HashEmbedder(), "solana outage validator restart")
    assert math.sqrt(sum(value * value for value in vector)) == pytest.approx(1.0)


def test_hash_embedder_empty_tokens_return_zero_vector() -> None:
    vector = embed(HashEmbedder(dimension=8), "___ !!!")
    assert vector == [0.0] * 8


def test_hash_embedder_model_contains_dimension_and_version() -> None:
    assert HashEmbedder(dimension=32, version="v9").model == "hash-32-v9"


def test_hash_embedder_rejects_invalid_dimension() -> None:
    with pytest.raises(ValueError, match="positive"):
        HashEmbedder(dimension=0)


def test_hash_embedder_embeds_a_batch() -> None:
    vectors = asyncio.run(HashEmbedder(dimension=16).embed(["one", "two", "three"]))
    assert len(vectors) == 3
    assert all(len(vector) == 16 for vector in vectors)

