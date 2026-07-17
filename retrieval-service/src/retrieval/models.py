"""Validated HTTP and storage models."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

DocumentKind = Literal["roast", "research", "tweet"]
SearchMode = Literal["hybrid", "vector", "lexical"]

MAX_DOCUMENTS_PER_BATCH = 500
MAX_TEXT_LENGTH = 20_000


class Document(BaseModel):
    """A searchable item from the roast, research, or observed-tweet corpus."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    id: Annotated[str, Field(min_length=1, max_length=256)]
    text: Annotated[str, Field(min_length=1, max_length=MAX_TEXT_LENGTH)]
    kind: DocumentKind
    target: Annotated[str | None, Field(max_length=256)] = None
    score: Annotated[float | None, Field(allow_inf_nan=False)] = None
    created_at: datetime | None = None


class IngestResponse(BaseModel):
    ingested: int
    skipped: int


class SearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    query: Annotated[str, Field(min_length=1, max_length=5_000)]
    k: Annotated[int, Field(ge=1, le=100)] = 10
    mode: SearchMode = "hybrid"
    kind: DocumentKind | None = None
    target: Annotated[str | None, Field(max_length=256)] = None


class SourceScores(BaseModel):
    lexical_rank: int | None = None
    vector_rank: int | None = None


class SearchHit(BaseModel):
    id: str
    text: str
    kind: DocumentKind
    target: str | None
    score: float
    source_scores: SourceScores


class SearchResponse(BaseModel):
    hits: list[SearchHit]


class SimilarRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    text: Annotated[str, Field(min_length=1, max_length=MAX_TEXT_LENGTH)]
    threshold: Annotated[float, Field(ge=0.0, le=1.0)] = 0.83
    kind: DocumentKind | None = None


class DuplicateHit(BaseModel):
    id: str
    text: str
    similarity: float


class SimilarResponse(BaseModel):
    duplicates: list[DuplicateHit]


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    store: str
    embedder: str
    documents: int

