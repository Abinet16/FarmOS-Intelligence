import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        The address may be mistyped, or the page may have moved.
      </p>
      <Link href="/organizations" className="btn-primary self-start">
        Go to your organizations
      </Link>
    </main>
  );
}
