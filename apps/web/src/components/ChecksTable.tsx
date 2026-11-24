import type { CheckDTO } from '@mailkeep/shared';

const ACTIVE_OUTCOMES = new Set([
  'linked',
  'reminder',
  'paid signal',
  'careful',
  'action',
  'use field',
  'accepted',
  'ask kind',
  'ask link',
  'ask paid',
  'sender mismatch',
]);

function number(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

export function ChecksTable({ checks }: { checks: CheckDTO[] }) {
  return (
    <div className="checks">
      <table>
        <thead>
          <tr>
            <th scope="col">Question</th>
            <th scope="col">Answer</th>
            <th scope="col">p / conf</th>
            <th scope="col">Bar</th>
            <th scope="col">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check) => (
            <tr
              key={check.id}
              className={ACTIVE_OUTCOMES.has(check.outcome) ? 'checks__active' : ''}
            >
              <td>{check.label}</td>
              <td className="mono">{check.answer}</td>
              <td className="mono">
                {number(check.probability)} / {number(check.confidence)}
              </td>
              <td className="mono">
                {check.threshold === null ? '—' : `≥ ${number(check.threshold)}`}
              </td>
              <td>{check.outcome}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
