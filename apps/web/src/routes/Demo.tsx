import { type LetterDTO, letterSchema, type TodayDTO, todaySchema } from '@mailkeep/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { apiFetch } from '../api.js';
import { AskSlip } from '../components/AskSlip.js';
import { Banner } from '../components/Banner.js';
import { DueLine } from '../components/DueLine.js';
import { Skeleton } from '../components/Skeleton.js';
import { Slip } from '../components/Slip.js';
import { Wordmark } from '../components/Wordmark.js';
import '../styles/demo.css';

interface DemoSample {
  id: string;
  title: string;
  description: string;
  photo: string;
  imageUrl: string;
}

async function fetchDemoToday(): Promise<TodayDTO> {
  const response = await apiFetch('/api/demo/today');
  if (!response.ok) throw new Error('Could not load the demo');
  return todaySchema.parse(await response.json());
}

async function fetchSamples(): Promise<DemoSample[]> {
  const response = await apiFetch('/api/demo/samples');
  if (!response.ok) throw new Error('Could not load demo samples');
  return (await response.json()) as DemoSample[];
}

export function Demo() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [rateLimited, setRateLimited] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['demo-today'],
    queryFn: fetchDemoToday,
  });
  const { data: samples } = useQuery({ queryKey: ['demo-samples'], queryFn: fetchSamples });
  const run = useMutation({
    mutationFn: async (sampleId: string) => {
      const response = await apiFetch(`/api/demo/samples/${encodeURIComponent(sampleId)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (response.status === 429) {
        setRateLimited(true);
        throw new Error('rate limited');
      }
      if (!response.ok) throw new Error('Could not run this sample');
      return letterSchema.parse(await response.json()) as LetterDTO;
    },
    onSuccess: (letter) => {
      setRateLimited(false);
      void queryClient.invalidateQueries({ queryKey: ['demo-today'] });
      navigate(`/demo/letters/${letter.id}`);
    },
  });

  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    return (
      <main className="page demo">
        <Banner tone="warning">
          Couldn't load.{' '}
          <button type="button" className="button--quiet" onClick={() => void refetch()}>
            Retry
          </button>
        </Banner>
      </main>
    );
  }

  return (
    <main className="page demo">
      <header className="demo__header">
        <Wordmark />
        <a href="/proof">How it works</a>
      </header>
      <Banner>
        Demo household · synthetic letters from invented organisations · demo clock Dec 9, 2026 ·
        nothing here is real mail
      </Banner>
      {rateLimited ? (
        <Banner tone="warning">
          Lots of people are trying this right now. Try again in a few minutes.
        </Banner>
      ) : null}
      <section className="demo__section" aria-labelledby="run-sample">
        <h1 id="run-sample">Run a sample letter</h1>
        <p>
          Watch Mailkeep read a letter, compare it with Ruth's earlier mail, and file the result.
        </p>
        {samples ? (
          <div className="demo__samples">
            {samples.map((sample) => (
              <button
                type="button"
                key={sample.id}
                disabled={run.isPending}
                onClick={() => run.mutate(sample.id)}
              >
                <img src={sample.imageUrl} alt="" />
                <span>
                  <strong>{sample.title}</strong>
                  <small>{sample.description}</small>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <Skeleton />
        )}
      </section>

      <section className="demo__section" aria-labelledby="demo-needs">
        <h2 id="demo-needs">Needs you</h2>
        {data.asks.length > 0 ? (
          <div className="demo__asks">
            {data.asks.map((ask) => (
              <AskSlip key={ask.id} ask={ask} readOnly demo onAnswer={async () => {}} />
            ))}
          </div>
        ) : (
          <p>Nothing needs you in the demo right now.</p>
        )}
      </section>

      <section className="demo__section" aria-labelledby="demo-upcoming">
        <h2 id="demo-upcoming">Coming up</h2>
        {data.upcoming.length > 0 ? (
          <div className="demo__due-list">
            {data.upcoming.slice(0, 8).map((due) => (
              <DueLine key={due.caseId} due={due} demo />
            ))}
          </div>
        ) : (
          <p>No open due dates.</p>
        )}
      </section>

      <section className="demo__section" aria-labelledby="demo-history">
        <h2 id="demo-history">Ruth's recent letters</h2>
        {data.recent.length > 0 ? (
          <div className="demo__history">
            {data.recent.map((letter) => (
              <Slip key={letter.id} letter={letter} to={`/demo/letters/${letter.id}`} />
            ))}
          </div>
        ) : (
          <p>No letters yet.</p>
        )}
      </section>
    </main>
  );
}
