import { type CaseDTO, caseSchema, formatUsd } from '@mailkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { apiFetch } from '../api.js';
import { Banner } from '../components/Banner.js';
import { Skeleton } from '../components/Skeleton.js';
import { Thread } from '../components/Thread.js';
import '../styles/case.css';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

async function fetchCase(id: string, demo = false): Promise<CaseDTO> {
  const response = await apiFetch(`${demo ? '/api/demo' : '/api'}/cases/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('Could not load this case');
  return caseSchema.parse(await response.json());
}

export function Case({ demo = false }: { demo?: boolean }) {
  const { id = '' } = useParams();
  const apiBase = demo ? '/api/demo' : '/api';
  const queryClient = useQueryClient();
  const [toast, setToast] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['case', id],
    queryFn: () => fetchCase(id, demo),
  });
  const update = useMutation({
    mutationFn: async (action: 'mark-paid' | 'reopen') => {
      const response = await apiFetch(`${apiBase}/cases/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!response.ok) throw new Error('Could not update this case');
    },
    onSuccess: () => {
      setToast('Saved. Case updated.');
      void queryClient.invalidateQueries({ queryKey: ['case', id] });
      void queryClient.invalidateQueries({ queryKey: ['today'] });
    },
    onError: () => setToast("Couldn't save that. Please try again."),
  });

  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    return (
      <main className="page case">
        <Banner tone="warning">
          Couldn't load.{' '}
          <button type="button" className="button--quiet" onClick={() => void refetch()}>
            Retry
          </button>
        </Banner>
      </main>
    );
  }

  const canMarkPaid = data.status === 'open' || data.status === 'overdue';
  const canReopen = data.status === 'paid' || data.status === 'closed';
  return (
    <main className="page case">
      <Link className="case__back" to={demo ? '/demo' : '/today'}>
        ← Today
      </Link>
      <header className="case__header">
        <div>
          <h1>
            {data.counterparty} — {data.title}
          </h1>
          <p className="case__status">
            <span className={`case-status case-status--${data.status}`}>{data.status}</span>
            {data.amountCents !== null ? <strong>{formatUsd(data.amountCents)}</strong> : null}
            {data.dueDate ? (
              <> due {dateFormat.format(new Date(`${data.dueDate}T00:00:00Z`))}</>
            ) : null}
            {data.secondNotice ? ' · second notice received' : ''}
            {data.contradiction ? ' · past-due after paid' : ''}
          </p>
        </div>
      </header>
      {toast ? (
        <div className="case__toast" role="status">
          {toast}
        </div>
      ) : null}
      <Thread data={data} demo={demo} />
      <footer className="case__actions">
        {canMarkPaid ? (
          <button
            type="button"
            className="button--primary"
            disabled={update.isPending || demo}
            title={demo ? 'Demo is read-only' : undefined}
            onClick={() => update.mutate('mark-paid')}
          >
            Mark paid
          </button>
        ) : null}
        {canReopen ? (
          <button
            type="button"
            className="button--secondary"
            disabled={update.isPending || demo}
            title={demo ? 'Demo is read-only' : undefined}
            onClick={() => update.mutate('reopen')}
          >
            Reopen
          </button>
        ) : null}
        {data.boxFolderUrl ? (
          <a href={data.boxFolderUrl} target="_blank" rel="noreferrer">
            Open the case folder in Box ↗
          </a>
        ) : null}
      </footer>
    </main>
  );
}
