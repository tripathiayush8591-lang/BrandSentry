import { getApiBaseUrl } from './api';
import { readCsrfCookie } from './auth-api';
import type { InsightsSummary } from '../types/insights';
import type { ReviewDetail, ReviewDecision, FindingDecisionRequest, FinalDecisionRequest } from '../types/review';
import type {
  KnowledgeDocument,
  KnowledgeDocumentDetail,
  KnowledgeChunk,
  BrandRule,
  CreateBrandRuleInput,
  ApprovedClaim,
  CreateApprovedClaimInput,
  SearchResponse,
  UploadResult,
  DocumentType,
} from '../types/knowledge';
import type {
  ContentSubmission,
  SubmissionDetail,
  ContentVersion,
  ValidationRun,
  ValidationRunSummary,
} from '../types/validation';

export class BrandApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'BrandApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    let code: string | undefined;
    let retryAfterSeconds: number | undefined;

    const retryHeader = response.headers.get('Retry-After');
    if (retryHeader) {
      retryAfterSeconds = parseInt(retryHeader, 10);
    }

    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        message = errJson.error.message;
        code = errJson.error.code;
        if (errJson.error.retry_after_seconds) {
          retryAfterSeconds = errJson.error.retry_after_seconds;
        }
      } else if (errJson?.detail) {
        message = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // Non-JSON response
    }

    throw new BrandApiError(message, response.status, code, retryAfterSeconds);
  }

  return response.json() as Promise<T>;
}

export const brandApi = {
  async getInsights(): Promise<InsightsSummary> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/insights/summary`, {
      credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
    });
    return handleResponse<InsightsSummary>(res);
  },
  async getReview(runId: string): Promise<ReviewDetail> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/validation-runs/${encodeURIComponent(runId)}/review`, {
      credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
    });
    return handleResponse<ReviewDetail>(res);
  },

  async reviewFinding(runId: string, findingId: string, body: FindingDecisionRequest, key: string, csrf?: string): Promise<ReviewDecision> {
    return postReview(`${encodeURIComponent(runId)}/review/findings/${encodeURIComponent(findingId)}`, body, key, csrf);
  },

  async finalizeReview(runId: string, body: FinalDecisionRequest, key: string, csrf?: string): Promise<ReviewDecision> {
    return postReview(`${encodeURIComponent(runId)}/review/decision`, body, key, csrf);
  },
  // --- Brand Knowledge Vault ---
  async listDocuments(): Promise<KnowledgeDocument[]> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/documents`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = await handleResponse<{ documents: KnowledgeDocument[] }>(res);
    return data.documents;
  },

  async getDocument(id: string): Promise<KnowledgeDocumentDetail> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/documents/${encodeURIComponent(id)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    return handleResponse<KnowledgeDocumentDetail>(res);
  },

  async uploadDocument(file: File, title?: string, docType: DocumentType = 'source_document'): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    if (title && title.trim()) {
      formData.append('title', title.trim());
    }
    formData.append('doc_type', docType);

    const csrf = readCsrfCookie();
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/documents`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: formData,
    });
    return handleResponse<UploadResult>(res);
  },

  async approveDocument(id: string): Promise<KnowledgeDocument> {
    const csrf = readCsrfCookie();
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/documents/${encodeURIComponent(id)}/approve`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
    });
    return handleResponse<KnowledgeDocument>(res);
  },

  async deleteDocument(id: string): Promise<void> {
    const csrf = readCsrfCookie();
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/documents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: {
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
    });
    return handleResponse<void>(res);
  },

  async listChunks(documentId: string, version?: number): Promise<KnowledgeChunk[]> {
    const query = version !== undefined ? `?version=${version}` : '';
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/documents/${encodeURIComponent(documentId)}/chunks${query}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = await handleResponse<{ chunks: KnowledgeChunk[] }>(res);
    return data.chunks;
  },

  // --- Brand Rules ---
  async listRules(): Promise<BrandRule[]> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/rules`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = await handleResponse<{ rules: BrandRule[] }>(res);
    return data.rules;
  },

  async createRule(input: CreateBrandRuleInput): Promise<BrandRule> {
    const csrf = readCsrfCookie();
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/rules`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify(input),
    });
    return handleResponse<BrandRule>(res);
  },

  async updateRule(id: string, updates: Partial<BrandRule>): Promise<BrandRule> {
    const csrf = readCsrfCookie();
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/rules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify(updates),
    });
    return handleResponse<BrandRule>(res);
  },

  // --- Approved Claims ---
  async listClaims(): Promise<ApprovedClaim[]> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/claims`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = await handleResponse<{ claims: ApprovedClaim[] }>(res);
    return data.claims;
  },

  async createClaim(input: CreateApprovedClaimInput): Promise<ApprovedClaim> {
    const csrf = readCsrfCookie();
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/claims`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify(input),
    });
    return handleResponse<ApprovedClaim>(res);
  },

  async updateClaim(id: string, updates: { claim_text?: string; status?: 'active' | 'retired' }): Promise<ApprovedClaim> {
    const csrf = readCsrfCookie();
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/claims/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify(updates),
    });
    return handleResponse<ApprovedClaim>(res);
  },

  // --- Retrieval (FTS5) ---
  async searchKnowledge(query: string, topK: number = 5): Promise<SearchResponse> {
    const params = new URLSearchParams({ q: query, top_k: String(topK) });
    const res = await fetch(`${getApiBaseUrl()}/api/v1/knowledge/search?${params.toString()}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    return handleResponse<SearchResponse>(res);
  },

  // --- Content Submissions ---
  async listSubmissions(limit: number = 50, offset: number = 0): Promise<ContentSubmission[]> {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await fetch(`${getApiBaseUrl()}/api/v1/submissions?${params.toString()}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = await handleResponse<{ submissions: ContentSubmission[] }>(res);
    return data.submissions;
  },

  async getSubmission(id: string): Promise<SubmissionDetail> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/submissions/${encodeURIComponent(id)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    return handleResponse<SubmissionDetail>(res);
  },

  async createSubmission(title: string, text: string): Promise<SubmissionDetail> {
    const csrf = readCsrfCookie();
    const res = await fetch(`${getApiBaseUrl()}/api/v1/submissions`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ title, text }),
    });
    return handleResponse<SubmissionDetail>(res);
  },

  async addSubmissionVersion(submissionId: string, text: string): Promise<ContentVersion> {
    const csrf = readCsrfCookie();
    const res = await fetch(`${getApiBaseUrl()}/api/v1/submissions/${encodeURIComponent(submissionId)}/versions`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: JSON.stringify({ text }),
    });
    return handleResponse<ContentVersion>(res);
  },

  // --- Validation ---
  async validateContent(submissionId: string, contentVersionId: string, idempotencyKey?: string): Promise<ValidationRun> {
    const csrf = readCsrfCookie();
    const res = await fetch(`${getApiBaseUrl()}/api/v1/submissions/${encodeURIComponent(submissionId)}/validate`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ content_version_id: contentVersionId }),
    });
    return handleResponse<ValidationRun>(res);
  },

  async listValidationRuns(limit: number = 20): Promise<ValidationRunSummary[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    const res = await fetch(`${getApiBaseUrl()}/api/v1/validation-runs?${params.toString()}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const data = await handleResponse<{ runs: ValidationRunSummary[] }>(res);
    return data.runs;
  },

  async getValidationRun(runId: string): Promise<ValidationRun> {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/validation-runs/${encodeURIComponent(runId)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    return handleResponse<ValidationRun>(res);
  },
};

async function postReview(path: string, body: FindingDecisionRequest | FinalDecisionRequest, key: string, csrf?: string): Promise<ReviewDecision> {
  const token = csrf || readCsrfCookie();
  if (!token) throw new BrandApiError('Session protection is unavailable. Refresh your session before reviewing.', 403);
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/v1/validation-runs/${path}`, {
      method: 'POST', credentials: 'include', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': token, 'Idempotency-Key': key },
      body: JSON.stringify(body),
    });
    return await handleResponse<ReviewDecision>(res);
  } finally { window.clearTimeout(timer); }
}
