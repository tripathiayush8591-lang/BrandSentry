"""Evidence retrieval over approved knowledge (Phase 3A RAG foundation).

Keyword retrieval via SQLite FTS5 (external-content table kept in sync by
triggers). This is **lexical** search: it matches terms, not meaning —
paraphrases that share no vocabulary will honestly return no results, and
nothing here claims semantic understanding. The :class:`RetrievalService`
protocol exists so a semantic implementation can be added later behind the
same interface without touching callers (Phase 3B consumes it).

Every query is workspace-scoped and restricted to the active version of
documents whose status is ``approved``; pending, rejected, deleted and
superseded content can never surface as evidence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class RetrievedChunk:
    chunk_id: str
    document_id: str
    document_title: str
    doc_type: str
    version: int
    section_ref: str
    page_number: int | None
    page_end: int | None
    text: str
    score: float


class RetrievalService(Protocol):
    """Interface so semantic retrieval can slot in later (no caller changes)."""

    def search(
        self, db: Session, *, workspace_id: str, query: str, top_k: int
    ) -> list[RetrievedChunk]: ...


_FTS_RESERVED = {"and", "or", "not", "near"}


def build_fts_query(query: str, max_terms: int = 24) -> str:
    """Sanitise user input into a safe FTS5 MATCH expression.

    Only word characters survive; everything else (quotes, asterisks,
    parentheses, hyphens) is dropped, and FTS5 boolean/NEAR keywords are
    filtered out, so user input can never alter query structure or trigger
    FTS syntax errors.
    """
    tokens = [
        token
        for token in re.findall(r"\w+", query, re.UNICODE)[:max_terms]
        if token.lower() not in _FTS_RESERVED
    ]
    return " ".join(tokens).strip()


class FtsRetrievalService:
    """FTS5-backed implementation of :class:`RetrievalService`.

    Behaviour: run the query as an implicit AND of sanitised terms for
    precision; when nothing matches, fall back to OR for recall. Results are
    ranked by BM25 (higher ``score`` = more relevant; the value is the
    negated FTS5 bm25 rank). No matches / empty query -> empty list.
    """

    def search(
        self, db: Session, *, workspace_id: str, query: str, top_k: int
    ) -> list[RetrievedChunk]:
        match_expression = build_fts_query(query)
        if not match_expression:
            return []
        bounded_k = max(1, min(top_k, 10))

        results = self._run_match(db, workspace_id, match_expression, bounded_k)
        if not results:
            results = self._run_match(
                db, workspace_id, " OR ".join(match_expression.split()), bounded_k
            )
        return results

    def _run_match(
        self, db: Session, workspace_id: str, match_expression: str, limit: int
    ) -> list[RetrievedChunk]:
        rows = db.execute(
            sql_text(
                """
                SELECT c.id, c.document_id, d.title, d.doc_type, c.version,
                       c.section_ref, c.page_number, c.page_end, c.text,
                       bm25(knowledge_chunks_fts) AS rank
                FROM knowledge_chunks_fts f
                JOIN knowledge_chunks c ON c.rowid = f.rowid
                JOIN knowledge_documents d ON d.id = c.document_id
                WHERE knowledge_chunks_fts MATCH :match
                  AND c.workspace_id = :workspace_id
                  AND d.status = 'approved'
                  AND d.active_version = c.version
                ORDER BY rank
                LIMIT :limit
                """
            ),
            {"match": match_expression, "workspace_id": workspace_id, "limit": limit},
        ).mappings()
        return [
            RetrievedChunk(
                chunk_id=row["id"],
                document_id=row["document_id"],
                document_title=row["title"],
                doc_type=row["doc_type"],
                version=row["version"],
                section_ref=row["section_ref"],
                page_number=row["page_number"],
                page_end=row["page_end"],
                text=row["text"],
                score=round(-row["rank"], 4),
            )
            for row in rows
        ]
