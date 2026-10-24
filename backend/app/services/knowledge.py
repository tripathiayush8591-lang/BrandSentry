"""Brand Knowledge Vault domain services (Phase 3A).

Ingestion pipeline: content-inspect the raw bytes (never trust the client
filename/extension), extract text (PyMuPDF for text-based PDFs, UTF-8 decode
for text), chunk by document structure, persist file + rows in one
transaction, and clean up the written file if the database commit fails.

Trust boundaries honoured here (docs/ARCHITECTURE.md §D):
- Boundary C: uploaded files are untrusted — magic-byte type detection,
  size caps, bounded extraction, encrypted-PDF rejection, no macros executed.
- Boundary D: every query is scoped by workspace_id taken from the verified
  session, never from client input.
"""

from __future__ import annotations

import contextlib
import hashlib
import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

import pymupdf
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    ApprovedClaim,
    BrandRule,
    KnowledgeChunk,
    KnowledgeDocument,
    KnowledgeDocumentVersion,
    new_id,
)

PDF_MAGIC = b"%PDF-"
MAX_FILENAME_LEN = 255

ALLOWED_DOC_TYPES = {
    "guidelines",
    "approved_claims",
    "terminology",
    "tone_messaging",
    "claims_policy",
    "source_document",
}
RULE_CATEGORIES = {
    "prohibited_term",
    "preferred_replacement",
    "restricted_phrase",
    "claim_requirement",
    "messaging_rule",
}
MATCHER_TYPES = {"contains", "exact", "regex"}


class IngestionError(Exception):
    """Raised when an upload cannot be accepted; maps to a stable API error."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(message)


class UnsupportedFileType(IngestionError):
    def __init__(self) -> None:
        super().__init__(
            400,
            "Unsupported file type: only UTF-8 text and text-based PDF files are accepted.",
        )


class FileTooLarge(IngestionError):
    def __init__(self, max_bytes: int) -> None:
        super().__init__(413, f"File exceeds the maximum allowed upload size of {max_bytes} bytes.")


class CorruptDocument(IngestionError):
    def __init__(
        self,
        message: str = "The document could not be read: it appears to be corrupt or unsupported.",
    ) -> None:
        super().__init__(400, message)


class EncryptedPdf(IngestionError):
    def __init__(self) -> None:
        super().__init__(400, "Encrypted PDFs are not supported.")


class EmptyDocument(IngestionError):
    def __init__(self) -> None:
        super().__init__(400, "No extractable text found in the document.")


class DuplicateDocumentTitle(IngestionError):
    def __init__(self) -> None:
        super().__init__(
            409,
            "A document with this title already exists in this workspace. "
            "Re-uploading its content creates a new version; use a different "
            "title for a separate document.",
        )


@dataclass(frozen=True)
class PageSegment:
    """Extracted text tied to its source page (None for plain text)."""

    text: str
    page_number: int | None


@dataclass(frozen=True)
class ExtractedDocument:
    full_text: str
    segments: list[PageSegment]
    content_type: str  # "text/plain" | "application/pdf"
    page_count: int | None
    # True when the extraction cap cut content short: the stored version is
    # then flagged ``incomplete`` rather than silently presented as whole.
    truncated: bool = False


@dataclass(frozen=True)
class PreparedChunk:
    section_ref: str
    page_number: int | None
    page_end: int | None
    text: str
    char_offset: int


# ---------------------------------------------------------------------------
# Content inspection and extraction
# ---------------------------------------------------------------------------


def sniff_content_type(raw: bytes) -> str:
    """Detect type from content. PDFs are identified by magic bytes; anything
    that is not a PDF must decode as UTF-8 text (rejections happen later)."""
    if raw.startswith(PDF_MAGIC):
        return "application/pdf"
    return "text/plain"


def _normalise(text: str) -> str:
    """Normalise newlines and strip trailing whitespace without destroying
    the wording or ordering that later evidence references rely on."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return text.strip("\n")


def extract_text(raw: bytes, content_type: str, max_chars: int) -> ExtractedDocument:
    if content_type == "application/pdf":
        return _extract_pdf(raw, max_chars)
    return _extract_txt(raw, max_chars)


def _extract_txt(raw: bytes, max_chars: int) -> ExtractedDocument:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise UnsupportedFileType() from exc
    text = _normalise(text)
    if not text.strip():
        raise EmptyDocument()
    truncated = len(text) > max_chars
    if truncated:
        text = text[:max_chars]
    return ExtractedDocument(
        full_text=text,
        segments=[PageSegment(text=text, page_number=None)],
        content_type="text/plain",
        page_count=None,
        truncated=truncated,
    )


def _extract_pdf(raw: bytes, max_chars: int) -> ExtractedDocument:
    try:
        doc = pymupdf.open(stream=raw, filetype="pdf")
    except Exception as exc:  # pymupdf raises varied exception types on corrupt input
        raise CorruptDocument() from exc
    try:
        if doc.is_encrypted:
            raise EncryptedPdf()
        segments: list[PageSegment] = []
        total = 0
        truncated = False
        for page in doc:
            page_text = _normalise(page.get_text("text"))  # noqa: S106 - format name, not a secret
            if total + len(page_text) > max_chars:
                remaining = max_chars - total
                truncated = True
                if remaining <= 0:
                    break
                page_text = page_text[:remaining]
            if page_text:
                segments.append(PageSegment(text=page_text, page_number=page.number + 1))
                total += len(page_text)
            if total >= max_chars:
                truncated = truncated or page.number + 1 < doc.page_count
                break
        if not segments:
            # A valid but image-only/empty PDF: no OCR in this phase.
            raise EmptyDocument()
        return ExtractedDocument(
            full_text="\n\n".join(segment.text for segment in segments),
            segments=segments,
            content_type="application/pdf",
            page_count=doc.page_count,
            truncated=truncated,
        )
    finally:
        doc.close()


@dataclass(frozen=True)
class _SectionUnit:
    """A blank-line-delimited section tied to the page(s) it was extracted from."""

    text: str
    page_start: int | None
    page_end: int | None


@dataclass(frozen=True)
class _ChunkPiece:
    text: str
    page_start: int | None
    page_end: int | None


def chunk_document(extracted: ExtractedDocument, max_chunk_chars: int) -> list[PreparedChunk]:
    """Chunk by document structure: blank-line sections (page-annotated for
    PDFs), merging small sections — including across page boundaries — and
    splitting oversized ones at sentence bounds. Each chunk carries the exact
    page span it was extracted from (``page_number`` = first page, kept as the
    existing reference; ``page_end`` = last page)."""
    units: list[_SectionUnit] = []
    for segment in extracted.segments:
        for section in re.split(r"\n\s*\n", segment.text):
            if section.strip():
                units.append(_SectionUnit(section, segment.page_number, segment.page_number))
    chunks: list[PreparedChunk] = []
    offset = 0
    for piece in _merge_units(units, max_chunk_chars):
        text = piece.text.strip()
        if not text:
            continue
        chunks.append(
            PreparedChunk(
                section_ref=f"s{len(chunks) + 1}",
                page_number=piece.page_start,
                page_end=piece.page_end,
                text=text,
                char_offset=offset,
            )
        )
        # +2 accounts for the section separator inserted between chunks.
        offset += len(text) + 2
    return chunks


def _merge_units(units: list[_SectionUnit], max_chunk_chars: int) -> list[_ChunkPiece]:
    pieces: list[_ChunkPiece] = []
    buffer: list[_SectionUnit] = []
    buffer_len = 0

    def flush() -> None:
        nonlocal buffer, buffer_len
        if buffer:
            pieces.append(
                _ChunkPiece(
                    text="\n\n".join(unit.text for unit in buffer),
                    page_start=buffer[0].page_start,
                    page_end=buffer[-1].page_end,
                )
            )
            buffer, buffer_len = [], 0

    for unit in units:
        if len(unit.text) > max_chunk_chars:
            flush()
            pieces.extend(
                _ChunkPiece(text=text, page_start=unit.page_start, page_end=unit.page_end)
                for text in _split_long_section(unit.text, max_chunk_chars)
            )
            continue
        if buffer_len + len(unit.text) + 2 > max_chunk_chars and buffer:
            flush()
        buffer.append(unit)
        buffer_len += len(unit.text) + 2
    flush()
    return pieces


def _split_long_section(section: str, max_chunk_chars: int) -> list[str]:
    """Split an oversized section at sentence boundaries, falling back to a
    hard character cut so pathological unbroken input stays bounded."""
    sentences = re.findall(r"[^.!?]*[.!?]+|[^.!?]+$", section)
    pieces: list[str] = []
    buffer = ""
    for sentence in sentences:
        while len(sentence) > max_chunk_chars:
            if buffer:
                pieces.append(buffer)
                buffer = ""
            pieces.append(sentence[:max_chunk_chars])
            sentence = sentence[max_chunk_chars:]
        if len(buffer) + len(sentence) > max_chunk_chars and buffer:
            pieces.append(buffer)
            buffer = ""
        buffer += sentence
    if buffer.strip():
        pieces.append(buffer)
    return pieces


def safe_original_filename(name: str | None) -> str:
    """Keep the client filename for display metadata only; never used in paths."""
    base = os.path.basename(name or "upload.txt").strip()
    base = base.replace("\\", "_").replace("/", "_").replace("\x00", "")
    base = re.sub(r"[^\w.\- ()]", "_", base).strip(". ")
    return (base or "upload.txt")[:MAX_FILENAME_LEN]


def checksum_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------


def document_file_path(
    settings: Settings, workspace_id: str, document_id: str, version: int, ext: str
) -> Path:
    """Workspace-scoped path under the configured upload directory, built
    entirely from server-generated identifiers (no client input in the path)."""
    safe_ext = ".pdf" if ext == "application/pdf" else ".txt"
    directory = Path(settings.upload_dir) / "workspaces" / workspace_id / "documents"
    return directory / f"{document_id}_v{version}{safe_ext}"


def _write_file_atomically(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(dir=path.parent, suffix=".part")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
        os.replace(temp_name, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(temp_name)
        raise


# ---------------------------------------------------------------------------
# Ingestion orchestration
# ---------------------------------------------------------------------------


def ingest_document(
    db: Session,
    settings: Settings,
    *,
    workspace_id: str,
    created_by: str,
    raw: bytes,
    filename: str | None,
    title: str | None,
    doc_type: str,
) -> tuple[KnowledgeDocument, KnowledgeDocumentVersion, bool]:
    """Validate, extract, persist and index one upload.

    Returns (document, version, created_new_version). Duplicate content for
    the document's active version is idempotent (no new version, no re-index).
    Raises :class:`IngestionError` subclasses for rejected input.
    """
    if doc_type not in ALLOWED_DOC_TYPES:
        raise IngestionError(
            422, f"Unknown document type; expected one of {sorted(ALLOWED_DOC_TYPES)}."
        )

    if len(raw) == 0:
        raise EmptyDocument()
    if len(raw) > settings.knowledge_max_upload_bytes:
        raise FileTooLarge(settings.knowledge_max_upload_bytes)

    content_type = sniff_content_type(raw)
    extracted = extract_text(raw, content_type, settings.knowledge_max_extracted_chars)
    chunks = chunk_document(extracted, settings.knowledge_chunk_max_chars)
    if not chunks:
        raise EmptyDocument()

    checksum = checksum_bytes(raw)
    safe_name = safe_original_filename(filename)
    resolved_title = (title or Path(safe_name).stem or "Untitled document").strip()[:200]

    document = _find_document_by_title(db, workspace_id, resolved_title)

    if document is not None and document.status == "deleted":
        # The (workspace_id, title) unique constraint means a second row with
        # this title can never exist, so a deleted title is re-created by
        # reactivating its row; version numbering continues past the versions
        # kept for audit.
        next_version = _max_stored_version(db, document.id) + 1
    elif document is None:
        document = KnowledgeDocument(
            id=new_id("kd"), workspace_id=workspace_id, title=resolved_title, doc_type=doc_type
        )
        db.add(document)
        try:
            db.flush()
        except IntegrityError as exc:
            # Lost a race against a concurrent upload claiming the same title.
            raise DuplicateDocumentTitle() from exc
        next_version = 1
    else:
        active = _active_version_row(db, document)
        if active is not None and active.checksum_sha256 == checksum:
            return document, active, False
        next_version = (document.active_version or 0) + 1

    path = document_file_path(settings, workspace_id, document.id, next_version, content_type)
    _write_file_atomically(path, raw)

    try:
        version_row = KnowledgeDocumentVersion(
            id=new_id("kdv"),
            document_id=document.id,
            workspace_id=workspace_id,
            version=next_version,
            original_filename=safe_name,
            content_type=content_type,
            storage_path=str(path),
            checksum_sha256=checksum,
            size_bytes=len(raw),
            page_count=extracted.page_count,
            # ``incomplete`` reports an honest partial extraction (cap hit);
            # content is stored and searchable, never silently presented as whole.
            extraction_status="incomplete" if extracted.truncated else "extracted",
            created_by=created_by,
        )
        db.add(version_row)
        # Superseded versions leave the searchable index immediately (FTS
        # delete- triggers fire); their metadata stays for audit.
        db.execute(
            delete(KnowledgeChunk).where(
                KnowledgeChunk.document_id == document.id,
                KnowledgeChunk.version != next_version,
            )
        )
        for chunk in chunks:
            db.add(
                KnowledgeChunk(
                    id=new_id("kc"),
                    document_id=document.id,
                    workspace_id=workspace_id,
                    version=next_version,
                    section_ref=chunk.section_ref,
                    page_number=chunk.page_number,
                    page_end=chunk.page_end,
                    text=chunk.text,
                    char_offset=chunk.char_offset,
                )
            )
        # New content is unapproved until an authorised role approves it; the
        # superseded version's chunks leave the index (FTS triggers fire).
        document.doc_type = doc_type
        document.active_version = next_version
        document.status = "pending"
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Keep the filesystem consistent with the rolled-back transaction.
        with contextlib.suppress(OSError):
            path.unlink(missing_ok=True)
        raise DuplicateDocumentTitle() from exc
    except BaseException:
        db.rollback()
        with contextlib.suppress(OSError):
            path.unlink(missing_ok=True)
        raise

    return document, version_row, True


def _find_document_by_title(db: Session, workspace_id: str, title: str) -> KnowledgeDocument | None:
    return db.scalar(
        select(KnowledgeDocument).where(
            KnowledgeDocument.workspace_id == workspace_id,
            KnowledgeDocument.title == title,
        )
    )


def _max_stored_version(db: Session, document_id: str) -> int:
    """Highest version number ever stored for the document (versions are kept
    for audit even after soft-delete, so numbering continues past them)."""
    return (
        db.scalar(
            select(func.max(KnowledgeDocumentVersion.version)).where(
                KnowledgeDocumentVersion.document_id == document_id
            )
        )
        or 0
    )


def _active_version_row(
    db: Session, document: KnowledgeDocument
) -> KnowledgeDocumentVersion | None:
    if document.active_version is None:
        return None
    return db.scalar(
        select(KnowledgeDocumentVersion).where(
            KnowledgeDocumentVersion.document_id == document.id,
            KnowledgeDocumentVersion.version == document.active_version,
        )
    )


def delete_document(db: Session, document: KnowledgeDocument) -> None:
    """Soft-delete: chunks leave the index immediately (trigger), the metadata
    row and stored file remain for audit."""
    document.status = "deleted"
    document.active_version = None
    db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id))
    db.commit()


# ---------------------------------------------------------------------------
# Brand rules and approved claims
# ---------------------------------------------------------------------------


def create_rule(
    db: Session,
    *,
    workspace_id: str,
    created_by: str,
    category: str,
    name: str,
    rule_text: str,
    pattern: str,
    matcher_type: str = "contains",
    replacement: str | None = None,
    source_document_id: str | None = None,
    source_section_ref: str | None = None,
) -> BrandRule:
    if category not in RULE_CATEGORIES:
        raise IngestionError(
            422, f"Unknown rule category; expected one of {sorted(RULE_CATEGORIES)}."
        )
    if matcher_type not in MATCHER_TYPES:
        raise IngestionError(422, f"Unknown matcher type; expected one of {sorted(MATCHER_TYPES)}.")
    if matcher_type == "regex":
        try:
            re.compile(pattern)
        except re.error as exc:
            raise IngestionError(422, "Pattern is not a valid regular expression.") from exc
    rule = BrandRule(
        id=new_id("rule"),
        workspace_id=workspace_id,
        category=category,
        name=name,
        rule_text=rule_text,
        matcher_type=matcher_type,
        pattern=pattern,
        replacement=replacement,
        source_document_id=source_document_id,
        source_section_ref=source_section_ref,
        created_by=created_by,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def update_rule(db: Session, rule: BrandRule, **changes: object) -> BrandRule:
    """Apply permitted field changes and bump the rule version (audit trail)."""
    if "matcher_type" in changes and changes["matcher_type"] not in MATCHER_TYPES:
        raise IngestionError(422, f"Unknown matcher type; expected one of {sorted(MATCHER_TYPES)}.")
    if "category" in changes and changes["category"] not in RULE_CATEGORIES:
        raise IngestionError(
            422, f"Unknown rule category; expected one of {sorted(RULE_CATEGORIES)}."
        )
    effective_matcher = changes.get("matcher_type", rule.matcher_type)
    if "pattern" in changes and effective_matcher == "regex":
        try:
            re.compile(str(changes["pattern"]))
        except re.error as exc:
            raise IngestionError(422, "Pattern is not a valid regular expression.") from exc
    for field, value in changes.items():
        if value is not None or field == "replacement":
            setattr(rule, field, value)
    rule.version += 1
    db.commit()
    db.refresh(rule)
    return rule


def create_claim(
    db: Session,
    *,
    workspace_id: str,
    created_by: str,
    claim_text: str,
    source_document_id: str | None = None,
    source_section_ref: str | None = None,
) -> ApprovedClaim:
    claim = ApprovedClaim(
        id=new_id("claim"),
        workspace_id=workspace_id,
        claim_text=claim_text,
        source_document_id=source_document_id,
        source_section_ref=source_section_ref,
        created_by=created_by,
    )
    db.add(claim)
    db.commit()
    db.refresh(claim)
    return claim
