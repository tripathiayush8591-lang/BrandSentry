"""Live HTTP smoke test for Phase 3A against a running backend (LIVE_BACKEND)."""

from __future__ import annotations

import httpx

BASE = "http://127.0.0.1:8010"

GUIDELINES = (
    "# Brand Guidelines\n\n"
    "Never promise guaranteed outcomes.\n\n"
    "The preferred product name is EcoBlend."
)

client = httpx.Client(base_url=BASE, timeout=30)

print("== health/ready ==")
print(client.get("/health").json()["status"], client.get("/ready").json()["status"])

print("== unauthenticated search -> 401 ==")
r = client.get("/api/v1/knowledge/search", params={"q": "anything"})
assert r.status_code == 401, r.text
print(r.status_code, r.json()["error"]["code"])

print("== guest login ==")
r = client.post("/api/v1/auth/guest")
assert r.status_code == 201, r.text
csrf = r.json()["csrf_token"]
headers = {"X-CSRF-Token": csrf}
print("role:", r.json()["role"], "workspace kind:", r.json()["workspace"]["kind"])

print("== upload txt (multipart, LIVE extraction) ==")
r = client.post(
    "/api/v1/knowledge/documents",
    files={"file": ("guidelines.txt", GUIDELINES.encode(), "text/plain")},
    data={"title": "Brand Guidelines", "doc_type": "guidelines"},
    headers=headers,
)
assert r.status_code == 201, r.text
payload = r.json()
doc_id = payload["document"]["id"]
print(
    "status:",
    payload["document"]["status"],
    "| checksum:",
    payload["version"]["checksum_sha256"][:12],
    "| chunks:",
    payload["chunk_count"],
)

print("== search before approval -> empty ==")
r = client.get("/api/v1/knowledge/search", params={"q": "guaranteed"})
print(r.status_code, "results:", len(r.json()["results"]))

print("== approve ==")
r = client.post(f"/api/v1/knowledge/documents/{doc_id}/approve", headers=headers)
assert r.status_code == 200, r.text
print(r.json()["status"])

print("== search after approval ==")
r = client.get("/api/v1/knowledge/search", params={"q": "guaranteed outcomes"})
assert r.status_code == 200 and r.json()["results"], r.text
top = r.json()["results"][0]
print("top:", {"section": top["section_ref"], "score": top["score"], "text": top["text"][:48]})

print("== special chars query ==")
r = client.get("/api/v1/knowledge/search", params={"q": 'EcoBlend "100%" (AND NOT NEAR)*'})
print(r.status_code, "results:", len(r.json()["results"]))

print("== create rule + claim ==")
r = client.post(
    "/api/v1/knowledge/rules",
    json={
        "category": "prohibited_term",
        "name": "No guarantees",
        "rule_text": "Never promise guaranteed outcomes.",
        "pattern": "guarantee",
        "source_document_id": doc_id,
        "source_section_ref": top["section_ref"],
    },
    headers=headers,
)
assert r.status_code == 201, r.text
print("rule version:", r.json()["version"])

r = client.post(
    "/api/v1/knowledge/claims",
    json={"claim_text": "The bottle contains 60% recycled plastic.", "source_document_id": doc_id},
    headers=headers,
)
assert r.status_code == 201, r.text
print("claim status:", r.json()["status"])

print("== duplicate upload idempotent ==")
r = client.post(
    "/api/v1/knowledge/documents",
    files={"file": ("guidelines.txt", GUIDELINES.encode(), "text/plain")},
    data={"title": "Brand Guidelines", "doc_type": "guidelines"},
    headers=headers,
)
assert r.status_code == 201 and r.json()["created_new_version"] is False, r.text
print("created_new_version:", r.json()["created_new_version"])

print("== corrupted PDF -> 400 ==")
r = client.post(
    "/api/v1/knowledge/documents",
    files={"file": ("broken.pdf", b"%PDF-1.4 junk", "application/pdf")},
    data={"title": "Broken"},
    headers=headers,
)
assert r.status_code == 400, r.text
print(r.status_code, r.json()["error"]["message"][:60])

print("== CSRF missing -> 403 ==")
r = client.post("/api/v1/knowledge/claims", json={"claim_text": "no csrf token present"})
assert r.status_code == 403, r.text
print(r.status_code, r.json()["error"]["code"])

print("SMOKE PASS")
