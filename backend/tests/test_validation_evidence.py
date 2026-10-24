"""Evidence retrieval + citation verification in validation runs.

Covers: workspace-scoped approved-only evidence, evidence snapshots with
document/version/section/page metadata, fabricated citation rejection,
quote-mismatch downgrade, and deleted-evidence behaviour. Gemini is mocked
at the provider boundary only.
"""

from __future__ import annotations

import pathlib
import tempfile

from tests.helpers_3a import upload_and_approve, upload_text
from tests.helpers_3b import (
    FakeGeminiProvider,
    ai_finding,
    create_submission,
    guest_session,
    install_fake_provider,
    make_client,
    validate_version,
    validation_settings,
)


def tmp() -> pathlib.Path:
    return pathlib.Path(tempfile.mkdtemp())


GUIDELINE = (
    "Brand Guidelines\n\n"
    "Never promise guaranteed outcomes in any marketing material.\n\n"
    "The preferred product name is EcoBlend, capitalised exactly like that."
)


def setup_workspace(client) -> dict[str, str]:
    headers = guest_session(client)
    upload_and_approve(client, headers, title="Brand Guidelines", content=GUIDELINE)
    return headers


def test_run_evidence_snapshot_has_full_provenance() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = setup_workspace(client)
        install_fake_provider(client, FakeGeminiProvider())
        # Content vocabulary overlaps the guideline so FTS5 retrieval matches.
        submission = create_submission(
            client,
            headers,
            text="Our product guarantees 100% outcomes and EcoBlend is great.",
        )
        run = validate_version(client, headers, submission).json()

        assert run["evidence"], "expected approved guideline chunks as evidence"
        for evidence in run["evidence"]:
            assert evidence["document_title"] == "Brand Guidelines"
            assert evidence["document_version"] == 1
            assert evidence["section_ref"].startswith("s")
            assert evidence["text"]
            assert evidence["chunk_id"] and evidence["document_id"]


def test_authentic_citation_keeps_evidence_but_support_needs_review() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = setup_workspace(client)
        submission = create_submission(
            client, headers, text="We promise guaranteed outcomes for every customer."
        )
        # Discover the real chunk id via the knowledge search API (workspace
        # scoped) and have the "AI" cite it with an exact quote from it.
        search = client.get(
            "/api/v1/knowledge/search", params={"q": "guaranteed outcomes"}, headers=headers
        ).json()
        assert search["results"]
        chunk = search["results"][0]
        quote_text = "guaranteed outcomes"
        assert quote_text in chunk["text"].lower()

        provider = FakeGeminiProvider(
            findings=[ai_finding(quote=quote_text, claimed=[chunk["chunk_id"]])]
        )
        install_fake_provider(client, provider)
        run = validate_version(client, headers, submission).json()

        ai_finding_row = next(f for f in run["findings"] if f["source"] == "ai")
        # Conservative support policy (Phase 4B): the citation is authentic
        # (real chunk from this run's evidence snapshot, quote present in
        # chunk and content) and is kept as evidence, but whether the source
        # actually supports the conclusion is not machine-verifiable, so the
        # finding stays NEEDS_VERIFICATION for human review.
        assert ai_finding_row["verification_status"] == "NEEDS_VERIFICATION"
        assert ai_finding_row["evidence_chunk_ids"] == [chunk["chunk_id"]]
        assert "human review" in ai_finding_row["needs_verification_reason"].lower()
        # The run's evidence set contains exactly the cited chunk.
        cited = {e["chunk_id"] for e in run["evidence"]}
        assert chunk["chunk_id"] in cited


def test_fabricated_citation_is_rejected_and_downgraded() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = setup_workspace(client)
        submission = create_submission(
            client, headers, text="We promise guaranteed outcomes for every customer."
        )
        provider = FakeGeminiProvider(
            findings=[ai_finding(quote="guaranteed outcomes", claimed=["chunk_does_not_exist"])]
        )
        install_fake_provider(client, provider)
        run = validate_version(client, headers, submission).json()

        ai_finding_row = next(f for f in run["findings"] if f["source"] == "ai")
        # The finding is kept for human review, but never as verified evidence.
        assert ai_finding_row["verification_status"] == "NEEDS_VERIFICATION"
        assert ai_finding_row["evidence_chunk_ids"] == []
        assert ai_finding_row["needs_verification_reason"]
        cited_ids = {e["chunk_id"] for e in run["evidence"]}
        assert "chunk_does_not_exist" not in cited_ids


def test_citation_quote_not_in_chunk_is_downgraded() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = setup_workspace(client)
        submission = create_submission(
            client, headers, text="We promise guaranteed outcomes for every customer."
        )
        search = client.get(
            "/api/v1/knowledge/search", params={"q": "guaranteed outcomes"}, headers=headers
        ).json()
        chunk_id = search["results"][0]["chunk_id"]
        provider = FakeGeminiProvider(
            findings=[
                ai_finding(
                    quote="cures all known diseases",  # not in the cited chunk
                    claimed=[chunk_id],
                )
            ]
        )
        install_fake_provider(client, provider)
        run = validate_version(client, headers, submission).json()

        ai_finding_row = next(f for f in run["findings"] if f["source"] == "ai")
        assert ai_finding_row["verification_status"] == "NEEDS_VERIFICATION"
        assert ai_finding_row["evidence_chunk_ids"] == []


def test_unapproved_knowledge_is_never_used_as_evidence() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        # Uploaded but NOT approved: must stay invisible to retrieval.
        upload_text(client, headers, title="Secret draft", content=GUIDELINE)
        install_fake_provider(client, FakeGeminiProvider())
        submission = create_submission(
            client, headers, text="Our product guarantees 100% outcomes."
        )
        run = validate_version(client, headers, submission).json()
        assert run["evidence"] == []


def test_evidence_snapshot_survives_document_deletion() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = setup_workspace(client)
        submission = create_submission(
            client, headers, text="Our product guarantees 100% outcomes."
        )
        run = validate_version(client, headers, submission).json()
        assert run["evidence"]
        snapshot = run["evidence"]

        # Admin deletes the guideline afterwards; the persisted run keeps its
        # own evidence copy (audit-grade, not a live join).
        documents = client.get("/api/v1/knowledge/documents", headers=headers).json()
        document_id = documents["documents"][0]["id"]
        delete = client.delete(f"/api/v1/knowledge/documents/{document_id}", headers=headers)
        assert delete.status_code == 204

        fetched = client.get(f"/api/v1/validation-runs/{run['id']}").json()
        assert fetched["evidence"] == snapshot
        assert fetched["findings"] == run["findings"]


def test_missing_evidence_never_becomes_a_false_factual_verdict() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)  # no knowledge uploaded at all
        provider = FakeGeminiProvider(
            findings=[
                ai_finding(
                    category="unsupported_claim",
                    quote="guarantees 100% results",
                    claimed=[],
                    reason="No approved evidence loaded for this claim.",
                )
            ]
        )
        install_fake_provider(client, provider)
        submission = create_submission(client, headers, text="Our product guarantees 100% results!")
        run = validate_version(client, headers, submission).json()

        assert run["evidence"] == []
        finding = run["findings"][0]
        assert finding["verification_status"] == "NEEDS_VERIFICATION"
        # Wording is about missing support, never about objective falsehood.
        assert "false" not in finding["explanation"].lower()
