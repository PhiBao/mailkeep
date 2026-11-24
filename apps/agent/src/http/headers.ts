import type { MiddlewareHandler } from 'hono';

export const securityHeaders: MiddlewareHandler = async (context, next) => {
  await next();
  context.header(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  context.header('Referrer-Policy', 'no-referrer');
  context.header('X-Content-Type-Options', 'nosniff');
  context.header('Permissions-Policy', 'camera=(self)');
};
