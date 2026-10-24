"""Phase 3A Brand Knowledge Vault endpoints under /api/v1/knowledge.

All endpoints require a live authenticated session scoped to exactly one
workspace; every query is filtered by that workspace server-side, so
cross-workspace retrieval is impossible by construction (same isolation
model as Phase 2A). Mutating endpoints require the session CSRF header.
Uploads and searches are rate-limited per actor (DB-backed, no Redis).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import select

from app.api.deps import AdminOnly, Author, CsrfVerified, CurrentActor, DbSession
from app.config import Settings
from app.db.models import (
    ApprovedClaim,
    BrandRule,
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeDocumentVersion,
)
from app.schemas.knowledge import (
    ApprovedClaimCreate,
    ApprovedClaimListResponse,
    ApprovedClaimOut,
    ApprovedClaimUpdate,
    BrandRuleCreate,
    BrandRuleListResponse,
    BrandRuleOut,
    BrandRuleUpdate,
    ChunkListResponse,
    ChunkOut,
    DocumentListResponse,
    KnowledgeDocumentDetailOut,
    KnowledgeDocumentOut,
    KnowledgeDocumentVersionOut,
    SearchResponse,
    UploadResult,
)
from app.services import knowledge as knowledge_service
from app.services import ratelimit
from app.services.identity import as_utc
from app.services.retrieval import FtsRetrievalService

router = APIRouter(tags=["knowledge"])

# Retrieval is behind a small abstraction so a semantic implementation can
# replace it later without changing callers (Phase 3B decision, ADR-007).
retrieval_service = FtsRetrievalService()


def _app_settings(request: Request) -> Settings:
    """The lifespan-configured Settings instance (respects per-test overrides)."""
    return request.app.state.settings


AppSettings = Annotated[Settings, Depends(_app_settings)]


def _require_workspace_document(
    db: DbSession, actor_workspace_id: str, document_id: str
) -> KnowledgeDocument:
    """404 (never 403) for other workspaces' documents: no existence leak."""
    document = db.get(KnowledgeDocument, document_id)
    if document is None or document.workspace_id != actor_workspace_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


def _document_out(document: KnowledgeDocument) -> KnowledgeDocumentOut:
    return KnowledgeDocumentOut(
        id=document.id,
        title=document.title,
        doc_type=document.doc_type,
        status=document.status,
        active_version=document.active_version,
        created_at=as_utc(document.created_at).isoformat(),
        updated_at=as_utc(document.updated_at).isoformat(),
    )


def _version_out(version: KnowledgeDocumentVersion) -> KnowledgeDocumentVersionOut:
    return KnowledgeDocumentVersionOut(
        id=version.id,
        version=version.version,
        original_filename=version.original_filename,
        content_type=version.content_type,
        checksum_sha256=version.checksum_sha256,
        size_bytes=version.size_bytes,
        page_count=version.page_count,
        extraction_status=version.extraction_status,
        created_by=version.created_by,
        created_at=as_utc(version.created_at).isoformat(),
    )


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


@router.post("/knowledge/documents", status_code=201, response_model=UploadResult)
def upload_document(
    db: DbSession,
    actor: Author,
    _csrf: CsrfVerified,
    settings: AppSettings,
    file: UploadFile,
    title: str | None = Form(default=None),
    doc_type: str = Form(default="source_document"),
) -> UploadResult:
    """Upload and ingest a UTF-8 text file or text-based PDF.

    The file is content-inspected (magic bytes + UTF-8 decode), never trusted
    by extension. Re-uploads of identical active content are idempotent.
    """
    try:
        ratelimit.check_rate_limit(
            db,
            scope=ratelimit.SCOPE_UPLOAD,
            key=actor.user.id,
            limit=settings.knowledge_uploads_per_hour,
        )
        # Read one byte beyond the cap so oversized input is rejected without
        # buffering an arbitrarily large upload in memory.
        raw = file.file.read(settings.knowledge_max_upload_bytes + 1)
    except ratelimit.RateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail="Upload rate limit reached. Please retry later.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc
    finally:
        file.file.close()

    if len(raw) > settings.knowledge_max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File exceeds the maximum allowed upload size of "
                f"{settings.knowledge_max_upload_bytes} bytes."
            ),
        )

    try:
        document, version_row, created = knowledge_service.ingest_document(
            db,
            settings,
            workspace_id=actor.workspace.id,
            created_by=actor.user.id,
            raw=raw,
            filename=file.filename,
            title=title,
            doc_type=doc_type,
        )
    except knowledge_service.IngestionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    chunk_count = len(
        db.scalars(
            select(KnowledgeChunk.id).where(
                KnowledgeChunk.document_id == document.id,
                KnowledgeChunk.version == version_row.version,
            )
        ).all()
    )
    return UploadResult(
        document=_document_out(document),
        version=_version_out(version_row),
        chunk_count=chunk_count,
        created_new_version=created,
    )


@router.get("/knowledge/documents", response_model=DocumentListResponse)
def list_documents(db: DbSession, actor: CurrentActor) -> DocumentListResponse:
    """Documents of the caller's workspace; deleted documents are hidden."""
    documents = db.scalars(
        select(KnowledgeDocument)
        .where(
            KnowledgeDocument.workspace_id == actor.workspace.id,
            KnowledgeDocument.status != "deleted",
        )
        .order_by(KnowledgeDocument.created_at.desc())
    ).all()
    return DocumentListResponse(documents=[_document_out(doc) for doc in documents])


@router.get("/knowledge/documents/{document_id}", response_model=KnowledgeDocumentDetailOut)
def get_document(
    db: DbSession, actor: CurrentActor, document_id: str
) -> KnowledgeDocumentDetailOut:
    document = _require_workspace_document(db, actor.workspace.id, document_id)
    detail = KnowledgeDocumentDetailOut(
        **_document_out(document).model_dump(),
        versions=[_version_out(v) for v in document.versions],
    )
    return detail


@router.get("/knowledge/documents/{document_id}/chunks", response_model=ChunkListResponse)
def list_chunks(
    db: DbSession,
    actor: CurrentActor,
    document_id: str,
    version: int | None = Query(default=None),
) -> ChunkListResponse:
    """Extracted chunks; defaults to the document's active version."""
    document = _require_workspace_document(db, actor.workspace.id, document_id)
    requested = version if version is not None else document.active_version
    if requested is None:
        return ChunkListResponse(chunks=[])
    chunks = db.scalars(
        select(KnowledgeChunk)
        .where(
            KnowledgeChunk.workspace_id == actor.workspace.id,
            KnowledgeChunk.document_id == document.id,
            KnowledgeChunk.version == requested,
        )
        .order_by(KnowledgeChunk.section_ref)
    ).all()
    return ChunkListResponse(
        chunks=[
            ChunkOut(
                id=chunk.id,
                document_id=chunk.document_id,
                version=chunk.version,
                section_ref=chunk.section_ref,
                page_number=chunk.page_number,
                page_end=chunk.page_end,
                text=chunk.text,
                char_offset=chunk.char_offset,
            )
            for chunk in chunks
        ]
    )


@router.post("/knowledge/documents/{document_id}/approve", response_model=KnowledgeDocumentOut)
def approve_document(
    db: DbSession,
    actor: AdminOnly,
    _csrf: CsrfVerified,
    document_id: str,
) -> KnowledgeDocumentOut:
    """Approve the document's active version so retrieval may surface it.

    Only server-side workspace admins may approve; creators and reviewers
    receive 403. A document without an ingested active version cannot be
    approved.
    """
    document = _require_workspace_document(db, actor.workspace.id, document_id)
    if document.active_version is None:
        raise HTTPException(status_code=409, detail="Document has no active version to approve")
    document.status = "approved"
    db.commit()
    return _document_out(document)


@router.delete("/knowledge/documents/{document_id}", status_code=204)
def delete_document(
    db: DbSession,
    actor: AdminOnly,
    _csrf: CsrfVerified,
    document_id: str,
) -> None:
    """Soft-delete a document; its chunks leave the search index immediately."""
    document = _require_workspace_document(db, actor.workspace.id, document_id)
    knowledge_service.delete_document(db, document)


# ---------------------------------------------------------------------------
# Brand rules
# ---------------------------------------------------------------------------


def _rule_out(rule: BrandRule) -> BrandRuleOut:
    return BrandRuleOut(
        id=rule.id,
        category=rule.category,
        name=rule.name,
        rule_text=rule.rule_text,
        matcher_type=rule.matcher_type,
        pattern=rule.pattern,
        replacement=rule.replacement,
        enabled=rule.enabled,
        version=rule.version,
        source_document_id=rule.source_document_id,
        source_section_ref=rule.source_section_ref,
        created_by=rule.created_by,
        created_at=as_utc(rule.created_at).isoformat(),
        updated_at=as_utc(rule.updated_at).isoformat(),
    )


@router.post("/knowledge/rules", status_code=201, response_model=BrandRuleOut)
def create_rule(
    body: BrandRuleCreate, db: DbSession, actor: AdminOnly, _csrf: CsrfVerified
) -> BrandRuleOut:
    """Create one explicit deterministic rule (admin only; never auto-extracted)."""
    _require_workspace_document_if_linked(db, actor.workspace.id, body.source_document_id)
    try:
        rule = knowledge_service.create_rule(
            db,
            workspace_id=actor.workspace.id,
            created_by=actor.user.id,
            category=body.category,
            name=body.name,
            rule_text=body.rule_text,
            pattern=body.pattern,
            matcher_type=body.matcher_type,
            replacement=body.replacement,
            source_document_id=body.source_document_id,
            source_section_ref=body.source_section_ref,
        )
    except knowledge_service.IngestionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return _rule_out(rule)


@router.get("/knowledge/rules", response_model=BrandRuleListResponse)
def list_rules(db: DbSession, actor: CurrentActor) -> BrandRuleListResponse:
    rules = db.scalars(
        select(BrandRule)
        .where(BrandRule.workspace_id == actor.workspace.id)
        .order_by(BrandRule.created_at.desc())
    ).all()
    return BrandRuleListResponse(rules=[_rule_out(rule) for rule in rules])


@router.patch("/knowledge/rules/{rule_id}", response_model=BrandRuleOut)
def update_rule(
    rule_id: str,
    body: BrandRuleUpdate,
    db: DbSession,
    actor: AdminOnly,
    _csrf: CsrfVerified,
) -> BrandRuleOut:
    """Update a rule; each update bumps the rule's version (audit trail)."""
    rule = _require_workspace_rule(db, actor.workspace.id, rule_id)
    changes = body.model_dump(exclude_unset=True)
    try:
        rule = knowledge_service.update_rule(db, rule, **changes)
    except knowledge_service.IngestionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return _rule_out(rule)


def _require_workspace_rule(db: DbSession, workspace_id: str, rule_id: str) -> BrandRule:
    rule = db.get(BrandRule, rule_id)
    if rule is None or rule.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


def _require_workspace_document_if_linked(
    db: DbSession, workspace_id: str, source_document_id: str | None
) -> None:
    """A rule/claim may only cite a document inside the same workspace."""
    if source_document_id is None:
        return
    document = db.get(KnowledgeDocument, source_document_id)
    if document is None or document.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Linked source document not found")


# ---------------------------------------------------------------------------
# Approved claims
# ---------------------------------------------------------------------------


def _claim_out(claim: ApprovedClaim) -> ApprovedClaimOut:
    return ApprovedClaimOut(
        id=claim.id,
        claim_text=claim.claim_text,
        status=claim.status,
        source_document_id=claim.source_document_id,
        source_section_ref=claim.source_section_ref,
        created_by=claim.created_by,
        created_at=as_utc(claim.created_at).isoformat(),
        updated_at=as_utc(claim.updated_at).isoformat(),
    )


@router.post("/knowledge/claims", status_code=201, response_model=ApprovedClaimOut)
def create_claim(
    body: ApprovedClaimCreate, db: DbSession, actor: AdminOnly, _csrf: CsrfVerified
) -> ApprovedClaimOut:
    _require_workspace_document_if_linked(db, actor.workspace.id, body.source_document_id)
    claim = knowledge_service.create_claim(
        db,
        workspace_id=actor.workspace.id,
        created_by=actor.user.id,
        claim_text=body.claim_text,
        source_document_id=body.source_document_id,
        source_section_ref=body.source_section_ref,
    )
    return _claim_out(claim)


@router.get("/knowledge/claims", response_model=ApprovedClaimListResponse)
def list_claims(db: DbSession, actor: CurrentActor) -> ApprovedClaimListResponse:
    claims = db.scalars(
        select(ApprovedClaim)
        .where(ApprovedClaim.workspace_id == actor.workspace.id)
        .order_by(ApprovedClaim.created_at.desc())
    ).all()
    return ApprovedClaimListResponse(claims=[_claim_out(claim) for claim in claims])


@router.patch("/knowledge/claims/{claim_id}", response_model=ApprovedClaimOut)
def update_claim(
    claim_id: str,
    body: ApprovedClaimUpdate,
    db: DbSession,
    actor: AdminOnly,
    _csrf: CsrfVerified,
) -> ApprovedClaimOut:
    claim = db.get(ApprovedClaim, claim_id)
    if claim is None or claim.workspace_id != actor.workspace.id:
        raise HTTPException(status_code=404, detail="Claim not found")
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(claim, field, value)
    db.commit()
    db.refresh(claim)
    return _claim_out(claim)


# ---------------------------------------------------------------------------
# Retrieval
# ---------------------------------------------------------------------------


@router.get("/knowledge/search", response_model=SearchResponse)
def search_knowledge(
    db: DbSession,
    actor: CurrentActor,
    settings: AppSettings,
    q: str = Query(min_length=1, max_length=1000),
    top_k: int = Query(default=5, ge=1, le=10),
) -> SearchResponse:
    """Retrieve approved, active knowledge chunks relevant to the query.

    Lexical FTS5 retrieval restricted to the caller's workspace; unapproved,
    superseded and deleted content is excluded by construction.
    """
    try:
        ratelimit.check_rate_limit(
            db,
            scope=ratelimit.SCOPE_SEARCH,
            key=actor.user.id,
            limit=settings.knowledge_searches_per_hour,
        )
    except ratelimit.RateLimitExceeded as exc:
        raise HTTPException(
            status_code=429,
            detail="Search rate limit reached. Please retry later.",
            headers={"Retry-After": str(exc.retry_after_seconds)},
        ) from exc

    bounded_k = min(top_k, settings.knowledge_search_max_top_k)
    results = retrieval_service.search(
        db, workspace_id=actor.workspace.id, query=q, top_k=bounded_k
    )
    return SearchResponse(
        query=q,
        results=[
            {
                "chunk_id": r.chunk_id,
                "document_id": r.document_id,
                "document_title": r.document_title,
                "doc_type": r.doc_type,
                "version": r.version,
                "section_ref": r.section_ref,
                "page_number": r.page_number,
                "page_end": r.page_end,
                "text": r.text,
                "score": r.score,
            }
            for r in results
        ],
    )
