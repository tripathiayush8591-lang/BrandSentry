export type SubmissionStatus = 'draft' | 'validated' | 'partial' | 'failed';

export interface ContentVersion {
  id: string;
  version: number;
  text_sha256: string;
  char_count: number;
  created_by: string;
  created_at: string;
}

export interface ContentSubmission {
  id: string;
  title: string;
  status: SubmissionStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface SubmissionDetail extends ContentSubmission {
  versions: ContentVersion[];
}

export type RunState = 'pending' | 'running' | 'completed' | 'partial' | 'failed';
export type AiStatus = 'complete' | 'partial' | 'unavailable' | 'skipped_budget' | 'pending';
export type FindingSeverity = 'low' | 'medium' | 'high';
export type FindingVerificationStatus =
  | 'SUPPORTED'
  | 'NEEDS_VERIFICATION'
  | 'INVALID_SOURCE'
  | 'NOT_APPLICABLE';

export interface Finding {
  id: string;
  category: string;
  severity: FindingSeverity;
  source: 'deterministic' | 'ai';
  rule_id: string | null;
  rule_version: number | null;
  snippet: string;
  start_offset: number | null;
  end_offset: number | null;
  explanation: string;
  suggested_text: string | null;
  verification_status: FindingVerificationStatus;
  evidence_chunk_ids: string[];
  needs_verification_reason: string | null;
}

export interface EvidenceSnapshot {
  id: string;
  chunk_id: string;
  document_id: string;
  document_title: string;
  doc_type: string;
  document_version: number;
  section_ref: string;
  page_start: number | null;
  page_end: number | null;
  text: string;
}

export interface ValidationRun {
  id: string;
  submission_id: string;
  content_version_id: string;
  state: RunState;
  ai_status: AiStatus;
  partial_reason: string | null;
  error_code: string | null;
  cache_hit: boolean;
  prompt_version: string;
  model_id: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  provider_latency_ms: number | null;
  created_at: string;
  completed_at: string | null;
  findings: Finding[];
  evidence: EvidenceSnapshot[];
}

export interface ValidationRunSummary {
  id: string;
  submission_id: string;
  content_version_id: string;
  state: RunState;
  ai_status: AiStatus;
  cache_hit: boolean;
  finding_count: number;
  created_at: string;
  completed_at: string | null;
}
