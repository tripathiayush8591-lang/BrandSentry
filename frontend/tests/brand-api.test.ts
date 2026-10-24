import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { brandApi, BrandApiError } from '../src/services/brand-api';

describe('brandApi client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists knowledge documents successfully', async () => {
    const mockDocs = [
      {
        id: 'doc_1',
        title: 'Brand Guidelines 2026',
        doc_type: 'guidelines',
        status: 'approved',
        active_version: 1,
        created_at: '2026-10-24T12:00:00Z',
        updated_at: '2026-10-24T12:00:00Z',
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ documents: mockDocs }),
    } as Response);

    const docs = await brandApi.listDocuments();
    expect(docs).toEqual(mockDocs);
  });

  it('handles 429 rate limit with Retry-After header', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'retry-after' ? '120' : null),
      },
      json: async () => ({
        error: {
          code: 'RATE_LIMITED',
          message: 'Upload rate limit reached',
          retry_after_seconds: 120,
        },
      }),
    } as unknown as Response);

    await expect(brandApi.uploadDocument(new File(['test'], 'test.txt'))).rejects.toThrow(
      BrandApiError
    );
  });

  it('creates and validates submissions synchronously', async () => {
    const mockSubmission = {
      id: 'sub_1',
      title: 'New Ad Copy',
      status: 'draft',
      created_by: 'usr_1',
      created_at: '2026-10-24T12:00:00Z',
      updated_at: '2026-10-24T12:00:00Z',
      versions: [
        {
          id: 'cv_1',
          version: 1,
          text_sha256: 'abc123hash',
          char_count: 50,
          created_by: 'usr_1',
          created_at: '2026-10-24T12:00:00Z',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => mockSubmission,
    } as Response);

    const created = await brandApi.createSubmission('New Ad Copy', '100% guarantee on all orders');
    expect(created.id).toBe('sub_1');
    expect(created.versions[0].id).toBe('cv_1');
  });

  it('runs validation and returns findings with evidence snapshot', async () => {
    const mockRun = {
      id: 'vr_1',
      submission_id: 'sub_1',
      content_version_id: 'cv_1',
      state: 'completed',
      ai_status: 'unavailable',
      cache_hit: false,
      prompt_version: 'v1',
      created_at: '2026-10-24T12:00:00Z',
      findings: [
        {
          id: 'f_1',
          category: 'prohibited_term',
          severity: 'high',
          source: 'deterministic',
          snippet: '100% guarantee',
          explanation: 'Absolute guarantee claims are prohibited under marketing policy.',
          suggested_text: 'results verified across study participants',
          verification_status: 'SUPPORTED',
          evidence_chunk_ids: ['chunk_1'],
        },
      ],
      evidence: [
        {
          id: 'ev_1',
          chunk_id: 'chunk_1',
          document_id: 'doc_1',
          document_title: 'Marketing Guidelines',
          doc_type: 'guidelines',
          document_version: 1,
          section_ref: 's3',
          page_start: 2,
          page_end: 2,
          text: 'Do not promise 100% guarantees without legal review.',
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockRun,
    } as Response);

    const run = await brandApi.validateContent('sub_1', 'cv_1');
    expect(run.state).toBe('completed');
    expect(run.findings.length).toBe(1);
    expect(run.findings[0].verification_status).toBe('SUPPORTED');
    expect(run.evidence.length).toBe(1);
  });
});
