"""Phase 4B regression: provider budget accounting (audit blocker 1).

The daily global call/token budget must be a hard cap on real provider
attempts: reserved atomically BEFORE each request (initial call and every
retry), consumed by failed/timeout/rate-limited attempts exactly like
successful ones, reconciled with provider-reported token counts after
success, and immune to concurrent distinct requests overshooting together.
Gemini is mocked at the provider boundary (FakeGeminiProvider) or at the
HTTP boundary (httpx.MockTransport) — no live provider requests.
"""

from __future__ import annotations

import pathlib
import tempfile

import httpx

from app.config import Settings
from app.db.models import ProviderBudgetDay
from app.services.gemini import GeminiProvider, ProviderError
from app.services.validation import _reserve_provider_budget
from tests.helpers_3b import (
    FakeGeminiProvider,
    ProviderRateLimited,
    ProviderTimeout,
    create_submission,
    guest_session,
    install_fake_provider,
    make_client,
    validate_version,
    validation_settings,
)


def tmp() -> pathlib.Path:
    return pathlib.Path(tempfile.mkdtemp())


def _budget_row(client) -> ProviderBudgetDay | None:
    factory = client.app.state.session_factory
    with factory() as db:
        row = db.get(ProviderBudgetDay, _today_key(), populate_existing=True)
        if row is not None:
            db.expunge(row)
        return row


def _today_key() -> str:
    from app.services.validation import _budget_day

    return _budget_day()


def test_failed_provider_attempts_consume_daily_budget() -> None:
    """Audit repro: a one-call budget permitted TWO failing provider attempts
    because ``outcome='error'`` rows were excluded from the count. Failed
    attempts must consume their reservation like successful ones."""
    with make_client(
        validation_settings(tmp(), gemini_calls_per_day=1, gemini_tokens_per_day=100000)
    ) as client:
        headers = guest_session(client)
        provider = FakeGeminiProvider(error=ProviderError("Synthetic provider 500"))
        install_fake_provider(client, provider)

        first = create_submission(
            client, headers, title="Synthetic 0", text="EcoBlend synthetic 0."
        )
        run_one = validate_version(client, headers, first).json()
        assert run_one["ai_status"] == "partial"
        assert run_one["partial_reason"] == "provider_error"

        # A distinct second request: the budget is already consumed by the
        # failed attempt, so the provider is never contacted again.
        second = create_submission(
            client, headers, title="Synthetic 1", text="EcoBlend synthetic 1."
        )
        run_two = validate_version(client, headers, second).json()
        assert run_two["ai_status"] == "skipped_budget"
        assert run_two["partial_reason"] == "provider_budget_exhausted"
        assert len(provider.calls) == 1
        row = _budget_row(client)
        assert row is not None and row.calls_reserved == 1


def test_timeout_and_rate_limited_attempts_consume_daily_budget() -> None:
    with make_client(
        validation_settings(tmp(), gemini_calls_per_day=2, gemini_tokens_per_day=100000)
    ) as client:
        headers = guest_session(client)
        provider = FakeGeminiProvider(error=ProviderTimeout("slow"))
        install_fake_provider(client, provider)

        first = create_submission(client, headers, title="T0", text="Timeout attempt one.")
        assert (
            validate_version(client, headers, first).json()["partial_reason"] == "provider_timeout"
        )

        provider.error = ProviderRateLimited("quota", retry_after_seconds=5)
        second = create_submission(client, headers, title="T1", text="Rate limited attempt two.")
        assert (
            validate_version(client, headers, second).json()["partial_reason"]
            == "provider_rate_limited"
        )

        provider.error = None
        third = create_submission(
            client, headers, title="T2", text="Attempt three must be skipped."
        )
        run_three = validate_version(client, headers, third).json()
        assert run_three["ai_status"] == "skipped_budget"
        assert len(provider.calls) == 2
        row = _budget_row(client)
        assert row is not None and row.calls_reserved == 2


def test_successful_run_reconciles_token_reservation_with_actual_usage() -> None:
    with make_client(
        validation_settings(tmp(), gemini_calls_per_day=10, gemini_tokens_per_day=100000)
    ) as client:
        headers = guest_session(client)
        # FakeGeminiProvider reports 150 actual tokens; the pre-call estimate
        # is larger, so reconciliation refunds the over-reservation.
        provider = FakeGeminiProvider()
        install_fake_provider(client, provider)
        submission = create_submission(client, headers)
        run = validate_version(client, headers, submission).json()
        assert run["ai_status"] == "complete"
        row = _budget_row(client)
        assert row is not None
        assert row.calls_reserved == 1
        assert row.tokens_reserved == 150  # actual usage, not the estimate


def test_reservation_function_enforces_limits_atomically() -> None:
    """Unit-level: the conditional reservation refuses capacity beyond the
    configured limits — the property that keeps concurrent distinct
    requests from collectively overshooting."""
    with make_client(
        validation_settings(tmp(), gemini_calls_per_day=3, gemini_tokens_per_day=100000)
    ) as client:
        factory = client.app.state.session_factory
        with factory() as db:
            days = [
                _reserve_provider_budget(db, calls=1, tokens=10, calls_limit=3, tokens_limit=100000)
                for _ in range(3)
            ]
            assert days[0] is not None
            assert days == [days[0]] * 3
            # Fourth call exceeds the limit: refused.
            assert (
                _reserve_provider_budget(db, calls=1, tokens=10, calls_limit=3, tokens_limit=100000)
                is None
            )
            row = db.get(ProviderBudgetDay, days[0], populate_existing=True)
            assert row.calls_reserved == 3

            # Token ceiling: refusing an attempt whose estimate cannot fit.
            assert (
                _reserve_provider_budget(db, calls=1, tokens=1, calls_limit=3, tokens_limit=2)
                is None
            )


def test_each_retry_attempt_reserves_budget_before_network_io() -> None:
    """Adapter-level: the guard runs before EVERY HTTP attempt (initial call
    and each retry); a guard refusal aborts the retry without network I/O."""
    settings = Settings(
        _env_file=None,
        app_env="development",
        database_url=f"sqlite:///{(tmp() / 'retry.sqlite').as_posix()}",
        log_level="WARNING",
        gemini_api_key="test-key",
        gemini_max_retries=2,
        gemini_timeout_seconds=5,
    )

    def make_transport(status_sequence: list[int], log: list[int]):
        state = {"n": 0}

        def handler(request: httpx.Request) -> httpx.Response:
            index = state["n"]
            state["n"] += 1
            log.append(index)
            status = status_sequence[min(index, len(status_sequence) - 1)]
            if status != 200:
                return httpx.Response(status, text="synthetic failure")
            return httpx.Response(
                200,
                json={
                    "candidates": [{"content": {"parts": [{"text": '{"findings": []}'}]}}],
                    "usageMetadata": {"promptTokenCount": 10, "totalTokenCount": 20},
                },
            )

        return httpx.MockTransport(handler)

    # All attempts happen and each one reserves: 3 attempts -> 3 reservations.
    http_log: list[int] = []
    reservations: list[int] = []
    provider = GeminiProvider(settings, transport=make_transport([500, 500, 200], http_log))

    def guard_allowing() -> None:
        reservations.append(1)

    result = provider.analyze(content="x", evidence=[], rules=[], reserve_attempt=guard_allowing)
    assert result.total_tokens == 20
    assert len(http_log) == 3
    assert len(reservations) == 3

    # Budget for only ONE attempt: attempt 1 fails (500), the retry is
    # refused by the guard BEFORE any second request; the adapter reports
    # the original attempt's failure.
    http_log2: list[int] = []
    calls = {"n": 0}

    def guard_one_attempt() -> None:
        calls["n"] += 1
        if calls["n"] > 1:
            from app.services.gemini import ProviderBudgetExhausted

            raise ProviderBudgetExhausted()

    provider2 = GeminiProvider(settings, transport=make_transport([500, 200], http_log2))
    try:
        provider2.analyze(content="x", evidence=[], rules=[], reserve_attempt=guard_one_attempt)
        raise AssertionError("expected ProviderError")
    except ProviderError:
        pass
    assert len(http_log2) == 1  # the retry never reached the network
    assert calls["n"] == 2
