import type { ReviewDetail } from '../../types/review';

export function serializeReport(review: ReviewDetail): string {
  return JSON.stringify({
    report_schema: 'brandsentry.validation-review.v1',
    exported_at: new Date().toISOString(),
    disclosures: [
      'Saved content and evidence snapshots for this exact validation run; not a live-source check.',
      'AI-generated and deterministic findings remain separate from human review outcomes.',
      'NEEDS_VERIFICATION is not independently verified; SUPPORTED records the system evidence assessment only.',
      'Historical approval does not approve current content. Check is_current and the exact content_version_id.',
      ...(review.is_demo ? ['Isolated demo activity; demo actors are labelled in decision history.'] : []),
    ],
    review,
  }, null, 2);
}
