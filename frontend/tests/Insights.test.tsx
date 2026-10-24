import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { InsightsView } from '../src/features/insights/InsightsView';
import { AuthContext } from '../src/features/auth/auth-context';
import { brandApi } from '../src/services/brand-api';
import { demoSession } from './auth-fixtures';
import type { InsightsSummary } from '../src/types/insights';

export const emptySummary: InsightsSummary = {
  workspace_id: 'test-workspace-guest', is_demo: true, scope: 'all_recorded_runs', validation_runs: 0,
  run_states: { pending: 0, running: 0, completed: 0, partial: 0, failed: 0 },
  findings: [], categories: [], review_progress: { pending: 0, in_review: 0, approved: 0, changes_requested: 0 },
};
function mount(role: 'admin' | 'creator' | 'reviewer' = 'admin') {
  return render(<AuthContext.Provider value={{ status: 'authenticated', session: { ...demoSession(), role }, pending: null, error: null, notice: null, signIn: vi.fn(), logout: vi.fn(), restore: vi.fn() }}><InsightsView /></AuthContext.Provider>);
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('shows loading then honest empty state and no invented categories', async () => {
  vi.spyOn(brandApi, 'getInsights').mockResolvedValue(emptySummary);
  mount(); expect(screen.getByRole('status')).toHaveTextContent('Loading');
  expect(await screen.findByText(/No validation runs recorded/)).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Recorded categories' })).not.toBeInTheDocument();
  expect(screen.getByText(/Isolated demo workspace/)).toBeVisible();
});
it('keeps machine origin, unverified status, incomplete runs and historical human outcomes explicit', async () => {
  vi.spyOn(brandApi, 'getInsights').mockResolvedValue({ ...emptySummary, validation_runs: 3,
    run_states: { ...emptySummary.run_states, completed: 1, partial: 1, running: 1 },
    findings: [{ source: 'ai', verification_status: 'NEEDS_VERIFICATION', count: 2 }, { source: 'deterministic', verification_status: 'SUPPORTED', count: 1 }],
    categories: [{ category: 'unsupported_claim', source: 'ai', count: 2 }],
    review_progress: { pending: 1, in_review: 1, approved: 1, changes_requested: 0 },
  });
  mount('reviewer'); await screen.findByRole('heading', { name: 'Validation runs: 3' });
  expect(screen.getByText('AI-generated · NEEDS_VERIFICATION')).toBeVisible();
  expect(screen.getByText('Deterministic · SUPPORTED')).toBeVisible();
  expect(screen.getByText('unsupported_claim · AI-generated')).toBeVisible();
  expect(screen.getByText(/NEEDS_VERIFICATION remains unverified/)).toBeVisible();
  expect(screen.getByText(/Historical approvals do not approve current content/)).toBeVisible();
  expect(screen.getByText(/Pending includes incomplete runs/)).toBeVisible();
});
it('handles denial without fetching and handles backend errors with retry', async () => {
  const get = vi.spyOn(brandApi, 'getInsights').mockRejectedValue(new Error('Summary unavailable'));
  const view = mount('creator'); expect(screen.getByRole('alert')).toHaveTextContent('admin or reviewer');
  expect(get).not.toHaveBeenCalled(); view.unmount(); mount();
  await screen.findByText('Summary unavailable');
  get.mockResolvedValue(emptySummary);
  await userEvent.click(screen.getByRole('button', { name: 'Refresh summary' }));
  await screen.findByText(/No validation runs recorded/);
});
it('uses the credentialed no-store API client and preserves authorization errors', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(emptySummary))); vi.stubGlobal('fetch', fetch);
  expect(await brandApi.getInsights()).toEqual(emptySummary);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/insights/summary'), expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
  fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Denied' } }), { status: 403 }));
  await waitFor(async () => { await expect(brandApi.getInsights()).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' }); });
});
