import {
  type LetterDTO,
  letterSchema,
  parentResultCopy,
  retakeCopy,
  type TodayDTO,
  todaySchema,
} from '@mailkeep/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { apiFetch } from '../api.js';
import { Banner } from '../components/Banner.js';
import { Skeleton } from '../components/Skeleton.js';
import '../styles/mom.css';

async function fetchMom(): Promise<TodayDTO> {
  const response = await apiFetch('/api/mom');
  if (!response.ok) throw new Error('Could not load Mom’s letters');
  return todaySchema.parse(await response.json());
}

async function fetchLetter(id: string): Promise<LetterDTO> {
  const response = await apiFetch(`/api/letters/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('Could not load the uploaded letter');
  return letterSchema.parse(await response.json());
}

function resultCopy(letter: LetterDTO): string {
  if (letter.status === 'needs_retake') return retakeCopy();
  if (letter.status === 'failed')
    return "Mailkeep couldn't finish this letter. Please take another photo.";
  if (letter.status !== 'done') return 'Reading your letter…';
  if (!letter.lane) return 'Reading your letter…';
  return parentResultCopy({
    lane: letter.lane,
    amountCents: letter.amountCents,
    dueDate: letter.dueDate,
    kind: letter.kind,
  });
}

export function Mom() {
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [newestId, setNewestId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['mom'], queryFn: fetchMom });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const response = await apiFetch('/api/letters', { method: 'POST', body: form });
      if (!response.ok) throw new Error('Could not upload that letter');
      const letters = letterSchema.array().parse(await response.json());
      const letter = letters[0];
      if (!letter) throw new Error('No letter was accepted');
      return letter;
    },
    onSuccess: (letter) => setNewestId(letter.id),
  });
  const { data: newest } = useQuery({
    queryKey: ['mom-letter', newestId],
    queryFn: () => fetchLetter(newestId as string),
    enabled: newestId !== null,
    refetchInterval: (query) =>
      query.state.data && ['done', 'failed', 'needs_retake'].includes(query.state.data.status)
        ? false
        : 1500,
  });

  function choose(file: File | undefined): void {
    if (file) upload.mutate(file);
  }

  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    return (
      <main className="page mom">
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
    <main className="page mom">
      <header className="mom__header">
        <h1>{data.household.name}</h1>
        <p>Photograph a letter. Mailkeep will read it and tell you what to do.</p>
      </header>
      <div className="mom__capture">
        <label className="mom__camera">
          <input
            ref={cameraInput}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            disabled={upload.isPending}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          Take a photo of a letter
        </label>
        <label className="mom__choose">
          <input
            ref={fileInput}
            type="file"
            accept="image/*,application/pdf"
            disabled={upload.isPending}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          Choose a file instead
        </label>
      </div>
      {upload.isError ? (
        <Banner tone="warning">That file could not be read. Please try another photo.</Banner>
      ) : null}
      {newest ? (
        <section className="mom__result" aria-live="polite">
          <h2>{newest.title}</h2>
          <p>{resultCopy(newest)}</p>
        </section>
      ) : null}
      <section className="mom__recent" aria-labelledby="last-letters">
        <h2 id="last-letters">Your last letters</h2>
        {data.recent.length > 0 ? (
          <ul>
            {data.recent.slice(0, 5).map((letter) => (
              <li key={letter.id}>
                <span>{letter.title}</span>
                <strong>{letter.lane ? letter.lane.replaceAll('_', ' ') : 'reading'}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>No letters yet.</p>
        )}
      </section>
    </main>
  );
}
