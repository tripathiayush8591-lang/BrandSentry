import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import { Navigation } from '../src/components/Navigation';
import { Header } from '../src/components/Header';
import { ConnectionState } from '../src/types/api';

describe('Navigation and Header Components', () => {
  it('renders all required navigation destinations with upcoming labels', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Navigation orientation="horizontal" />
      </MemoryRouter>
    );

    // Active item
    const overviewLink = screen.getByRole('link', { name: /Overview/i });
    expect(overviewLink).toBeInTheDocument();
    expect(overviewLink).toHaveAttribute('href', '/');

    // Upcoming / disabled items
    const vaultItem = screen.getByText('Brand Vault').closest('[role="link"]');
    expect(vaultItem).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Phase 3')).toBeInTheDocument();

    const reviewItem = screen.getByText('Content Review').closest('[role="link"]');
    expect(reviewItem).toHaveAttribute('aria-disabled', 'true');

    const approvalsItem = screen.getByText('Approvals').closest('[role="link"]');
    expect(approvalsItem).toHaveAttribute('aria-disabled', 'true');

    const insightsItem = screen.getByText('Insights').closest('[role="link"]');
    expect(insightsItem).toHaveAttribute('aria-disabled', 'true');
  });

  it('renders mobile menu toggle and opens/closes drawer on mobile viewport', () => {
    const dummyState: ConnectionState = { status: 'loading' };

    render(
      <MemoryRouter initialEntries={['/']}>
        <Header connectionState={dummyState} />
      </MemoryRouter>
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
