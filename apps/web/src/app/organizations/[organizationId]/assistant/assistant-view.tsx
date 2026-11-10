'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { api, ApiError, type AskResult, type AssistantStatus, type Conversation } from '@/lib/api';
import { useCan, useOrganization } from '@/lib/organization-context';
import { AnswerCard } from './answer-card';
import { EXAMPLE_QUESTIONS } from './answer-format';
import { ConversationList } from './conversation-list';
import { QuestionForm } from './question-form';

export function AssistantView() {
  const organization = useOrganization();
  const canAsk = useCan('ai:query');
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const base = `/organizations/${organization.id}/assistant`;

  const status = useQuery({
    queryKey: ['assistant', organization.id, 'status'],
    queryFn: () => api<AssistantStatus>(`${base}/status`),
    enabled: canAsk,
  });
  const conversation = useQuery({
    queryKey: ['assistant', organization.id, 'conversation', selected],
    queryFn: () => api<Conversation>(`${base}/conversations/${selected}`),
    enabled: canAsk && selected !== null,
  });

  const ask = useMutation({
    mutationFn: (question: string) =>
      api<AskResult>(
        selected ? `${base}/conversations/${selected}/messages` : `${base}/conversations`,
        {
          method: 'POST',
          body: JSON.stringify({ question }),
        },
      ),
    onSuccess: async (result) => {
      setSelected(result.conversation.id);
      await queryClient.invalidateQueries({ queryKey: ['assistant', organization.id] });
    },
    // A failed turn still stores the question, so refresh the list either way.
    onError: () => queryClient.invalidateQueries({ queryKey: ['assistant', organization.id] }),
  });

  if (!canAsk) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Your role doesn’t include the assistant. Ask an owner or manager if you need it.
      </p>
    );
  }
  if (status.data && !status.data.available) {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Assistant</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          The assistant isn’t configured on this server. Everything else in FarmOS works as usual.
        </p>
      </section>
    );
  }

  const messages = selected ? (conversation.data?.messages ?? []) : [];
  const askError =
    ask.error instanceof ApiError && ask.error.status === 502
      ? new Error(`${ask.error.message} Your question was saved.`)
      : ask.error;

  return (
    <div className="grid gap-8 md:grid-cols-[14rem_1fr]">
      <ConversationList
        selected={selected}
        onSelect={(id) => {
          ask.reset();
          setSelected(id);
        }}
      />
      <section className="flex min-w-0 flex-col gap-6" aria-live="polite">
        <header>
          <h1 className="text-xl font-semibold">Assistant</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Answers cite the records they come from. It summarizes and explains your data; it
            doesn’t diagnose disease, recommend treatment or change records.
          </p>
        </header>

        <ErrorMessage error={conversation.error} />
        {selected === null && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Try asking</p>
            <ul className="flex flex-col gap-1">
              {EXAMPLE_QUESTIONS.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    disabled={ask.isPending}
                    onClick={() => ask.mutate(question)}
                    className="text-left text-sm text-zinc-600 underline decoration-zinc-300 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ol className="flex flex-col gap-4">
          {messages.map((message) =>
            message.role === 'USER' ? (
              <li
                key={message.id}
                className="self-end rounded-lg bg-zinc-100 px-4 py-2 text-sm whitespace-pre-line dark:bg-zinc-800"
              >
                {message.content}
              </li>
            ) : (
              <li key={message.id}>
                {message.answer ? (
                  <AnswerCard
                    messageId={message.id}
                    answer={message.answer}
                    evidence={message.evidence ?? []}
                  />
                ) : (
                  <p className="text-sm">{message.content}</p>
                )}
              </li>
            ),
          )}
          {ask.isPending && (
            <li className="self-end rounded-lg bg-zinc-100 px-4 py-2 text-sm whitespace-pre-line dark:bg-zinc-800">
              {ask.variables}
            </li>
          )}
          {ask.isPending && (
            <li className="text-sm text-zinc-500">
              <span className="sr-only">Working: </span>Looking up your records…
            </li>
          )}
        </ol>

        <ErrorMessage error={askError} />
        <QuestionForm pending={ask.isPending} onAsk={(question) => ask.mutateAsync(question)} />
      </section>
    </div>
  );
}
