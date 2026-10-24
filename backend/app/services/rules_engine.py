"""Deterministic brand rule engine (Phase 3B, always-on, no network).

Evaluates approved, enabled ``brand_rules`` against submitted content:

- ``prohibited_term`` / ``restricted_phrase``: the pattern must NOT appear.
- ``preferred_replacement``: the pattern (the wrong form) must not appear;
  ``replacement`` is offered as the correction.
- ``messaging_rule``: any content-match is reported as a policy violation.
- ``claim_requirement``: when ``pattern`` (the trigger) appears, the required
  companion text (``replacement``) must appear too — a deterministically
  evaluable policy requirement (e.g. a mandatory disclaimer). Without a
  ``replacement`` the rule is not deterministically evaluable and is skipped
  here (the AI stage may still reason about it).

Safety properties:
- Every finding cites the real rule ID + version that produced it; nothing
  is reported that the configured rule does not actually match.
- Regex rules are bounded: pattern length capped, patterns matching a
  nested-quantifier heuristic are skipped (logged, never crash the run) and
  matching runs against length-capped content — defence against regex DoS
  (Python ``re`` has no timeout, so unsafe patterns are excluded up front).
- Matching is case-insensitive everywhere; offsets point at the original
  text so snippets are exact slices.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from app.db.models import BrandRule

logger = logging.getLogger(__name__)

# Deterministic categories (mirrors BrandRule.category values).
CATEGORY_PROHIBITED_TERM = "prohibited_term"
CATEGORY_PREFERRED_REPLACEMENT = "preferred_replacement"
CATEGORY_RESTRICTED_PHRASE = "restricted_phrase"
CATEGORY_CLAIM_REQUIREMENT = "claim_requirement"
CATEGORY_MESSAGING_RULE = "messaging_rule"

MAX_PATTERN_CHARS = 2_000
# Regex rules never see more content than the input cap; bounded anyway as a
# second line of defence independent of endpoint validation.
MAX_MATCH_TEXT_CHARS = 60_000

# Heuristic ReDoS guard: a quantified group whose body itself contains a
# quantifier (e.g. ``(a+)+``, ``(?:\w*\s*)*``) can backtrack exponentially.
_GROUP = re.compile(r"\(([^()]*)\)\s*([+*?]|\{\d*,\d*\})")


@dataclass(frozen=True)
class DeterministicFinding:
    category: str
    severity: str
    rule_id: str
    rule_version: int
    snippet: str
    start_offset: int
    end_offset: int
    explanation: str
    suggested_text: str | None


def is_risky_regex(pattern: str) -> bool:
    """True when a pattern looks like a nested-quantifier ReDoS hazard.

    Deliberately conservative: safe-looking but unusual patterns may be
    skipped too — a skipped rule is logged and missing from results, never a
    false violation.
    """
    if len(pattern) > MAX_PATTERN_CHARS:
        return True
    for match in _GROUP.finditer(pattern):
        body, quantifier = match.group(1), match.group(2)
        if quantifier in ("+", "*"):
            unescaped = body.replace(r"\+", "").replace(r"\*", "")
            if re.search(r"[+*{]", unescaped):
                return True
    return False


def _find_all(text: str, needle: str) -> list[tuple[int, int]]:
    """Case-insensitive occurrences of ``needle`` in ``text``."""
    lowered_text = text.lower()
    lowered = needle.lower()
    spans: list[tuple[int, int]] = []
    start = 0
    while True:
        index = lowered_text.find(lowered, start)
        if index < 0:
            break
        spans.append((index, index + len(needle)))
        start = index + max(1, len(needle))
    return spans


def _find_exact_words(text: str, needle: str) -> list[tuple[int, int]]:
    """Case-insensitive whole-token matches (``exact`` matcher semantics)."""
    spans: list[tuple[int, int]] = []
    escaped = re.escape(needle.strip())
    for match in re.finditer(rf"(?<!\w){escaped}(?!\w)", text, re.IGNORECASE):
        spans.append((match.start(), match.end()))
    return spans


def _safe_regex_findall(text: str, pattern: str) -> list[tuple[int, int]] | None:
    """Compile + search with bounds; None when the pattern is unsafe/invalid."""
    if len(pattern) > MAX_PATTERN_CHARS or is_risky_regex(pattern):
        logger.warning("Skipping unsafe brand-rule regex pattern (length=%d)", len(pattern))
        return None
    try:
        compiled = re.compile(pattern, re.IGNORECASE)
    except re.error:
        logger.warning("Skipping invalid brand-rule regex pattern")
        return None
    if compiled.groups > 50:
        logger.warning("Skipping brand-rule regex with excessive groups")
        return None
    spans: list[tuple[int, int]] = []
    for match in compiled.finditer(text[:MAX_MATCH_TEXT_CHARS]):
        spans.append((match.start(), match.end()))
        if len(spans) >= 50:
            break  # bound work per rule; pathological texts cannot loop us
    return spans


def _rule_finding(
    rule: BrandRule,
    span: tuple[int, int],
    text: str,
    *,
    explanation: str,
    suggested: str | None = None,
) -> DeterministicFinding:
    return DeterministicFinding(
        category=rule.category,
        severity="high"
        if rule.category in (CATEGORY_PROHIBITED_TERM, CATEGORY_RESTRICTED_PHRASE)
        else "medium",
        rule_id=rule.id,
        rule_version=rule.version,
        snippet=text[span[0] : span[1]],
        start_offset=span[0],
        end_offset=span[1],
        explanation=explanation,
        suggested_text=suggested if suggested is not None else rule.replacement,
    )


def run_deterministic_rules(text: str, rules: list[BrandRule]) -> list[DeterministicFinding]:
    """Evaluate enabled rules; findings only for real configured matches."""
    if not text:
        return []
    findings: list[DeterministicFinding] = []
    for rule in rules:
        if not rule.enabled:
            continue
        pattern = rule.pattern.strip()
        if not pattern:
            continue

        if rule.category == CATEGORY_CLAIM_REQUIREMENT:
            required = (rule.replacement or "").strip()
            if not required:
                continue  # not deterministically evaluable without the requirement
            if not _find_all(text, required):
                triggers = _find_all(text, pattern) or _find_exact_words(text, pattern)
                for span in triggers:
                    findings.append(
                        _rule_finding(
                            rule,
                            span,
                            text,
                            explanation=(
                                f"{rule.rule_text} The content references "
                                f"'{pattern}' but the required text '{required}' is missing."
                            ),
                            suggested=None,
                        )
                    )
            continue

        matcher = rule.matcher_type
        if matcher == "contains":
            spans = _find_all(text, pattern)
        elif matcher == "exact":
            spans = _find_exact_words(text, pattern)
        elif matcher == "regex":
            regex_spans = _safe_regex_findall(text, pattern)
            if regex_spans is None:
                continue
            spans = regex_spans
        else:
            # Unknown matcher types are data errors guarded at the API layer;
            # here they are skipped rather than guessed at.
            logger.warning("Skipping brand rule with unknown matcher_type %r", matcher)
            continue

        for span in spans:
            findings.append(
                _rule_finding(
                    rule,
                    span,
                    text,
                    explanation=(
                        f"{rule.rule_text} Matched configured {rule.category} rule "
                        f"'{rule.name}' (v{rule.version})."
                    ),
                )
            )
    return findings
