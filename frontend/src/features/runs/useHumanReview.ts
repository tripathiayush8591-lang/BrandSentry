import { useCallback, useEffect, useRef, useState } from 'react';
import { brandApi, BrandApiError } from '../../services/brand-api';
import { useAuth } from '../auth/auth-context';
import type { ReviewDetail, FindingDecisionRequest, FinalDecisionRequest } from '../../types/review';
import type { SubmissionDetail } from '../../types/validation';

type Action = { findingId: string; body: FindingDecisionRequest; key: string }
  | { findingId: null; body: FinalDecisionRequest; key: string };

export function useHumanReview(runId: string) {
  const { session, restore } = useAuth();
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [submission, setSubmission] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [retry, setRetry] = useState<Action | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [denied, setDenied] = useState(false);
  const lock = useRef(false);
  const generation = useRef({ value: 0 });

  const refresh = useCallback(async () => {
    const current = ++generation.current.value;
    const detail = await brandApi.getReview(runId);
    const author = await brandApi.getSubmission(detail.run.submission_id);
    if (current !== generation.current.value) return;
    setReview(detail); setSubmission(author); setNeedsRefresh(false);
  }, [runId]);

  useEffect(() => {
    const tracker = generation.current;
    let active = true;
    refresh().catch(() => {
      if (active) setError('Could not load review and author permissions. Check your connection and retry.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; tracker.value++; };
  }, [refresh]);

  const reload = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await refresh(); }
    catch { setNeedsRefresh(true); setError('Could not refresh review state. Retry loading before making another decision.'); }
    finally { lock.current = false; setBusy(false); setLoading(false); }
  };

  const version = submission?.versions.find((item) => item.id === review?.run.content_version_id);
  let permissionReason: string | null = null;
  if (!session || !['admin', 'reviewer'].includes(session.role)) permissionReason = 'Your workspace role does not permit review. An admin or reviewer must decide.';
  else if (!submission || !version) permissionReason = 'Author permissions could not be confirmed. Refresh review state.';
  else if (session.workspace.kind !== 'demo' && [submission.created_by, version.created_by].includes(session.user.id)) permissionReason = 'Original authors cannot review their own content. A separate reviewer must decide.';
  else if (denied) permissionReason = 'The server denied review permission or session protection. Refresh your session before continuing.';

  const final = review?.status === 'approved' || review?.status === 'changes_requested';
  const workflowReason = final ? 'Review finalized. This run is locked.'
    : !review?.is_current ? 'Historical run. Only the latest run of the latest content version can be reviewed.'
    : !['completed', 'partial'].includes(review.run.state) ? 'Review is available only for completed or partial validation runs.' : null;
  const canReview = !!review && !permissionReason && !workflowReason && !needsRefresh && !retry && !busy;

  async function execute(action: Action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    let saved = false;
    try {
      if (action.findingId === null) await brandApi.finalizeReview(runId, action.body, action.key, session?.csrf_token);
      else await brandApi.reviewFinding(runId, action.findingId, action.body, action.key, session?.csrf_token);
      saved = true; setRetry(null); setNeedsRefresh(true);
      await refresh();
      setNotice('Human decision recorded. Review state refreshed.');
    } catch (failure) {
      if (saved) {
        setError('Decision recorded, but the latest review could not be loaded. Refresh review state before continuing.');
      } else if (failure instanceof BrandApiError && failure.status === 409) {
        setRetry(null); setNeedsRefresh(true);
        setError('Review conflict: the revision, content, or decision changed. Review the refreshed state and choose a new action. Nothing was silently resubmitted.');
        try { await refresh(); } catch { /* Keep writes locked until a successful refresh. */ }
      } else if (failure instanceof BrandApiError && failure.status && failure.status < 500 && failure.status !== 429) {
        setRetry(null);
        if (failure.status === 403 || failure.status === 401) setDenied(true);
        setError(failure.status === 403 ? 'Review denied by the server. Your role, author identity, or session protection no longer permits this action.'
          : failure.status === 401 ? 'Your session has ended. Sign in again to review.'
          : failure.status === 404 ? 'This run or finding is unavailable in your workspace.'
          : 'The decision was not accepted. Rejecting a finding requires a reason; notes must be at most 2000 characters.');
        if (failure.status === 401) void restore();
      } else {
        setRetry(action);
        setError('Could not confirm the decision. Retry the exact request to safely recover its receipt; other actions are paused.');
      }
    } finally { lock.current = false; setBusy(false); }
  }

  const decide = (findingId: string | null, decision: FindingDecisionRequest['decision'] | FinalDecisionRequest['decision'], notes: string) => {
    if (!canReview || !review) return;
    const common = { expected_revision: review.revision, notes: notes.trim() || null };
    const key = crypto.randomUUID();
    if (findingId === null && (decision === 'approve' || decision === 'request_changes')) {
      void execute({ findingId, key, body: { ...common, decision } });
    } else if (findingId !== null && (decision === 'accept' || decision === 'reject' || decision === 'flag')) {
      void execute({ findingId, key, body: { ...common, decision } });
    }
  };

  return { review, loading, busy, error, notice, retry, needsRefresh, permissionReason, workflowReason, canReview,
    reload, decide, retryDecision: () => { if (retry) void execute(retry); } };
}
