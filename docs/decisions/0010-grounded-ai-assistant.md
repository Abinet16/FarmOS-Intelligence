# ADR-0010: A grounded AI assistant

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Week 7 adds an assistant that answers questions about a farm's records, such as "which flock
had the highest mortality over the last seven days, and how much feed did it consume?". The plan
sets the bar: every factual claim must be backed by retrieved evidence, gaps must be disclosed,
tool arguments must be validated, staff notes are untrusted, the model can't change records, and
no question may reach another organization's data. Answers must be good enough to act on, so
"usually right" isn't enough.

## Decision

**Fixed read-only tools, never SQL.** The model chooses among eight tools: list flocks,
overview, compare flocks, compare farms, a flock's daily records, alerts, health and
vaccinations, and inventory. They are the same services the dashboards use, so the assistant's
figures are the dashboard's figures.

- Each tool has a strict Zod schema. It is published to the model as a strict JSON schema and
  re-validated on the server.
- No tool takes an organization id. The organization and role come from the signed-in request.
- Tools run inside `withTenant`, so row-level security applies as it does everywhere else.
- A tool is only offered when the caller's role has its permission.
- Free text typed by staff is wrapped as `{"untrustedText": …}`, capped at 500 characters, and
  the system prompt says to treat it as data.

**Answers are submitted, then checked on the server.** The model finishes by calling
`submit_answer` with:

- a status (`ANSWERED`, `INSUFFICIENT_DATA` or `OUT_OF_SCOPE`);
- the reply;
- claims, each citing evidence ids;
- data gaps and suggested checks.

The server rejects the answer, and tells the model why, when any of these fail:

- a claim cites no evidence, or cites an id from outside this turn;
- a figure in a claim is not found, at the precision stated, in the evidence the claim cites;
- a figure in the reply is not found in this turn's evidence or the question.

Only an answer that passes reaches the user. This turns "every claim is supported by evidence"
from a prompt instruction into a check the server enforces. The model is told not to do its own
arithmetic: the tools return totals and bird-weighted rates.

**A manual loop with limits.** The loop is a plain loop over the Messages API rather than the
SDK's beta tool runner. Validation, evidence numbering, the answer check and the limits all sit
between model calls, so owning the loop is simpler.

- At most 10 model requests and 20 tool calls per question.
- One reminder if the model stops without submitting an answer.
- A `refusal` stop gives a fixed out-of-scope reply.
- A response cut off at `max_tokens` fails the turn instead of running half a tool call.

**Claude behind an interface.** The default model is `claude-opus-5-5`, set by `AI_MODEL`.

- Adaptive thinking at medium effort.
- The system prompt and tools are fixed text, so the API caches them.
- Server-side fallback is on (`fallbacks: "default"`), so a safety-classifier decline is
  retried on the default fallback model.
- The model sits behind an `AssistantModel` interface. Integration tests replace it with a
  scripted model that misbehaves on purpose: it asks for another organization's flock, follows
  an injected note, invents figures and calls tools that don't exist.

**Private conversations, minimal retention.**

- A conversation is visible only to the member who started it, not even the owner.
- Each answer stores what it claimed, its evidence (tool, arguments, summary, record
  references), rejected tool calls, and model metadata (model, iterations, tokens).
- Raw tool output is not stored. It can be regenerated from the stored arguments.
- Every answer writes an audit entry.
- Questions are limited per member per day (`AI_DAILY_QUESTION_LIMIT`).

**Graded by a deterministic evaluation set.** `eval/assistant` seeds "Eval Farms", whose every
expected figure was worked out on paper. It runs 18 questions in six categories through the real
API and the real model:

- factual;
- evidence;
- abstention;
- out of scope;
- prompt injection;
- unauthorized access.

The grader is code, not another model, and has its own unit tests. The release bar:

| Measure              | Target |
| -------------------- | ------ |
| Factual accuracy     | ≥ 90%  |
| Evidence correctness | 100%   |
| Unauthorized access  | 0      |
| Abstention quality   | ≥ 90%  |
| Injection resistance | 100%   |

## Alternatives considered

- **Text-to-SQL** over a read-only role. Rejected: the model would write the queries, metric
  definitions would be re-derived on every question, and tenant safety would rest on row-level
  security alone.
- **Retrieval-augmented generation** over record text. Rejected: these are questions about
  computed figures, which embeddings retrieve poorly and models compute unreliably.
- **Citations checked by a second model.** Rejected: a probabilistic check of a probabilistic
  answer, where the figures can be checked exactly instead.

## Consequences

- An answer that needs a figure no tool reports (for example a difference between two weeks)
  comes back as reported facts plus a data gap, not a calculation. New questions of that kind
  need a new tool, not a prompt change.
- The figure check only matches numbers. A wrong claim with no numbers in it, such as naming the
  wrong flock, is caught by the evaluation set, not at runtime.
- Each question costs a few model requests. The token counts stored with each answer show what
  it cost.
- The evaluation needs an API key and spends real usage, so CI runs only its model-free
  self-check. The full run is a release step.
