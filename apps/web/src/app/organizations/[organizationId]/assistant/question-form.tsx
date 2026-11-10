'use client';

import { MAX_QUESTION_LENGTH } from '@farmos/shared-types';
import { useState, type FormEvent } from 'react';

export function QuestionForm({
  pending,
  onAsk,
}: {
  pending: boolean;
  onAsk: (question: string) => Promise<unknown>;
}) {
  const [question, setQuestion] = useState('');
  const trimmed = question.trim();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (trimmed.length < 3 || pending) return;
    try {
      await onAsk(trimmed);
      setQuestion('');
    } catch {
      // The error is shown by the caller; keep the question so it can be retried.
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="assistant-question" className="text-sm font-medium">
        Ask about your farm records
      </label>
      <textarea
        id="assistant-question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.currentTarget.form?.requestSubmit();
          }
        }}
        maxLength={MAX_QUESTION_LENGTH}
        rows={3}
        placeholder="e.g. Which flock had the highest mortality last week?"
        className="rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-zinc-500">
          Answers come only from your organization’s records. The assistant can’t diagnose,
          prescribe or change records.
        </p>
        <button
          type="submit"
          disabled={pending || trimmed.length < 3}
          className="shrink-0 rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {pending ? 'Looking up records…' : 'Ask'}
        </button>
      </div>
    </form>
  );
}
