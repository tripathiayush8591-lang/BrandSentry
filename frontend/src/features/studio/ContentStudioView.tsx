import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { brandApi } from '../../services/brand-api';
import type { ContentSubmission, SubmissionDetail } from '../../types/validation';
import {
  ShieldCheck,
  PlusCircle,
  History,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

const MAX_CHARS = 12000;

export const ContentStudioView: React.FC = () => {
  const navigate = useNavigate();
  const { submissionId } = useParams<{ submissionId?: string }>();

  const [submissions, setSubmissions] = useState<ContentSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [activeSubmission, setActiveSubmission] = useState<SubmissionDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');

  // Editor form state
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(!submissionId);

  // Validation / saving states
  const [isValidating, setIsValidating] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHARS;

  // Load submissions list
  const loadSubmissions = async () => {
    setLoadingSubmissions(true);
    try {
      const data = await brandApi.listSubmissions(50);
      setSubmissions(data);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load submissions' });
    } finally {
      setLoadingSubmissions(false);
    }
  };

  // Load active submission details
  const loadSubmissionDetail = async (id: string) => {
    try {
      const detail = await brandApi.getSubmission(id);
      setActiveSubmission(detail);
      setTitle(detail.title);
      setIsCreatingNew(false);
      // Select latest version
      if (detail.versions.length > 0) {
        const latest = detail.versions[0];
        setSelectedVersionId(latest.id);
      }
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load submission detail' });
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  useEffect(() => {
    if (submissionId) {
      loadSubmissionDetail(submissionId);
    } else {
      setIsCreatingNew(true);
      setTitle('');
      setText('');
      setActiveSubmission(null);
    }
  }, [submissionId]);

  // Handle Save New Submission
  const handleSaveDraft = async () => {
    if (!title.trim() || !text.trim() || isOverLimit) return;
    setIsSavingDraft(true);
    setFeedback(null);
    try {
      const created = await brandApi.createSubmission(title.trim(), text.trim());
      setFeedback({ type: 'success', message: `Saved draft "${created.title}".` });
      await loadSubmissions();
      navigate(`/studio/${created.id}`);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save submission' });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Handle Create New Revision Version
  const handleCreateRevision = async () => {
    if (!activeSubmission || !text.trim() || isOverLimit) return;
    setIsSavingDraft(true);
    setFeedback(null);
    try {
      await brandApi.addSubmissionVersion(activeSubmission.id, text.trim());
      setFeedback({ type: 'success', message: 'Created new revision version.' });
      await loadSubmissionDetail(activeSubmission.id);
      await loadSubmissions();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create version' });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Handle Check content
  const handleRunValidation = async () => {
    setFeedback(null);
    setIsValidating(true);

    try {
      let subId = activeSubmission?.id;
      let verId = selectedVersionId;

      // If creating new on the fly:
      if (isCreatingNew || !subId) {
        if (!title.trim() || !text.trim() || isOverLimit) {
          setFeedback({ type: 'error', message: 'Title and content text are required to validate.' });
          setIsValidating(false);
          return;
        }
        const created = await brandApi.createSubmission(title.trim(), text.trim());
        subId = created.id;
        verId = created.versions[0].id;
      } else if (!verId && activeSubmission?.versions.length) {
        verId = activeSubmission.versions[0].id;
      }

      if (!subId || !verId) {
        throw new Error('No content version available to validate');
      }

      // Synchronous validation call
      const run = await brandApi.validateContent(subId, verId);
      // Navigate straight to run inspector
      navigate(`/runs/${run.id}`);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Validation failed' });
      setIsValidating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Content Studio
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Write your content, save a version, and check it against your brand guidelines.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isCreatingNew && (
            <button
              type="button"
              onClick={() => {
                setIsCreatingNew(true);
                setTitle('');
                setText('');
                setActiveSubmission(null);
                navigate('/studio');
              }}
              className="px-3 py-2 rounded-xl neu-btn-secondary text-xs flex items-center gap-1.5"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>New Submission</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRunValidation}
            disabled={isValidating || !text.trim() || isOverLimit}
            className="px-4 py-2 rounded-xl neu-btn-primary text-xs flex items-center gap-2 shadow-md"
          >
            {isValidating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Validation...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Check content</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Submissions Sidebar (3 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-4 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Workspace Submissions ({submissions.length})
              </h3>
              <button
                type="button"
                onClick={loadSubmissions}
                aria-label="Refresh submissions"
                className="text-slate-500 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingSubmissions ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="mt-3 space-y-1.5 max-h-[600px] overflow-y-auto">
              {loadingSubmissions && submissions.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">Loading submissions...</div>
              ) : submissions.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No submissions yet. Create your first draft.
                </div>
              ) : (
                submissions.map((sub) => {
                  const isSelected = activeSubmission?.id === sub.id;
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => navigate(`/studio/${sub.id}`)}
                      className={`w-full text-left p-3 rounded-xl transition-all flex flex-col gap-1 border ${
                        isSelected
                          ? 'neu-tab-active bg-brand-50/80 dark:bg-brand-950/40 border-brand-200 dark:border-brand-800 text-brand-950 dark:text-brand-100'
                          : 'bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800/40 border-slate-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold truncate">{sub.title}</span>
                        <span
                          className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full capitalize ${
                            sub.status === 'validated'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : sub.status === 'partial'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {sub.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center justify-between">
                        <span>{new Date(sub.created_at).toLocaleDateString()}</span>
                        <ArrowRight className="w-3 h-3 text-slate-500" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          {/* Version History (if viewing existing submission) */}
          {activeSubmission && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-slate-500" />
                  Saved versions ({activeSubmission.versions.length})
                </span>
              </div>

              <div className="space-y-2">
                {activeSubmission.versions.map((v) => {
                  const isSelected = selectedVersionId === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVersionId(v.id)}
                      aria-pressed={isSelected}
                      className={`w-full text-left p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-brand-50/60 dark:bg-brand-950/40 border-brand-300 dark:border-brand-700'
                          : 'bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span className="text-slate-900 dark:text-white">Version {v.version}</span>
                        <span className="text-[10px] font-mono text-slate-500">{v.char_count} chars</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-slate-500">
                        <span className="truncate max-w-[140px]">{v.text_sha256.slice(0, 16)}...</span>
                        <span>{new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Right column: Main Editor (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <Card className="p-6 space-y-4">
            {/* Title Input */}
            <div>
              <label htmlFor="submission-title" className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Campaign / Asset Title
              </label>
              <input
                id="submission-title"
                type="text"
                placeholder="e.g. Q4 Flagship Launch Landing Page Copy"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2 text-sm font-semibold rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </div>

            {/* Content Textarea with Inset styling */}
            <div>
              <div className="flex flex-wrap gap-2 items-center justify-between mb-1.5">
                <label htmlFor="submission-text" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Marketing Copy / Proposed Content
                </label>
                <div className={`text-xs font-mono ${isOverLimit ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                  {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
                </div>
              </div>

              <textarea
                id="submission-text"
                rows={14}
                placeholder="Paste or write the advertising claims, marketing copy, social media captions, or website text to validate against active guidelines..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full p-4 text-xs sm:text-sm font-sans leading-relaxed rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Checks use your saved guidelines and brand rules.</span>
              </div>

              <div className="flex items-center gap-2">
                {isCreatingNew ? (
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={isSavingDraft || !title.trim() || !text.trim() || isOverLimit}
                    className="px-4 py-2 rounded-xl neu-btn-secondary text-xs font-medium"
                  >
                    {isSavingDraft ? 'Saving Draft...' : 'Save Draft'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateRevision}
                    disabled={isSavingDraft || !text.trim() || isOverLimit}
                    className="px-4 py-2 rounded-xl neu-btn-secondary text-xs font-medium"
                  >
                    {isSavingDraft ? 'Creating Version...' : 'Save New Revision'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleRunValidation}
                  disabled={isValidating || !text.trim() || isOverLimit}
                  className="px-5 py-2 rounded-xl neu-btn-primary text-xs flex items-center gap-1.5 shadow-md"
                >
                  {isValidating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>Check content</span>
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
