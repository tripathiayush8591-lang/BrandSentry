"""Phase 3A Brand Knowledge Vault request/response schemas.

No raw file bytes, storage paths or other internals are exposed; storage
paths stay server-side (only the original display filename is returned).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# --- documents ---------------------------------------------------------------


class KnowledgeDocumentOut(BaseModel):
    id: str
    title: str
    doc_type: str
    status: str  # pending | approved | rejected | deleted
    active_version: int | None = None
    created_at: str
    updated_at: str


class KnowledgeDocumentVersionOut(BaseModel):
    id: str
    version: int
    original_filename: str
    content_type: str
    checksum_sha256: str
    size_bytes: int
    page_count: int | None = None
    extraction_status: str
    created_by: str
    created_at: str


class KnowledgeDocumentDetailOut(KnowledgeDocumentOut):
    versions: list[KnowledgeDocumentVersionOut]


class ChunkOut(BaseModel):
    id: str
    document_id: str
    version: int
    section_ref: str
    page_number: int | None = None
    # Last (inclusive) page of the span this chunk was extracted from; equals
    # page_number for single-page chunks, None for plain text.
    page_end: int | None = None
    text: str
    char_offset: int


class DocumentListResponse(BaseModel):
    documents: list[KnowledgeDocumentOut]


class ChunkListResponse(BaseModel):
    chunks: list[ChunkOut]


# --- brand rules -------------------------------------------------------------


class BrandRuleCreate(BaseModel):
    category: str = Field(min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=200)
    rule_text: str = Field(min_length=1, max_length=4000)
    pattern: str = Field(min_length=1, max_length=2000)
    matcher_type: str = "contains"  # contains | exact | regex
    replacement: str | None = Field(default=None, max_length=2000)
    source_document_id: str | None = Field(default=None, max_length=64)
    source_section_ref: str | None = Field(default=None, max_length=100)


class BrandRuleUpdate(BaseModel):
    category: str | None = Field(default=None, min_length=1, max_length=40)
    name: str | None = Field(default=None, min_length=1, max_length=200)
    rule_text: str | None = Field(default=None, min_length=1, max_length=4000)
    pattern: str | None = Field(default=None, min_length=1, max_length=2000)
    matcher_type: str | None = Field(default=None, min_length=1, max_length=16)
    replacement: str | None = Field(default=None, max_length=2000)
    enabled: bool | None = None


class BrandRuleOut(BaseModel):
    id: str
    category: str
    name: str
    rule_text: str
    matcher_type: str
    pattern: str
    replacement: str | None = None
    enabled: bool
    version: int
    source_document_id: str | None = None
    source_section_ref: str | None = None
    created_by: str
    created_at: str
    updated_at: str


class BrandRuleListResponse(BaseModel):
    rules: list[BrandRuleOut]


# --- approved claims ---------------------------------------------------------


class ApprovedClaimCreate(BaseModel):
    claim_text: str = Field(min_length=1, max_length=4000)
    source_document_id: str | None = Field(default=None, max_length=64)
    source_section_ref: str | None = Field(default=None, max_length=100)


class ApprovedClaimUpdate(BaseModel):
    claim_text: str | None = Field(default=None, min_length=1, max_length=4000)
    status: str | None = Field(default=None, pattern="^(active|retired)$")


class ApprovedClaimOut(BaseModel):
    id: str
    claim_text: str
    status: str
    source_document_id: str | None = None
    source_section_ref: str | None = None
    created_by: str
    created_at: str
    updated_at: str


class ApprovedClaimListResponse(BaseModel):
    claims: list[ApprovedClaimOut]


# --- retrieval ---------------------------------------------------------------


class RetrievedChunkOut(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    doc_type: str
    version: int
    section_ref: str
    page_number: int | None = None
    page_end: int | None = None
    text: str
    score: float


class SearchResponse(BaseModel):
    query: str
    results: list[RetrievedChunkOut]
    # Lexical FTS5 retrieval; not a semantic relevance guarantee.
    retrieval_method: str = "fts5_bm25"


class UploadResult(BaseModel):
    document: KnowledgeDocumentOut
    version: KnowledgeDocumentVersionOut
    chunk_count: int
    # False when the same content was re-uploaded (idempotent no-op).
    created_new_version: bool
