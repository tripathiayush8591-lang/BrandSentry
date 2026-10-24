export interface InsightsSummary {
  workspace_id: string;
  is_demo: boolean;
  scope: 'all_recorded_runs';
  validation_runs: number;
  run_states: Record<string, number>;
  findings: { source: string; verification_status: string; count: number }[];
  categories: { category: string; source: string; count: number }[];
  review_progress: Record<string, number>;
}
