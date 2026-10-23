import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConnectivityPanel } from '../src/features/overview/ConnectivityPanel';
import { ConnectionState } from '../src/types/api';

describe('ConnectivityPanel Component', () => {
  const dummyBaseUrl = 'http://127.0.0.1:8000';

  it('renders loading state correctly', () => {
    const loadingState: ConnectionState = { status: 'loading' };
    render(
      <ConnectivityPanel
        connectionState={loadingState}
        onRetry={vi.fn()}
        apiBaseUrl={dummyBaseUrl}
      />
    );

    expect(screen.getByTestId('state-loading')).toBeInTheDocument();
    expect(screen.getByText('Checking connection...')).toBeInTheDocument();
    expect(screen.getByTestId('retry-button')).toBeDisabled();
    expect(screen.getByText('Checking...')).toBeInTheDocument();
  });

  it('renders connected state with authoritative response details', () => {
    const connectedState: ConnectionState = {
      status: 'connected',
      data: {
        status: 'ok',
        service: 'brandsentry-backend',
        version: '0.1.0',
        environment: 'development',
        api_version: 'v1',
        time_utc: '2026-10-23T15:45:00.000000Z',
        request_id: 'req_auth987654',
      },
      latencyMs: 14,
      fetchedAt: new Date(),
    };

    render(
      <ConnectivityPanel
        connectionState={connectedState}
        onRetry={vi.fn()}
        apiBaseUrl={dummyBaseUrl}
      />
    );

    expect(screen.getByTestId('state-connected')).toBeInTheDocument();
    expect(screen.getByText('Backend reachable and responsive')).toBeInTheDocument();
    expect(screen.getByText('HTTP 200 OK')).toBeInTheDocument();
    expect(screen.getByText('14ms')).toBeInTheDocument();

    // Verify response fields
    expect(screen.getByText('brandsentry-backend')).toBeInTheDocument();
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
    expect(screen.getByText('development')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('req_auth987654')).toBeInTheDocument();
    expect(screen.getByText('2026-10-23T15:45:00.000000Z')).toBeInTheDocument();

    // Retry button is enabled
    const retryBtn = screen.getByTestId('retry-button');
    expect(retryBtn).not.toBeDisabled();
    expect(screen.getByText('Retry Connection')).toBeInTheDocument();
  });

  it('renders backend unavailable error state with troubleshooting guidance', () => {
    const errorState: ConnectionState = {
      status: 'error',
      errorType: 'unreachable',
      message: 'Unable to connect to backend at http://127.0.0.1:8000: Connection refused',
      attemptedAt: new Date(),
    };

    render(
      <ConnectivityPanel
        connectionState={errorState}
        onRetry={vi.fn()}
        apiBaseUrl={dummyBaseUrl}
      />
    );

    expect(screen.getByTestId('state-error')).toBeInTheDocument();
    expect(screen.getByText('Backend Unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Connection refused/)).toBeInTheDocument();
    expect(screen.getByText(/Troubleshooting Steps:/)).toBeInTheDocument();
  });

  it('renders request timeout error state', () => {
    const timeoutState: ConnectionState = {
      status: 'error',
      errorType: 'timeout',
      message: 'Request to http://127.0.0.1:8000/api/v1/status timed out after 5000ms.',
      attemptedAt: new Date(),
    };

    render(
      <ConnectivityPanel
        connectionState={timeoutState}
        onRetry={vi.fn()}
        apiBaseUrl={dummyBaseUrl}
      />
    );

    expect(screen.getByTestId('state-error')).toBeInTheDocument();
    expect(screen.getByText('Request Timeout')).toBeInTheDocument();
    expect(
      screen.getByText(/timed out after 5000ms/)
    ).toBeInTheDocument();
  });

  it('renders malformed response error state', () => {
    const malformedState: ConnectionState = {
      status: 'error',
      errorType: 'malformed',
      message: 'Backend response is missing required fields or did not match the status schema.',
      attemptedAt: new Date(),
    };

    render(
      <ConnectivityPanel
        connectionState={malformedState}
        onRetry={vi.fn()}
        apiBaseUrl={dummyBaseUrl}
      />
    );

    expect(screen.getByTestId('state-error')).toBeInTheDocument();
    expect(screen.getByText('Malformed Response')).toBeInTheDocument();
    expect(
      screen.getByText(/missing required fields/)
    ).toBeInTheDocument();
  });

  it('triggers onRetry when retry button is clicked', () => {
    const onRetryMock = vi.fn();
    const errorState: ConnectionState = {
      status: 'error',
      errorType: 'unreachable',
      message: 'Failed to connect',
      attemptedAt: new Date(),
    };

    render(
      <ConnectivityPanel
        connectionState={errorState}
        onRetry={onRetryMock}
        apiBaseUrl={dummyBaseUrl}
      />
    );

    const retryBtn = screen.getByTestId('retry-button');
    fireEvent.click(retryBtn);

    expect(onRetryMock).toHaveBeenCalledTimes(1);
  });
});
