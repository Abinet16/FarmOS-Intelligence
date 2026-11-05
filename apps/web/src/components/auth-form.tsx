'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/auth-client';

type Mode = 'sign-in' | 'sign-up';

const copy = {
  'sign-in': {
    title: 'Sign in',
    submit: 'Sign in',
    alt: 'No account yet?',
    altLink: 'Create one',
    altHref: '/sign-up',
  },
  'sign-up': {
    title: 'Create your account',
    submit: 'Create account',
    alt: 'Already registered?',
    altLink: 'Sign in',
    altHref: '/sign-in',
  },
} as const;

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const text = copy[mode];

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email'));
    const password = String(form.get('password'));
    setPending(true);
    setError(null);
    const result =
      mode === 'sign-up'
        ? await authClient.signUp.email({ name: String(form.get('name')), email, password })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error) {
      setError(result.error.message ?? 'Something went wrong');
      return;
    }
    router.push('/organizations');
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{text.title}</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === 'sign-up' && (
          <label className="flex flex-col gap-1 text-sm">
            Full name
            <input name="name" required minLength={2} autoComplete="name" className="input" />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required autoComplete="email" className="input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            className="input"
          />
          {mode === 'sign-up' && (
            <span className="text-xs text-zinc-500">At least 12 characters.</span>
          )}
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? 'Please wait…' : text.submit}
        </button>
      </form>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {text.alt}{' '}
        <Link href={text.altHref} className="underline">
          {text.altLink}
        </Link>
      </p>
    </main>
  );
}
