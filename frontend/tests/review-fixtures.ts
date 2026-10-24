import type { ReviewDetail, ReviewDecision } from '../src/types/review';
import type { SubmissionDetail } from '../src/types/validation';

export function reviewFixture(): ReviewDetail {
  return {
    content_text: 'Synthetic EcoBlend guarantees results.', revision: 0, status: 'pending', is_current: true, is_demo: true,
    unresolved_finding_ids: ['finding-1'], accepted_finding_ids: [], approval_blockers: ['unresolved_findings'], decisions: [],
    run: { id: 'run-1', submission_id: 'submission-1', content_version_id: 'version-1', state: 'completed', ai_status: 'complete', partial_reason: null, error_code: null, cache_hit: false, prompt_version: 'test', model_id: null, prompt_tokens: null, completion_tokens: null, total_tokens: null, provider_latency_ms: null, created_at: '2026-10-24T12:00:00Z', completed_at: '2026-10-24T12:00:01Z',
      findings: [{ id: 'finding-1', category: 'unsupported_claim', severity: 'high', source: 'ai', rule_id: null, rule_version: null, snippet: 'guarantees results', start_offset: 19, end_offset: 37, explanation: 'Synthetic claim lacks supporting evidence.', suggested_text: 'Results may vary.', verification_status: 'NEEDS_VERIFICATION', evidence_chunk_ids: ['chunk-1'], needs_verification_reason: 'The cited policy does not verify this claim.' }],
      evidence: [{ id: 'snapshot-1', chunk_id: 'chunk-1', document_id: 'doc-1', document_title: 'Synthetic EcoBlend policy', doc_type: 'guideline', document_version: 1, section_ref: 'Claims', page_start: 1, page_end: 1, text: 'Avoid guarantees without evidence.' }],
    },
  };
}
export function decisionFixture(decision = 'reject', revision = 1): ReviewDecision {
  return { id: `decision-${revision}`, run_id: 'run-1', finding_id: 'finding-1', revision, decision, notes: 'Synthetic reviewer rationale', actor_id: 'reviewer-1', actor_name: 'Synthetic Reviewer', actor_role: 'reviewer', is_demo: true, created_at: '2026-10-24T12:05:00Z' };
}
export function submissionFixture(): SubmissionDetail {
  return { id: 'submission-1', title: 'Synthetic EcoBlend', status: 'validated', created_by: 'author-1', created_at: '2026-10-24T12:00:00Z', updated_at: '2026-10-24T12:00:00Z', versions: [{ id: 'version-1', version: 1, text_sha256: 'synthetic', char_count: 37, created_by: 'version-author-1', created_at: '2026-10-24T12:00:00Z' }] };
}
