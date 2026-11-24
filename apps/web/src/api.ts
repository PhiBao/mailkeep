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
