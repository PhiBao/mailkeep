import { formatUsd, type LetterDTO, letterSchema } from '@mailkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { apiFetch, fetchToday } from '../api.js';
import { Banner } from '../components/Banner.js';
import { ChecksTable } from '../components/ChecksTable.js';
import { Skeleton } from '../components/Skeleton.js';
import { Stamp } from '../components/Stamp.js';
import '../styles/letter.css';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const timeFormat = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});
const STEPS = ['Reading the photo', 'Looking through past letters', 'Deciding', 'Filing'];

async function fetchLetter(id: string): Promise<LetterDTO> {
  const response = await apiFetch(`/api/letters/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('Could not load this letter');
  return letterSchema.parse(await response.json());
}

function terminal(status: LetterDTO['status']): boolean {
  return status === 'done' || status === 'failed' || status === 'needs_retake';
}

function currentStep(status: LetterDTO['status']): number {
  if (status === 'queued' || status === 'reading') return 0;
  if (status === 'recalling') return 1;
  if (status === 'deciding') return 2;
  return 3;
}

function relationText(relation: LetterDTO['relations'][number]): string {
  if (relation.relation === 'follow_up')
    return `second notice · ${relation.probability.toFixed(2)}`;
  if (relation.relation === 'completes')
    return `says it was paid · ${relation.probability.toFixed(2)}`;
  if (relation.relation === 'sender_mismatch') return 'sender does not match';
  if (relation.relation === 'contradicts') return 'contradicts a paid mark';
  return `same matter · ${relation.probability.toFixed(2)}`;
}

export function Letter() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [toast, setToast] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['letter', id],
    queryFn: () => fetchLetter(id),
    refetchInterval: (query) =>
      query.state.data && terminal(query.state.data.status) ? false : 1500,
  });
  const { data: today } = useQuery({ queryKey: ['today'], queryFn: fetchToday });
  const retry = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`/api/letters/${encodeURIComponent(id)}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Could not retry this letter');
    },
    onSuccess: () => {
      setToast('Trying again.');
      void queryClient.invalidateQueries({ queryKey: ['letter', id] });
    },
    onError: () => setToast("Couldn't retry. Please try again."),
  });

  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    return (
      <main className="page letter">
        <Banner tone="warning">
          Couldn't load.{' '}
          <button type="button" className="button--quiet" onClick={() => void refetch()}>
            Retry
          </button>
        </Banner>
      </main>
    );
  }

  const parentNote = data.outbox.find((row) => row.kind === 'parent_note');
  const daysLeft =
    data.dueDate && today
      ? Math.floor(
          (Date.parse(`${data.dueDate}T00:00:00Z`) -
            Date.parse(`${today.household.today}T00:00:00Z`)) /
            86_400_000,
        )
      : null;
  return (
    <main className="page letter">
      <Link className="letter__back" to="/today">
        ← Today
      </Link>
      {toast ? (
        <div className="letter__toast" role="status">
          {toast}
        </div>
      ) : null}
      <div className="letter__layout">
        <section className="letter__photo" aria-label="Letter photo">
          <button type="button" onClick={() => dialog.current?.showModal()}>
            <img src={data.imageUrl} alt={`Letter from ${data.senderOrg ?? 'unknown sender'}`} />
          </button>
          <details>
            <summary>Show what Mailkeep read</summary>
            <pre className="mono">{data.transcript || 'No transcript yet.'}</pre>
          </details>
        </section>
        <section className="letter__reading">
          {!terminal(data.status) ? (
            <div className="letter__processing" aria-live="polite">
              <h1>{data.title}</h1>
              <ol>
                {STEPS.map((step, index) => (
                  <li key={step} className={index === currentStep(data.status) ? 'is-current' : ''}>
                    <span className="mono">{index + 1}</span> {step}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <>
              <div className="letter__title">
                <div>
                  <h1>{data.title}</h1>
                  <p className="meta">
                    {data.senderOrg ?? 'Unknown sender'} ·{' '}
                    {dateFormat.format(new Date(data.receivedAt))}
                  </p>
                </div>
                {data.lane ? <Stamp lane={data.lane} /> : null}
              </div>
              {data.status === 'needs_retake' ? (
                <Banner tone="warning">
                  The photo was too dark or blurry to read. Ruth has been asked for a new one.
                </Banner>
              ) : null}
              {data.status === 'failed' ? (
                <Banner tone="warning">
                  Mailkeep couldn't finish this letter.{' '}
                  <span className="mono">{data.error ?? 'unknown error'}</span>{' '}
                  <button
                    type="button"
                    className="button--quiet"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate()}
                  >
                    Try again
                  </button>
                </Banner>
              ) : null}

              <section className="letter__section">
                <h2>What we told Ruth</h2>
                <blockquote>{data.summaryParent ?? 'Mailkeep read this letter.'}</blockquote>
                <p className="meta">
                  {parentNote?.status === 'sent' && parentNote.sentAt
                    ? `Sent ${timeFormat.format(new Date(parentNote.sentAt))} · to ${parentNote.toEmail}`
                    : parentNote?.status === 'suppressed'
                      ? `Not sent: ${parentNote.suppressedReason ?? 'demo'}`
                      : 'Note queued'}
                </p>
              </section>

              <section className="letter__section">
                <h2>What it needs</h2>
                {data.amountCents !== null || data.dueDate || data.todoParent ? (
                  <p className="letter__needs">
                    {data.todoParent ?? 'Nothing'}
                    {data.amountCents !== null ? ` · ${formatUsd(data.amountCents)}` : ''}
                    {data.dueDate
                      ? ` · due ${dateFormat.format(new Date(`${data.dueDate}T00:00:00Z`))}`
                      : ''}
                    {daysLeft !== null
                      ? ` · ${daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days`}`
                      : ''}
                  </p>
                ) : (
                  <p>Nothing</p>
                )}
              </section>

              {data.caseId || data.relations.length > 0 ? (
                <section className="letter__section">
                  <h2>Linked to</h2>
                  {data.caseId ? (
                    <Link to={`/cases/${data.caseId}`}>Open the case file</Link>
                  ) : null}
                  <ul className="letter__relations">
                    {data.relations.map((relation) => (
                      <li className="mono" key={relation.id}>
                        {relationText(relation)}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="letter__section">
                <h2>Checks</h2>
                <ChecksTable checks={data.checks} />
                {data.decision ? (
                  <div className="letter__decision meta">
                    <span>{data.decision.modelId}</span> · {data.decision.questionCount} questions ·{' '}
                    {data.decision.latencyMs} ms · $
                    {(data.decision.costMicrousd / 1_000_000).toFixed(4)}
                    {data.decision.rawResponseUrl ? (
                      <>
                        {' · '}
                        <a href={data.decision.rawResponseUrl} download>
                          Raw response
                        </a>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="letter__section">
                <h2>Recall</h2>
                {data.recall.length > 0 ? (
                  <>
                    <p className="meta">{data.recall.length} past letters compared</p>
                    <ul className="letter__recall">
                      {data.recall.map((candidate) => (
                        <li key={candidate.letterId}>
                          <Link to={`/letters/${candidate.letterId}`}>{candidate.title}</Link>
                          <span className="mono">
                            {' '}
                            · recall{' '}
                            {candidate.recallScore === null
                              ? '—'
                              : candidate.recallScore.toFixed(2)}{' '}
                            · account {candidate.tailMatch ? 'match' : 'no match'} · same matter{' '}
                            {candidate.sameMatterProbability === null
                              ? '—'
                              : candidate.sameMatterProbability.toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="meta">No past letters compared.</p>
                )}
              </section>
            </>
          )}
        </section>
      </div>
      <dialog ref={dialog} className="letter__dialog">
        <button type="button" aria-label="Close photo" onClick={() => dialog.current?.close()}>
          Close
        </button>
        <img src={data.imageUrl} alt={`Full letter from ${data.senderOrg ?? 'unknown sender'}`} />
      </dialog>
    </main>
  );
}
