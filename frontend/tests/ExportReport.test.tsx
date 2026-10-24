import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ExportReport } from '../src/features/runs/ExportReport';
import { serializeReport } from '../src/features/runs/report';
import { brandApi } from '../src/services/brand-api';
import { decisionFixture, reviewFixture } from './review-fixtures';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('exports exact historical snapshots, decisions and verification without alteration', () => {
  const review = reviewFixture(); review.is_current = false; review.status = 'approved';
  review.decisions = [decisionFixture()];
  review.content_text = '<script>synthetic</script>\nUnicode: नमस्ते';
  const before = structuredClone(review);
  const report = JSON.parse(serializeReport(review));
  expect(report.review).toEqual(before); expect(review).toEqual(before);
  expect(report.report_schema).toBe('brandsentry.validation-review.v1');
  expect(report.disclosures.join(' ')).toContain('NEEDS_VERIFICATION is not independently verified');
  expect(report.review.run.evidence[0].text).toBe('Avoid guarantees without evidence.');
  expect(report.review.run.findings[0].verification_status).toBe('NEEDS_VERIFICATION');
});
it('fetches fresh server state on download and exposes failures without producing a report', async () => {
  const get = vi.spyOn(brandApi, 'getReview').mockRejectedValueOnce(new Error('Export unavailable')).mockResolvedValue(reviewFixture());
  const create = vi.fn().mockReturnValue('blob:synthetic');
  vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = vi.fn(); });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  render(<ExportReport runId="run-1" />);
  await userEvent.click(screen.getByRole('button'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Export unavailable'); expect(create).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button'));
  expect(get).toHaveBeenCalledTimes(2); expect(get).toHaveBeenLastCalledWith('run-1');
  expect(create).toHaveBeenCalledWith(expect.any(Blob)); expect(click).toHaveBeenCalledOnce();
});
