"""Deterministic rule engine: matching semantics, safety, no false positives.

Pure unit tests — no HTTP, no DB, no provider (MOCK-free, deterministic).
"""

from __future__ import annotations

from types import SimpleNamespace

from app.services.rules_engine import is_risky_regex, run_deterministic_rules


def rule(
    *,
    category: str = "prohibited_term",
    matcher: str = "contains",
    pattern: str = "guarantee",
    replacement: str | None = None,
    rule_text: str = "Never promise guaranteed outcomes.",
    enabled: bool = True,
    version: int = 3,
    name: str = "No guarantees",
    rule_id: str = "rule_1",
) -> SimpleNamespace:
    return SimpleNamespace(
        id=rule_id,
        category=category,
        name=name,
        rule_text=rule_text,
        matcher_type=matcher,
        pattern=pattern,
        replacement=replacement,
        enabled=enabled,
        version=version,
    )


def test_contains_match_is_case_insensitive_with_offsets() -> None:
    text = "Our product GUARANTEES 100% results!"
    findings = run_deterministic_rules(text, [rule(pattern="guarantees")])
    assert len(findings) == 1
    finding = findings[0]
    assert finding.snippet == "GUARANTEES"
    assert text[finding.start_offset : finding.end_offset] == "GUARANTEES"
    assert finding.rule_version == 3
    assert finding.severity == "high"


def test_no_match_means_no_finding() -> None:
    assert run_deterministic_rules("Completely clean copy.", [rule()]) == []


def test_exact_matcher_rejects_substring() -> None:
    # "guarantee" as a whole word matches; inside "guarantees" it must not.
    exact = rule(matcher="exact", pattern="guarantee")
    assert run_deterministic_rules("We guarantee quality.", [exact])
    assert run_deterministic_rules("It guarantees quality.", [exact]) == []


def test_disabled_rule_is_ignored() -> None:
    assert run_deterministic_rules("guarantee!", [rule(enabled=False)]) == []


def test_preferred_replacement_offers_correction() -> None:
    terminology = rule(
        category="preferred_replacement",
        pattern="Ecoblend",
        replacement="EcoBlend",
        rule_text="The product name is capitalised EcoBlend.",
    )
    findings = run_deterministic_rules("Try Ecoblend today.", [terminology])
    assert len(findings) == 1
    assert findings[0].suggested_text == "EcoBlend"
    assert findings[0].severity == "medium"


def test_claim_requirement_missing_required_text() -> None:
    requirement = rule(
        category="claim_requirement",
        pattern="clinically proven",
        replacement="*when used as directed",
        rule_text="Claims of proof need the usage disclaimer.",
    )
    findings = run_deterministic_rules("It is clinically proven to work.", [requirement])
    assert len(findings) == 1
    assert findings[0].category == "claim_requirement"

    # Requirement present -> no finding.
    compliant = "It is clinically proven to work. *when used as directed"
    assert run_deterministic_rules(compliant, [requirement]) == []


def test_claim_requirement_without_required_text_is_skipped() -> None:
    requirement = rule(category="claim_requirement", pattern="clinically proven", replacement=None)
    assert run_deterministic_rules("clinically proven!", [requirement]) == []


def test_regex_rule_matches_and_is_case_insensitive() -> None:
    regex_rule = rule(matcher="regex", pattern=r"free\s+money", name="No free money")
    findings = run_deterministic_rules("Get FREE money now.", [regex_rule])
    assert len(findings) == 1
    assert findings[0].snippet == "FREE money"


def test_invalid_regex_is_skipped_not_crash() -> None:
    broken = rule(matcher="regex", pattern="([unclosed")
    assert run_deterministic_rules("any text", [broken]) == []


def test_catastrophic_regex_is_skipped_quickly() -> None:
    # Nested quantifiers: classic exponential backtracking trap.
    evil = rule(matcher="regex", pattern="(a+)+b")
    assert is_risky_regex(evil.pattern)
    # Must return promptly with no findings (the rule is skipped, not run).
    assert run_deterministic_rules("a" * 40, [evil]) == []


def test_safe_quantified_regex_is_allowed() -> None:
    safe = rule(matcher="regex", pattern=r"\d{3}-\d{4}")
    findings = run_deterministic_rules("Call 555-1234 now.", [safe])
    assert len(findings) == 1


def test_findings_map_to_their_actual_rule() -> None:
    first = rule(pattern="guarantee", version=1, rule_id="rule_a")
    second = rule(pattern="100%", version=7, name="No percentages", rule_id="rule_b")
    findings = run_deterministic_rules("guarantee 100%", [first, second])
    by_rule = {f.rule_id: f for f in findings}
    assert len(by_rule) == 2
    assert by_rule["rule_a"].rule_version == 1
    assert by_rule["rule_b"].rule_version == 7
    assert {f.snippet for f in findings} == {"guarantee", "100%"}


def test_unknown_matcher_type_is_skipped() -> None:
    weird = rule(matcher="fuzzy")
    assert run_deterministic_rules("guarantee", [weird]) == []


def test_empty_text_yields_no_findings() -> None:
    assert run_deterministic_rules("", [rule()]) == []
