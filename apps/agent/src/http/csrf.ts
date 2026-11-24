import type { Context, MiddlewareHandler } from 'hono';

function reject(context: Context) {
  return context.json({ error: 'csrf' }, 403);
}

function externalOrigin(context: Context, publicUrl?: string): string | null {
  if (publicUrl) {
    try {
      return new URL(publicUrl).origin;
    } catch {
      // Fall back to the request when a development config has no valid public URL.
    }
  }
  try {
    const requestUrl = new URL(context.req.url);
    const forwardedProto = context.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedHost = context.req.header('x-forwarded-host')?.split(',')[0]?.trim();
    if (forwardedProto === 'http' || forwardedProto === 'https') {
      requestUrl.protocol = forwardedProto;
    }
    if (forwardedHost) requestUrl.host = new URL(`${requestUrl.protocol}//${forwardedHost}`).host;
    return requestUrl.origin;
  } catch {
    return null;
  }
}

export function isSameOrigin(context: Context, origin: string, publicUrl?: string): boolean {
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const expectedOrigin = externalOrigin(context, publicUrl);
  return (
    originUrl.origin === expectedOrigin &&
    originUrl.origin !== 'null' &&
    originUrl.pathname === '/' &&
    originUrl.search === '' &&
    originUrl.hash === '' &&
    originUrl.username === '' &&
    originUrl.password === ''
  );
}

/** Browser POSTs need both the custom header and, when supplied, a same-origin Origin. */
export function csrfProtection(publicUrl?: string): MiddlewareHandler {
  return async (context, next) => {
    if (context.req.method !== 'POST') return next();
    if (context.req.header('X-Mailkeep') !== '1') return reject(context);
    const origin = context.req.header('Origin');
    if (origin !== undefined && !isSameOrigin(context, origin, publicUrl)) return reject(context);
    await next();
  };
}
