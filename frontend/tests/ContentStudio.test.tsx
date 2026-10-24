import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContentStudioView } from '../src/features/studio/ContentStudioView';
import { ValidationRunsView } from '../src/features/runs/ValidationRunsView';
import { EvidenceFindingsView } from '../src/features/runs/EvidenceFindingsView';
import { AuthContext } from '../src/features/auth/auth-context';
import { demoSession } from './auth-fixtures';

vi.mock('../src/services/brand-api', () => ({
  brandApi: {
    listSubmissions: vi.fn().mockResolvedValue([
      {
        id: 'sub_123',
        title: 'Spring Campaign Copy',
        status: 'draft',
        created_by: 'usr_1',
        created_at: '2026-10-24T12:00:00Z',
        updated_at: '2026-10-24T12:00:00Z',
      },
    ]),
    createSubmission: vi.fn().mockResolvedValue({
      id: 'sub_123',
      title: 'Spring Campaign Copy',
      status: 'draft',
      created_by: 'usr_1',
      created_at: '2026-10-24T12:00:00Z',
      updated_at: '2026-10-24T12:00:00Z',
      versions: [
        {
          id: 'cv_123',
          version: 1,
          text_sha256: 'hash123',
          char_count: 50,
          created_by: 'usr_1',
          created_at: '2026-10-24T12:00:00Z',
        },
      ],
    }),
    validateContent: vi.fn().mockResolvedValue({
      id: 'vr_999',
      submission_id: 'sub_123',
      content_version_id: 'cv_123',
      state: 'completed',
      ai_status: 'unavailable',
      cache_hit: false,
      prompt_version: 'v1',
      created_at: '2026-10-24T12:00:00Z',
      findings: [],
      evidence: [],
    }),
    listValidationRuns: vi.fn().mockResolvedValue([
      {
        id: 'vr_999',
        submission_id: 'sub_123',
        content_version_id: 'cv_123',
        state: 'completed',
        ai_status: 'unavailable',
        cache_hit: true,
        finding_count: 2,
        created_at: '2026-10-24T12:00:00Z',
        completed_at: '2026-10-24T12:00:01Z',
      },
    ]),
    getValidationRun: vi.fn().mockResolvedValue({
      id: 'vr_999',
      submission_id: 'sub_123',
      content_version_id: 'cv_123',
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
          snippet: 'unlimited free warranty',
          explanation: 'Warranty claims must disclose duration terms.',
          suggested_text: 'complimentary 1-year limited warranty',
          verification_status: 'SUPPORTED',
          evidence_chunk_ids: ['chunk_1'],
        },
      ],
      evidence: [
        {
          id: 'ev_1',
          chunk_id: 'chunk_1',
          document_id: 'doc_1',
          document_title: 'Warranty Policy',
          doc_type: 'guidelines',
          document_version: 1,
          section_ref: 's1',
          page_start: 1,
          page_end: 1,
          text: 'Do not use unlimited warranty phrasing.',
        },
      ],
    }),
  },
}));

describe('ContentStudioView and Runs Views', () => {
  const mockAuthState = {
    status: 'authenticated' as const,
    session: demoSession(),
    pending: null,
    error: null,
    notice: null,
    signIn: vi.fn(),
    logout: vi.fn(),
    restore: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Content Studio editor with character counter', async () => {
    render(
      <AuthContext.Provider value={mockAuthState}>
        <MemoryRouter initialEntries={['/studio']}>
          <ContentStudioView />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText('Content Studio')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e\.g\. Q4 Flagship Launch/i)).toBeInTheDocument();
    expect(screen.getByText(/0 \/ 12,000 characters/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Spring Campaign Copy')).toBeInTheDocument();
    });
  });

  it('renders ValidationRunsView with runs history table', async () => {
    render(
      <MemoryRouter initialEntries={['/runs']}>
        <ValidationRunsView />
      </MemoryRouter>
    );

    expect(screen.getByText('Validation Runs')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/vr_999/i)).toBeInTheDocument();
      expect(screen.getByText('Rule checks only')).toBeInTheDocument();
      expect(screen.getAllByText('completed').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders EvidenceFindingsView showing transparent provider state and findings', async () => {
    render(
      <MemoryRouter initialEntries={['/runs/vr_999']}>
        <Routes>
          <Route path="/runs/:runId" element={<EvidenceFindingsView />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Evidence & Findings')).toBeInTheDocument();
      expect(screen.getByText('AI analysis unavailable')).toBeInTheDocument();
      expect(screen.getByText(/"unlimited free warranty"/i)).toBeInTheDocument();
      expect(screen.getByText('SUPPORTED')).toBeInTheDocument();
      expect(screen.getByText('Warranty Policy')).toBeInTheDocument();
    });
  });
});
