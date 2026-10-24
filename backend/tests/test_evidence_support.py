"""Phase 4B regression: evidence-support verification (audit blocker 3).

An authentic source containing the finding's quote is NOT proof that the
source supports the finding's conclusion. Citation checks (source-ID
membership + exact-quote presence) and content anchoring are mechanical;
semantic support is not machine-verifiable, so AI findings are never
auto-elevated to SUPPORTED by citation checks alone.
"""

from __future__ import annotations

import pathlib
import tempfile

from app.services.gemini import AIAnalysis, AIFinding
from app.services.retrieval import RetrievedChunk
from app.services.validation import _verify_ai_findings
from tests.helpers_3a import upload_and_approve
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


def _chunk(chunk_id: str, text: str) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        document_id="doc_synthetic",
        document_title="Synthetic guideline",
        doc_type="guidelines",
        version=1,
        section_ref="s1",
        page_number=1,
        page_end=1,
        text=text,
        score=1.0,
    )


def test_unrelated_conclusion_is_never_supported_by_phrase_overlap() -> None:
    """Audit repro: the quote appears in an authentic approved source, but
    the conclusion is unrelated — phrase overlap must not yield SUPPORTED."""
    chunk = _chunk("synthetic-chunk", "EcoBlend brand name.")
    finding = AIFinding(
        category="tone",
        severity="medium",
        quote_or_range="EcoBlend",
        explanation="An unrelated invented conclusion that this policy does not establish.",
        claimed_source_ids=["synthetic-chunk"],
    )
    result = _verify_ai_findings(
        AIAnalysis(findings=[finding]),
        {"synthetic-chunk": chunk},
        content="EcoBlend synthetic 0.",
    )
    assert result[0]["verification_status"] == "NEEDS_VERIFICATION"
    # The citation is authentic (real chunk, quote present in chunk and
    # content) so it is retained as evidence — but support is not claimed.
    assert result[0]["evidence_chunk_ids"] == ["synthetic-chunk"]
    assert "machine-verified" in result[0]["needs_verification_reason"]


def test_quote_matching_is_case_and_whitespace_insensitive() -> None:
    """Mechanical anchoring/quote checks tolerate case/whitespace noise but
    still never produce SUPPORTED for AI findings."""
    chunk = _chunk("c1", "The preferred product name is EcoBlend.")
    finding = AIFinding(
        category="terminology",
        quote_or_range="preferred   product NAME",
        explanation="Terminology note.",
        claimed_source_ids=["c1"],
    )
    result = _verify_ai_findings(
        AIAnalysis(findings=[finding]),
        {"c1": chunk},
        content="Use the PREFERRED PRODUCT name in all copy.",
    )
    assert result[0]["evidence_chunk_ids"] == ["c1"]
    assert result[0]["verification_status"] == "NEEDS_VERIFICATION"


def test_fabricated_conclusion_over_authentic_evidence_stays_unverified_end_to_end() -> None:
    """Integration: same overlap shape through the full run pipeline."""
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        upload_and_approve(
            client,
            headers,
            title="EcoBlend guideline",
            content="EcoBlend brand name.\n\nThe tone must stay neutral in all copy.",
        )
        provider = FakeGeminiProvider()
        # The fake provider sees the run's actual evidence; claim the first
        # chunk it is handed (as a real model citing supplied IDs would).
        original_analyze = provider.analyze

        def claim_supplied_chunk(*, content, evidence, rules, reserve_attempt=None):
            if evidence:
                provider.findings = [
                    ai_finding(
                        category="tone",
                        quote="EcoBlend",
                        explanation=(
                            "An unrelated invented conclusion that this policy does not establish."
                        ),
                        claimed=[evidence[0]["source_id"]],
                    )
                ]
            return original_analyze(
                content=content, evidence=evidence, rules=rules, reserve_attempt=reserve_attempt
            )

        provider.analyze = claim_supplied_chunk  # type: ignore[method-assign]
        install_fake_provider(client, provider)
        submission = create_submission(
            client, headers, text="EcoBlend synthetic 0.", title="Synthetic 0"
        )
        run = validate_version(client, headers, submission).json()

        assert run["evidence"], "expected the approved EcoBlend chunk as evidence"
        ai_rows = [f for f in run["findings"] if f["source"] == "ai"]
        assert ai_rows, "the AI finding must be kept for human review"
        for row in ai_rows:
            assert row["verification_status"] == "NEEDS_VERIFICATION"
        assert provider.calls


def test_quote_not_in_submitted_content_drops_citation() -> None:
    """A finding quoting text that was never submitted cannot cite real
    evidence for it — the citation is dropped entirely."""
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        upload_and_approve(
            client,
            headers,
            title="Claims policy",
            content="Never state that the product cures all known diseases.",
        )
        submission = create_submission(
            client, headers, text="Our refreshing drink is great for summer."
        )
        search = client.get(
            "/api/v1/knowledge/search", params={"q": "cures all known diseases"}, headers=headers
        ).json()
        assert search["results"]
        chunk_id = search["results"][0]["chunk_id"]

        provider = FakeGeminiProvider(
            findings=[
                ai_finding(
                    category="unsupported_claim",
                    quote="cures all known diseases",  # in the source, NOT in the content
                    claimed=[chunk_id],
                )
            ]
        )
        install_fake_provider(client, provider)
        run = validate_version(client, headers, submission).json()

        ai_finding_row = next(f for f in run["findings"] if f["source"] == "ai")
        assert ai_finding_row["verification_status"] == "NEEDS_VERIFICATION"
        assert ai_finding_row["evidence_chunk_ids"] == []
        assert "submitted content" in ai_finding_row["needs_verification_reason"].lower()
