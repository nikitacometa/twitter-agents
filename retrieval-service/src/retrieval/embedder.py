"""Embedding backends for production and deterministic offline use."""

import hashlib
import math
import re
from collections.abc import Sequence
from typing import Protocol

from openai import AsyncOpenAI, OpenAIError

TOKEN_PATTERN = re.compile(r"[^\W_]+", re.UNICODE)


class EmbedderError(RuntimeError):
    """An embedding backend could not satisfy a request."""


class Embedder(Protocol):
    @property
    def model(self) -> str: ...

    @property
    def dimension(self) -> int: ...

    async def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


class HashEmbedder:
    """Deterministic token hashing for offline development and tests.

    The vectors preserve token overlap but carry no learned semantic meaning.
    """

    def __init__(self, dimension: int = 256, version: str = "v1") -> None:
        if dimension <= 0:
            raise ValueError("dimension must be positive")
        self._dimension = dimension
        self._model = f"hash-{dimension}-{version}"

    @property
    def model(self) -> str:
        return self._model

    @property
    def dimension(self) -> int:
        return self._dimension

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._embed_one(text) for text in texts]

    def _embed_one(self, text: str) -> list[float]:
        vector = [0.0] * self._dimension
        tokens = TOKEN_PATTERN.findall(text.casefold())
        for token in tokens:
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=16).digest()
            bucket = int.from_bytes(digest[:8], "little") % self._dimension
            sign = 1.0 if digest[8] & 1 else -1.0
            vector[bucket] += sign

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0.0:
            return vector
        return [value / norm for value in vector]


class OpenAIEmbedder:
    """OpenAI text-embedding-3-small backend."""

    def __init__(
        self,
        api_key: str,
        model: str = "text-embedding-3-small",
        dimension: int = 1536,
    ) -> None:
        if not api_key:
            raise ValueError("api_key must not be empty")
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model
        self._dimension = dimension

    @property
    def model(self) -> str:
        return self._model

    @property
    def dimension(self) -> int:
        return self._dimension

    async def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            response = await self._client.embeddings.create(
                input=list(texts), model=self._model, dimensions=self._dimension
            )
        except OpenAIError as error:
            raise EmbedderError(f"OpenAI embedding request failed: {error}") from error
        ordered = sorted(response.data, key=lambda item: item.index)
        return [item.embedding for item in ordered]
