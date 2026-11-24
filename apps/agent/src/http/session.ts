import { createHash, randomBytes } from 'node:crypto';
import type { MemberRole } from '@mailkeep/shared';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { DB } from '../db/db.js';

export const SESSION_COOKIE = 'mk_session';
export const TOKEN_BYTES = 32;
export const LOGIN_TOKEN_TTL_MS = 15 * 60_000;
export const SESSION_TTL_MS: Record<MemberRole, number> = {
  family: 30 * 24 * 60 * 60_000,
  parent: 180 * 24 * 60 * 60_000,
};

export interface SessionMember {
  id: string;
  household_id: string;
  email: string;
  display_name: string;
  role: MemberRole;
  created_at: string;
}

export interface IssuedLoginToken {
  token: string;
  tokenHash: string;
  expiresAt: string;
}

export interface IssuedSession {
  token: string;
  tokenHash: string;
  member: SessionMember;
  expiresAt: string;
}

export interface LoadedSession {
  tokenHash: string;
  member: SessionMember;
  expiresAt: string;
}

export type HouseholdTable = 'letters' | 'cases' | 'asks' | 'outbox';
export type Clock = () => Date;

const householdTables = new Set<string>(['letters', 'cases', 'asks', 'outbox']);
const now: Clock = () => new Date();

declare module 'hono' {
  interface ContextVariableMap {
    member: SessionMember;
    session: LoadedSession;
  }
}

export function opaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function issueLoginToken(db: DB, memberId: string, clock: Clock = now): IssuedLoginToken {
  const token = opaqueToken();
  const expiresAt = new Date(clock().getTime() + LOGIN_TOKEN_TTL_MS).toISOString();
  db.prepare('INSERT INTO login_tokens (token_hash, member_id, expires_at) VALUES (?, ?, ?)').run(
    hashToken(token),
    memberId,
    expiresAt,
  );
  return { token, tokenHash: hashToken(token), expiresAt };
}

/** The conditional update makes concurrent uses of the same link mutually exclusive. */
export function consumeLoginToken(db: DB, token: string, clock: Clock = now): string | null {
  const consumedAt = clock().toISOString();
  const row = db
    .prepare(
      `UPDATE login_tokens
          SET used_at = ?
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
        RETURNING member_id`,
    )
    .get(consumedAt, hashToken(token), consumedAt) as { member_id: string } | undefined;
  return row?.member_id ?? null;
}

export function issueSession(db: DB, memberId: string, clock: Clock = now): IssuedSession | null {
  const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId) as
    | SessionMember
    | undefined;
  if (!member) return null;
  const token = opaqueToken();
  const tokenHash = hashToken(token);
  const createdAt = clock();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS[member.role]).toISOString();
  db.prepare(
    `INSERT INTO sessions (token_hash, member_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(tokenHash, member.id, expiresAt, createdAt.toISOString());
  return { token, tokenHash, member, expiresAt };
}

export function loadSession(
  db: DB,
  token: string | undefined,
  clock: Clock = now,
): LoadedSession | null {
  if (!token) return null;
  const currentTime = clock().toISOString();
  const row = db
    .prepare(
      `SELECT s.token_hash, s.expires_at, m.id, m.household_id, m.email, m.display_name, m.role, m.created_at
         FROM sessions s
         JOIN members m ON m.id = s.member_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), currentTime) as
    | (SessionMember & { token_hash: string; expires_at: string })
    | undefined;
  if (row) {
    return {
      tokenHash: row.token_hash,
      member: {
        id: row.id,
        household_id: row.household_id,
        email: row.email,
        display_name: row.display_name,
        role: row.role,
        created_at: row.created_at,
      },
      expiresAt: row.expires_at,
    };
  }
  db.prepare('DELETE FROM sessions WHERE token_hash = ? AND expires_at <= ?').run(
    hashToken(token),
    currentTime,
  );
  return null;
}

export function loadContextSession(
  context: Context,
  db: DB,
  clock: Clock = now,
): LoadedSession | null {
  return loadSession(db, getCookie(context, SESSION_COOKIE), clock);
}

export function destroySession(db: DB, token: string | undefined): void {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function sessionCookieOptions(role: MemberRole, clock: Clock = now) {
  const maxAge = Math.floor(SESSION_TTL_MS[role] / 1000);
  return {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax' as const,
    path: '/',
    maxAge,
    expires: new Date(clock().getTime() + maxAge * 1000),
  };
}

export function setSessionCookie(
  context: Context,
  session: IssuedSession,
  clock: Clock = now,
): void {
  setCookie(
    context,
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(session.member.role, clock),
  );
}

export function clearSessionCookie(context: Context): void {
  deleteCookie(context, SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
  });
}

export function requireMember(db: DB, clock: Clock = now): MiddlewareHandler {
  return async (context, next) => {
    const session = loadContextSession(context, db, clock);
    if (!session) return context.json({ error: 'unauthorized' }, 401);
    context.set('member', session.member);
    context.set('session', session);
    await next();
  };
}

export function requireFamily(db: DB, clock: Clock = now): MiddlewareHandler {
  return async (context, next) => {
    const session = loadContextSession(context, db, clock);
    if (!session) return context.json({ error: 'unauthorized' }, 401);
    if (session.member.role !== 'family') return context.json({ error: 'forbidden' }, 403);
    context.set('member', session.member);
    context.set('session', session);
    await next();
  };
}

/** Returns undefined for missing and other-household resources so routes can both answer 404. */
export function getHouseholdRow<T>(
  db: DB,
  member: Pick<SessionMember, 'household_id'>,
  table: HouseholdTable,
  resourceId: string,
): T | undefined {
  if (!householdTables.has(table)) throw new Error(`Unsupported household table: ${table}`);
  return db
    .prepare(`SELECT * FROM ${table} WHERE id = ? AND household_id = ? LIMIT 1`)
    .get(resourceId, member.household_id) as T | undefined;
}
