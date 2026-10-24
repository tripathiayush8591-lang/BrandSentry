import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EvidenceFindingsView } from '../src/features/runs/EvidenceFindingsView';
import { AuthContext } from '../src/features/auth/auth-context';
import { brandApi, BrandApiError } from '../src/services/brand-api';
import { demoSession } from './auth-fixtures';
import { reviewFixture, submissionFixture, decisionFixture } from './review-fixtures';
import type { AuthSession } from '../src/types/auth';
import type { ReviewDetail } from '../src/types/review';

let review: ReviewDetail;
const submission = submissionFixture();
function mount(session: AuthSession = demoSession()) {
  return render(<AuthContext.Provider value={{ status: 'authenticated', session, pending: null, error: null, notice: null, signIn: vi.fn(), logout: vi.fn(), restore: vi.fn() }}>
    <MemoryRouter initialEntries={['/runs/run-1']}><Routes><Route path="/runs/:runId" element={<EvidenceFindingsView />} /></Routes></MemoryRouter>
  </AuthContext.Provider>);
}
beforeEach(() => {
  review = reviewFixture();
  vi.spyOn(brandApi, 'getReview').mockImplementation(async () => structuredClone(review));
  vi.spyOn(brandApi, 'getSubmission').mockResolvedValue(structuredClone(submission));
  vi.spyOn(brandApi, 'reviewFinding').mockImplementation(async (_run, _finding, body) => {
    const event = { ...decisionFixture(body.decision, review.revision + 1), notes: body.notes ?? null };
    review = { ...review, revision: event.revision, status: 'in_review', decisions: [...review.decisions, event], unresolved_finding_ids: body.decision === 'flag' ? ['finding-1'] : [], accepted_finding_ids: body.decision === 'accept' ? ['finding-1'] : [], approval_blockers: body.decision === 'accept' ? ['accepted_issues'] : body.decision === 'flag' ? ['unresolved_findings'] : [] };
    return event;
  });
  vi.spyOn(brandApi, 'finalizeReview').mockImplementation(async (_run, body) => {
    const event = { ...decisionFixture(body.decision, review.revision + 1), finding_id: null, notes: body.notes ?? null };
    review = { ...review, revision: event.revision, status: body.decision === 'approve' ? 'approved' : 'changes_requested', approval_blockers: ['review_final'], decisions: [...review.decisions, event] };
    return event;
  });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
afterEach(() => vi.restoreAllMocks());

describe('human review workflow', () => {
  it('shows loading, pending review, immutable AI assessment and exact saved citations', async () => {
    mount(); expect(screen.getByText('Loading findings and sources…')).toBeVisible();
    expect(await screen.findByText('Pending human review', { selector: 'strong' })).toBeVisible();
    expect(screen.getByText('Original AI assessment · Finding 1')).toBeVisible();
    expect(screen.getByText('NEEDS_VERIFICATION')).toBeVisible();
    expect(screen.getByText('Avoid guarantees without evidence.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeDisabled();
  });
  it('records notes and all finding dispositions, with superseded history and unchanged machine output', async () => {
    const user = userEvent.setup(); const original = structuredClone(review.run); mount();
    const accept = await screen.findByRole('button', { name: 'Accept issue' });
    expect(screen.getByRole('button', { name: 'Reject finding' })).toBeDisabled();
    await user.click(accept);
    await screen.findByText('Partially reviewed');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Flag for investigation' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Request changes' })).toBeDisabled());
    await user.type(screen.getByLabelText(/Reviewer notes/), 'Documented human exception.');
    await user.click(screen.getByRole('button', { name: 'Reject finding' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled());
    expect(brandApi.reviewFinding).toHaveBeenLastCalledWith('run-1', 'finding-1', { expected_revision: 2, decision: 'reject', notes: 'Documented human exception.' }, expect.any(String), 'mock-csrf-value');
    expect(screen.getByText('Revision 1 · Accept — issue exists')).toBeVisible();
    expect(screen.getByText('Revision 2 · Flag — investigate')).toBeVisible();
    expect(screen.getByText('Revision 3 · Reject — dismissed')).toBeVisible();
    expect(screen.getAllByText(/Synthetic Reviewer · reviewer/).length).toBeGreaterThan(0);
    expect(review.run).toEqual(original);
    expect(screen.getByText('NEEDS_VERIFICATION')).toBeVisible();
  });
  it('requires explicit final confirmation, supports cancel, and locks finalized review', async () => {
    const user = userEvent.setup(); review.run.findings = []; review.unresolved_finding_ids = []; review.approval_blockers = [];
    mount(); await screen.findByText('No policy violations detected');
    await user.type(screen.getByLabelText('Final reviewer notes (optional)'), 'Human final note');
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(brandApi.finalizeReview).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(brandApi.finalizeReview).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(screen.getByRole('button', { name: 'Confirm final decision' }));
    await screen.findByText('Review finalized. This run is locked.');
    expect(brandApi.finalizeReview).toHaveBeenCalledExactlyOnceWith('run-1', { expected_revision: 0, decision: 'approve', notes: 'Human final note' }, expect.any(String), 'mock-csrf-value');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });
  it.each(['submission', 'version'])('prohibits a real %s author even with admin role', async (kind) => {
    const session = demoSession('google'); session.user.id = kind === 'submission' ? submission.created_by : submission.versions[0].created_by;
    review.is_demo = false; mount(session);
    expect(await screen.findByText(/Original authors cannot review/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept issue' })).toBeDisabled();
  });
  it('permits a separate real reviewer and disables creator actions', async () => {
    const session = demoSession('google'); session.role = 'creator'; mount(session);
    expect(await screen.findByText(/Your workspace role does not permit review/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept issue' })).toBeDisabled();
  });
  it('enables a separate real reviewer', async () => {
    const session = demoSession('google'); session.role = 'reviewer'; review.is_demo = false; mount(session);
    expect(await screen.findByRole('button', { name: 'Accept issue' })).toBeEnabled();
    expect(screen.queryByText(/Demo self-review · Actions/)).not.toBeInTheDocument();
  });
  it('blocks historical approval, failed runs and partial approval while allowing partial request changes', async () => {
    review.status = 'approved'; review.is_current = false; review.approval_blockers = ['stale_run', 'review_final']; mount();
    expect(await screen.findByText('Historical · Approved')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept issue' })).toBeDisabled();
  });
  it.each(['pending', 'running', 'failed'] as const)('makes a %s run inspectable but read-only', async (state) => {
    review.run.state = state; mount();
    expect(await screen.findByText(/Review is available only/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Accept issue' })).toBeDisabled();
  });
  it('allows request changes for a partial empty run and explains why approval is blocked', async () => {
    review.run.state = 'partial'; review.run.ai_status = 'unavailable'; review.run.findings = []; review.unresolved_finding_ids = []; review.approval_blockers = ['incomplete_validation']; mount();
    await screen.findByText('No policy violations detected');
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Request changes' })).toBeEnabled();
    expect(screen.getByText(/Validation and AI analysis must both be complete/)).toBeVisible();
  });
  it('reloads conflicts without retrying or silently replacing the expected revision', async () => {
    vi.mocked(brandApi.reviewFinding).mockRejectedValue(new BrandApiError('stale', 409)); mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept issue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Review conflict');
    await waitFor(() => expect(brandApi.getReview).toHaveBeenCalledTimes(2));
    expect(brandApi.reviewFinding).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Retry exact decision' })).not.toBeInTheDocument();
  });
  it('retries an uncertain write using identical key/body and prevents duplicate submissions', async () => {
    vi.mocked(brandApi.reviewFinding).mockRejectedValueOnce(new TypeError('offline')); mount();
    const accept = await screen.findByRole('button', { name: 'Accept issue' });
    fireEvent.click(accept); fireEvent.click(accept);
    const retry = await screen.findByRole('button', { name: 'Retry exact decision' });
    expect(brandApi.reviewFinding).toHaveBeenCalledTimes(1); expect(accept).toBeDisabled();
    fireEvent.click(retry);
    await screen.findByRole('status');
    expect(vi.mocked(brandApi.reviewFinding).mock.calls[0]).toEqual(vi.mocked(brandApi.reviewFinding).mock.calls[1]);
  });
  it('does not repost a saved decision when only its refresh failed', async () => {
    vi.mocked(brandApi.getReview).mockResolvedValueOnce(review).mockRejectedValueOnce(new Error('offline')).mockImplementation(async () => review);
    mount(); fireEvent.click(await screen.findByRole('button', { name: 'Accept issue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Decision recorded, but');
    expect(screen.getByRole('button', { name: 'Accept issue' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh review state' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept issue' })).toBeEnabled());
    expect(brandApi.reviewFinding).toHaveBeenCalledTimes(1);
  });
  it('handles load failure and retry, and fails closed when author detail is missing', async () => {
    vi.mocked(brandApi.getSubmission).mockRejectedValueOnce(new Error('offline')); mount();
    expect(await screen.findByText('Review unavailable')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading review' }));
    await screen.findByText('Human review');
    expect(within(screen.getByRole('region', { name: 'Human judgment for finding 1' })).getByRole('button', { name: 'Accept issue' })).toBeEnabled();
  });
  it('displays review unavailable when review load fails (404/network) and recovers on retry', async () => {
    vi.mocked(brandApi.getReview).mockRejectedValueOnce(new BrandApiError('Not Found', 404)); mount();
    expect(await screen.findByText('Review unavailable')).toBeVisible();
    expect(screen.getByText('Could not load review and author permissions. Check your connection and retry.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading review' }));
    await screen.findByText('Human review');
    expect(screen.getByText('Pending human review', { selector: 'strong' })).toBeVisible();
  });
  it('locks writes after server permission denial', async () => {
    vi.mocked(brandApi.reviewFinding).mockRejectedValue(new BrandApiError('forbidden', 403)); mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept issue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Review denied by the server');
    expect(screen.getByRole('button', { name: 'Accept issue' })).toBeDisabled();
  });
});
