import type { TodayDTO } from '@mailkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { apiFetch, fetchToday } from '../api.js';
import { AskSlip } from '../components/AskSlip.js';
import { Banner } from '../components/Banner.js';
import { DueLine } from '../components/DueLine.js';
import { Empty } from '../components/Empty.js';
import { Skeleton } from '../components/Skeleton.js';
import { Slip } from '../components/Slip.js';
import { Wordmark } from '../components/Wordmark.js';
import '../styles/today.css';

export function Today() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [toast, setToast] = useState('');
  const [showAll, setShowAll] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['today'],
    queryFn: () => fetchToday(false),
    refetchInterval: 30_000,
  });
  const answer = useMutation({
    mutationFn: async ({ askId, value }: { askId: string; value: string }) => {
      const response = await apiFetch(`/api/asks/${encodeURIComponent(askId)}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: value }),
      });
      if (!response.ok) throw new Error('Could not save that answer');
    },
    onMutate: async ({ askId }) => {
      await queryClient.cancelQueries({ queryKey: ['today'] });
      const previous = queryClient.getQueryData<TodayDTO>(['today']);
      queryClient.setQueryData<TodayDTO>(['today'], (current) =>
        current ? { ...current, asks: current.asks.filter((ask) => ask.id !== askId) } : current,
      );
      return { previous };
    },
    onSuccess: () => {
      setToast('Saved. Case updated.');
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['today'], context.previous);
      setToast("Couldn't save that. Please try again.");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['today'] });
    },
  });
  const markPaid = useMutation({
    mutationFn: async (caseId: string) => {
      const response = await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Could not mark the case paid');
    },
    onSuccess: () => {
      setToast('Saved. Case updated.');
      void queryClient.invalidateQueries({ queryKey: ['today'] });
    },
    onError: () => setToast("Couldn't save that. Please try again."),
  });

  async function signOut(): Promise<void> {
    await apiFetch('/auth/logout', { method: 'POST' });
    navigate('/login');
  }

  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    return (
      <main className="page today">
        <Banner tone="warning">
          Couldn't load.{' '}
          <button type="button" className="button--quiet" onClick={() => void refetch()}>
            Retry
          </button>
        </Banner>
      </main>
    );
  }

  const secondNotices = data.upcoming.filter((due) => due.secondNotice);
  const upcoming = showAll ? data.upcoming : data.upcoming.slice(0, 8);
  const nothingNeedsYou = data.asks.length === 0 && secondNotices.length === 0;

  return (
    <main className="page today">
      <header className="today__header">
        <Link to="/today" aria-label="Mailkeep today">
          <Wordmark />
        </Link>
        <div className="today__household">
          <strong>{data.household.name}</strong>
          <nav aria-label="Account">
            <Link to="/mom">Mom's page</Link>
            <Link to="/proof">Proof</Link>
            <button type="button" className="button--quiet" onClick={() => void signOut()}>
              Sign out
            </button>
          </nav>
        </div>
      </header>

      {toast ? (
        <div className="today__toast" role="status">
          {toast}
        </div>
      ) : null}

      <section className="today__section" aria-labelledby="needs-you-title">
        <h2 id="needs-you-title">Needs you</h2>
        {nothingNeedsYou ? (
          <Empty title="Nothing needs you right now.">
            Mailkeep has read {data.handledThisWeek.count + data.recent.length} of Ruth's letters.
          </Empty>
        ) : (
          <div className="today__asks">
            {secondNotices.map((due) => (
              <article className="ask-slip" key={due.caseId}>
                <div className="ask-slip__heading">
                  <div>
                    <Link className="meta" to={`/cases/${due.caseId}`}>
                      {due.title}
                    </Link>
                    <h3>A second notice arrived. Has this been paid?</h3>
                  </div>
                </div>
                <p className="ask-slip__evidence mono">
                  {due.counterparty} · due {due.dueDate} ·{' '}
                  {due.amountCents === null ? 'no amount' : 'amount on case'}
                </p>
                <div className="ask-slip__actions">
                  <button
                    type="button"
                    className="button--primary"
                    disabled={markPaid.isPending}
                    onClick={() => markPaid.mutate(due.caseId)}
                  >
                    Mark paid
                  </button>
                  <Link className="button button--secondary" to={`/cases/${due.caseId}`}>
                    Open case
                  </Link>
                </div>
              </article>
            ))}
            {data.asks.map((ask) => (
              <AskSlip
                key={ask.id}
                ask={ask}
                busy={answer.isPending}
                onAnswer={(askId, value) => answer.mutateAsync({ askId, value })}
              />
            ))}
          </div>
        )}
      </section>

      <section className="today__section" aria-labelledby="coming-up-title">
        <div className="today__section-heading">
          <h2 id="coming-up-title">Coming up</h2>
          {data.upcoming.length > 8 ? (
            <button
              type="button"
              className="button--quiet"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? 'Show fewer' : 'See all'}
            </button>
          ) : null}
        </div>
        {upcoming.length > 0 ? (
          <div className="today__due-list">
            {upcoming.map((due) => (
              <DueLine key={due.caseId} due={due} />
            ))}
          </div>
        ) : (
          <p className="meta">No open due dates.</p>
        )}
      </section>

      <section className="today__section" aria-labelledby="handled-title">
        <h2 id="handled-title">Handled quietly this week</h2>
        {data.handledThisWeek.count > 0 ? (
          <details className="today__handled">
            <summary>{data.handledThisWeek.count} letters filed. Nothing needed you.</summary>
            <div className="today__handled-list">
              {data.handledThisWeek.items.map((letter) => (
                <Slip key={letter.id} letter={letter} />
              ))}
            </div>
          </details>
        ) : (
          <p className="meta">No letters filed quietly this week.</p>
        )}
      </section>
    </main>
  );
}
