import { type Context, Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { nanoid } from 'nanoid';
import type { Config } from '../../config.js';
import type { DB } from '../../db/db.js';
import { getMemberByEmail } from '../../db/repo.js';
import { loginEmail } from '../../notify/templates.js';
import { log } from '../../util/log.js';
import { csrfProtection } from '../csrf.js';
import { AUTH_EMAIL_RATE, AUTH_IP_RATE, clientIp, SlidingWindowRateLimiter } from '../ratelimit.js';
import {
  type Clock,
  clearSessionCookie,
  consumeLoginToken,
  destroySession,
  issueLoginToken,
  issueSession,
  SESSION_COOKIE,
  type SessionMember,
  setSessionCookie,
} from '../session.js';

export interface LoginMail {
  to: string;
  subject: string;
  body: string;
}

export type LoginMailQueue = (mail: LoginMail) => void | Promise<void>;

export interface AuthDeps {
  config: Config;
  db: DB;
  now?: Clock | undefined;
  mailQueue?: LoginMailQueue | undefined;
  rateLimiter?: SlidingWindowRateLimiter | undefined;
}

function emailFromBody(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('email' in value)) return null;
  const email = value.email;
  if (typeof email !== 'string') return null;
  const normalised = email.trim().toLowerCase();
  if (normalised.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalised)) return null;
  return normalised;
}

function queueToOutbox(db: DB, mail: LoginMail, member: SessionMember, clock: Clock): void {
  db.prepare(
    `INSERT INTO outbox
      (id, household_id, to_email, kind, subject, body_text, related_id, status, created_at)
     VALUES (?, ?, ?, 'login', ?, ?, ?, 'pending', ?)`,
  ).run(
    `out_${nanoid()}`,
    member.household_id,
    mail.to,
    mail.subject,
    mail.body,
    member.id,
    clock().toISOString(),
  );
}

function accepted(context: Context) {
  context.header('Cache-Control', 'no-store');
  return context.json({ ok: true });
}

function rateLimited(context: Context, retryAfterSeconds: number) {
  context.header('Retry-After', String(retryAfterSeconds));
  return accepted(context);
}

function expired(context: Context) {
  context.header('Cache-Control', 'no-store');
  return context.redirect('/login?error=expired', 302);
}

export function authRoutes(deps: AuthDeps): Hono {
  const app = new Hono();
  const clock = deps.now ?? (() => new Date());
  const limiter = deps.rateLimiter ?? new SlidingWindowRateLimiter(() => clock().getTime());
  const mailQueue = deps.mailQueue;
  const csrf = csrfProtection(deps.config.MAILKEEP_PUBLIC_URL);

  app.post('/auth/link', csrf, async (context) => {
    const ip = limiter.check(`ip:${clientIp(context)}`, AUTH_IP_RATE.limit, AUTH_IP_RATE.windowMs);
    if (!ip.allowed) return rateLimited(context, ip.retryAfterSeconds);

    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return accepted(context);
    }
    const email = emailFromBody(body);
    if (!email) return accepted(context);

    const emailRate = limiter.check(
      `email:${email}`,
      AUTH_EMAIL_RATE.limit,
      AUTH_EMAIL_RATE.windowMs,
    );
    if (!emailRate.allowed) return rateLimited(context, emailRate.retryAfterSeconds);

    try {
      const member = getMemberByEmail(deps.db, email) as SessionMember | undefined;
      if (!member) return accepted(context);

      const issued = issueLoginToken(deps.db, member.id, clock);
      const baseUrl = deps.config.MAILKEEP_PUBLIC_URL.replace(/\/$/, '');
      const link = `${baseUrl}/auth/callback?token=${encodeURIComponent(issued.token)}`;
      const mail: LoginMail = { to: member.email, ...loginEmail(link) };
      try {
        if (mailQueue) await mailQueue(mail);
        else queueToOutbox(deps.db, mail, member, clock);
      } catch {
        log.warn({ event: 'login_mail_queue_failed' }, 'Could not queue a login email');
      }
      return accepted(context);
    } catch {
      log.warn({ event: 'login_request_failed' }, 'Could not issue a login link');
      return accepted(context);
    }
  });

  app.get('/auth/callback', (context) => {
    const token = context.req.query('token');
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return expired(context);

    const session = deps.db.transaction(() => {
      const memberId = consumeLoginToken(deps.db, token, clock);
      return memberId ? issueSession(deps.db, memberId, clock) : null;
    })();
    if (!session) return expired(context);

    setSessionCookie(context, session, clock);
    context.header('Cache-Control', 'no-store');
    return context.redirect(session.member.role === 'parent' ? '/mom' : '/today', 302);
  });

  app.post('/auth/logout', csrf, (context) => {
    destroySession(deps.db, getCookie(context, SESSION_COOKIE));
    clearSessionCookie(context);
    return accepted(context);
  });

  return app;
}
