import { type FormEvent, useState } from 'react';
import { apiFetch } from '../api.js';
import { Wordmark } from '../components/Wordmark.js';
import '../styles/auth.css';

export function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const expired = new URLSearchParams(window.location.search).get('error') === 'expired';

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch('/auth/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
    } catch {
      // The response must not reveal whether the address or mail service exists.
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <main className="page login">
      <Wordmark />
      <section className="login__panel">
        <h1>Sign in to your family's mail.</h1>
        {expired ? <p className="login__error">That link has expired. Ask for a new one.</p> : null}
        {sent ? (
          <p role="status">If that address belongs to a household, a link is on its way.</p>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="submit" className="button--primary" disabled={busy}>
              Email me a link
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
