import { formatUsd, type LetterDTO, letterSchema, parentResultCopy } from '@mailkeep/shared';
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

async function fetchLetter(id: string, demo = false): Promise<LetterDTO> {
  const response = await apiFetch(
    `${demo ? '/api/demo' : '/api'}/letters/${encodeURIComponent(id)}`,
  );
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
  if (relation.relation === 'same_matter') {
    if (relation.status === 'asked')
      return `possible same matter · ${relation.probability.toFixed(2)} · asked`;
    if (relation.status === 'rejected')
      return `same matter rejected · ${relation.probability.toFixed(2)}`;
    return `linked same matter · ${relation.probability.toFixed(2)}`;
  }
  return `${relation.relation.replaceAll('_', ' ')} · ${relation.probability.toFixed(2)}`;
}

export function Letter({ demo = false }: { demo?: boolean }) {
  const { id = '' } = useParams();
  const apiBase = demo ? '/api/demo' : '/api';
  const queryClient = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const [toast, setToast] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['letter', demo ? 'demo' : 'family', id],
    queryFn: () => fetchLetter(id, demo),
    refetchInterval: (query) =>
      query.state.data && terminal(query.state.data.status) ? false : 1500,
  });
  const { data: today } = useQuery({
    queryKey: ['today', demo ? 'demo' : 'family'],
    queryFn: () => fetchToday(demo),
  });
  const retry = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(`${apiBase}/letters/${encodeURIComponent(id)}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Could not retry this letter');
    },
    onSuccess: () => {
      setToast('Trying again.');
      void queryClient.invalidateQueries({ queryKey: ['letter', demo ? 'demo' : 'family', id] });
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
  const linkedRecall = new Set(
    data.relations
      .filter((relation) => relation.status === 'accepted')
      .map((relation) => relation.otherLetterId),
  );
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
      <Link className="letter__back" to={demo ? '/demo' : '/today'}>
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
            {data.mime === 'application/pdf' ? (
              <object
                data={data.imageUrl}
                type="application/pdf"
                aria-label={`PDF letter from ${data.senderOrg ?? 'unknown sender'}`}
              />
            ) : (
              <img src={data.imageUrl} alt={`Letter from ${data.senderOrg ?? 'unknown sender'}`} />
            )}
          </button>
          <details>
            <summary>Show what Mailkeep read</summary>
            <pre className="mono">{data.transcript || 'No transcript yet.'}</pre>
          </details>
        </section>
        <section className="letter__reading">
          {!terminal(data.status) ? (
            <div className="letter__processing">
              <p className="sr-only" role="status">
                {STEPS[currentStep(data.status)]}…
              </p>
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
                  {!demo ? (
                    <button
                      type="button"
                      className="button--quiet"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate()}
                    >
                      Try again
                    </button>
                  ) : null}
                </Banner>
              ) : null}

              <section className="letter__section">
                <h2>What we told Ruth</h2>
                <blockquote>
                  {parentNote?.bodyText ?? data.summaryParent ?? 'Mailkeep read this letter.'}
                </blockquote>
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
                {data.lane === 'careful' ? (
                  <p className="letter__needs">{parentResultCopy({ lane: 'careful' })}</p>
                ) : data.amountCents !== null || data.dueDate || data.todoParent ? (
                  <p className="letter__needs">
                    {data.todoParent ?? 'Nothing'}
                    {data.amountCents !== null ? ` · ${formatUsd(data.amountCents)}` : ''}
                    {data.dueDate
                      ? ` · due ${dateFormat.format(new Date(`${data.dueDate}T00:00:00Z`))}`
                      : ''}
                    {daysLeft !== null
                      ? ` · ${
                          daysLeft < 0
                            ? `${Math.abs(daysLeft)} ${Math.abs(daysLeft) === 1 ? 'day' : 'days'} overdue`
                            : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
                        }`
                      : ''}
                  </p>
                ) : (
                  <p>Nothing</p>
                )}
              </section>

              {data.notes.length > 0 ? (
                <section className="letter__section">
                  <h2>Why this decision</h2>
                  <ul className="letter__notes">
                    {data.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {data.caseId || data.relations.length > 0 ? (
                <section className="letter__section">
                  <h2>Household memory</h2>
                  {data.caseId ? (
                    <Link to={`${demo ? '/demo' : ''}/cases/${data.caseId}`}>
                      Open the case file
                    </Link>
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
                {data.checks.some(
                  (check) =>
                    (check.key === 'amount_due' || check.key === 'due_date') &&
                    check.outcome === 'do not use',
                ) ? (
                  <p className="meta">
                    A visible amount or date was left blank because confidence was below the bar.
                  </p>
                ) : null}
                {data.decision ? (
                  <div className="letter__decision meta">
                    <span>{data.decision.modelId}</span> · {data.decision.questionCount} questions ·{' '}
                    decision call {data.decision.latencyMs} ms · estimated letter cost $
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
                          <Link to={`${demo ? '/demo' : ''}/letters/${candidate.letterId}`}>
                            {candidate.title}
                          </Link>
                          <span className="mono">
                            {' · '}
                            {candidate.tailMatch
                              ? candidate.recallScore === null
                                ? 'exact account-tail match · no vector score'
                                : `exact account-tail match + Pinecone ${candidate.recallScore.toFixed(2)}`
                              : `Pinecone semantic recall ${candidate.recallScore?.toFixed(2) ?? '—'}`}
                            {' · same matter '}
                            {candidate.sameMatterProbability === null
                              ? '—'
                              : candidate.sameMatterProbability.toFixed(2)}
                            {linkedRecall.has(candidate.letterId) ? ' · linked' : ''}
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
      <dialog ref={dialog} className="letter__dialog" aria-label="Letter photo">
        <button type="button" aria-label="Close photo" onClick={() => dialog.current?.close()}>
          Close
        </button>
        {data.mime === 'application/pdf' ? (
          <object
            data={data.imageUrl}
            type="application/pdf"
            aria-label={`Full PDF letter from ${data.senderOrg ?? 'unknown sender'}`}
          />
        ) : (
          <img src={data.imageUrl} alt={`Full letter from ${data.senderOrg ?? 'unknown sender'}`} />
        )}
      </dialog>
    </main>
  );
}
