import Link from 'next/link';

const milestones = [
  { name: 'v0.1 — Secure foundation', state: 'Done' },
  { name: 'v0.2 — Farm operations', state: 'Done' },
  { name: 'v0.3 — Analytics and alerts', state: 'Done' },
  { name: 'v0.4 — AI decision support', state: 'Done' },
  { name: 'v0.5 — Production release', state: 'In progress' },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">FarmOS Intelligence</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Farm operations and decision support, starting with poultry production.
        </p>
        <div className="mt-2 flex gap-3">
          <Link href="/sign-in" className="btn-primary">
            Sign in
          </Link>
          <Link href="/sign-up" className="btn-secondary">
            Create account
          </Link>
        </div>
      </header>
      <section aria-labelledby="milestones" className="flex flex-col gap-3">
        <h2 id="milestones" className="text-lg font-medium">
          Milestones
        </h2>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {milestones.map((m) => (
            <li key={m.name} className="flex items-center justify-between px-4 py-3">
              <span>{m.name}</span>
              <span className="text-sm text-zinc-500">{m.state}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
