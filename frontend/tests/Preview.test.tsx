import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, afterEach } from 'vitest';
import App from '../src/app/App';
import { demoApi } from '../src/features/preview/demo-api';
import { demoDestination } from '../src/components/workspace-destination';

describe('isolated frontend Guest Demo', () => {
  afterEach(() => vi.restoreAllMocks());
  it('renders the production shell, fixtures and navigation without a network request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Backend stopped'));
    render(<MemoryRouter initialEntries={['/preview']}><App /></MemoryRouter>);
    expect(screen.getByText('Guest Demo — Synthetic Data')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Your brand, in good hands.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Brand Vault' }));
    expect(await screen.findByText('BrewNest Coffee — Brand Guidelines (synthetic)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Insights' }));
    expect(await screen.findByText('Synthetic metrics from the sample records — no live activity or provider results.')).toBeInTheDocument();
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
    fetch.mockRestore();
  });

  it('rejects every write and unknown ID without fetching or changing fixtures', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network'));
    const before = await demoApi.getReview('brewnest-run-1');
    await expect(demoApi.uploadDocument(new File(['sample'], 'sample.txt'))).rejects.toThrow('Available in connected mode');
    await expect(demoApi.approveDocument('brewnest-guidelines')).rejects.toThrow('Available in connected mode');
    await expect(demoApi.deleteDocument('brewnest-guidelines')).rejects.toThrow('Available in connected mode');
    await expect(demoApi.createRule({ category: 'restricted_phrase', name: 'demo', rule_text: 'demo', pattern: 'demo' })).rejects.toThrow('Available in connected mode');
    await expect(demoApi.updateRule('no-guarantees', {})).rejects.toThrow('Available in connected mode');
    await expect(demoApi.createClaim({ claim_text: 'demo' })).rejects.toThrow('Available in connected mode');
    await expect(demoApi.updateClaim('arabica', {})).rejects.toThrow('Available in connected mode');
    await expect(demoApi.createSubmission('demo', 'demo')).rejects.toThrow('Available in connected mode');
    await expect(demoApi.addSubmissionVersion('brewnest-submission-1', 'demo')).rejects.toThrow('Available in connected mode');
    await expect(demoApi.validateContent('brewnest-submission-1', 'brewnest-version-1')).rejects.toThrow('Available in connected mode');
    await expect(demoApi.reviewFinding('brewnest-run-1', 'brewnest-finding-1', { expected_revision: 3, decision: 'accept' }, 'demo')).rejects.toThrow('Available in connected mode');
    await expect(demoApi.finalizeReview('brewnest-run-1', { expected_revision: 3, decision: 'approve' }, 'demo')).rejects.toThrow('Available in connected mode');
    await expect(demoApi.getReview('unknown')).rejects.toThrow('not found');
    await expect(demoApi.getSubmission('unknown')).rejects.toThrow('not found');
    await expect(demoApi.getValidationRun('unknown')).rejects.toThrow('not found');
    expect(await demoApi.getReview('brewnest-run-1')).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });

  it('scopes only demo navigation and preserves connected destinations', () => {
    expect(demoDestination('/studio/x?mode=test', true)).toBe('/preview/studio/x?mode=test');
    expect(demoDestination('/', true)).toBe('/preview');
    expect(demoDestination('/login', true)).toBe('/login');
    expect(demoDestination('/runs/x', false)).toBe('/runs/x');
  });
});
