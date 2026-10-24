"""Phase 5A: real HTTP/SQLite, MOCK Gemini only. No live provider requests."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from app.db.migrations import make_alembic_config
from app.db.models import (
    AuthSession,
    Membership,
    ReviewDecision,
    ReviewState,
    User,
    ValidationRun,
    Workspace,
    new_id,
)
from app.db.session import make_engine
from tests.helpers_3a import upload_and_approve
from tests.helpers_3b import (
    FakeGeminiProvider,
    ProviderRateLimited,
    ProviderTimeout,
    ai_finding,
    change_session_role,
    create_submission,
    guest_session,
    install_fake_provider,
    make_client,
    validate_version,
    validation_settings,
)


def setup_run(client, *, findings=True, provider=True):
    headers = guest_session(client)
    if provider:
        install_fake_provider(
            client,
            FakeGeminiProvider(
                findings=[ai_finding(quote="guarantees", claimed=[])] if findings else []
            ),
        )
    submission = create_submission(client, headers)
    response = validate_version(client, headers, submission)
    assert response.status_code == 200, response.text
    return headers, submission, response.json()


def path(run):
    return f"/api/v1/validation-runs/{run['id']}/review"


def finding(client, headers, run, revision=0, decision="reject", key="finding-key", **extra):
    return client.post(
        f"{path(run)}/findings/{run['findings'][0]['id']}",
        headers={**headers, "Idempotency-Key": key},
        json={
            "expected_revision": revision,
            "decision": decision,
            "notes": "Human investigated the issue; documented exception.",
            **extra,
        },
    )


def final(client, headers, run, revision=0, decision="approve", key="final-key", **extra):
    return client.post(
        f"{path(run)}/decision",
        headers={**headers, "Idempotency-Key": key},
        json={"expected_revision": revision, "decision": decision, **extra},
    )


def test_complete_flow_and_immutable_engine_output(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, submission, run = setup_run(client)
        before = client.get(f"/api/v1/validation-runs/{run['id']}").json()
        detail = client.get(path(run)).json()
        assert detail["revision"] == 0 and detail["status"] == "pending"
        assert detail["content_text"].startswith("Our product")
        assert detail["unresolved_finding_ids"] == [run["findings"][0]["id"]]
        assert final(client, headers, run).status_code == 409
        accepted = finding(client, headers, run, decision="accept").json()
        assert accepted["revision"] == 1 and accepted["is_demo"] is True
        assert accepted["actor_id"] == submission["created_by"]
        assert datetime.fromisoformat(accepted["created_at"]).utcoffset() == timedelta(0)
        assert final(client, headers, run, 1).status_code == 409
        assert finding(client, headers, run, 1, "flag", "flag-key").status_code == 200
        assert final(client, headers, run, 2, "request_changes").status_code == 409
        assert finding(client, headers, run, 2, key="resolve-key").status_code == 200
        result = final(client, headers, run, 3)
        assert result.status_code == 200, result.text
        detail = client.get(path(run)).json()
        assert detail["status"] == "approved" and detail["revision"] == 4
        assert [d["decision"] for d in detail["decisions"]] == [
            "accept",
            "flag",
            "reject",
            "approve",
        ]
        assert client.get(f"/api/v1/validation-runs/{run['id']}").json() == before
        assert before["findings"][0]["verification_status"] == "NEEDS_VERIFICATION"
        # Human approval is separate; validation status is not rewritten.
        assert client.get(f"/api/v1/submissions/{submission['id']}").json()["status"] == "validated"
        assert finding(client, headers, run, 4, key="after-final").status_code == 409
        assert final(client, headers, run, 4, "request_changes", "after-final-2").status_code == 409


def test_accept_issue_allows_request_changes(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client)
        assert finding(client, headers, run, decision="accept", notes=None).status_code == 200
        assert final(client, headers, run, 1, "request_changes").status_code == 200
        assert client.get(path(run)).json()["status"] == "changes_requested"


def test_no_findings_allows_human_approval(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client, findings=False)
        assert final(client, headers, run).status_code == 200


@pytest.mark.parametrize(
    "provider_error", [None, ProviderRateLimited("limited"), ProviderTimeout("timeout")]
)
def test_partial_never_approves_but_can_request_changes(tmp_path, provider_error):
    with make_client(validation_settings(tmp_path)) as client:
        headers = guest_session(client)
        if provider_error:
            install_fake_provider(client, FakeGeminiProvider(error=provider_error))
        submission = create_submission(client, headers)
        run = validate_version(client, headers, submission).json()
        assert run["state"] == "partial"
        assert final(client, headers, run).status_code == 409
        assert final(client, headers, run, decision="request_changes").status_code == 200


@pytest.mark.parametrize("state", ["pending", "running", "failed"])
def test_nonterminal_or_failed_run_cannot_be_reviewed(tmp_path, state):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client)
        with client.app.state.session_factory() as db:
            db.get(ValidationRun, run["id"]).state = state
            db.commit()
        assert finding(client, headers, run).status_code == 409
        assert final(client, headers, run, decision="request_changes").status_code == 409


def test_idempotency_and_stale_revision(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client)
        first = finding(client, headers, run)
        assert first.status_code == 200
        assert finding(client, headers, run).json() == first.json()
        assert finding(client, headers, run, decision="flag").status_code == 409
        assert finding(client, headers, run, key="stale-key").status_code == 409
        approved = final(client, headers, run, 1)
        assert approved.status_code == 200
        assert final(client, headers, run, 1).json() == approved.json()
        assert final(client, headers, run, 1, "request_changes").status_code == 409
        with client.app.state.session_factory() as db:
            assert db.scalar(select(func.count()).select_from(ReviewDecision)) == 2


@pytest.mark.parametrize(
    "body_update",
    [
        {"notes": None},
        {"notes": "   "},
        {"notes": "x" * 2001},
        {"decision": "approve"},
        {"expected_revision": -1},
        {"expected_revision": True},
        {"actor_id": "forged"},
        {"verification_status": "SUPPORTED"},
    ],
)
def test_invalid_finding_body(tmp_path, body_update):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client)
        assert finding(client, headers, run, **body_update).status_code == 422
        assert client.get(path(run)).json()["revision"] == 0


def test_auth_role_csrf_invalid_ids_and_workspace_isolation(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client)
        cookies = dict(client.cookies)
        # No CSRF and invalid replay-key/body contracts.
        assert final(client, {}, run).status_code == 403
        assert (
            client.post(
                f"{path(run)}/decision",
                headers=headers,
                json={"expected_revision": 0, "decision": "approve"},
            ).status_code
            == 422
        )
        assert final(client, headers, run, key=" ").status_code == 422
        assert final(client, headers, run, decision="reject").status_code == 422
        assert client.get("/api/v1/validation-runs/missing/review").status_code == 404
        assert (
            client.post(
                f"{path(run)}/findings/missing",
                headers={**headers, "Idempotency-Key": "x"},
                json={"expected_revision": 0, "decision": "flag"},
            ).status_code
            == 404
        )
        change_session_role(client, "creator")
        assert client.get(path(run)).status_code == 200
        assert finding(client, headers, run).status_code == 403
        assert final(client, headers, run).status_code == 403
        change_session_role(client, "reviewer")
        assert finding(client, headers, run).status_code == 200
        other_headers = guest_session(client)
        assert client.get(path(run)).status_code == 404
        assert finding(client, other_headers, run).status_code == 404
        assert final(client, other_headers, run).status_code == 404
        client.cookies.clear()
        assert client.get(path(run)).status_code == 401
        assert final(client, headers, run).status_code == 401
        client.cookies.update(cookies)
        with client.app.state.session_factory() as db:
            for session in db.scalars(select(AuthSession)):
                session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
            db.commit()
        assert finding(client, headers, run).status_code == 401


def test_revoked_session_and_removed_membership(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client)
        me = client.get("/api/v1/auth/me").json()
        with client.app.state.session_factory() as db:
            membership = db.scalar(select(Membership).where(Membership.user_id == me["user"]["id"]))
            db.delete(membership)
            db.commit()
        assert final(client, headers, run).status_code == 401


def test_real_self_review_forbidden_separate_reviewer_allowed(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, submission, run = setup_run(client, findings=False)
        me = client.get("/api/v1/auth/me").json()
        workspace_id = me["workspace"]["id"]
        with client.app.state.session_factory() as db:
            db.get(Workspace, workspace_id).kind = "real"
            db.get(User, submission["created_by"]).user_kind = "google"
            db.commit()
        assert final(client, headers, run).status_code == 403
        # Test-only provisioning: no public role/membership administration added.
        reviewer_headers = guest_session(client)
        reviewer_id = client.get("/api/v1/auth/me").json()["user"]["id"]
        with client.app.state.session_factory() as db:
            session = db.scalar(select(AuthSession).where(AuthSession.user_id == reviewer_id))
            session.workspace_id = workspace_id
            db.get(User, reviewer_id).user_kind = "google"
            db.add(
                Membership(
                    id=new_id("mem"),
                    workspace_id=workspace_id,
                    user_id=reviewer_id,
                    role="reviewer",
                )
            )
            db.commit()
        approved = final(client, reviewer_headers, run)
        assert approved.status_code == 200, approved.text
        assert approved.json()["actor_id"] == reviewer_id
        assert approved.json()["is_demo"] is False
        assert approved.json()["actor_role"] == "reviewer"


def test_new_version_and_new_run_make_old_review_historical(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, submission, run = setup_run(client, findings=False)
        original = final(client, headers, run)
        assert original.status_code == 200
        newer = validate_version(client, headers, submission).json()
        assert newer["id"] != run["id"]
        old_detail = client.get(path(run)).json()
        assert old_detail["status"] == "approved" and old_detail["is_current"] is False
        # Exact retry remains a receipt even after a newer run exists.
        assert final(client, headers, run).json() == original.json()
        assert final(client, headers, run, 1, key="new-request").status_code == 409
        assert final(client, headers, newer, key="new-run").status_code == 200
        response = client.post(
            f"/api/v1/submissions/{submission['id']}/versions",
            headers=headers,
            json={"text": "A new draft."},
        )
        assert response.status_code == 201
        assert client.get(path(newer)).json()["is_current"] is False
        assert client.get(path(newer)).json()["status"] == "approved"


def test_finding_from_another_run_rejected(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, submission, run = setup_run(client)
        second = validate_version(client, headers, submission).json()
        wrong = {**second, "findings": run["findings"]}
        assert finding(client, headers, wrong).status_code == 404


def test_evidence_snapshot_retained_after_source_delete_and_human_review(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers = guest_session(client)
        source = upload_and_approve(
            client, headers, title="Synthetic policy", content="Never promise guaranteed outcomes."
        )
        submission = create_submission(client, headers, text="We promise guaranteed outcomes.")
        search = client.get("/api/v1/knowledge/search?q=guaranteed").json()
        chunk_id = search["results"][0]["chunk_id"]
        install_fake_provider(
            client,
            FakeGeminiProvider(
                findings=[ai_finding(quote="guaranteed outcomes", claimed=[chunk_id])]
            ),
        )
        run = validate_version(client, headers, submission).json()
        assert run["findings"][0]["evidence_chunk_ids"] == [chunk_id]
        document_id = run["evidence"][0]["document_id"]
        assert source is not None
        assert client.delete(
            f"/api/v1/knowledge/documents/{document_id}", headers=headers
        ).status_code in (200, 204)
        assert finding(client, headers, run).status_code == 200
        assert final(client, headers, run, 1).status_code == 200
        detail = client.get(path(run)).json()
        assert detail["run"] == run
        assert detail["run"]["evidence"][0]["text"]


@pytest.mark.parametrize("same_request", [False, True])
def test_concurrent_reviews_do_not_overwrite(tmp_path, same_request):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client)
        barrier = Barrier(2)

        # Separate HTTP clients sharing only the test session, not cookie jars.
        def write(index):
            worker = TestClient(client.app)
            worker.cookies.update(dict(client.cookies))
            barrier.wait(timeout=10)
            return finding(
                worker,
                headers,
                run,
                decision="reject" if same_request or index == 0 else "flag",
                key="same-key" if same_request else f"key-{index}",
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(write, range(2)))
        assert sorted(r.status_code for r in results) == (
            [200, 200] if same_request else [200, 409]
        )
        if same_request:
            assert results[0].json() == results[1].json()
        detail = client.get(path(run)).json()
        assert detail["revision"] == 1 and len(detail["decisions"]) == 1


def test_concurrent_final_and_finding_decision(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client)
        assert finding(client, headers, run).status_code == 200
        barrier = Barrier(2)

        def write(index):
            worker = TestClient(client.app)
            worker.cookies.update(dict(client.cookies))
            barrier.wait(timeout=10)
            if index:
                return final(worker, headers, run, 1)
            return finding(worker, headers, run, 1, "flag", "flag-key")

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(write, range(2)))
        assert sorted(r.status_code for r in results) == [200, 409]
        detail = client.get(path(run)).json()
        assert detail["revision"] == 2
        if detail["status"] == "approved":
            assert not detail["unresolved_finding_ids"]
        else:
            assert detail["unresolved_finding_ids"]


def test_restart_and_database_immutability(tmp_path):
    settings = validation_settings(tmp_path)
    with make_client(settings) as client:
        headers, _, run = setup_run(client, findings=False)
        result = final(client, headers, run)
        assert result.status_code == 200
        cookies = dict(client.cookies)
        expected = client.get(path(run)).json()
        with client.app.state.session_factory() as db:
            with pytest.raises(IntegrityError, match="immutable"):
                db.execute(text("UPDATE review_decisions SET decision='request_changes'"))
            db.rollback()
            with pytest.raises(IntegrityError, match="immutable"):
                db.execute(text("DELETE FROM review_decisions"))
            db.rollback()
            assert db.get(ReviewState, run["id"]).revision == 1
    with make_client(settings) as restarted:
        restarted.cookies.update(cookies)
        assert restarted.get(path(run)).json() == expected
        assert final(restarted, headers, run).json() == result.json()


def test_migration_upgrade_existing_database_and_downgrade(tmp_path):
    settings = validation_settings(tmp_path)
    # Populate using the previous schema, then prove additive migration works.
    config = make_alembic_config(settings.database_url)
    engine = make_engine(settings.database_url)
    command.upgrade(config, "0005_provider_budget_reservation")
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO users (id,display_name,user_kind,created_at) "
                "VALUES ('existing','Existing','google',CURRENT_TIMESTAMP)"
            )
        )
    command.upgrade(config, "head")
    assert "review_decisions" in inspect(engine).get_table_names()
    with engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT display_name FROM users WHERE id='existing'"))
            == "Existing"
        )
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    command.downgrade(config, "0005_provider_budget_reservation")
    assert "review_decisions" not in inspect(engine).get_table_names()
    command.upgrade(config, "head")
    engine.dispose()


def test_audit_failure_rolls_back_state_and_allows_clean_retry(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client, findings=False)
        factory = client.app.state.session_factory
        with factory() as db:
            db.execute(
                text(
                    "CREATE TRIGGER test_reject_event BEFORE INSERT ON review_decisions "
                    "BEGIN SELECT RAISE(ABORT, 'test audit failure'); END"
                )
            )
            db.commit()
        assert final(client, headers, run).status_code == 409
        with factory() as db:
            assert db.get(ReviewState, run["id"]) is None
            assert db.scalar(select(func.count()).select_from(ReviewDecision)) == 0
            db.execute(text("DROP TRIGGER test_reject_event"))
            db.commit()
        assert final(client, headers, run).status_code == 200


def test_new_unreviewed_version_blocks_old_final_decision(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, submission, run = setup_run(client, findings=False)
        assert (
            client.post(
                f"/api/v1/submissions/{submission['id']}/versions",
                headers=headers,
                json={"text": "New immutable copy."},
            ).status_code
            == 201
        )
        assert final(client, headers, run).status_code == 409
        detail = client.get(path(run)).json()
        assert detail["status"] == "pending" and detail["is_current"] is False


def test_migration_retains_preexisting_content_findings_and_evidence(tmp_path):
    settings = validation_settings(tmp_path)
    with make_client(settings) as client:
        headers, _, run = setup_run(client)
        cookies = dict(client.cookies)
    config = make_alembic_config(settings.database_url)
    command.downgrade(config, "0005_provider_budget_reservation")
    command.upgrade(config, "head")
    with make_client(settings) as client:
        client.cookies.update(cookies)
        assert client.get(path(run)).json()["run"] == run
        assert finding(client, headers, run).status_code == 200


def test_revoked_session_cannot_replay_decision(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client, findings=False)
        assert final(client, headers, run).status_code == 200
        cookies = dict(client.cookies)
        assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
        client.cookies.update(cookies)
        assert final(client, headers, run).status_code == 401


def test_all_findings_required_and_deterministic_output_untouched(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, submission, _ = setup_run(client)
        assert (
            client.post(
                "/api/v1/knowledge/rules",
                headers=headers,
                json={
                    "category": "prohibited_term",
                    "name": "Synthetic rule",
                    "pattern": "guarantees",
                    "rule_text": "No guarantees.",
                    "matcher_type": "contains",
                },
            ).status_code
            == 201
        )
        run = validate_version(client, headers, submission).json()
        assert len(run["findings"]) == 2
        assert {f["source"] for f in run["findings"]} == {"ai", "deterministic"}
        assert finding(client, headers, run).status_code == 200
        assert final(client, headers, run, 1).status_code == 409
        second_finding = {**run, "findings": [run["findings"][1]]}
        assert finding(client, headers, second_finding, 1, key="second-finding").status_code == 200
        assert final(client, headers, run, 2).status_code == 200
        assert client.get(path(run)).json()["run"] == run


def test_distinct_reviewers_compete_without_silent_overwrite(tmp_path):
    with make_client(validation_settings(tmp_path)) as client:
        headers, _, run = setup_run(client, findings=False)
        first_cookies = dict(client.cookies)
        workspace_id = client.get("/api/v1/auth/me").json()["workspace"]["id"]
        other_headers = guest_session(client)
        other_id = client.get("/api/v1/auth/me").json()["user"]["id"]
        with client.app.state.session_factory() as db:
            session = db.scalar(select(AuthSession).where(AuthSession.user_id == other_id))
            session.workspace_id = workspace_id
            db.add(
                Membership(
                    id=new_id("mem"), workspace_id=workspace_id, user_id=other_id, role="reviewer"
                )
            )
            db.commit()
        second_cookies = dict(client.cookies)
        barrier = Barrier(2)

        def write(index):
            worker = TestClient(client.app)
            worker.cookies.update(second_cookies if index else first_cookies)
            barrier.wait(timeout=10)
            return final(
                worker,
                other_headers if index else headers,
                run,
                decision="request_changes" if index else "approve",
            )

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(write, range(2)))
        assert sorted(r.status_code for r in results) == [200, 409]
        detail = client.get(path(run)).json()
        assert detail["revision"] == 1 and len(detail["decisions"]) == 1
