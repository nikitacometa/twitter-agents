"""Vector-store contracts and SQLite/Qdrant implementations."""

import math
import re
import sqlite3
import struct
import threading
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast

from qdrant_client import QdrantClient
from qdrant_client import models as qmodels

from retrieval.models import Document, DocumentKind

FTS_TOKEN_PATTERN = re.compile(r"[^\W_]+", re.UNICODE)


class StoreError(RuntimeError):
    """A storage backend could not satisfy a request."""


@dataclass(frozen=True, slots=True)
class ScoredDocument:
    document: Document
    score: float


@dataclass(frozen=True, slots=True)
class UpsertPlan:
    documents: list[Document]
    skipped: int


class VectorStore(Protocol):
    @property
    def name(self) -> str: ...

    def prepare_upsert(self, documents: Sequence[Document], embedding_model: str) -> UpsertPlan: ...

    def upsert(
        self,
        documents: Sequence[Document],
        embeddings: Sequence[Sequence[float]],
        embedding_model: str,
    ) -> int: ...

    def lexical_search(
        self,
        query: str,
        limit: int,
        kind: DocumentKind | None = None,
        target: str | None = None,
    ) -> list[ScoredDocument]: ...

    def vector_search(
        self,
        embedding: Sequence[float],
        limit: int,
        kind: DocumentKind | None = None,
        target: str | None = None,
    ) -> list[ScoredDocument]: ...

    def count(self) -> int: ...

    def close(self) -> None: ...


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    if len(left) != len(right):
        raise ValueError("embedding dimensions do not match")
    dot = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0.0 or right_norm == 0.0:
        return 0.0
    return max(-1.0, min(1.0, dot / (left_norm * right_norm)))


def _created_at_text(document: Document) -> str | None:
    return document.created_at.isoformat() if document.created_at is not None else None


def _document_payload(document: Document, embedding_model: str) -> dict[str, object]:
    return {
        "id": document.id,
        "text": document.text,
        "kind": document.kind,
        "target": document.target,
        "target_casefold": document.target.casefold() if document.target is not None else None,
        "document_score": document.score,
        "created_at": _created_at_text(document),
        "embedding_model": embedding_model,
    }


class SqliteVectorStore:
    """SQLite FTS5 plus float32 embeddings in a single WAL-mode database."""

    def __init__(self, path: Path | str) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(self._path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        self._initialize()

    @property
    def name(self) -> str:
        return "sqlite"

    def _initialize(self) -> None:
        schema = """
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                text TEXT NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('roast', 'research', 'tweet')),
                target TEXT,
                document_score REAL,
                created_at TEXT,
                embedding BLOB NOT NULL,
                embedding_model TEXT NOT NULL
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                text,
                content='documents',
                content_rowid='rowid',
                tokenize='unicode61'
            );

            CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
                INSERT INTO documents_fts(rowid, text) VALUES (new.rowid, new.text);
            END;

            CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, text)
                VALUES ('delete', old.rowid, old.text);
            END;

            CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, text)
                VALUES ('delete', old.rowid, old.text);
                INSERT INTO documents_fts(rowid, text) VALUES (new.rowid, new.text);
            END;
        """
        try:
            with self._lock:
                self._connection.executescript(schema)
        except sqlite3.Error as error:
            raise StoreError(f"failed to initialize SQLite store: {error}") from error

    def prepare_upsert(self, documents: Sequence[Document], embedding_model: str) -> UpsertPlan:
        if not documents:
            return UpsertPlan(documents=[], skipped=0)
        placeholders = ",".join("?" for _ in documents)
        query = (
            "SELECT id, text, kind, target, document_score, created_at, embedding_model "
            f"FROM documents WHERE id IN ({placeholders})"
        )
        try:
            with self._lock:
                rows = self._connection.execute(query, [doc.id for doc in documents]).fetchall()
        except sqlite3.Error as error:
            raise StoreError(f"failed to inspect existing documents: {error}") from error

        existing = {cast(str, row["id"]): row for row in rows}
        changed: list[Document] = []
        skipped = 0
        for document in documents:
            row = existing.get(document.id)
            if row is not None and self._row_matches(row, document, embedding_model):
                skipped += 1
            else:
                changed.append(document)
        return UpsertPlan(documents=changed, skipped=skipped)

    @staticmethod
    def _row_matches(row: sqlite3.Row, document: Document, embedding_model: str) -> bool:
        return (
            cast(str, row["text"]) == document.text
            and cast(str, row["kind"]) == document.kind
            and cast(str | None, row["target"]) == document.target
            and cast(float | None, row["document_score"]) == document.score
            and cast(str | None, row["created_at"]) == _created_at_text(document)
            and cast(str, row["embedding_model"]) == embedding_model
        )

    def upsert(
        self,
        documents: Sequence[Document],
        embeddings: Sequence[Sequence[float]],
        embedding_model: str,
    ) -> int:
        if len(documents) != len(embeddings):
            raise ValueError("documents and embeddings must have equal lengths")
        rows = [
            (
                document.id,
                document.text,
                document.kind,
                document.target,
                document.score,
                _created_at_text(document),
                self._pack_embedding(embedding),
                embedding_model,
            )
            for document, embedding in zip(documents, embeddings, strict=True)
        ]
        statement = """
            INSERT INTO documents
                (id, text, kind, target, document_score, created_at, embedding, embedding_model)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                text=excluded.text,
                kind=excluded.kind,
                target=excluded.target,
                document_score=excluded.document_score,
                created_at=excluded.created_at,
                embedding=excluded.embedding,
                embedding_model=excluded.embedding_model
        """
        try:
            with self._lock, self._connection:
                self._connection.executemany(statement, rows)
        except sqlite3.Error as error:
            raise StoreError(f"failed to upsert documents: {error}") from error
        return len(rows)

    @staticmethod
    def _pack_embedding(embedding: Sequence[float]) -> bytes:
        if not embedding:
            raise ValueError("embedding must not be empty")
        return struct.pack(f"<{len(embedding)}f", *embedding)

    @staticmethod
    def _unpack_embedding(blob: bytes) -> tuple[float, ...]:
        if len(blob) % 4 != 0:
            raise StoreError("stored embedding has an invalid float32 byte length")
        return struct.unpack(f"<{len(blob) // 4}f", blob)

    def lexical_search(
        self,
        query: str,
        limit: int,
        kind: DocumentKind | None = None,
        target: str | None = None,
    ) -> list[ScoredDocument]:
        fts_query = self._safe_fts_query(query)
        if not fts_query:
            return []
        conditions = ["documents_fts MATCH ?"]
        parameters: list[object] = [fts_query]
        if kind is not None:
            conditions.append("d.kind = ?")
            parameters.append(kind)
        if target is not None:
            conditions.append("d.target = ? COLLATE NOCASE")
            parameters.append(target)
        parameters.append(limit)
        sql = f"""
            SELECT d.*, bm25(documents_fts) AS lexical_score
            FROM documents_fts
            JOIN documents d ON d.rowid = documents_fts.rowid
            WHERE {' AND '.join(conditions)}
            ORDER BY lexical_score ASC, d.id ASC
            LIMIT ?
        """
        try:
            with self._lock:
                rows = self._connection.execute(sql, parameters).fetchall()
        except sqlite3.Error as error:
            raise StoreError(f"lexical search failed: {error}") from error
        return [
            ScoredDocument(self._row_to_document(row), -float(row["lexical_score"]))
            for row in rows
        ]

    @staticmethod
    def _safe_fts_query(query: str) -> str:
        tokens = FTS_TOKEN_PATTERN.findall(query.casefold())
        return " OR ".join(f'"{token}"' for token in tokens)

    def vector_search(
        self,
        embedding: Sequence[float],
        limit: int,
        kind: DocumentKind | None = None,
        target: str | None = None,
    ) -> list[ScoredDocument]:
        conditions: list[str] = []
        parameters: list[object] = []
        if kind is not None:
            conditions.append("kind = ?")
            parameters.append(kind)
        if target is not None:
            conditions.append("target = ? COLLATE NOCASE")
            parameters.append(target)
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        try:
            with self._lock:
                rows = self._connection.execute(
                    f"SELECT * FROM documents {where}", parameters
                ).fetchall()
        except sqlite3.Error as error:
            raise StoreError(f"vector search failed: {error}") from error

        scored = [
            ScoredDocument(
                self._row_to_document(row),
                cosine_similarity(embedding, self._unpack_embedding(cast(bytes, row["embedding"]))),
            )
            for row in rows
        ]
        scored.sort(key=lambda item: (-item.score, item.document.id))
        return scored[:limit]

    @staticmethod
    def _row_to_document(row: sqlite3.Row) -> Document:
        return Document(
            id=row["id"],
            text=row["text"],
            kind=row["kind"],
            target=row["target"],
            score=row["document_score"],
            created_at=row["created_at"],
        )

    def count(self) -> int:
        try:
            with self._lock:
                row = self._connection.execute("SELECT COUNT(*) FROM documents").fetchone()
        except sqlite3.Error as error:
            raise StoreError(f"failed to count documents: {error}") from error
        if row is None:
            raise StoreError("document count returned no row")
        return int(row[0])

    def close(self) -> None:
        with self._lock:
            self._connection.close()


class QdrantStore:
    """Thin optional vector backend; lexical ranking remains a SQLite capability."""

    def __init__(
        self,
        url: str,
        dimension: int,
        collection_name: str = "beef_retrieval",
        lexical_path: Path | str | None = None,
    ) -> None:
        self._client = QdrantClient(url=url)
        self._dimension = dimension
        self._collection_name = collection_name
        self._lexical_store = (
            SqliteVectorStore(lexical_path) if lexical_path is not None else None
        )
        try:
            if not self._client.collection_exists(collection_name):
                self._client.create_collection(
                    collection_name=collection_name,
                    vectors_config=qmodels.VectorParams(
                        size=dimension, distance=qmodels.Distance.COSINE
                    ),
                )
        except Exception as error:
            raise StoreError(f"failed to initialize Qdrant store: {error}") from error

    @property
    def name(self) -> str:
        return "qdrant"

    def prepare_upsert(self, documents: Sequence[Document], embedding_model: str) -> UpsertPlan:
        # Comparing whole payloads (rather than a version field) also carries
        # schema evolution: a point written by an older payload shape can never
        # equal the current one, so it lands in `changed` and is rewritten in
        # full. Adding a payload key needs no separate migration step.
        if not documents:
            return UpsertPlan(documents=[], skipped=0)
        try:
            records = self._client.retrieve(
                collection_name=self._collection_name,
                ids=[self._point_id(document.id) for document in documents],
                with_payload=True,
                with_vectors=False,
            )
        except Exception as error:
            raise StoreError(f"failed to inspect Qdrant documents: {error}") from error
        payloads = {
            str((record.payload or {}).get("id")): record.payload or {} for record in records
        }
        changed_ids: set[str] = set()
        for document in documents:
            if payloads.get(document.id) != _document_payload(document, embedding_model):
                changed_ids.add(document.id)
        if self._lexical_store is not None:
            lexical_plan = self._lexical_store.prepare_upsert(documents, embedding_model)
            changed_ids.update(document.id for document in lexical_plan.documents)
        changed = [document for document in documents if document.id in changed_ids]
        return UpsertPlan(changed, len(documents) - len(changed))

    def upsert(
        self,
        documents: Sequence[Document],
        embeddings: Sequence[Sequence[float]],
        embedding_model: str,
    ) -> int:
        if len(documents) != len(embeddings):
            raise ValueError("documents and embeddings must have equal lengths")
        points = [
            qmodels.PointStruct(
                id=self._point_id(document.id),
                vector=list(embedding),
                payload=_document_payload(document, embedding_model),
            )
            for document, embedding in zip(documents, embeddings, strict=True)
        ]
        try:
            if points:
                self._client.upsert(collection_name=self._collection_name, points=points, wait=True)
        except Exception as error:
            raise StoreError(f"failed to upsert Qdrant documents: {error}") from error
        if self._lexical_store is not None:
            self._lexical_store.upsert(documents, embeddings, embedding_model)
        return len(points)

    def lexical_search(
        self,
        query: str,
        limit: int,
        kind: DocumentKind | None = None,
        target: str | None = None,
    ) -> list[ScoredDocument]:
        if self._lexical_store is None:
            return []
        return self._lexical_store.lexical_search(query, limit, kind, target)

    def vector_search(
        self,
        embedding: Sequence[float],
        limit: int,
        kind: DocumentKind | None = None,
        target: str | None = None,
    ) -> list[ScoredDocument]:
        conditions: list[qmodels.Condition] = []
        if kind is not None:
            conditions.append(
                qmodels.FieldCondition(key="kind", match=qmodels.MatchValue(value=kind))
            )
        if target is not None:
            conditions.append(
                qmodels.FieldCondition(
                    key="target_casefold", match=qmodels.MatchValue(value=target.casefold())
                )
            )
        query_filter = qmodels.Filter(must=conditions) if conditions else None
        try:
            response = self._client.query_points(
                collection_name=self._collection_name,
                query=list(embedding),
                query_filter=query_filter,
                limit=limit,
                with_payload=True,
            )
        except Exception as error:
            raise StoreError(f"Qdrant vector search failed: {error}") from error
        results: list[ScoredDocument] = []
        for point in response.points:
            payload = point.payload or {}
            results.append(
                ScoredDocument(
                    document=Document(
                        id=payload["id"],
                        text=payload["text"],
                        kind=payload["kind"],
                        target=payload.get("target"),
                        score=payload.get("document_score"),
                        created_at=payload.get("created_at"),
                    ),
                    score=float(point.score),
                )
            )
        results.sort(key=lambda item: (-item.score, item.document.id))
        return results

    def count(self) -> int:
        try:
            result = self._client.count(collection_name=self._collection_name, exact=True)
        except Exception as error:
            raise StoreError(f"failed to count Qdrant documents: {error}") from error
        return result.count

    @staticmethod
    def _point_id(document_id: str) -> str:
        # Qdrant accepts UUIDs or integers; corpus IDs are arbitrary stable strings.
        return str(uuid.uuid5(uuid.NAMESPACE_URL, f"beef-retrieval:{document_id}"))

    def close(self) -> None:
        try:
            self._client.close()
        finally:
            if self._lexical_store is not None:
                self._lexical_store.close()
