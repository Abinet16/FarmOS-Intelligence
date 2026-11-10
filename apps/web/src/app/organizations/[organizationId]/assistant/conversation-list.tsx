'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/error-message';
import { api, type ConversationSummary, type Page } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useOrganization } from '@/lib/organization-context';

/** The signed-in member's own conversations; nobody else can see them. */
export function ConversationList({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const organization = useOrganization();
  const conversations = useQuery({
    queryKey: ['assistant', organization.id, 'conversations'],
    queryFn: () =>
      api<Page<ConversationSummary>>(
        `/organizations/${organization.id}/assistant/conversations?pageSize=30`,
      ),
  });

  return (
    <nav aria-label="Your conversations" className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className="rounded border border-zinc-300 px-3 py-1.5 text-left text-sm font-medium dark:border-zinc-700"
      >
        + New conversation
      </button>
      <ErrorMessage error={conversations.error} />
      <ul className="flex flex-col gap-1">
        {conversations.data?.items.map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect(conversation.id)}
              aria-current={conversation.id === selected ? 'true' : undefined}
              className={`w-full rounded px-3 py-1.5 text-left text-sm ${
                conversation.id === selected
                  ? 'bg-zinc-100 font-medium dark:bg-zinc-800'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
              }`}
            >
              <span className="line-clamp-2">{conversation.title}</span>
              <span className="block text-xs text-zinc-500">
                {formatDateTime(conversation.updatedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {conversations.data?.items.length === 0 && (
        <p className="text-xs text-zinc-500">No conversations yet.</p>
      )}
    </nav>
  );
}
