"""Validation reliability: provider failures, budgets, retries semantics,
restart persistence and duplicate-run protection. Gemini is mocked at the
provider boundary (FakeGeminiProvider) except where noted.
"""

from __future__ import annotations

import pathlib
import tempfile

from tests.helpers_3b import (
    FakeGeminiProvider,
    InvalidModelOutput,
    ProviderRateLimited,
    ProviderTimeout,
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


def test_provider_timeout_yields_partial_with_deterministic_findings() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        rule = client.post(
            "/api/v1/knowledge/rules",
            json={
                "category": "prohibited_term",
                "name": "No guarantees",
                "rule_text": "Never promise guaranteed outcomes.",
                "pattern": "guarantees",
                "matcher_type": "contains",
            },
            headers=headers,
        ).json()
        install_fake_provider(client, FakeGeminiProvider(error=ProviderTimeout("slow")))
        submission = create_submission(
            client, headers, text="This copy guarantees amazing outcomes."
        )
        response = validate_version(client, headers, submission)
        assert response.status_code == 200  # honest partial, not an error page
        run = response.json()
        assert run["state"] == "partial"
        assert run["ai_status"] == "partial"
        assert run["partial_reason"] == "provider_timeout"
        deterministic = [f for f in run["findings"] if f["source"] == "deterministic"]
        assert len(deterministic) == 1
        assert deterministic[0]["rule_id"] == rule["id"]
        detail = client.get(f"/api/v1/submissions/{submission['id']}").json()
        assert detail["status"] == "partial"


def test_provider_rate_limit_never_fakes_completion() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        install_fake_provider(
            client, FakeGeminiProvider(error=ProviderRateLimited("quota", retry_after_seconds=7))
        )
        submission = create_submission(client, headers)
        run = validate_version(client, headers, submission).json()
        assert run["state"] == "partial"
        assert run["partial_reason"] == "provider_rate_limited"
        assert run["error_code"] == "PROVIDER_RATE_LIMITED"
        assert run["ai_status"] != "complete"


def test_invalid_ai_output_is_reported_not_swallowed() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        install_fake_provider(client, FakeGeminiProvider(error=InvalidModelOutput("bad json")))
        submission = create_submission(client, headers)
        run = validate_version(client, headers, submission).json()
        assert run["state"] == "partial"
        assert run["partial_reason"] == "invalid_ai_output"
        assert run["ai_status"] == "partial"


def test_global_budget_exhaustion_skips_ai_and_reports_honestly() -> None:
    with make_client(
        validation_settings(tmp(), gemini_calls_per_day=1, gemini_tokens_per_day=100000)
    ) as client:
        headers = guest_session(client)
        provider = FakeGeminiProvider()
        install_fake_provider(client, provider)
        submission = create_submission(client, headers)
        first = validate_version(client, headers, submission).json()
        assert first["ai_status"] == "complete"

        # Second run (cache miss forced by a new version) hits the daily cap.
        version_two = client.post(
            f"/api/v1/submissions/{submission['id']}/versions",
            json={"text": "Second revision text, different content."},
            headers=headers,
        ).json()
        second = validate_version(client, headers, submission, version_id=version_two["id"]).json()
        assert second["ai_status"] == "skipped_budget"
        assert second["state"] == "partial"
        assert second["partial_reason"] == "provider_budget_exhausted"
        assert len(provider.calls) == 1


def test_stale_running_run_is_marked_failed_not_eternally_in_flight() -> None:
    # A run left `running` (process crash / restart mid-provider-call) older
    # than the provider timeout window must be swept to failed, never linger
    # as silently in-flight. The sweep is exercised on its own fingerprint.
    import datetime as dt

    from app.db.models import ContentVersion, ValidationRun, new_id
    from app.services.validation import _sweep_stale_runs

    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        submission = create_submission(client, headers)
        factory = client.app.state.session_factory

        with factory() as db:
            version = db.query(ContentVersion).filter_by(submission_id=submission["id"]).first()
            stale = ValidationRun(
                id=new_id("run"),
                workspace_id=version.workspace_id,
                submission_id=version.submission_id,
                content_version_id=version.id,
                requested_by=version.created_by,
                state="running",
                ai_status="pending",
                fingerprint="fp-stale-test",
                source_set_hash="0" * 64,
                rules_hash="0" * 64,
                prompt_version="x",
                created_at=dt.datetime.now(dt.UTC) - dt.timedelta(hours=1),
            )
            db.add(stale)
            db.commit()
            stale_id = stale.id

            _sweep_stale_runs(db, fingerprint="fp-stale-test", settings=client.app.state.settings)
            db.commit()
            swept = db.get(ValidationRun, stale_id)
            assert swept.state == "failed"
            assert swept.error_code == "interrupted"

            # A fresh running run is never touched by the sweep.
            fresh = ValidationRun(
                id=new_id("run"),
                workspace_id=version.workspace_id,
                submission_id=version.submission_id,
                content_version_id=version.id,
                requested_by=version.created_by,
                state="running",
                ai_status="pending",
                fingerprint="fp-stale-test",
                source_set_hash="0" * 64,
                rules_hash="0" * 64,
                prompt_version="x",
            )
            db.add(fresh)
            db.commit()
            fresh_id = fresh.id

            _sweep_stale_runs(db, fingerprint="fp-stale-test", settings=client.app.state.settings)
            db.commit()
            assert db.get(ValidationRun, fresh_id).state == "running"


def test_run_persists_across_backend_restart() -> None:
    path = pathlib.Path(tempfile.mkdtemp())
    database_url = f"sqlite:///{(path / 'restart.sqlite').as_posix()}"
    upload_dir = str(path / "uploads")

    settings = validation_settings(path, database_url=database_url, upload_dir=upload_dir)
    with make_client(settings) as client:
        headers = guest_session(client)
        provider = FakeGeminiProvider(findings=[ai_finding(quote="guarantees", claimed=[])])
        install_fake_provider(client, provider)
        submission = create_submission(client, headers)
        run = validate_version(client, headers, submission).json()
        run_id, submission_id = run["id"], submission["id"]

    # Simulated restart: a brand-new app process on the same SQLite volume.
    settings2 = validation_settings(path, database_url=database_url, upload_dir=upload_dir)
    session_cookie = client.cookies.get("brandsentry_session")
    with make_client(settings2) as client2:
        client2.cookies.set("brandsentry_session", session_cookie)
        fetched = client2.get(f"/api/v1/validation-runs/{run_id}")
        assert fetched.status_code == 200
        restored = fetched.json()
        assert restored["state"] == "completed"
        assert restored["findings"]
        assert restored["submission_id"] == submission_id
        listing = client2.get("/api/v1/validation-runs").json()
        assert len(listing["runs"]) == 1


def test_concurrent_duplicate_requests_do_not_double_call_provider() -> None:
    # Two identical validations racing: the second must reuse the first's run
    # or its cached result — never issue a second provider call. Simulated
    # sequentially through the same lease path a concurrent request takes.
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        provider = FakeGeminiProvider()
        install_fake_provider(client, provider)
        submission = create_submission(client, headers)

        first = validate_version(client, headers, submission, idempotency_key="race")
        assert first.status_code == 200
        second = validate_version(client, headers, submission, idempotency_key="race")
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"]
        assert len(provider.calls) == 1


def test_provider_latency_and_tokens_recorded_once_per_call() -> None:
    with make_client(validation_settings(tmp())) as client:
        headers = guest_session(client)
        provider = FakeGeminiProvider()
        install_fake_provider(client, provider)
        submission = create_submission(client, headers)
        run = validate_version(client, headers, submission).json()
        assert run["prompt_tokens"] == 100
        assert run["completion_tokens"] == 50
        assert run["provider_latency_ms"] == 25
        # A second identical request hits the cache: usage is NOT duplicated
        # or fabricated from the cache.
        cached = validate_version(client, headers, submission).json()
        assert cached["cache_hit"] is True
        assert cached["total_tokens"] is None
