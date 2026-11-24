import { type TodayDTO, todaySchema } from '@mailkeep/shared';

const publicUrl = (import.meta.env.VITE_MAILKEEP_PUBLIC_URL ?? '').replace(/\/$/, '');

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('X-Mailkeep', '1');
  return fetch(`${publicUrl}${path}`, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
}

export async function fetchToday(): Promise<TodayDTO> {
  const response = await apiFetch('/api/today');
  if (!response.ok) throw new Error('Could not load today');
  return todaySchema.parse(await response.json());
}
