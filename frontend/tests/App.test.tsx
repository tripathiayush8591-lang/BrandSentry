import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from '../src/app/App';
import { StatusResponse } from '../src/types/api';

describe('App Integration', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const validStatusPayload: StatusResponse = {
    status: 'ok',
    service: 'brandsentry-backend',
    version: '0.1.0',
    environment: 'development',
    api_version: 'v1',
    time_utc: '2026-10-23T15:45:00.000000Z',
    request_id: 'req_app_test123',
  };

  it('renders application shell, logo, overview and footer', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => 'req_app_test123',
      },
      json: async () => validStatusPayload,
    } as unknown as Response);

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    // Brand logo & wordmark
    expect(screen.getByText('Brand')).toBeInTheDocument();
    expect(screen.getByText('Sentry')).toBeInTheDocument();

    // Mission and overview
    expect(
      screen.getByText('AI-Assisted Pre-Publication Brand Governance')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Every claim verified. Every decision accountable.')
    ).toBeInTheDocument();

    // Footer
    expect(screen.getByText('PROMPT PIRATES')).toBeInTheDocument();

    // Wait for successful connectivity update
    await waitFor(() => {
      expect(screen.getByText('brandsentry-backend')).toBeInTheDocument();
      expect(screen.getByText('req_app_test123')).toBeInTheDocument();
    });
  });

  it('renders 404 Not Found fallback when navigating to unknown route', () => {
    render(
      <MemoryRouter initialEntries={['/some/nonexistent/page']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('Page Not Found')).toBeInTheDocument();
    expect(screen.getByText('/some/nonexistent/page')).toBeInTheDocument();
    expect(screen.getByText('Return to Overview')).toBeInTheDocument();
  });

  it('handles backend connection failure gracefully in App', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('state-error')).toBeInTheDocument();
      expect(screen.getAllByText('Backend Unavailable').length).toBeGreaterThanOrEqual(1);
    });
  });
});
