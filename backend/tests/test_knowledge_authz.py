"""Phase 3A authorisation, isolation, rate limits and persistence tests.

Negative paths required by the operating contract: unauthenticated access,
CSRF enforcement, role-based write permissions, cross-workspace isolation
(guest↔guest and guest↔Google), rate limits on expensive operations, and
SQLite persistence across an application restart.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.helpers_2a import VALID_TOKEN, install_fake_verifier
from tests.helpers_3a import (
    GUIDELINE_TEXT,
    change_session_role,
    guest_session,
    knowledge_settings,
    make_client,
    upload_and_approve,
    upload_text,
)


@pytest.fixture()
def client(tmp_path: Path) -> Iterator[TestClient]:
    yield from make_client(knowledge_settings(tmp_path))


# ---------------------------------------------------------------------------
# Authentication and CSRF
# ---------------------------------------------------------------------------


def test_unauthenticated_requests_rejected(client: TestClient) -> None:
    for method, path, kwargs in (
        ("get", "/api/v1/knowledge/documents", {}),
        ("get", "/api/v1/knowledge/search", {"params": {"q": "anything"}}),
        ("get", "/api/v1/knowledge/rules", {}),
        ("get", "/api/v1/knowledge/claims", {}),
        ("post", "/api/v1/knowledge/documents", {"files": {"file": ("a.txt", b"x", "text/plain")}}),
        (
            "post",
            "/api/v1/knowledge/rules",
            {"json": {"category": "messaging_rule", "name": "n", "rule_text": "t", "pattern": "p"}},
        ),
    ):
        response = getattr(client, method)(path, **kwargs)
        assert response.status_code == 401, f"{method.upper()} {path} must require a session"
        assert response.json()["error"]["code"] == "UNAUTHENTICATED"


def test_mutations_require_csrf_header(client: TestClient) -> None:
    guest_session(client)  # establishes the session cookie without returning headers
    response = client.post(
        "/api/v1/knowledge/documents",
        files={"file": ("guide.txt", GUIDELINE_TEXT.encode(), "text/plain")},
        data={"title": "Guide", "doc_type": "guidelines"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


# ---------------------------------------------------------------------------
# Role-based write permissions
# ---------------------------------------------------------------------------


def test_creator_may_upload_but_not_approve_or_author_rules(client: TestClient) -> None:
    headers = guest_session(client)
    change_session_role(client, "creator")

    payload = upload_text(client, headers)
    assert payload["document"]["status"] == "pending"
    document_id = payload["document"]["id"]

    approve = client.post(f"/api/v1/knowledge/documents/{document_id}/approve", headers=headers)
    assert approve.status_code == 403

    rule = client.post(
        "/api/v1/knowledge/rules",
        json={
            "category": "prohibited_term",
            "name": "no guarantees",
            "rule_text": "no guarantees",
            "pattern": "guarantee",
        },
        headers=headers,
    )
    assert rule.status_code == 403

    claim = client.post(
        "/api/v1/knowledge/claims",
        json={"claim_text": "Contains 60% recycled plastic."},
        headers=headers,
    )
    assert claim.status_code == 403

    delete = client.delete(f"/api/v1/knowledge/documents/{document_id}", headers=headers)
    assert delete.status_code == 403

    # Reads stay available to every workspace member.
    assert client.get("/api/v1/knowledge/documents", headers=headers).status_code == 200


def test_reviewer_cannot_write_knowledge(client: TestClient) -> None:
    headers = guest_session(client)
    change_session_role(client, "reviewer")
    response = client.post(
        "/api/v1/knowledge/documents",
        files={"file": ("guide.txt", GUIDELINE_TEXT.encode(), "text/plain")},
        data={"title": "Guide", "doc_type": "guidelines"},
        headers=headers,
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "FORBIDDEN"


def test_admin_can_approve_own_workspace_material(client: TestClient) -> None:
    """Server-side role permitting: a workspace admin may approve uploads in
    their own workspace (the Phase 2A model gives every actor one workspace
    they administer); unauthorised roles are rejected above."""
    headers = guest_session(client)
    payload = upload_text(client, headers)
    approve = client.post(
        f"/api/v1/knowledge/documents/{payload['document']['id']}/approve", headers=headers
    )
    assert approve.status_code == 200
    assert approve.json()["status"] == "approved"


# ---------------------------------------------------------------------------
# Workspace isolation
# ---------------------------------------------------------------------------


def test_guest_cannot_reach_another_guests_knowledge(tmp_path: Path) -> None:
    from app.main import create_app

    settings = knowledge_settings(tmp_path)
    with TestClient(create_app(settings)) as client_a:
        headers_a = guest_session(client_a)
        payload = upload_and_approve(client_a, headers_a, title="Private Rules")
        document_id = payload["document"]["id"]

        with TestClient(create_app(settings)) as client_b:
            headers_b = guest_session(client_b)

            listed = client_b.get("/api/v1/knowledge/documents", headers=headers_b).json()
            assert listed["documents"] == []

            assert (
                client_b.get(
                    f"/api/v1/knowledge/documents/{document_id}", headers=headers_b
                ).status_code
                == 404
            )
            assert (
                client_b.get(
                    f"/api/v1/knowledge/documents/{document_id}/chunks", headers=headers_b
                ).status_code
                == 404
            )
            assert (
                client_b.post(
                    f"/api/v1/knowledge/documents/{document_id}/approve", headers=headers_b
                ).status_code
                == 404
            )
            assert (
                client_b.delete(
                    f"/api/v1/knowledge/documents/{document_id}", headers=headers_b
                ).status_code
                == 404
            )

            # Guest B searching for guest A's exact content finds nothing.
            search = client_b.get("/api/v1/knowledge/search", params={"q": "guaranteed outcomes"})
            assert search.json()["results"] == []

            # A rule linked to guest A's document id is rejected, not silently created.
            linked_rule = client_b.post(
                "/api/v1/knowledge/rules",
                json={
                    "category": "claim_requirement",
                    "name": "leak attempt",
                    "rule_text": "attempt",
                    "pattern": "x",
                    "source_document_id": document_id,
                },
                headers=headers_b,
            )
            assert linked_rule.status_code == 404


def test_guest_isolated_from_google_user_workspace(tmp_path: Path) -> None:
    from app.main import create_app

    settings = knowledge_settings(tmp_path)
    with TestClient(create_app(settings)) as client:
        install_fake_verifier(client)
        headers_guest = guest_session(client)
        guest_payload = upload_and_approve(client, headers_guest, title="Guest Demo Policy")

        # Same client (cookie jar): sign in as a Google user, replacing the session.
        google_login = client.post("/api/v1/auth/google", json={"id_token": VALID_TOKEN})
        assert google_login.status_code == 200
        headers_google = {"X-CSRF-Token": google_login.json()["csrf_token"]}

        listed = client.get("/api/v1/knowledge/documents", headers=headers_google).json()
        assert listed["documents"] == []  # the Google workspace cannot see guest data

        document_id = guest_payload["document"]["id"]
        assert (
            client.get(
                f"/api/v1/knowledge/documents/{document_id}", headers=headers_google
            ).status_code
            == 404
        )
        search = client.get("/api/v1/knowledge/search", params={"q": "guaranteed outcomes"})
        assert search.json()["results"] == []


# ---------------------------------------------------------------------------
# Rate limits (DB-backed, no Redis)
# ---------------------------------------------------------------------------


def test_upload_rate_limit_returns_429_with_retry_after(tmp_path: Path) -> None:
    from app.main import create_app

    settings = knowledge_settings(tmp_path, knowledge_uploads_per_hour=2)
    with TestClient(create_app(settings)) as client:
        headers = guest_session(client)
        upload_text(client, headers, title="Doc A")
        upload_text(client, headers, title="Doc B")
        third = client.post(
            "/api/v1/knowledge/documents",
            files={"file": ("c.txt", b"content c", "text/plain")},
            data={"title": "Doc C", "doc_type": "source_document"},
            headers=headers,
        )
        assert third.status_code == 429
        assert third.json()["error"]["code"] == "RATE_LIMITED"
        assert "Retry-After" in third.headers


def test_search_rate_limit_returns_429(tmp_path: Path) -> None:
    from app.main import create_app

    settings = knowledge_settings(tmp_path, knowledge_searches_per_hour=2)
    with TestClient(create_app(settings)) as client:
        guest_session(client)
        for _ in range(2):
            assert (
                client.get("/api/v1/knowledge/search", params={"q": "anything"}).status_code == 200
            )
        third = client.get("/api/v1/knowledge/search", params={"q": "anything"})
        assert third.status_code == 429
        assert "Retry-After" in third.headers


# ---------------------------------------------------------------------------
# Persistence across restart (local analogue of a backend restart)
# ---------------------------------------------------------------------------


def test_knowledge_survives_application_restart(tmp_path: Path) -> None:
    from app.db.models import KnowledgeChunk, KnowledgeDocument, KnowledgeDocumentVersion
    from app.main import create_app

    settings = knowledge_settings(tmp_path)
    with TestClient(create_app(settings)) as client:
        headers = guest_session(client)
        payload = upload_and_approve(client, headers, title="Durable Policy")
        document_id = payload["document"]["id"]

    # Simulated restart: fresh app instance against the same SQLite file.
    with TestClient(create_app(settings)) as restarted:
        factory = restarted.app.state.session_factory
        with factory() as db:
            from sqlalchemy import select

            document = db.scalar(
                select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
            )
            assert document is not None
            assert document.status == "approved"
            chunks = db.scalars(
                select(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id)
            ).all()
            assert len(chunks) >= 1

            version = db.scalar(
                select(KnowledgeDocumentVersion).where(
                    KnowledgeDocumentVersion.document_id == document_id
                )
            )
            assert version is not None
            storage_path = Path(version.storage_path)
            assert storage_path.exists()

        # The FTS index was rebuilt-free but must still serve the old content:
        # prove it through the service layer against the restarted app's DB.
        from app.services.retrieval import FtsRetrievalService

        with factory() as db:
            results = FtsRetrievalService().search(
                db, workspace_id=document.workspace_id, query="guaranteed outcomes", top_k=5
            )
            assert len(results) >= 1

        # A brand-new guest session is still isolated from the old workspace.
        headers_new = guest_session(restarted)
        assert (
            restarted.get("/api/v1/knowledge/documents", headers=headers_new).json()["documents"]
            == []
        )
