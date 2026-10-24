"""Phase 3A brand rule and approved claim management tests.

Rules/claims are explicit, admin-authored records — nothing is auto-extracted
from uploads. Every mutation is versioned or auditable.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.helpers_3a import guest_session, knowledge_settings, make_client, upload_and_approve


@pytest.fixture()
def client(tmp_path: Path) -> Iterator[TestClient]:
    yield from make_client(knowledge_settings(tmp_path))


RULE = {
    "category": "prohibited_term",
    "name": "No absolute guarantees",
    "rule_text": "Never promise guaranteed outcomes; this is a prohibited claim pattern.",
    "pattern": "guarantee",
    "matcher_type": "contains",
    "replacement": "may support",
}


def test_create_and_list_rule(client: TestClient) -> None:
    headers = guest_session(client)
    response = client.post("/api/v1/knowledge/rules", json=RULE, headers=headers)
    assert response.status_code == 201, response.text
    rule = response.json()
    assert rule["version"] == 1
    assert rule["enabled"] is True
    assert rule["matcher_type"] == "contains"

    listing = client.get("/api/v1/knowledge/rules").json()["rules"]
    assert [r["id"] for r in listing] == [rule["id"]]


def test_update_rule_bumps_version(client: TestClient) -> None:
    headers = guest_session(client)
    rule = client.post("/api/v1/knowledge/rules", json=RULE, headers=headers).json()
    update = client.patch(
        f"/api/v1/knowledge/rules/{rule['id']}",
        json={"pattern": "guaranteed", "enabled": False, "replacement": None},
        headers=headers,
    )
    assert update.status_code == 200
    updated = update.json()
    assert updated["version"] == 2
    assert updated["pattern"] == "guaranteed"
    assert updated["enabled"] is False
    assert updated["replacement"] is None  # explicit clearing allowed
    assert updated["name"] == RULE["name"]  # untouched fields preserved

    original_version = client.get("/api/v1/knowledge/rules").json()["rules"][0]
    assert original_version["version"] == 2


def test_invalid_rule_inputs_rejected(client: TestClient) -> None:
    headers = guest_session(client)
    bad_category = {**RULE, "category": "vibes"}
    assert (
        client.post("/api/v1/knowledge/rules", json=bad_category, headers=headers).status_code
        == 422
    )
    bad_matcher = {**RULE, "matcher_type": "fuzzy"}
    assert (
        client.post("/api/v1/knowledge/rules", json=bad_matcher, headers=headers).status_code == 422
    )
    bad_regex = {**RULE, "matcher_type": "regex", "pattern": "([unclosed"}
    assert (
        client.post("/api/v1/knowledge/rules", json=bad_regex, headers=headers).status_code == 422
    )


def test_rule_can_reference_same_workspace_document(client: TestClient) -> None:
    headers = guest_session(client)
    payload = upload_and_approve(client, headers)
    rule = client.post(
        "/api/v1/knowledge/rules",
        json={**RULE, "source_document_id": payload["document"]["id"], "source_section_ref": "s1"},
        headers=headers,
    )
    assert rule.status_code == 201
    assert rule.json()["source_document_id"] == payload["document"]["id"]


def test_claims_crud_and_retirement(client: TestClient) -> None:
    headers = guest_session(client)
    created = client.post(
        "/api/v1/knowledge/claims",
        json={
            "claim_text": "The bottle contains 60% recycled plastic.",
            "source_section_ref": "s2",
        },
        headers=headers,
    )
    assert created.status_code == 201
    claim = created.json()
    assert claim["status"] == "active"

    retired = client.patch(
        f"/api/v1/knowledge/claims/{claim['id']}", json={"status": "retired"}, headers=headers
    )
    assert retired.status_code == 200
    assert retired.json()["status"] == "retired"

    edited = client.patch(
        f"/api/v1/knowledge/claims/{claim['id']}",
        json={
            "claim_text": "The bottle contains at least 60% recycled plastic.",
            "status": "active",
        },
        headers=headers,
    )
    assert edited.status_code == 200
    assert "at least" in edited.json()["claim_text"]

    listing = client.get("/api/v1/knowledge/claims").json()["claims"]
    assert len(listing) == 1


def test_invalid_claim_status_rejected(client: TestClient) -> None:
    headers = guest_session(client)
    claim = client.post(
        "/api/v1/knowledge/claims", json={"claim_text": "Synthetic claim."}, headers=headers
    ).json()
    response = client.patch(
        f"/api/v1/knowledge/claims/{claim['id']}",
        json={"status": "approved-by-magic"},
        headers=headers,
    )
    assert response.status_code == 422


def test_other_workspace_rule_invisible(tmp_path: Path) -> None:
    from fastapi.testclient import TestClient as TC

    from app.main import create_app

    settings = knowledge_settings(tmp_path)
    with TC(create_app(settings)) as client_a:
        headers_a = guest_session(client_a)
        rule = client_a.post("/api/v1/knowledge/rules", json=RULE, headers=headers_a).json()
    with TC(create_app(settings)) as client_b:
        guest_session(client_b)
        assert client_b.get(f"/api/v1/knowledge/rules/{rule['id']}").status_code in (404, 405)
        listing = client_b.get("/api/v1/knowledge/rules").json()["rules"]
        assert listing == []
        patch = client_b.patch(
            f"/api/v1/knowledge/rules/{rule['id']}",
            json={"enabled": False},
            headers=guest_session(client_b),
        )
        assert patch.status_code == 404
