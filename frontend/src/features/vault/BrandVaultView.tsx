import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card } from '../../components/Card';
import { useBrandApi } from '../../services/useBrandApi';
import { useAuth } from '../auth/auth-context';
import type {
  KnowledgeDocument,
  KnowledgeChunk,
  BrandRule,
  ApprovedClaim,
  RetrievedChunk,
  DocumentType,
  RuleCategory,
  MatcherType,
} from '../../types/knowledge';
import {
  Archive,
  Upload,
  CheckCircle2,
  Trash2,
  Search,
  PlusCircle,
  FileText,
  Sliders,
  Check,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export const BrandVaultView: React.FC = () => {
  const { session } = useAuth();
  const brandApi = useBrandApi();
  const [searchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') || '';

  const [activeTab, setActiveTab] = useState<'docs' | 'rules' | 'claims' | 'search'>(
    initialSearch ? 'search' : 'docs'
  );

  // Documents state
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadType, setUploadType] = useState<DocumentType>('guidelines');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDocChunks, setSelectedDocChunks] = useState<{ docTitle: string; chunks: KnowledgeChunk[] } | null>(null);

  // Rules state
  const [rules, setRules] = useState<BrandRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [showNewRule, setShowNewRule] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleCategory, setRuleCategory] = useState<RuleCategory>('prohibited_term');
  const [ruleMatcher, setRuleMatcher] = useState<MatcherType>('contains');
  const [rulePattern, setRulePattern] = useState('');
  const [ruleReplacement, setRuleReplacement] = useState('');
  const [ruleText, setRuleText] = useState('');
  const [isSavingRule, setIsSavingRule] = useState(false);

  // Claims state
  const [claims, setClaims] = useState<ApprovedClaim[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [newClaimText, setNewClaimText] = useState('');
  const [isSavingClaim, setIsSavingClaim] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [searchResults, setSearchResults] = useState<RetrievedChunk[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // General feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isAdmin = session?.role === 'admin';

  // Load documents
  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const data = await brandApi.listDocuments();
      setDocuments(data);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load documents' });
    } finally {
      setLoadingDocs(false);
    }
  }, [brandApi]);

  // Load rules
  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const data = await brandApi.listRules();
      setRules(data);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load rules' });
    } finally {
      setLoadingRules(false);
    }
  }, [brandApi]);

  // Load claims
  const loadClaims = useCallback(async () => {
    setLoadingClaims(true);
    try {
      const data = await brandApi.listClaims();
      setClaims(data);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load claims' });
    } finally {
      setLoadingClaims(false);
    }
  }, [brandApi]);

  const handleSearch = useCallback(async (queryText: string) => {
    if (!queryText.trim()) return;
    setIsSearching(true);
    setFeedback(null);
    try {
      const res = await brandApi.searchKnowledge(queryText.trim(), 8);
      setSearchResults(res.results);
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Search failed' });
    } finally {
      setIsSearching(false);
    }
  }, [brandApi]);

  useEffect(() => {
    loadDocuments();
    loadRules();
    loadClaims();
    if (initialSearch) {
      handleSearch(initialSearch);
    }
  }, [initialSearch, loadDocuments, loadRules, loadClaims, handleSearch]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setIsUploading(true);
    setFeedback(null);
    try {
      const res = await brandApi.uploadDocument(uploadFile, uploadTitle, uploadType);
      setFeedback({
        type: 'success',
        message: `Uploaded "${res.document.title}" (version ${res.version.version}).`,
      });
      setUploadFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setUploadTitle('');
      await loadDocuments();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Upload failed' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleApprove = async (docId: string, title: string) => {
    setFeedback(null);
    try {
      await brandApi.approveDocument(docId);
      setFeedback({ type: 'success', message: `Approved "${title}". It is now available for content checks.` });
      await loadDocuments();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Approval failed' });
    }
  };

  const handleDelete = async (docId: string, title: string) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    setFeedback(null);
    try {
      await brandApi.deleteDocument(docId);
      setFeedback({ type: 'success', message: `Deleted "${title}". Chunks removed from retrieval index.` });
      await loadDocuments();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Delete failed' });
    }
  };

  const handleViewChunks = async (doc: KnowledgeDocument) => {
    setSelectedDocChunks(null);
    try {
      const chunks = await brandApi.listChunks(doc.id, doc.active_version ?? undefined);
      setSelectedDocChunks({ docTitle: doc.title, chunks });
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load chunks' });
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !rulePattern.trim() || !ruleText.trim()) return;

    setIsSavingRule(true);
    setFeedback(null);
    try {
      await brandApi.createRule({
        name: ruleName.trim(),
        category: ruleCategory,
        matcher_type: ruleMatcher,
        pattern: rulePattern.trim(),
        replacement: ruleReplacement.trim() || undefined,
        rule_text: ruleText.trim(),
      });
      setFeedback({ type: 'success', message: `Created brand rule "${ruleName}".` });
      setRuleName('');
      setRulePattern('');
      setRuleReplacement('');
      setRuleText('');
      setShowNewRule(false);
      await loadRules();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to create rule' });
    } finally {
      setIsSavingRule(false);
    }
  };

  const handleToggleRule = async (rule: BrandRule) => {
    try {
      await brandApi.updateRule(rule.id, { enabled: !rule.enabled });
      await loadRules();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update rule' });
    }
  };

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClaimText.trim()) return;

    setIsSavingClaim(true);
    setFeedback(null);
    try {
      await brandApi.createClaim({ claim_text: newClaimText.trim() });
      setFeedback({ type: 'success', message: 'Added approved claim.' });
      setNewClaimText('');
      await loadClaims();
    } catch (err) {
      setFeedback({ type: 'error', message: err instanceof Error ? err.message : 'Failed to add claim' });
    } finally {
      setIsSavingClaim(false);
    }
  };



  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Brand Knowledge Vault
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Keep your guidelines, approved facts, and brand rules in one place.
          </p>
        </div>

        {/* Tab Switcher (Neumorphic Wells) */}
        <div className="neu-inset-sm p-1 inline-flex flex-wrap max-w-full items-center gap-1 bg-slate-100 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('docs')}
            aria-pressed={activeTab === 'docs'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'docs'
                ? 'neu-card-sm text-brand-600 dark:text-brand-400 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Guidelines ({documents.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            aria-pressed={activeTab === 'rules'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'rules'
                ? 'neu-card-sm text-brand-600 dark:text-brand-400 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Rules ({rules.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('claims')}
            aria-pressed={activeTab === 'claims'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'claims'
                ? 'neu-card-sm text-brand-600 dark:text-brand-400 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Claims ({claims.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            aria-pressed={activeTab === 'search'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'search'
                ? 'neu-card-sm text-brand-600 dark:text-brand-400 font-semibold shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Search guidelines
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs opacity-70 hover:opacity-100 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: GUIDELINES & DOCUMENTS */}
      {activeTab === 'docs' && (
        <div className="space-y-6">
          {/* Upload Card */}
          <Card className="p-5">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
              <Upload className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              Upload Brand Guideline or Policy Document
            </h2>
            <form onSubmit={handleUpload} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-4">
                <label htmlFor="vault-file" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  File (PDF or UTF-8 TXT, max 5MB)
                </label>
                <input id="vault-file"
                  ref={fileInput}
                  type="file"
                  accept=".pdf,.txt,text/plain,application/pdf"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 dark:file:bg-brand-900/40 dark:file:text-brand-300 hover:file:bg-brand-100 cursor-pointer"
                />
              </div>

              <div className="sm:col-span-4">
                <label htmlFor="vault-title" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Document Title (Optional)
                </label>
                <input id="vault-title"
                  type="text"
                  placeholder="e.g. Q4 Master Brand Guidelines"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="vault-type" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Document Type
                </label>
                <select id="vault-type"
                  value={uploadType}
                  onChange={(e) => setUploadType(e.target.value as DocumentType)}
                  className="w-full px-2 py-1.5 text-xs rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                >
                  <option value="guidelines">Guidelines</option>
                  <option value="approved_claims">Approved Claims</option>
                  <option value="terminology">Terminology</option>
                  <option value="tone_messaging">Tone & Messaging</option>
                  <option value="claims_policy">Claims Policy</option>
                  <option value="source_document">Source Document</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={!uploadFile || isUploading}
                  className="w-full py-2 px-3 neu-btn-primary text-xs flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isUploading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{isUploading ? 'Uploading…' : 'Upload guideline'}</span>
                </button>
              </div>
            </form>
          </Card>

          {/* Document Table */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                Workspace Documents
              </h3>
              <button
                type="button"
                onClick={loadDocuments}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingDocs ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>

            {loadingDocs ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading documents...</div>
            ) : documents.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Archive className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No guidelines yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Upload a PDF or TXT guideline to start checking your content.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Title</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Active Ver.</th>
                      <th className="py-3 px-4">Uploaded</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {documents.map((doc) => {
                      const isApproved = doc.status === 'approved';
                      return (
                        <tr key={doc.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                            {doc.title}
                          </td>
                          <td className="py-3 px-4">
                            <span className="capitalize px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                              {doc.doc_type.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                                isApproved
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                              }`}
                            >
                              {isApproved ? 'Approved' : 'Pending Review'}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                            v{doc.active_version ?? 1}
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {new Date(doc.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => handleViewChunks(doc)}
                              className="px-2.5 py-1 rounded-lg neu-btn-secondary text-xs inline-flex items-center gap-1"
                            >
                              Chunks
                            </button>
                            {!isApproved && isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleApprove(doc.id, doc.title)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs inline-flex items-center gap-1 shadow-sm"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleDelete(doc.id, doc.title)}
                                className="p-1 rounded-lg text-slate-500 hover:text-rose-600 dark:hover:text-rose-400"
                                title="Delete document"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Chunks Inspector Modal / Panel */}
          {selectedDocChunks && (
            <Card className="p-5 border-brand-200 dark:border-brand-900 animate-in fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Extracted Chunks: {selectedDocChunks.docTitle}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {selectedDocChunks.chunks.length} structural chunk(s) indexed for retrieval and citation grounding.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDocChunks(null)}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold"
                >
                  Close Chunks
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto p-1">
                {selectedDocChunks.chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="p-3 rounded-xl neu-card bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <span className="font-mono text-brand-600 dark:text-brand-400">{chunk.section_ref}</span>
                      {chunk.page_number && (
                        <span>
                          Page {chunk.page_number}
                          {chunk.page_end && chunk.page_end !== chunk.page_number ? `–${chunk.page_end}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 font-sans text-sm bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg leading-relaxed whitespace-pre-wrap">
                      {chunk.text}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: BRAND RULES */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Set the words and claims your content should follow.
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowNewRule(!showNewRule)}
                className="py-1.5 px-3 rounded-xl neu-btn-primary text-xs flex items-center gap-1.5"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>{showNewRule ? 'Cancel' : 'Add Brand Rule'}</span>
              </button>
            )}
          </div>

          {/* New Rule Form */}
          {showNewRule && (
            <Card className="p-5 border-brand-200 dark:border-brand-900 animate-in fade-in">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">
                Create brand rule
              </h3>
              <form onSubmit={handleCreateRule} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="rule-name" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Rule Name
                    </label>
                    <input id="rule-name"
                      type="text"
                      required
                      placeholder="e.g. Prohibit competitor guarantee"
                      value={ruleName}
                      onChange={(e) => setRuleName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="rule-category" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Category
                    </label>
                    <select id="rule-category"
                      value={ruleCategory}
                      onChange={(e) => setRuleCategory(e.target.value as RuleCategory)}
                      className="w-full px-2 py-1.5 text-xs rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="prohibited_term">Prohibited Term</option>
                      <option value="preferred_replacement">Preferred Replacement</option>
                      <option value="restricted_phrase">Restricted Phrase</option>
                      <option value="claim_requirement">Claim Requirement</option>
                      <option value="messaging_rule">Messaging Rule</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="rule-matcher" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Matcher Type
                    </label>
                    <select id="rule-matcher"
                      value={ruleMatcher}
                      onChange={(e) => setRuleMatcher(e.target.value as MatcherType)}
                      className="w-full px-2 py-1.5 text-xs rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="contains">Contains (Sub-string)</option>
                      <option value="exact">Exact (Whole token)</option>
                      <option value="regex">Regex (Bounded ReDoS guard)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="rule-pattern" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Search Pattern
                    </label>
                    <input id="rule-pattern"
                      type="text"
                      required
                      placeholder={ruleMatcher === 'regex' ? '\\bguarantee(d)?\\b' : 'e.g. 100% guaranteed'}
                      value={rulePattern}
                      onChange={(e) => setRulePattern(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label htmlFor="rule-replacement" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Suggested Replacement (Optional)
                    </label>
                    <input id="rule-replacement"
                      type="text"
                      placeholder="e.g. results may vary according to usage"
                      value={ruleReplacement}
                      onChange={(e) => setRuleReplacement(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="rule-explanation" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Rule Explanation / Guidance
                  </label>
                  <textarea id="rule-explanation"
                    required
                    rows={2}
                    placeholder="Explain why this phrase is restricted and what the copywriter should communicate instead..."
                    value={ruleText}
                    onChange={(e) => setRuleText(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewRule(false)}
                    className="px-3 py-1.5 rounded-xl neu-btn-secondary text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingRule}
                    className="px-4 py-1.5 rounded-xl neu-btn-primary text-xs flex items-center gap-1.5"
                  >
                    {isSavingRule ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Save Rule</span>
                  </button>
                </div>
              </form>
            </Card>
          )}

          {/* Rules List */}
          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-500" />
                Active Brand Rules ({rules.length})
              </h3>
            </div>

            {loadingRules ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading rules...</div>
            ) : rules.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Sliders className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No brand rules defined yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Add a rule for restricted terms or preferred wording.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Rule Name</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Pattern / Matcher</th>
                      <th className="py-3 px-4">Replacement</th>
                      <th className="py-3 px-4">Version</th>
                      <th className="py-3 px-4 text-center">Active</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rules.map((rule) => (
                      <tr key={rule.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                          <div>{rule.name}</div>
                          <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400 line-clamp-1">{rule.rule_text}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="capitalize px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60">
                            {rule.category.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-1.5 py-0.5 rounded">
                            {rule.pattern}
                          </span>
                          <span className="ml-1.5 text-[10px] text-slate-500">({rule.matcher_type})</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                          {rule.replacement ? (
                            <span className="font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
                              {rule.replacement}
                            </span>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">v{rule.version}</td>
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Enable ${rule.name}`}
                            checked={rule.enabled}
                            onChange={() => handleToggleRule(rule)}
                            disabled={!isAdmin}
                            className="rounded text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: APPROVED CLAIMS */}
      {activeTab === 'claims' && (
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Add Verified Brand Fact / Approved Claim
            </h3>
            <form onSubmit={handleCreateClaim} className="flex gap-2 items-center">
              <input
                type="text"
                required
                aria-label="New approved claim"
                placeholder="e.g. Over 500 enterprise clients trust BrandSentry across 14 markets."
                value={newClaimText}
                onChange={(e) => setNewClaimText(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
              <button
                type="submit"
                disabled={isSavingClaim}
                className="py-2 px-4 neu-btn-primary text-xs flex items-center gap-1.5"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Add Claim</span>
              </button>
            </form>
          </Card>

          <Card className="overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Approved Claims Register ({claims.length})
              </h3>
            </div>

            {loadingClaims ? (
              <div className="p-8 text-center text-xs text-slate-500">Loading claims...</div>
            ) : claims.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No approved factual claims registered yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {claims.map((claim) => (
                  <div key={claim.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                    <p className="text-slate-800 dark:text-slate-200 font-medium">
                      &quot;{claim.claim_text}&quot;
                    </p>
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                      {claim.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: SEARCH FTS5 */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
              Search your guidelines
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Find passages from the current version of your approved guidelines.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch(searchQuery);
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3 pointer-events-none" />
                <input
                  type="search"
                  aria-label="Search approved knowledge"
                  placeholder="Enter keywords or phrases (e.g. warranty, color palette, data privacy)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl neu-input bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="py-2 px-5 neu-btn-primary text-xs flex items-center gap-1.5"
              >
                {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                <span>Search</span>
              </button>
            </form>
          </Card>

          {/* Results */}
          <div className="space-y-3">
            {searchResults.length > 0 && (
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Found {searchResults.length} matching knowledge chunk(s):
              </div>
            )}

            {searchResults.map((res) => (
              <Card key={res.chunk_id} className="p-4 space-y-2 neu-card-interactive">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{res.document_title}</span>
                    <span className="text-[11px] font-mono text-brand-600 dark:text-brand-400">[{res.section_ref}]</span>
                    {res.page_number && (
                      <span className="text-[10px] text-slate-500">
                        pp. {res.page_number}{res.page_end && res.page_end !== res.page_number ? `–${res.page_end}` : ''}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    Match score: {res.score.toFixed(3)}
                  </span>
                </div>
                <p className="text-sm font-sans text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg whitespace-pre-wrap leading-relaxed">
                  {res.text}
                </p>
              </Card>
            ))}

            {!isSearching && searchResults.length === 0 && searchQuery && (
              <Card className="p-8 text-center text-xs text-slate-500">
                No matching approved chunks found for &quot;{searchQuery}&quot;.
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
