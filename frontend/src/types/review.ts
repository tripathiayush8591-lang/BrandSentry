import type { ValidationRun } from './validation';

// Mirrors backend/app/schemas/review.py. DecisionOut deliberately uses strings
// for decision/actor_role, as the response schema does (requests are narrower).
export type FindingDecision = 'accept' | 'reject' | 'flag';
export type FinalDecision = 'approve' | 'request_changes';
export interface FindingDecisionRequest {
  expected_revision: number;
  decision: FindingDecision;
  notes?: string | null;
}
export interface FinalDecisionRequest {
  expected_revision: number;
  decision: FinalDecision;
  notes?: string | null;
}
export interface ReviewDecision {
  id: string;
  run_id: string;
  finding_id: string | null;
  revision: number;
  decision: string;
  notes: string | null;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  is_demo: boolean;
  created_at: string;
}
export interface ReviewDetail {
  run: ValidationRun;
  content_text: string;
  revision: number;
  status: 'pending' | 'in_review' | 'approved' | 'changes_requested';
  is_current: boolean;
  is_demo: boolean;
  unresolved_finding_ids: string[];
  accepted_finding_ids: string[];
  approval_blockers: string[];
  decisions: ReviewDecision[];
}
