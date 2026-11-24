import { LANE_LABELS, type Lane, type LetterDTO, letterSchema } from '@mailkeep/shared';
import { useMutation, useQueries } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { apiFetch } from '../api.js';
import { Banner } from '../components/Banner.js';
import { Stamp } from '../components/Stamp.js';
import '../styles/shoebox.css';

interface ShoeboxItem {
  key: string;
  name: string;
  letter?: LetterDTO;
  error?: string;
}

const TERMINAL = new Set(['done', 'failed', 'needs_retake']);
const LANES: Lane[] = ['handled', 'headsup', 'needs_you', 'careful'];

function statusLabel(item: ShoeboxItem): string {
  if (item.error) return 'failed';
  if (!item.letter) return 'queued';
  return item.letter.status.replaceAll('_', ' ');
}

async function fetchLetter(id: string): Promise<LetterDTO> {
  const response = await apiFetch(`/api/letters/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('Could not load this letter');
  return letterSchema.parse(await response.json());
}

export function Shoebox() {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ShoeboxItem[]>([]);
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      if (files.length > 40) throw new Error('Choose at most 40 files.');
      const keyed = files.map((file, index) => ({
        key: `${Date.now()}-${index}-${file.name}`,
        name: file.name,
      }));
      setItems((current) => [...current, ...keyed]);
      for (const [index, file] of files.entries()) {
        const key = keyed[index]?.key;
        if (!key) continue;
        try {
          const form = new FormData();
          form.append('file', file);
          const response = await apiFetch('/api/letters', { method: 'POST', body: form });
          if (!response.ok) throw new Error(`Upload failed (${response.status})`);
          const letters = letterSchema.array().parse(await response.json());
          const letter = letters[0];
          if (!letter) throw new Error('No letter was accepted');
          setItems((current) =>
            current.map((item) => (item.key === key ? { ...item, letter } : item)),
          );
        } catch (error) {
          setItems((current) =>
            current.map((item) =>
              item.key === key
                ? { ...item, error: error instanceof Error ? error.message : 'Upload failed' }
                : item,
            ),
          );
        }
      }
    },
  });
  const letterQueries = useQueries({
    queries: items.flatMap((item) =>
      item.letter?.id
        ? [
            {
              queryKey: ['shoebox-letter', item.letter.id],
              queryFn: () => fetchLetter(item.letter?.id as string),
              refetchInterval: (query: { state: { data?: LetterDTO } }) =>
                query.state.data && TERMINAL.has(query.state.data.status) ? false : 1000,
            },
          ]
        : [],
    ),
  });
  const letters = new Map(
    letterQueries.flatMap((query) => (query.data ? [[query.data.id, query.data] as const] : [])),
  );
  const view = items.map((item) => ({
    ...item,
    letter: item.letter?.id ? (letters.get(item.letter.id) ?? item.letter) : item.letter,
  }));
  const counts = Object.fromEntries(
    LANES.map((lane) => [lane, view.filter((item) => item.letter?.lane === lane).length]),
  ) as Record<Lane, number>;
  const cost = view.reduce((sum, item) => sum + (item.letter?.decision?.costMicrousd ?? 0), 0);

  return (
    <main className="page shoebox">
      <header className="shoebox__header">
        <div>
          <p className="eyebrow">Family mail, kept</p>
          <h1>Shoebox</h1>
        </div>
        <label className="button button--primary shoebox__choose">
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            multiple
            disabled={upload.isPending}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = '';
              if (files.length) void upload.mutate(files);
            }}
          />
          Choose letters
        </label>
      </header>
      <p className="meta">
        Up to 40 photos or PDFs. Mailkeep uploads them one at a time and reads two at once.
      </p>
      {upload.isError ? <Banner tone="warning">{(upload.error as Error).message}</Banner> : null}
      {view.length > 0 ? (
        <>
          <div className="shoebox__tallies mono" role="status">
            {LANES.map((lane) => `${LANE_LABELS[lane]} ${counts[lane]}`).join(' · ')} · $
            {(cost / 1_000_000).toFixed(3)}
          </div>
          <div className="shoebox__grid">
            {view.map((item) => (
              <article className="shoebox__item" key={item.key}>
                <span className="shoebox__name">{item.name}</span>
                <span className="shoebox__status mono">{statusLabel(item)}</span>
                {item.letter?.lane && item.letter.status === 'done' ? (
                  <Stamp lane={item.letter.lane} />
                ) : (
                  <span className="shoebox__pending" aria-hidden="true" />
                )}
                {item.error ? <span className="shoebox__error">{item.error}</span> : null}
              </article>
            ))}
          </div>
        </>
      ) : (
        <section className="shoebox__empty">
          <h2>A stack of letters, without the stack.</h2>
          <p>Choose photos or PDFs to see each one read, linked and filed.</p>
        </section>
      )}
    </main>
  );
}
