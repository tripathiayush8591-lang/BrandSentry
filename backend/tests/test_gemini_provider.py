"""Gemini provider adapter tests: the HTTP boundary is mocked with
httpx.MockTransport; the request building, parsing, error mapping and retry
logic under test are the real implementation (MOCK at network layer only).
"""

from __future__ import annotations

import json

import httpx
import pytest

from app.config import Settings
from app.services.gemini import (
    GeminiProvider,
    InvalidModelOutput,
    ProviderConfigError,
    ProviderError,
    ProviderRateLimited,
    ProviderTimeout,
)

VALID_BODY = {
    "candidates": [{"content": {"parts": [{"text": json.dumps({"findings": []})}]}}],
    "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5, "totalTokenCount": 15},
}


def make_settings(**overrides) -> Settings:
    defaults: dict = {
        "gemini_api_key": "test-key-not-real",
        "gemini_timeout_seconds": 5.0,
        "log_level": "ERROR",
    }
    defaults.update(overrides)
    return Settings(**defaults)  # type: ignore[arg-type]


def handler_returning(status_code: int, body: dict | str, headers: dict | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if isinstance(body, dict):
            return httpx.Response(status_code, json=body, headers=headers or {})
        return httpx.Response(status_code, text=body, headers=headers or {})

    return handler


def test_missing_key_raises_config_error_before_any_network() -> None:
    provider = GeminiProvider(make_settings(gemini_api_key=None))
    assert provider.is_configured is False
    with pytest.raises(ProviderConfigError):
        provider.analyze(content="x", evidence=[], rules=[])


def test_successful_structured_call_is_parsed_with_usage() -> None:
    seen: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["key_header"] = request.headers.get("x-goog-api-key")
        seen["payload"] = json.loads(request.content.decode())
        return httpx.Response(200, json=VALID_BODY)

    provider = GeminiProvider(make_settings(), transport=httpx.MockTransport(handler))
    result = provider.analyze(content="some content", evidence=[], rules=[])
    assert result.total_tokens == 15
    assert result.analysis.findings == []
    assert seen["key_header"] == "test-key-not-real"
    assert ":generateContent" in seen["url"]
    gen_config = seen["payload"]["generationConfig"]
    assert gen_config["responseMimeType"] == "application/json"
    assert "findings" in gen_config["responseSchema"]["properties"]


def test_structured_findings_are_validated() -> None:
    body = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "findings": [
                                        {
                                            "category": "unsupported_claim",
                                            "severity": "high",
                                            "quote_or_range": "guarantees 100%",
                                            "explanation": "No approved evidence.",
                                            "claimed_source_ids": ["chunk_1"],
                                        }
                                    ]
                                }
                            )
                        }
                    ]
                }
            }
        ]
    }
    provider = GeminiProvider(
        make_settings(), transport=httpx.MockTransport(handler_returning(200, body))
    )
    result = provider.analyze(content="x", evidence=[], rules=[])
    assert len(result.analysis.findings) == 1
    assert result.analysis.findings[0].claimed_source_ids == ["chunk_1"]


def test_malformed_json_text_raises_invalid_output() -> None:
    body = {"candidates": [{"content": {"parts": [{"text": "not json at all"}]}}]}
    provider = GeminiProvider(
        make_settings(), transport=httpx.MockTransport(handler_returning(200, body))
    )
    with pytest.raises(InvalidModelOutput):
        provider.analyze(content="x", evidence=[], rules=[])


def test_non_conforming_schema_raises_invalid_output() -> None:
    body = {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps({"findings": [{"bogus": True}]})}]}}
        ]
    }
    provider = GeminiProvider(
        make_settings(), transport=httpx.MockTransport(handler_returning(200, body))
    )
    with pytest.raises(InvalidModelOutput):
        provider.analyze(content="x", evidence=[], rules=[])


def test_missing_candidate_raises_invalid_output() -> None:
    provider = GeminiProvider(
        make_settings(), transport=httpx.MockTransport(handler_returning(200, {"candidates": []}))
    )
    with pytest.raises(InvalidModelOutput):
        provider.analyze(content="x", evidence=[], rules=[])


def test_429_maps_to_rate_limited_with_retry_after() -> None:
    provider = GeminiProvider(
        make_settings(),
        transport=httpx.MockTransport(
            handler_returning(429, {"error": {"message": "quota"}}, {"Retry-After": "30"})
        ),
    )
    with pytest.raises(ProviderRateLimited) as exc_info:
        provider.analyze(content="x", evidence=[], rules=[])
    assert exc_info.value.retry_after_seconds == 30


def test_timeout_maps_to_provider_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("too slow", request=request)

    provider = GeminiProvider(make_settings(), transport=httpx.MockTransport(handler))
    with pytest.raises(ProviderTimeout):
        provider.analyze(content="x", evidence=[], rules=[])


def test_5xx_maps_to_provider_error() -> None:
    provider = GeminiProvider(
        make_settings(), transport=httpx.MockTransport(handler_returning(503, {}))
    )
    with pytest.raises(ProviderError):
        provider.analyze(content="x", evidence=[], rules=[])


def test_4xx_request_errors_are_never_retried() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, json={"error": {"message": "bad request"}})

    provider = GeminiProvider(
        make_settings(gemini_max_retries=1), transport=httpx.MockTransport(handler)
    )
    with pytest.raises(ProviderError):
        provider.analyze(content="x", evidence=[], rules=[])
    assert calls["n"] == 1


def test_transient_5xx_is_retried_once_when_enabled() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(500, json={})
        return httpx.Response(200, json=VALID_BODY)

    provider = GeminiProvider(
        make_settings(gemini_max_retries=1), transport=httpx.MockTransport(handler)
    )
    result = provider.analyze(content="x", evidence=[], rules=[])
    assert calls["n"] == 2
    assert result.total_tokens == 15


def test_retries_disabled_by_default() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(500, json={})

    provider = GeminiProvider(make_settings(), transport=httpx.MockTransport(handler))
    with pytest.raises(ProviderError):
        provider.analyze(content="x", evidence=[], rules=[])
    assert calls["n"] == 1


def test_oversized_finding_list_is_bounded_server_side() -> None:
    many = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "findings": [
                                        {
                                            "category": "tone",
                                            "severity": "low",
                                            "quote_or_range": f"quote {i}",
                                            "explanation": "x",
                                        }
                                        for i in range(30)
                                    ]
                                }
                            )
                        }
                    ]
                }
            }
        ]
    }
    provider = GeminiProvider(
        make_settings(), transport=httpx.MockTransport(handler_returning(200, many))
    )
    result = provider.analyze(content="x", evidence=[], rules=[])
    assert len(result.analysis.findings) == 12
