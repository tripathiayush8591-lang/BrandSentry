import type { brandApi } from '../../services/brand-api';
import { demoDocuments, demoChunks, demoRules, demoClaims, demoSubmissions, demoRuns, demoReviews, demoInsights } from './demo-data';

const unavailable = async (): Promise<never> => { throw new Error('Available in connected mode. Guest Demo does not upload, validate, save or record decisions.'); };
function requireRecord<T>(value: T | undefined): T {
  if (!value) throw new Error('This synthetic record was not found. Choose a sample from the sidebar.');
  return structuredClone(value);
}

// Complete interface: reads stay in memory, every mutation is explicitly rejected.
// No fallback to the real client is allowed here, even for unknown IDs.
export const demoApi: typeof brandApi = {
  getInsights: async () => structuredClone(demoInsights),
  listDocuments: async () => structuredClone(demoDocuments),
  getDocument: async id => ({ ...requireRecord(demoDocuments.find(d => d.id === id)), versions: [] }),
  listChunks: async (id, version) => {
    requireRecord(demoDocuments.find(d => d.id === id));
    return structuredClone(demoChunks.filter(c => c.document_id === id && (version === undefined || c.version === version)));
  },
  listRules: async () => structuredClone(demoRules),
  listClaims: async () => structuredClone(demoClaims),
  searchKnowledge: async (query, topK = 5) => ({ query, retrieval_method: 'synthetic local text search', results: demoChunks.filter(c => `${c.text} ${c.section_ref}`.toLowerCase().includes(query.toLowerCase())).slice(0, topK).map(c => ({ ...c, chunk_id: c.id, document_title: demoDocuments.find(d => d.id === c.document_id)!.title, doc_type: 'guidelines', score: 1 })) }),
  listSubmissions: async (limit = 50, offset = 0) => structuredClone(demoSubmissions.slice(offset, offset + limit)),
  getSubmission: async id => requireRecord(demoSubmissions.find(s => s.id === id)),
  listValidationRuns: async (limit = 20) => demoRuns.slice(0, limit).map(run => ({ ...structuredClone(run), finding_count: run.findings.length })),
  getValidationRun: async id => requireRecord(demoRuns.find(r => r.id === id)),
  getReview: async id => requireRecord(demoReviews.find(r => r.run.id === id)),
  uploadDocument: unavailable, approveDocument: unavailable, deleteDocument: unavailable,
  createRule: unavailable, updateRule: unavailable, createClaim: unavailable, updateClaim: unavailable,
  createSubmission: unavailable, addSubmissionVersion: unavailable, validateContent: unavailable,
  reviewFinding: unavailable, finalizeReview: unavailable,
};
