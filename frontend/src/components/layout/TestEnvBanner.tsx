import { cn } from '@/lib/utils';

/**
 * Server-rendered banner that surfaces only on `test` deployments.
 *
 * Reads `process.env.NEXT_PUBLIC_APP_ENV` exactly once at module top — Next.js
 * inlines `NEXT_PUBLIC_*` into both server and client bundles at build time, so
 * the conditional resolves server-side and ships as plain text in the initial
 * HTML (no client flicker, no hydration mismatch).
 */
const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

export function TestEnvBanner() {
  if (APP_ENV !== 'test') {
    return null;
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="test-env-banner"
      className={cn(
        'w-full text-center',
        'border-b border-status-warning/40',
        'bg-status-warning/10',
        'font-display tracking-[1px] uppercase',
        'px-4 py-2',
        'text-[12px] sm:text-[14px]',
        'text-[#091420]',
      )}
    >
      Test environment — not for production use
    </div>
  );
}
