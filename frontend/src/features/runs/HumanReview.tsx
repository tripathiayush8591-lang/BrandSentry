import { useEffect, useRef, useState } from 'react';
import type { ReviewDetail, ReviewDecision, FindingDecision, FinalDecision } from '../../types/review';
import { Card } from '../../components/Card';
import type { useHumanReview } from './useHumanReview';
import './review.css';
import { useDemoMode } from '../preview/demo-context';

type Controller = ReturnType<typeof useHumanReview>;
const labels: Record<string, string> = { pending: 'Pending human review', in_review: 'Partially reviewed', approved: 'Approved', changes_requested: 'Changes requested' };
const decisions: Record<string, string> = { accept: 'Accept — issue exists', reject: 'Reject — dismissed', flag: 'Flag — investigate', approve: 'Approve', request_changes: 'Request changes' };
const blockers: Record<string, string> = { stale_run: 'A newer content version or validation run exists.', incomplete_validation: 'Validation and AI analysis must both be complete for approval.', unresolved_findings: 'Accept or reject every finding before finalizing. Flagged findings remain unresolved.', accepted_issues: 'Accepted issues block approval. Request changes or reconsider the finding decisions.', review_final: 'This review is finalized and locked.' };

export function ReviewSummary({ controller: c }: { controller: Controller }) {
  const demo = useDemoMode();
  const r = c.review!;
  return <Card className="review-panel p-5 space-y-3">
    <div className="review-heading"><div><h2>Human review</h2><p className="review-muted">Exact version · revision {r.revision}</p></div>
      <strong className="review-status">{!r.is_current ? 'Historical · ' : ''}{labels[r.status]}</strong></div>
    <p>{r.run.findings.length - r.unresolved_finding_ids.length} of {r.run.findings.length} findings resolved · {r.unresolved_finding_ids.length} pending or flagged</p>
    {r.is_demo && <p className="review-callout">{demo ? 'Simulated review history · Fictional reviewer and sample decisions. No human decision has been performed or saved in this preview.' : 'Demo self-review · Actions use your actual guest identity. This is an isolated demonstration, not independent multi-person approval.'}</p>}
    <p className="review-muted">Human judgments are recorded separately. They do not change the original AI assessment, source verification, or saved evidence.</p>
    {(c.permissionReason || c.workflowReason) && <p className="review-callout">{c.permissionReason || c.workflowReason}</p>}
    {c.error && <p role="alert" className="review-callout">{c.error}</p>}
    {c.notice && <p role="status">{c.notice}</p>}
    <div className="review-actions">
      {c.retry && <button className="neu-btn-primary" disabled={c.busy} onClick={c.retryDecision}>Retry exact decision</button>}
      <button className="neu-btn-secondary" disabled={c.busy || !!c.retry} onClick={() => void c.reload()}>{c.busy ? 'Updating review…' : 'Refresh review state'}</button>
    </div>
    <details className="service-details"><summary>Exact content reviewed</summary>
      <p className="review-muted review-id">Version {r.run.content_version_id} · Run {r.run.id}</p>
      <p className="review-content">{r.content_text}</p>
    </details>
  </Card>;
}

export function FindingReview({ findingId, index, review, disabled, onDecide }: {
  findingId: string; index: number; review: ReviewDetail; disabled: boolean;
  onDecide: (id: string, decision: FindingDecision, notes: string) => void;
}) {
  const [notes, setNotes] = useState('');
  const latest = review.decisions.filter((d) => d.finding_id === findingId).slice(-1)[0];
  return <section className="finding-review" aria-label={`Human judgment for finding ${index + 1}`}>
    <h3>Human judgment</h3>
    <p>{latest ? decisions[latest.decision] ?? latest.decision : 'Pending human review'}{review.unresolved_finding_ids.includes(findingId) ? ' · Unresolved' : ''}</p>
    {latest && <Attribution event={latest} />}
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="review-muted">Accept confirms the issue. Reject dismisses it with a reason. Flag requests further investigation.</legend>
      <label htmlFor={`notes-${findingId}`}>Reviewer notes <span className="review-muted">(required for reject; otherwise optional)</span></label>
      <textarea id={`notes-${findingId}`} className="neu-input" value={notes} maxLength={2000} rows={2} onChange={(e) => setNotes(e.target.value)} />
      <div className="review-actions">
        <button className="neu-btn-secondary" onClick={() => onDecide(findingId, 'accept', notes)}>Accept issue</button>
        <button className="neu-btn-secondary" disabled={!notes.trim()} onClick={() => onDecide(findingId, 'reject', notes)}>Reject finding</button>
        <button className="neu-btn-secondary" onClick={() => onDecide(findingId, 'flag', notes)}>Flag for investigation</button>
      </div>
    </fieldset>
  </section>;
}

function Attribution({ event }: { event: ReviewDecision }) {
  const demo = useDemoMode();
  return <div className="review-attribution">
    <p>{event.actor_name} · {event.actor_role}{demo ? ' · Simulated decision' : event.is_demo ? ' · Demo self-review' : ''} · <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></p>
    <p className="review-muted review-id">Actor {event.actor_id}</p>
    {event.notes && <p className="review-content">{event.notes}</p>}
  </div>;
}

export function FinalReview({ controller: c }: { controller: Controller }) {
  const r = c.review!;
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState<{ decision: FinalDecision; revision: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (confirm && !dialog.current?.open) dialog.current?.showModal();
  }, [confirm]);
  const canFinalize = c.canReview && r.unresolved_finding_ids.length === 0;
  const canApprove = canFinalize && r.approval_blockers.length === 0;
  const close = () => { dialog.current?.close(); setConfirm(null); opener.current?.focus(); };
  const choose = (decision: FinalDecision, button: HTMLButtonElement) => { opener.current = button; setConfirm({ decision, revision: r.revision }); };
  return <>
    <Card className="review-panel p-5 space-y-3">
      <h2>Final review decision</h2>
      <p className="review-muted">Approve or request changes for this exact content version and run. Finalizing locks further review actions.</p>
      {r.approval_blockers.length > 0 && <ul className="review-blockers" aria-label="Approval blockers">{r.approval_blockers.map((b) => <li key={b}>{blockers[b] ?? `Approval blocked: ${b}`}</li>)}</ul>}
      <label htmlFor="final-review-notes">Final reviewer notes (optional)</label>
      <textarea className="neu-input" id="final-review-notes" maxLength={2000} rows={2} value={notes} disabled={!c.canReview} onChange={(e) => setNotes(e.target.value)} />
      <div className="review-actions">
        <button className="neu-btn-primary" disabled={!canApprove} onClick={(e) => choose('approve', e.currentTarget)}>Approve</button>
        <button className="neu-btn-secondary" disabled={!canFinalize} onClick={(e) => choose('request_changes', e.currentTarget)}>Request changes</button>
      </div>
    </Card>
    <Card className="review-panel p-5 space-y-3">
      <h2>Review history</h2>
      <p className="review-muted">Every decision is retained, including superseded judgments.</p>
      {r.decisions.length === 0 ? <p>No human decisions recorded yet.</p> : <ol className="review-history">{r.decisions.map((d) => <li key={d.id}>
        <strong>Revision {d.revision} · {decisions[d.decision] ?? d.decision}</strong>
        <p>{d.finding_id ? `Finding ${r.run.findings.findIndex((f) => f.id === d.finding_id) + 1}` : 'Final decision'} · Version <span className="review-id">{r.run.content_version_id}</span></p>
        <Attribution event={d} />
      </li>)}</ol>}
    </Card>
    {confirm && <dialog ref={dialog} className="review-dialog" aria-labelledby="confirm-review-title" onCancel={close}>
      <h2 id="confirm-review-title">Confirm {decisions[confirm.decision].toLowerCase()}</h2>
      <p>This final decision locks the review for this exact version and run.</p>
      <p className="review-id">Version {r.run.content_version_id} · Revision {confirm.revision}</p>
      {r.is_demo && <p>Demo self-review using your actual guest identity.</p>}
      {notes.trim() && <p className="review-content">{notes.trim()}</p>}
      {confirm.revision !== r.revision && <p role="alert">Review changed. Cancel and reconsider the latest state.</p>}
      <div className="review-actions">
        <button autoFocus className="neu-btn-secondary" onClick={close}>Cancel</button>
        <button className="neu-btn-primary" disabled={confirm.revision !== r.revision || !(confirm.decision === 'approve' ? canApprove : canFinalize)} onClick={() => { c.decide(null, confirm.decision, notes); close(); }}>Confirm final decision</button>
      </div>
    </dialog>}
  </>;
}
