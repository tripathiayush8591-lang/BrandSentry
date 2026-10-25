import type { KnowledgeDocument, KnowledgeChunk, BrandRule, ApprovedClaim } from '../../types/knowledge';
import type { SubmissionDetail, ValidationRun } from '../../types/validation';
import type { ReviewDetail } from '../../types/review';
import type { InsightsSummary } from '../../types/insights';

const time = '2026-10-25T03:30:00Z';
const actor = 'synthetic-creator';
export const demoDocuments: KnowledgeDocument[] = [
  { id: 'brewnest-guidelines', title: 'BrewNest Coffee — Brand Guidelines (synthetic)', doc_type: 'guidelines', status: 'approved', active_version: 1, created_at: time, updated_at: time },
  { id: 'brewnest-claims', title: 'BrewNest Coffee — Product Facts (synthetic)', doc_type: 'approved_claims', status: 'approved', active_version: 1, created_at: time, updated_at: time },
];
export const demoChunks: KnowledgeChunk[] = [
  { id: 'brewnest-tone', document_id: 'brewnest-guidelines', version: 1, section_ref: 'Voice & tone §1', page_number: 1, page_end: 1, text: 'BrewNest is warm, welcoming and grounded. Invite people to slow down and enjoy their coffee. Use clear, measured language; avoid absolute guarantees and unsupported health claims.', char_offset: 0 },
  { id: 'brewnest-policy', document_id: 'brewnest-guidelines', version: 1, section_ref: 'Claims policy §2', page_number: 2, page_end: 2, text: 'Do not promise guaranteed productivity or health outcomes. Use BrewNest Coffee by name. Describe the experience and cite approved product facts. Environmental claims require supporting evidence.', char_offset: 220 },
  { id: 'brewnest-facts', document_id: 'brewnest-claims', version: 1, section_ref: 'House blend §1', page_number: 1, page_end: 1, text: 'Fictional product facts: BrewNest House Blend is 100% Arabica coffee, medium roasted, with tasting notes of cocoa and toasted almond. Available in 250 g bags. These are synthetic examples, not verified commercial claims.', char_offset: 0 },
];
export const demoRules: BrandRule[] = [
  { id: 'no-guarantees', category: 'restricted_phrase', name: 'Avoid absolute guarantees', rule_text: 'No guaranteed productivity or health outcomes.', matcher_type: 'contains', pattern: 'guarantees', replacement: 'invites you to enjoy a mindful coffee break', enabled: true, version: 1, source_document_id: 'brewnest-guidelines', source_section_ref: 'Claims policy §2', created_by: actor, created_at: time, updated_at: time },
  { id: 'brand-name', category: 'preferred_replacement', name: 'Use the full brand name', rule_text: 'Use BrewNest Coffee in marketing copy.', matcher_type: 'contains', pattern: 'Brew Nest', replacement: 'BrewNest Coffee', enabled: true, version: 1, source_document_id: 'brewnest-guidelines', source_section_ref: 'Voice & tone §1', created_by: actor, created_at: time, updated_at: time },
  { id: 'evidence-needed', category: 'claim_requirement', name: 'Evidence for environmental claims', rule_text: 'Sustainability claims require a supporting source.', matcher_type: 'contains', pattern: 'carbon neutral', replacement: null, enabled: true, version: 1, source_document_id: 'brewnest-guidelines', source_section_ref: 'Claims policy §2', created_by: actor, created_at: time, updated_at: time },
];
export const demoClaims: ApprovedClaim[] = [
  { id: 'arabica', claim_text: 'BrewNest House Blend is 100% Arabica coffee. (Synthetic approved claim)', status: 'active', source_document_id: 'brewnest-claims', source_section_ref: 'House blend §1', created_by: actor, created_at: time, updated_at: time },
  { id: 'roast', claim_text: 'Medium roasted with cocoa and toasted almond tasting notes. (Synthetic approved claim)', status: 'active', source_document_id: 'brewnest-claims', source_section_ref: 'House blend §1', created_by: actor, created_at: time, updated_at: time },
];
export const demoTexts = [
  'BrewNest Coffee guarantees 100% productivity. Our carbon neutral House Blend makes every morning better.',
  'Make room for a slower morning. BrewNest Coffee House Blend brings cocoa and toasted almond notes to your cup. Explore our medium roasted, 100% Arabica coffee in a 250 g bag.',
  'A warm cup, a fresh start. Discover your next coffee ritual with BrewNest Coffee.',
];
export const demoSubmissions: SubmissionDetail[] = ['Autumn launch — social campaign', 'House Blend — product newsletter', 'Weekend ritual — draft'].map((title, i) => ({
  id: `brewnest-submission-${i + 1}`, title, status: i === 2 ? 'draft' : 'partial', created_by: actor, created_at: time, updated_at: time,
  versions: [{ id: `brewnest-version-${i + 1}`, version: 1, text_sha256: 'synthetic-not-a-content-hash', char_count: demoTexts[i].length, created_by: actor, created_at: time }],
}));
export const demoRuns: ValidationRun[] = [0, 1].map(i => ({
  id: `brewnest-run-${i + 1}`, submission_id: demoSubmissions[i].id, content_version_id: demoSubmissions[i].versions[0].id,
  state: 'partial', ai_status: 'unavailable', partial_reason: 'Synthetic example only. No validation or provider request was performed.', error_code: null, cache_hit: false,
  prompt_version: 'synthetic-example', model_id: null, prompt_tokens: null, completion_tokens: null, total_tokens: null, provider_latency_ms: null, created_at: time, completed_at: time,
  findings: i === 0 ? [
    { id: 'brewnest-finding-1', category: 'restricted_phrase', severity: 'high', source: 'deterministic', rule_id: 'no-guarantees', rule_version: 1, snippet: 'guarantees 100% productivity', start_offset: 16, end_offset: 44, explanation: 'Simulated finding: this absolute outcome conflicts with the fictional claims policy.', suggested_text: 'invites you to enjoy a mindful coffee break', verification_status: 'SUPPORTED', evidence_chunk_ids: ['brewnest-policy'], needs_verification_reason: null },
    { id: 'brewnest-finding-2', category: 'claim_requirement', severity: 'medium', source: 'deterministic', rule_id: 'evidence-needed', rule_version: 1, snippet: 'carbon neutral', start_offset: null, end_offset: null, explanation: 'Simulated finding: no supporting environmental evidence is included in the sample vault.', suggested_text: null, verification_status: 'NEEDS_VERIFICATION', evidence_chunk_ids: [], needs_verification_reason: 'No synthetic source supports this environmental claim.' },
  ] : [],
  evidence: demoChunks.map(chunk => ({ id: `snapshot-${chunk.id}`, chunk_id: chunk.id, document_id: chunk.document_id, document_title: demoDocuments.find(doc => doc.id === chunk.document_id)!.title, doc_type: 'guidelines', document_version: 1, section_ref: chunk.section_ref, page_start: chunk.page_number, page_end: chunk.page_end, text: chunk.text })),
}));
export const demoReviews: ReviewDetail[] = demoRuns.map((run, i) => ({
  run, content_text: demoTexts[i], revision: i === 0 ? 3 : 0, status: i === 0 ? 'changes_requested' : 'pending', is_current: true, is_demo: true,
  unresolved_finding_ids: [], accepted_finding_ids: i === 0 ? ['brewnest-finding-1', 'brewnest-finding-2'] : [],
  approval_blockers: i === 0 ? ['incomplete_validation', 'accepted_issues', 'review_final'] : ['incomplete_validation'],
  decisions: i === 0 ? [
    { id: 'demo-decision-1', run_id: run.id, finding_id: 'brewnest-finding-1', revision: 1, decision: 'accept', notes: 'Simulated history: replace the absolute guarantee with experience-focused language.', actor_id: 'synthetic-reviewer', actor_name: 'Maya — fictional reviewer', actor_role: 'reviewer', is_demo: true, created_at: time },
    { id: 'demo-decision-2', run_id: run.id, finding_id: 'brewnest-finding-2', revision: 2, decision: 'accept', notes: 'Simulated history: evidence is missing; remove or substantiate carbon neutral. Accepting the issue does not verify the claim.', actor_id: 'synthetic-reviewer', actor_name: 'Maya — fictional reviewer', actor_role: 'reviewer', is_demo: true, created_at: time },
    { id: 'demo-decision-3', run_id: run.id, finding_id: null, revision: 3, decision: 'request_changes', notes: 'Simulated history: revise the guarantee and remove or substantiate the environmental claim.', actor_id: 'synthetic-reviewer', actor_name: 'Maya — fictional reviewer', actor_role: 'reviewer', is_demo: true, created_at: time },
  ] : [],
}));
export const demoInsights: InsightsSummary = {
  workspace_id: 'synthetic-brewnest', is_demo: true, scope: 'all_recorded_runs', validation_runs: demoRuns.length,
  run_states: { partial: 2 }, findings: [
    { source: 'deterministic', verification_status: 'SUPPORTED', count: 1 },
    { source: 'deterministic', verification_status: 'NEEDS_VERIFICATION', count: 1 },
  ], categories: [{ category: 'restricted_phrase', source: 'deterministic', count: 1 }, { category: 'claim_requirement', source: 'deterministic', count: 1 }],
  review_progress: { pending: 1, changes_requested: 1 },
};
