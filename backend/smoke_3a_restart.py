"""Phase 3A restart-persistence smoke: run BEFORE restart, then AFTER."""

from __future__ import annotations

import sys
from pathlib import Path

import httpx

BASE = "http://127.0.0.1:8010"
COOKIE_FILE = Path(".data/smoke/session.txt")

client = httpx.Client(base_url=BASE, timeout=30, cookies=httpx.Cookies())

mode = sys.argv[1]
if mode == "before":
    r = client.post("/api/v1/auth/guest")
    assert r.status_code == 201, r.text
    csrf = r.json()["csrf_token"]
    headers = {"X-CSRF-Token": csrf}
    content = "# Durable Policy\n\nApproved guidance about recycling logos survives restarts."
    r = client.post(
        "/api/v1/knowledge/documents",
        files={"file": ("durable.txt", content.encode(), "text/plain")},
        data={"title": "Durable Policy", "doc_type": "guidelines"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    doc_id = r.json()["document"]["id"]
    assert (
        client.post(f"/api/v1/knowledge/documents/{doc_id}/approve", headers=headers).status_code
        == 200
    )
    COOKIE_FILE.write_text(f"{client.cookies.get('brandsentry_session')}\n{csrf}")
    print("uploaded+approved:", doc_id)
elif mode == "after":
    raw_cookie, csrf = COOKIE_FILE.read_text().strip().splitlines()
    headers = {"X-CSRF-Token": csrf, "Cookie": f"brandsentry_session={raw_cookie}"}
    r = client.get("/api/v1/knowledge/documents", headers=headers)
    assert r.status_code == 200, r.text
    docs = r.json()["documents"]
    assert len(docs) == 1 and docs[0]["title"] == "Durable Policy", docs
    r = client.get("/api/v1/knowledge/search", params={"q": "recycling logos"}, headers=headers)
    assert r.status_code == 200 and len(r.json()["results"]) == 1, r.text
    print(
        "RESTART PERSISTENCE PASS:",
        docs[0]["id"],
        "| search hit:",
        r.json()["results"][0]["section_ref"],
    )
