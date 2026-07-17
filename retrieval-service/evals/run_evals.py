"""Run the labeled retrieval set against lexical, vector, and hybrid modes."""

import argparse
import asyncio
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict

from retrieval.embedder import Embedder, HashEmbedder, OpenAIEmbedder
from retrieval.hybrid import HybridRetriever
from retrieval.models import Document, SearchMode
from retrieval.store import SqliteVectorStore


class GoldenCase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    query: str
    relevant_doc_ids: set[str]
    documents: list[Document]


@dataclass(frozen=True, slots=True)
class Metrics:
    recall_at_5: float
    recall_at_10: float
    mrr: float


def load_cases(path: Path) -> list[GoldenCase]:
    cases: list[GoldenCase] = []
    with path.open(encoding="utf-8") as golden_file:
        for line_number, line in enumerate(golden_file, start=1):
            if not line.strip():
                continue
            try:
                cases.append(GoldenCase.model_validate(json.loads(line)))
            except (json.JSONDecodeError, ValueError) as error:
                raise ValueError(f"invalid golden case at line {line_number}: {error}") from error
    if not cases:
        raise ValueError("golden set is empty")
    return cases


def build_embedder(backend: Literal["hash", "openai"]) -> Embedder:
    if backend == "hash":
        return HashEmbedder()
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required for --embedder openai")
    return OpenAIEmbedder(api_key=api_key)


def calculate_metrics(rankings: list[list[str]], cases: list[GoldenCase]) -> Metrics:
    recall_5 = 0.0
    recall_10 = 0.0
    reciprocal_ranks = 0.0
    for ranking, case in zip(rankings, cases, strict=True):
        relevant = case.relevant_doc_ids
        recall_5 += len(set(ranking[:5]) & relevant) / len(relevant)
        recall_10 += len(set(ranking[:10]) & relevant) / len(relevant)
        first_rank = next(
            (rank for rank, document_id in enumerate(ranking, start=1) if document_id in relevant),
            None,
        )
        if first_rank is not None:
            reciprocal_ranks += 1.0 / first_rank
    count = len(cases)
    return Metrics(recall_5 / count, recall_10 / count, reciprocal_ranks / count)


async def evaluate(golden_path: Path, backend: Literal["hash", "openai"]) -> dict[str, Metrics]:
    cases = load_cases(golden_path)
    embedder = build_embedder(backend)
    documents = {
        document.id: document for case in cases for document in case.documents
    }

    with tempfile.TemporaryDirectory(prefix="beef-retrieval-eval-") as directory:
        store = SqliteVectorStore(Path(directory) / "eval.db")
        corpus = list(documents.values())
        corpus_vectors = await embedder.embed([document.text for document in corpus])
        store.upsert(corpus, corpus_vectors, embedder.model)
        query_vectors = await embedder.embed([case.query for case in cases])
        retriever = HybridRetriever(store)

        results: dict[str, Metrics] = {}
        modes: tuple[SearchMode, ...] = ("lexical", "vector", "hybrid")
        for mode in modes:
            rankings: list[list[str]] = []
            for case, query_vector in zip(cases, query_vectors, strict=True):
                hits = retriever.search(
                    query=case.query,
                    embedding=None if mode == "lexical" else query_vector,
                    k=10,
                    mode=mode,
                )
                rankings.append([hit.document.id for hit in hits])
            results[mode] = calculate_metrics(rankings, cases)
        store.close()
    return results


def print_results(results: dict[str, Metrics]) -> None:
    print("Mode     Recall@5  Recall@10  MRR")
    print("-------  --------  ---------  -----")
    for mode in ("lexical", "vector", "hybrid"):
        metrics = results[mode]
        print(
            f"{mode:<7}  {metrics.recall_at_5:>8.3f}  "
            f"{metrics.recall_at_10:>9.3f}  {metrics.mrr:>5.3f}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--embedder", choices=("hash", "openai"), default="hash", help="embedding backend"
    )
    parser.add_argument(
        "--golden",
        type=Path,
        default=Path(__file__).with_name("golden.jsonl"),
        help="path to the labeled JSONL set",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    results = asyncio.run(evaluate(args.golden, args.embedder))
    print_results(results)


if __name__ == "__main__":
    main()
