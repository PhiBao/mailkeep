import { type ProofDTO, proofSchema } from '@mailkeep/shared';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api.js';
import { Banner } from '../components/Banner.js';
import { Skeleton } from '../components/Skeleton.js';
import { Wordmark } from '../components/Wordmark.js';
import '../styles/proof.css';

async function fetchProof(): Promise<ProofDTO> {
  const response = await apiFetch('/api/proof');
  if (!response.ok) throw new Error('Could not load proof');
  return proofSchema.parse(await response.json());
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function usd(microusd: number): string {
  return `$${(microusd / 1_000_000).toFixed(4)}`;
}

export function Proof() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['proof'],
    queryFn: fetchProof,
  });
  if (isLoading) return <Skeleton />;
  if (isError || !data) {
    return (
      <main className="page proof">
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
    <main className="page proof">
      <header className="proof__header">
        <Wordmark />
        <div>
          <a href="https://github.com/PhiBao/mailkeep">Code</a>
          <a href="/demo">Live demo</a>
        </div>
      </header>
      <h1>How Mailkeep runs</h1>
      <p className="proof__intro">
        A personal mail agent on a Fly.io Sprite. Provider credentials stay in Fly connectors; the
        Sprite and this public repo hold none.
      </p>

      <section className="proof__section" aria-labelledby="where">
        <h2 id="where">1. Where it runs</h2>
        <dl className="proof__grid">
          <dt>Sprite</dt>
          <dd>{data.where.spriteName}</dd>
          <dt>URL</dt>
          <dd>
            <a href={data.where.url}>{data.where.url}</a>
          </dd>
          <dt>Service</dt>
          <dd>{data.where.serviceStatus}</dd>
          <dt>Git SHA</dt>
          <dd>
            <a
              href={`https://github.com/PhiBao/mailkeep/commit/${data.where.gitSha}`}
              className="mono"
            >
              {data.where.gitSha.slice(0, 12)}
            </a>
          </dd>
          <dt>Uptime</dt>
          <dd>{data.where.uptime}</dd>
        </dl>
      </section>

      <section className="proof__section" aria-labelledby="connectors">
        <h2 id="connectors">2. What it can reach</h2>
        <div className="proof__table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Connector</th>
                <th scope="col">Connection prefix</th>
                <th scope="col">Credential</th>
              </tr>
            </thead>
            <tbody>
              {data.connectors.map((connector) => (
                <tr key={`${connector.provider}-${connector.connectionIdPrefix}`}>
                  <td>{connector.provider}</td>
                  <td className="mono">{connector.connectionIdPrefix}…</td>
                  <td>{connector.credentialLocation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="proof__section" aria-labelledby="keyscan">
        <h2 id="keyscan">3. What it holds</h2>
        <p>
          <strong>Provider keys found on this Sprite: {data.keyscan.found}</strong>
        </p>
        <p className="meta">
          Checked {data.keyscan.checkedAt}. Environment names only:{' '}
          {data.keyscan.envVarNames.join(', ')}.
        </p>
      </section>

      <section className="proof__section" aria-labelledby="thresholds">
        <h2 id="thresholds">4. How it decides</h2>
        <div className="proof__table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">Bar</th>
                <th scope="col">What happens</th>
              </tr>
            </thead>
            <tbody>
              {data.thresholds.map((threshold) => (
                <tr key={threshold.key}>
                  <td className="mono">{threshold.key}</td>
                  <td className="mono">
                    {typeof threshold.bar === 'number'
                      ? `${threshold.key === 'senderInconsistent' ? '<' : '≥'} ${threshold.bar}`
                      : threshold.bar}
                  </td>
                  <td>{threshold.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="proof__section" aria-labelledby="eval">
        <h2 id="eval">5. How well</h2>
        {data.eval ? (
          <>
            <p className="mono">
              {data.eval.runId} · {data.eval.letters} letters · {data.eval.generatedAt}
            </p>
            <dl className="proof__grid">
              <dt>Lane accuracy</dt>
              <dd>{pct(data.eval.laneAccuracy)}</dd>
              <dt>Never unsafe</dt>
              <dd>{data.eval.neverSafe}</dd>
              <dt>Scams caught</dt>
              <dd>{data.eval.scamsCaught}</dd>
              <dt>Link precision</dt>
              <dd>{pct(data.eval.linkPrecision)}</dd>
              <dt>Link recall</dt>
              <dd>{pct(data.eval.linkRecall)}</dd>
              <dt>Ask rate</dt>
              <dd>{pct(data.eval.askRate)}</dd>
            </dl>
            <a href="https://github.com/PhiBao/mailkeep/blob/main/EVAL.md">
              Read the full evaluation and tuning log
            </a>
          </>
        ) : (
          <p>No evaluation has run yet.</p>
        )}
      </section>

      <section className="proof__section" aria-labelledby="costs">
        <h2 id="costs">6. What it costs</h2>
        <dl className="proof__grid">
          <dt>Letters processed</dt>
          <dd>{data.costs.lettersProcessed}</dd>
          <dt>Total</dt>
          <dd>{usd(data.costs.totalMicrousd)}</dd>
          <dt>Average per letter</dt>
          <dd>{usd(data.costs.averageMicrousd)}</dd>
          <dt>Jev estimate</dt>
          <dd>{usd(data.costs.jevMicrousd)}</dd>
          <dt>Ollama estimate</dt>
          <dd>{usd(data.costs.ollamaMicrousd)}</dd>
        </dl>
      </section>

      <section className="proof__section" aria-labelledby="prior-art">
        <h2 id="prior-art">7. Prior art</h2>
        <p>
          <a href={data.priorArt.url}>{data.priorArt.name}</a> — {data.priorArt.difference}
        </p>
      </section>
    </main>
  );
}
