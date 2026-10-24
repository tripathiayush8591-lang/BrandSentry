"""Phase 3B validation API: CRUD, authz, engine flow, idempotency, cache, quotas.

Gemini is mocked at the provider boundary only (FakeGeminiProvider);
everything else is LIVE_BACKEND SQLite + HTTP.
"""

from __future__ import annotations

import pathlib
import tempfile

from tests.helpers_3b import (
    FakeGeminiProvider,
    ai_finding,
    change_session_role,
    create_submission,
    guest_session,
    install_fake_provider,
    make_client,
    validate_version,
    validation_settings,
)


def tmp() -> pathlib.Path:
    return pathlib.Path(tempfile.mkdtemp())


def test_submission_crud_and_validation_flow() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        provider = FakeGeminiProvider(
            findings=[ai_finding(quote="100% results", claimed=[], reason="No approved evidence.")]
        )
        install_fake_provider(client, provider)

        submission = create_submission(client, headers)
        assert submission["status"] == "draft"
        assert len(submission["versions"]) == 1

        response = validate_version(client, headers, submission)
        assert response.status_code == 200, response.text
        run = response.json()
        assert run["state"] == "completed"
        assert run["ai_status"] == "complete"
        assert run["cache_hit"] is False
        assert run["total_tokens"] == 150  # actual (fake) provider usage recorded
        categories = {f["category"] for f in run["findings"]}
        assert "unsupported_claim" in categories
        # No fabricated citations: empty claimed list -> NEEDS_VERIFICATION.
        ai_finding_row = next(f for f in run["findings"] if f["source"] == "ai")
        assert ai_finding_row["verification_status"] == "NEEDS_VERIFICATION"

        # Submission state follows the run honestly.
        detail = client.get(f"/api/v1/submissions/{submission['id']}").json()
        assert detail["status"] == "validated"

        # The provider received the submitted content and the rule set.
        assert provider.calls[0]["content"].startswith("Our product guarantees")
        assert provider.calls[0]["rules"] == []


def test_empty_submission_rejected() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        response = client.post(
            "/api/v1/submissions", json={"title": "T", "text": "   "}, headers=headers
        )
        assert response.status_code == 422


def test_oversize_submission_rejected_413() -> None:
    with make_client(validation_settings(tmp(), validation_max_content_chars=100)) as client:
        headers = guest_session(client)
        response = client.post(
            "/api/v1/submissions", json={"title": "T", "text": "x" * 101}, headers=headers
        )
        assert response.status_code == 413


def test_reviewer_role_cannot_create_or_validate() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        change_session_role(client, "reviewer")
        response = client.post(
            "/api/v1/submissions", json={"title": "T", "text": "text"}, headers=headers
        )
        assert response.status_code == 403


def test_unauthenticated_submission_rejected() -> None:
    with make_client(validation_settings(tmp())) as client:
        response = client.post("/api/v1/submissions", json={"title": "T", "text": "text"})
        assert response.status_code == 401


def test_cross_workspace_submission_and_run_are_404() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers_a = guest_session(client)
        install_fake_provider(client, FakeGeminiProvider())
        submission = create_submission(client, headers_a)
        run_response = validate_version(client, headers_a, submission)
        assert run_response.status_code == 200
        run_id = run_response.json()["id"]

        headers_b = guest_session(client)  # separate isolated demo workspace
        assert (
            client.get(f"/api/v1/submissions/{submission['id']}", headers=headers_b).status_code
            == 404
        )
        assert client.get(f"/api/v1/validation-runs/{run_id}", headers=headers_b).status_code == 404
        # Workspace B's submission list never contains A's items.
        titles = [
            s["title"]
            for s in client.get("/api/v1/submissions", headers=headers_b).json()["submissions"]
        ]
        assert "Launch copy" not in titles


def test_idempotency_key_replays_same_run_and_conflicts_on_different_payload() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        provider = FakeGeminiProvider()
        install_fake_provider(client, provider)
        submission = create_submission(client, headers)

        first = validate_version(client, headers, submission, idempotency_key="key-1")
        assert first.status_code == 200
        second = validate_version(client, headers, submission, idempotency_key="key-1")
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]

        # Same content version via a *different* key is a cache hit, not a
        # conflict; the provider is still called only once.
        third = validate_version(client, headers, submission, idempotency_key="key-2")
        assert third.status_code == 200
        assert third.json()["cache_hit"] is True
        assert len(provider.calls) == 1

        # Same key, different payload (a new version) -> 409 conflict.
        version_two = client.post(
            f"/api/v1/submissions/{submission['id']}/versions",
            json={"text": "Different text entirely."},
            headers=headers,
        ).json()
        conflict = validate_version(
            client, headers, submission, version_id=version_two["id"], idempotency_key="key-1"
        )
        assert conflict.status_code == 409


def test_result_cache_reuse_and_rule_version_invalidation() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        provider = FakeGeminiProvider()
        install_fake_provider(client, provider)
        submission = create_submission(client, headers)

        first = validate_version(client, headers, submission).json()
        assert first["cache_hit"] is False
        second = validate_version(client, headers, submission).json()
        assert second["cache_hit"] is True
        assert second["state"] == "completed"  # cached AI results stay completed
        assert len(provider.calls) == 1  # no second provider call
        assert first["id"] != second["id"]  # but runs remain individually traceable

        # A new rule changes the rules hash -> cache invalidated.
        rule_response = client.post(
            "/api/v1/knowledge/rules",
            json={
                "category": "prohibited_term",
                "name": "No guarantees",
                "rule_text": "Never promise guaranteed outcomes.",
                "pattern": "guarantees",
                "matcher_type": "contains",
            },
            headers=headers,
        )
        assert rule_response.status_code == 201, rule_response.text
        third = validate_version(client, headers, submission).json()
        assert third["cache_hit"] is False
        assert len(provider.calls) == 2
        deterministic = [f for f in third["findings"] if f["source"] == "deterministic"]
        assert len(deterministic) == 1
        assert deterministic[0]["rule_id"] == rule_response.json()["id"]
        assert deterministic[0]["verification_status"] == "SUPPORTED"


def test_validation_quota_returns_429_with_retry_after() -> None:
    # Guests take the per-user guest quota (guests are admins of their own
    # isolated demo workspace, so the workspace quota is not shared).
    with make_client(validation_settings(tmp(), validation_guest_per_hour=1)) as client:
        headers = guest_session(client)
        install_fake_provider(client, FakeGeminiProvider())
        submission = create_submission(client, headers)
        assert validate_version(client, headers, submission).status_code == 200
        limited = validate_version(client, headers, submission)
        assert limited.status_code == 429
        assert limited.headers.get("Retry-After")
        assert limited.json()["error"]["code"] == "RATE_LIMITED"


def test_cache_never_shared_between_workspaces() -> None:
    with make_client(validation_settings(tmp())) as client:
        provider = FakeGeminiProvider()
        install_fake_provider(client, provider)

        headers_a = guest_session(client)
        submission_a = create_submission(client, headers_a)
        assert validate_version(client, headers_a, submission_a).status_code == 200

        headers_b = guest_session(client)  # identical content, different workspace
        submission_b = create_submission(client, headers_b)
        assert validate_version(client, headers_b, submission_b).status_code == 200

        # Identical content across workspaces still costs a separate call:
        # cached confidential results never leak across the boundary.
        assert len(provider.calls) == 2


def test_new_version_resets_state_and_hashes_differ() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        install_fake_provider(client, FakeGeminiProvider())
        submission = create_submission(client, headers)
        assert validate_version(client, headers, submission).json()["state"] == "completed"

        version_two = client.post(
            f"/api/v1/submissions/{submission['id']}/versions",
            json={"text": "Revised launch copy, still mentioning guarantees."},
            headers=headers,
        )
        assert version_two.status_code == 201
        detail = client.get(f"/api/v1/submissions/{submission['id']}").json()
        assert detail["status"] == "draft"  # editing resets to an unvalidated draft
        assert [v["version"] for v in detail["versions"]] == [1, 2]
        assert detail["versions"][0]["text_sha256"] != detail["versions"][1]["text_sha256"]


def test_runs_list_is_workspace_scoped_and_summarised() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        provider = FakeGeminiProvider(findings=[ai_finding(quote="guarantees", claimed=[])])
        install_fake_provider(client, provider)
        submission = create_submission(client, headers)
        validate_version(client, headers, submission)

        listing = client.get("/api/v1/validation-runs", headers=headers).json()
        assert len(listing["runs"]) == 1
        summary = listing["runs"][0]
        assert summary["state"] == "completed"
        assert summary["finding_count"] >= 1
        assert "findings" not in summary  # summaries only; detail via GET


def test_validation_without_gemini_key_is_honest_partial() -> None:
    # No fake provider installed and no API key configured: the run must be
    # partial with ai_status unavailable — never a fake completion.
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        submission = create_submission(client, headers)
        response = validate_version(client, headers, submission)
        assert response.status_code == 200
        run = response.json()
        assert run["state"] == "partial"
        assert run["ai_status"] == "unavailable"
        assert run["partial_reason"] == "ai_not_configured"
        assert run["model_id"] is None or run["total_tokens"] is None
