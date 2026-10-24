import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/context/ThemeProvider';
import { ThemeToggle } from '../src/components/ThemeToggle';

describe('Theme preference and accessible landscape control', () => {
  let systemDark: boolean;
  let listeners: Set<(event: MediaQueryListEvent) => void>;
  const renderToggle = () => render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
  const changeSystem = (dark: boolean) => act(() => {
    systemDark = dark;
    listeners.forEach((listener) => listener({ matches: dark } as MediaQueryListEvent));
  });

  beforeEach(() => {
    localStorage.clear();
    systemDark = false;
    listeners = new Set();
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return systemDark; },
      addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    })));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  it('follows system changes by default and sets native control color scheme', () => {
    renderToggle();
    expect(screen.getByRole('switch', { name: 'Dark mode' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Use system theme' })).toHaveAttribute('aria-pressed', 'true');
    changeSystem(true);
    expect(screen.getByRole('switch')).toBeChecked();
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('supports Space and Enter, exposes checked state, and persists explicit choice', async () => {
    const user = userEvent.setup();
    renderToggle();
    await user.tab();
    expect(screen.getByRole('switch')).toHaveFocus();
    await user.keyboard(' ');
    expect(screen.getByRole('switch')).toBeChecked();
    expect(localStorage.getItem('brandsentry_theme')).toBe('dark');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(localStorage.getItem('brandsentry_theme')).toBe('light');
  });

  it('restores a saved explicit preference despite the device setting', () => {
    localStorage.setItem('brandsentry_theme', 'light');
    systemDark = true;
    renderToggle();
    expect(screen.getByRole('switch')).not.toBeChecked();
    changeSystem(false);
    changeSystem(true);
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('can resume following the system after choosing a manual theme', async () => {
    localStorage.setItem('brandsentry_theme', 'light');
    systemDark = true;
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole('button', { name: 'Use system theme' }));
    expect(screen.getByRole('switch')).toBeChecked();
    expect(localStorage.getItem('brandsentry_theme')).toBe('system');
    changeSystem(false);
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('ignores invalid stored preferences and removes media listeners on unmount', () => {
    localStorage.setItem('brandsentry_theme', 'unexpected');
    const view = renderToggle();
    expect(screen.getByRole('button', { name: 'Use system theme' })).toHaveAttribute('aria-pressed', 'true');
    expect(listeners.size).toBe(1);
    view.unmount();
    expect(listeners.size).toBe(0);
  });

  it('still works when storage access is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const user = userEvent.setup();
    renderToggle();
    await user.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toBeChecked();
  });
});
