'use client';

import Link from 'next/link';

/**
 * Shown when a page crashes while rendering. The digest identifies the error
 * in the server logs without revealing its details.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        This page couldn’t be shown. Try again, or go back to your organizations.
        {error.digest && <> Reference {error.digest}.</>}
      </p>
      <div className="flex gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/organizations" className="btn-secondary">
          Your organizations
        </Link>
      </div>
    </main>
  );
}
