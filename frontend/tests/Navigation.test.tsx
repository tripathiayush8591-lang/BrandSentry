import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { Navigation } from '../src/components/Navigation';
import { Header } from '../src/components/Header';
import { ConnectionState } from '../src/types/api';
import { ThemeProvider } from '../src/context/ThemeProvider';

describe('Navigation and Header Components', () => {
  it('renders all required navigation destinations with active and upcoming labels', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Navigation orientation="vertical" />
      </MemoryRouter>
    );

    // Active Phase 3 routes
    const overviewLink = screen.getByRole('link', { name: /Overview/i });
    expect(overviewLink).toBeInTheDocument();
    expect(overviewLink).toHaveAttribute('href', '/');

    const vaultLink = screen.getByRole('link', { name: /Brand Vault/i });
    expect(vaultLink).toBeInTheDocument();
    expect(vaultLink).toHaveAttribute('href', '/vault');

    const studioLink = screen.getByRole('link', { name: /Content Studio/i });
    expect(studioLink).toBeInTheDocument();
    expect(studioLink).toHaveAttribute('href', '/studio');

    const runsLink = screen.getByRole('link', { name: /Validation Runs/i });
    expect(runsLink).toBeInTheDocument();
    expect(runsLink).toHaveAttribute('href', '/runs');

    // Upcoming / disabled items (Phase 5)
    const approvalsItem = screen.getByText('Approvals').closest('[role="link"]');
    expect(approvalsItem).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getAllByText('Soon').length).toBeGreaterThanOrEqual(1);

    const insightsItem = screen.getByText('Insights').closest('[role="link"]');
    expect(insightsItem).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders mobile menu toggle and opens/closes drawer on mobile viewport', () => {
    const dummyState: ConnectionState = { status: 'loading' };

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <Header connectionState={dummyState} />
        </MemoryRouter>
      </ThemeProvider>
    );

    // Mobile menu toggle exists
    const menuToggle = screen.getByLabelText('Toggle navigation menu');
    expect(menuToggle).toBeInTheDocument();
    expect(menuToggle).toHaveAttribute('aria-expanded', 'false');

    // Mobile menu should not be open initially
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument();

    // Click toggle to open
    fireEvent.click(menuToggle);
    expect(menuToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('mobile-menu')).toBeInTheDocument();

    // Click toggle again to close
    fireEvent.click(menuToggle);
    expect(menuToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('mobile-menu')).not.toBeInTheDocument();
  });

  it('calls onItemClick when an item is selected in navigation', () => {
    const onItemClickMock = vi.fn();

    render(
      <MemoryRouter initialEntries={['/']}>
        <Navigation orientation="vertical" onItemClick={onItemClickMock} />
      </MemoryRouter>
    );

    const overviewLink = screen.getByRole('link', { name: /Overview/i });
    fireEvent.click(overviewLink);

    expect(onItemClickMock).toHaveBeenCalledTimes(1);
  });
});
