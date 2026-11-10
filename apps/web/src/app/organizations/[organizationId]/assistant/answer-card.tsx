'use client';

import type { AssistantAnswer, Evidence } from '@farmos/shared-types';
import Link from 'next/link';
import { useOrganization } from '@/lib/organization-context';
import { recordHref, STATUS_LABELS } from './answer-format';

/**
 * One answer with everything behind it: the claims and the evidence each
 * cites, what was missing, and checks a person could make. Evidence ids in
 * the claims link to the evidence list below them.
 */
export function AnswerCard({
  messageId,
  answer,
  evidence,
}: {
  messageId: string;
  answer: AssistantAnswer;
  evidence: Evidence[];
}) {
  const base = `/organizations/${useOrganization().id}`;
  const status = STATUS_LABELS[answer.status];
  const anchor = (id: string) => `${messageId}-${id}`;

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        <span aria-hidden="true" style={{ color: status.tone }}>
          {status.icon}
        </span>
        {status.label}
      </p>
      <p className="text-sm leading-6 whitespace-pre-line">{answer.answer}</p>

      {answer.claims.length > 0 && (
        <section aria-label="Claims and their evidence">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Based on
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {answer.claims.map((claim, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-2">
                <span>{claim.statement}</span>
                {claim.evidence.map((id) => (
                  <a
                    key={id}
                    href={`#${anchor(id)}`}
                    className="rounded bg-zinc-100 px-1.5 text-xs font-medium text-zinc-700 hover:underline dark:bg-zinc-800 dark:text-zinc-300"
                    aria-label={`Evidence ${id}`}
                  >
                    {id}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {answer.dataGaps.length > 0 && (
        <section aria-label="Gaps in the records">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Missing or conflicting records
          </h3>
          <ul className="list-disc pl-5 text-sm">
            {answer.dataGaps.map((gap, index) => (
              <li key={index}>{gap}</li>
            ))}
          </ul>
        </section>
      )}

      {answer.suggestedChecks.length > 0 && (
        <section aria-label="Suggested checks">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Worth checking
          </h3>
          <ul className="list-disc pl-5 text-sm">
            {answer.suggestedChecks.map((check, index) => (
              <li key={index}>{check}</li>
            ))}
          </ul>
        </section>
      )}

      {evidence.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            Evidence ({evidence.length})
          </summary>
          <ol className="mt-2 flex flex-col gap-2">
            {evidence.map((item) => (
              <li key={item.id} id={anchor(item.id)} className="scroll-mt-24">
                <p>
                  <span className="font-medium">{item.id}</span> · {item.summary}
                </p>
                {item.records.length > 0 && (
                  <p className="flex flex-wrap gap-x-2 text-xs text-zinc-500">
                    {item.records.slice(0, 12).map((ref) => {
                      const href = recordHref(base, ref);
                      return href ? (
                        <Link key={`${ref.type}-${ref.id}`} href={href} className="underline">
                          {ref.label}
                        </Link>
                      ) : (
                        <span key={`${ref.type}-${ref.id}`}>{ref.label}</span>
                      );
                    })}
                    {item.records.length > 12 && <span>and {item.records.length - 12} more</span>}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
