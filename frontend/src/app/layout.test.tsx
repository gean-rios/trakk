import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';

// `next/font/local` is a build-time-only helper that ships as a 0-byte stub
// under Vitest's jsdom environment; mock the default export with a factory
// that returns an empty className variable so the layout module can be
// imported without crashing.
vi.mock('next/font/local', () => ({
  default: () => ({ variable: '' }),
}));

// `frontend/src/app/layout.tsx` references `React.ReactNode` and the JSX
// runtime expects `React` in scope (Next.js's SWC compiler normally injects
// it at build time, which Vitest does not). Make `React` available globally
// before the layout module is parsed.
vi.hoisted(async () => {
  const ReactModule = await import('react');
  (globalThis as unknown as { React: typeof import('react') }).React = ReactModule;
});

// `metadata` is a top-level export of `layout.tsx` independent of the env
// flag, so it's safe to import once at module scope.
import { metadata } from './layout';

describe('RootLayout — test environment banner', () => {
  const original = process.env.NEXT_PUBLIC_APP_ENV;

  // Re-evaluate `layout.tsx` for each test so the TestEnvBanner module's
  // top-level `process.env.NEXT_PUBLIC_APP_ENV` read captures the value set
  // inside the test, then re-render with a fresh `RootLayout` reference.
  const loadFreshRootLayout = async () => {
    vi.resetModules();
    vi.doMock('@/components/layout/TestEnvBanner', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/components/layout/TestEnvBanner')>();
      return {
        TestEnvBanner: () =>
          process.env.NEXT_PUBLIC_APP_ENV === 'test' ? actual.TestEnvBanner() : null,
      };
    });
    return (await import('./layout')).default;
  };

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_ENV;
    else process.env.NEXT_PUBLIC_APP_ENV = original;
  });

  it('renders the banner as the first child of <body> when NEXT_PUBLIC_APP_ENV === "test"', async () => {
    process.env.NEXT_PUBLIC_APP_ENV = 'test';
    const RootLayout = await loadFreshRootLayout();
    const { container } = render(<RootLayout>{<span data-testid="page-child" />}</RootLayout>);
    const banner = screen.getByTestId('test-env-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/test environment/i);
    const body = container.querySelector('body')!;
    expect(body.firstElementChild).toBe(banner);
  });

  it.each([
    ['prod'],
    ['production'],
    ['staging'],
    [''],
    ['TEST'],
    [' test '],
  ])('does NOT render the banner when NEXT_PUBLIC_APP_ENV === %p', async (value) => {
    if (value === '') delete process.env.NEXT_PUBLIC_APP_ENV;
    else process.env.NEXT_PUBLIC_APP_ENV = value;
    const RootLayout = await loadFreshRootLayout();
    render(<RootLayout>{<span data-testid="page-child" />}</RootLayout>);
    expect(screen.queryByTestId('test-env-banner')).not.toBeInTheDocument();
  });

  it('does NOT render the banner when NEXT_PUBLIC_APP_ENV is undefined', async () => {
    delete process.env.NEXT_PUBLIC_APP_ENV;
    const RootLayout = await loadFreshRootLayout();
    render(<RootLayout>{<span data-testid="page-child" />}</RootLayout>);
    expect(screen.queryByTestId('test-env-banner')).not.toBeInTheDocument();
  });

  it('preserves the existing metadata (regression guard for the layout shell)', () => {
    expect(metadata).toEqual({ title: 'Trakk', description: 'Lightweight issue tracking with Kanban boards.' });
  });
});
