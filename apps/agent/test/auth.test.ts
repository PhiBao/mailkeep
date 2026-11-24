import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { addMember, createHousehold } from '../src/db/repo.js';
import { csrfProtection } from '../src/http/csrf.js';
import { SlidingWindowRateLimiter } from '../src/http/ratelimit.js';
import { type AuthDeps, authRoutes, type LoginMail } from '../src/http/routes/auth.js';
import {
  getHouseholdRow,
  hashToken,
  issueSession,
  LOGIN_TOKEN_TTL_MS,
  loadSession,
  requireFamily,
  requireMember,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type SessionMember,
} from '../src/http/session.js';

const ORIGIN = 'https://mailkeep.test';
const START = Date.parse('2026-11-24T12:00:00.000Z');
const FAMILY_EMAIL = 'family@example.com';
const PARENT_EMAIL = 'parent@example.com';

let directory: string;
let db: DB;
let currentTime: number;
let app: Hono;
let mailed: LoginMail[];
let family: SessionMember;
let parent: SessionMember;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-auth-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
  currentTime = START;
  for (const householdId of ['hh_a', 'hh_b']) {
    createHousehold(db, {
      id: householdId,
      name: householdId,
      parentDisplay: 'Ruth',
      timezone: 'America/Chicago',
      demo: false,
    });
  }
  addMember(db, {
    householdId: 'hh_a',
    email: FAMILY_EMAIL,
    displayName: 'Sarah',
    role: 'family',
  });
  addMember(db, {
    householdId: 'hh_a',
    email: PARENT_EMAIL,
    displayName: 'Ruth',
    role: 'parent',
  });
  addMember(db, {
    householdId: 'hh_b',
    email: 'other@example.com',
    displayName: 'Other',
    role: 'family',
  });
  family = db
    .prepare('SELECT * FROM members WHERE email = ?')
    .get(FAMILY_EMAIL) as unknown as SessionMember;
  parent = db
    .prepare('SELECT * FROM members WHERE email = ?')
    .get(PARENT_EMAIL) as unknown as SessionMember;
  mailed = [];
  app = makeApp();
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

function clock(): Date {
  return new Date(currentTime);
}

function deps(): AuthDeps {
  return {
    config: loadConfig({ MAILKEEP_PUBLIC_URL: ORIGIN, MAILKEEP_DATA_DIR: directory }),
    db,
    now: clock,
    mailQueue: (mail) => {
      mailed.push(mail);
    },
  };
}

function makeApp(overrides: Partial<AuthDeps> = {}): Hono {
  const instance = new Hono();
  instance.route('/', authRoutes({ ...deps(), ...overrides }));
  return instance;
}

function postLink(
  email: string,
  options: { ip?: string; origin?: string | null; csrf?: string | null } = {},
) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options.csrf !== null) headers.set('X-Mailkeep', options.csrf ?? '1');
  if (options.origin !== null) headers.set('Origin', options.origin ?? ORIGIN);
  headers.set('X-Forwarded-For', options.ip ?? '203.0.113.1');
  return app.request(`${ORIGIN}/auth/link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
}

function tokenFromMail(index = mailed.length - 1): string {
  const token = mailed[index]?.body.match(/token=([A-Za-z0-9_-]{43})/)?.[1];
  expect(token).toBeDefined();
  return token as string;
}

async function callback(token: string): Promise<Response> {
  return app.request(`${ORIGIN}/auth/callback?token=${encodeURIComponent(token)}`);
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

describe('magic links', () => {
  it('issues a 32-byte base64url token and stores only its SHA-256 hash', async () => {
    const response = await postLink(`  ${FAMILY_EMAIL.toUpperCase()}  `);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mailed).toHaveLength(1);
    expect(mailed[0]?.to).toBe(FAMILY_EMAIL);

    const token = tokenFromMail();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    const row = db.prepare('SELECT * FROM login_tokens').get() as Record<string, unknown>;
    expect(row.token_hash).toBe(hashToken(token));
    expect(row.token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(Object.values(row)).not.toContain(token);
    expect(row.used_at).toBeNull();
    expect(Date.parse(String(row.expires_at)) - currentTime).toBe(LOGIN_TOKEN_TTL_MS);
  });

  it('consumes a token atomically and only once', async () => {
    await postLink(FAMILY_EMAIL);
    const token = tokenFromMail();
    const responses = await Promise.all([callback(token), callback(token)]);
    const locations = responses.map((response) => response.headers.get('Location')).sort();
    expect(locations).toEqual(['/login?error=expired', '/today']);
    expect(responses.every((response) => response.status === 302)).toBe(true);
    expect((db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }).n).toBe(1);
    const used = db.prepare('SELECT used_at FROM login_tokens').get() as { used_at: string };
    expect(used.used_at).toBe(clock().toISOString());
  });

  it('rejects a token at its 15-minute expiry without creating a session', async () => {
    await postLink(FAMILY_EMAIL);
    const token = tokenFromMail();
    currentTime += LOGIN_TOKEN_TTL_MS;
    const response = await callback(token);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login?error=expired');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect((db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }).n).toBe(0);
    const row = db.prepare('SELECT used_at FROM login_tokens').get() as { used_at: null };
    expect(row.used_at).toBeNull();
  });

  it('redirects missing and malformed tokens to the same expired-link page', async () => {
    for (const url of ['/auth/callback', '/auth/callback?token=not-a-token']) {
      const response = await app.request(`${ORIGIN}${url}`);
      expect(response.headers.get('Location')).toBe('/login?error=expired');
    }
    expect((db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }).n).toBe(0);
  });

  it('does not reveal whether an email belongs to a household', async () => {
    const known = await postLink(FAMILY_EMAIL);
    const unknown = await postLink('nobody@example.com');
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.text()).toBe(await unknown.text());
    expect(mailed).toHaveLength(1);
    expect((db.prepare('SELECT count(*) AS n FROM login_tokens').get() as { n: number }).n).toBe(1);
  });

  it('always accepts valid requests even when the mail queue is unavailable', async () => {
    app = makeApp({
      mailQueue: () => {
        throw new Error('offline test queue');
      },
    });
    const response = await postLink(FAMILY_EMAIL);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it('does not turn a token-storage failure into an enumeration response', async () => {
    db.exec(
      `CREATE TRIGGER reject_login_token BEFORE INSERT ON login_tokens
       BEGIN SELECT RAISE(ABORT, 'test storage failure'); END`,
    );
    const known = await postLink(FAMILY_EMAIL);
    const unknown = await postLink('nobody@example.com');
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.text()).toBe(await unknown.text());
    expect(mailed).toHaveLength(0);
  });

  it('uses the durable login outbox by default without calling a provider', async () => {
    app = makeApp({ mailQueue: undefined });
    const response = await postLink(FAMILY_EMAIL);
    expect(response.status).toBe(200);
    const row = db.prepare("SELECT * FROM outbox WHERE kind = 'login'").get() as Record<
      string,
      unknown
    >;
    const token = String(row.body_text).match(/token=([A-Za-z0-9_-]{43})/)?.[1];
    expect(row.status).toBe('pending');
    expect(row.household_id).toBe('hh_a');
    expect(token).toBeDefined();
    expect(
      (db.prepare('SELECT token_hash FROM login_tokens').get() as { token_hash: string })
        .token_hash,
    ).toBe(hashToken(token as string));
  });
});

describe('sessions', () => {
  it.each([
    { role: 'family' as const, email: FAMILY_EMAIL, maxAge: 30 * 24 * 60 * 60, location: '/today' },
    { role: 'parent' as const, email: PARENT_EMAIL, maxAge: 180 * 24 * 60 * 60, location: '/mom' },
  ])('sets a secure $role cookie for $maxAge seconds', async ({ email, maxAge, location }) => {
    const member = db.prepare('SELECT * FROM members WHERE email = ?').get(email) as SessionMember;
    await postLink(member.email);
    const token = tokenFromMail();
    const response = await callback(token);
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(location);
    expect(response.headers.get('Cache-Control')).toBe('no-store');

    const cookie = response.headers.get('Set-Cookie');
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${maxAge}`);
    const sessionToken = cookie?.split(';')[0]?.split('=')[1];
    expect(sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(sessionToken as string, 'base64url')).toHaveLength(32);

    const row = db.prepare('SELECT * FROM sessions').get() as Record<string, unknown>;
    expect(row.token_hash).toBe(hashToken(sessionToken as string));
    expect(Object.values(row)).not.toContain(sessionToken);
    expect(Date.parse(String(row.expires_at)) - currentTime).toBe(SESSION_TTL_MS[member.role]);
  });

  it('loads an unexpired session and rejects an expired one', () => {
    const issued = issueSession(db, family.id, clock);
    expect(issued).not.toBeNull();
    expect(loadSession(db, issued?.token, clock)?.member.id).toBe(family.id);
    currentTime += SESSION_TTL_MS.family;
    expect(loadSession(db, issued?.token, clock)).toBeNull();
    expect((db.prepare('SELECT count(*) AS n FROM sessions').get() as { n: number }).n).toBe(0);
  });

  it('requireMember returns 401 without a cookie and exposes the member with one', async () => {
    const protectedApp = new Hono();
    protectedApp.get('/me', requireMember(db, clock), (context) =>
      context.json(context.get('member')),
    );
    expect((await protectedApp.request(`${ORIGIN}/me`)).status).toBe(401);

    const issued = issueSession(db, family.id, clock);
    const response = await protectedApp.request(`${ORIGIN}/me`, {
      headers: { Cookie: sessionCookie(issued?.token as string) },
    });
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(family.id);
  });

  it('requireFamily rejects the parent role', async () => {
    const protectedApp = new Hono();
    protectedApp.get('/family', requireFamily(db, clock), (context) =>
      context.json(context.get('member')),
    );
    const issued = issueSession(db, parent.id, clock);
    const response = await protectedApp.request(`${ORIGIN}/family`, {
      headers: { Cookie: sessionCookie(issued?.token as string) },
    });
    expect(response.status).toBe(403);
  });

  it('returns 404 for a resource owned by another household', async () => {
    db.prepare(
      `INSERT INTO cases (id, household_id, title, counterparty, kind, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      'case_other',
      'hh_b',
      'Other case',
      'Other',
      'bill',
      'open',
      clock().toISOString(),
      clock().toISOString(),
    );
    expect(getHouseholdRow(db, family, 'cases', 'case_other')).toBeUndefined();
    const other = db
      .prepare('SELECT * FROM members WHERE email = ?')
      .get('other@example.com') as unknown as SessionMember;
    expect(getHouseholdRow<{ id: string }>(db, other, 'cases', 'case_other')?.id).toBe(
      'case_other',
    );

    const protectedApp = new Hono();
    protectedApp.get('/cases/:id', requireMember(db, clock), (context) => {
      const resource = getHouseholdRow(db, context.get('member'), 'cases', context.req.param('id'));
      return resource ? context.json(resource) : context.json({ error: 'not_found' }, 404);
    });
    const issued = issueSession(db, family.id, clock);
    const response = await protectedApp.request(`${ORIGIN}/cases/case_other`, {
      headers: { Cookie: sessionCookie(issued?.token as string) },
    });
    expect(response.status).toBe(404);
  });

  it('logout requires CSRF, revokes the server session, and clears the cookie', async () => {
    const issued = issueSession(db, family.id, clock);
    const cookie = sessionCookie(issued?.token as string);
    const rejected = await app.request(`${ORIGIN}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie },
    });
    expect(rejected.status).toBe(403);
    expect(loadSession(db, issued?.token, clock)).not.toBeNull();

    const response = await app.request(`${ORIGIN}/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-Mailkeep': '1', Origin: ORIGIN },
    });
    expect(response.status).toBe(200);
    expect(loadSession(db, issued?.token, clock)).toBeNull();
    const cleared = response.headers.get('Set-Cookie');
    expect(cleared).toContain(`${SESSION_COOKIE}=;`);
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toContain('Secure');
    expect(cleared).toContain('SameSite=Lax');
    expect(cleared).toContain('Path=/');
  });
});

describe('CSRF', () => {
  it('rejects POSTs without the X-Mailkeep header', async () => {
    const response = await postLink(FAMILY_EMAIL, { csrf: null });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'csrf' });
    expect(mailed).toHaveLength(0);
  });

  it('rejects a cross-origin Origin even with the header', async () => {
    const response = await postLink(FAMILY_EMAIL, { origin: 'https://attacker.example' });
    expect(response.status).toBe(403);
    expect(mailed).toHaveLength(0);
  });

  it('accepts same-origin POSTs and permits an absent Origin for non-browser clients', async () => {
    expect((await postLink(FAMILY_EMAIL)).status).toBe(200);
    expect((await postLink(FAMILY_EMAIL, { origin: null })).status).toBe(200);
    expect(mailed).toHaveLength(2);
  });

  it('checks Origin independently of the CSRF header', async () => {
    const csrfApp = new Hono();
    csrfApp.post('/submit', csrfProtection(), (context) => context.json({ ok: true }));
    const response = await csrfApp.request(`${ORIGIN}/submit`, {
      method: 'POST',
      headers: { 'X-Mailkeep': '1', Origin: 'https://mailkeep.test.attacker.example' },
    });
    expect(response.status).toBe(403);
  });

  it('uses the public URL as the origin when TLS terminates at the proxy', async () => {
    const response = await app.request('http://localhost/auth/link', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mailkeep': '1',
        Origin: ORIGIN,
        Host: 'mailkeep.test',
      },
      body: JSON.stringify({ email: FAMILY_EMAIL }),
    });
    expect(response.status).toBe(200);
    expect(mailed).toHaveLength(1);
  });

  it('falls back to forwarded scheme and host when no public URL is configured', async () => {
    const csrfApp = new Hono();
    csrfApp.post('/submit', csrfProtection(), (context) => context.json({ ok: true }));
    const response = await csrfApp.request('http://localhost/submit', {
      method: 'POST',
      headers: {
        'X-Mailkeep': '1',
        Origin: ORIGIN,
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'mailkeep.test',
      },
    });
    expect(response.status).toBe(200);
  });
});

describe('rate limits', () => {
  it('allows three links per email per hour and still returns 200 on the fourth', async () => {
    const responses = [];
    for (let request = 0; request < 4; request += 1) responses.push(await postLink(FAMILY_EMAIL));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses.map((response) => response.headers.get('Retry-After'))).toEqual([
      null,
      null,
      null,
      '3600',
    ]);
    expect(mailed).toHaveLength(3);
    expect((db.prepare('SELECT count(*) AS n FROM login_tokens').get() as { n: number }).n).toBe(3);
  });

  it('limits each IP independently at ten requests per hour', async () => {
    for (let request = 0; request < 11; request += 1) {
      const response = await postLink(`person${request}@example.com`, { ip: '203.0.113.10' });
      expect(response.status).toBe(200);
      if (request === 10) expect(response.headers.get('Retry-After')).toBe('3600');
    }
    const otherIp = await postLink('person@example.com', { ip: '203.0.113.11' });
    expect(otherIp.status).toBe(200);
    expect(otherIp.headers.get('Retry-After')).toBeNull();
  });

  it('uses a sliding window rather than a fixed hourly bucket', () => {
    let time = 0;
    const limiter = new SlidingWindowRateLimiter(() => time);
    expect(limiter.check('email:test', 2, 1000).allowed).toBe(true);
    expect(limiter.check('email:test', 2, 1000).allowed).toBe(true);
    expect(limiter.check('email:test', 2, 1000)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
    });
    time = 500;
    expect(limiter.check('email:test', 2, 1000).allowed).toBe(false);
    time = 1000;
    expect(limiter.check('email:test', 2, 1000).allowed).toBe(true);
    time = 1500;
    expect(limiter.check('email:test', 2, 1000).allowed).toBe(true);
  });
});
