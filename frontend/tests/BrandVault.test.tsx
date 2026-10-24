import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrandVaultView } from '../src/features/vault/BrandVaultView';
import { AuthContext } from '../src/features/auth/auth-context';
import { demoSession } from './auth-fixtures';

vi.mock('../src/services/brand-api', () => ({
  brandApi: {
    listDocuments: vi.fn().mockResolvedValue([
      {
        id: 'doc_1',
        title: 'Q4 Master Guidelines',
        doc_type: 'guidelines',
        status: 'approved',
        active_version: 1,
        created_at: '2026-10-24T12:00:00Z',
        updated_at: '2026-10-24T12:00:00Z',
      },
    ]),
    listRules: vi.fn().mockResolvedValue([
      {
        id: 'rule_1',
        name: 'Prohibit 100% guarantee',
        category: 'prohibited_term',
        matcher_type: 'contains',
        pattern: '100% guarantee',
        replacement: 'clinical results supported',
        rule_text: 'No unverified guarantee statements allowed',
        enabled: true,
        version: 1,
        created_at: '2026-10-24T12:00:00Z',
        updated_at: '2026-10-24T12:00:00Z',
      },
    ]),
    listClaims: vi.fn().mockResolvedValue([
      {
        id: 'claim_1',
        claim_text: 'Zero data retention policy across AI inference.',
        status: 'active',
        created_at: '2026-10-24T12:00:00Z',
        updated_at: '2026-10-24T12:00:00Z',
      },
    ]),
    searchKnowledge: vi.fn().mockResolvedValue({
      query: 'guarantee',
      results: [
        {
          chunk_id: 'c1',
          document_id: 'doc_1',
          document_title: 'Q4 Master Guidelines',
          doc_type: 'guidelines',
          version: 1,
          section_ref: 's2',
          page_number: 3,
          page_end: 3,
          text: 'Avoid absolute guarantee claims.',
          score: 1.45,
        },
      ],
      retrieval_method: 'fts5_bm25',
    }),
  },
}));

describe('BrandVaultView', () => {
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

  it('renders Brand Knowledge Vault header and tabs', async () => {
    render(
      <AuthContext.Provider value={mockAuthState}>
        <MemoryRouter initialEntries={['/vault']}>
          <BrandVaultView />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    expect(screen.getByText('Brand Knowledge Vault')).toBeInTheDocument();
    expect(screen.getByText('Upload Brand Guideline or Policy Document')).toBeInTheDocument();

    // Check document loaded
    await waitFor(() => {
      expect(screen.getByText('Q4 Master Guidelines')).toBeInTheDocument();
    });
  });

  it('switches to Brand Rules tab and displays rules table', async () => {
    render(
      <AuthContext.Provider value={mockAuthState}>
        <MemoryRouter initialEntries={['/vault']}>
          <BrandVaultView />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    const rulesTabButton = await screen.findByRole('button', { name: /Rules/i });
    fireEvent.click(rulesTabButton);

    await waitFor(() => {
      expect(screen.getByText('Prohibit 100% guarantee')).toBeInTheDocument();
      expect(screen.getByText('100% guarantee')).toBeInTheDocument();
    });
  });

  it('switches to FTS5 search tab and renders search form', async () => {
    render(
      <AuthContext.Provider value={mockAuthState}>
        <MemoryRouter initialEntries={['/vault']}>
          <BrandVaultView />
        </MemoryRouter>
      </AuthContext.Provider>
    );

    const searchTabButton = await screen.findByRole('button', { name: /Search guidelines/i });
    fireEvent.click(searchTabButton);

    expect(screen.getByPlaceholderText(/Enter keywords or phrases/i)).toBeInTheDocument();
  });
});
