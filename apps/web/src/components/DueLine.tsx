import { type DueLineDTO, formatUsd } from '@mailkeep/shared';
import { Link } from 'react-router';

function dateBlock(value: string): { month: string; day: string } {
  const date = new Date(`${value}T00:00:00Z`);
  return {
    month: date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase(),
    day: String(date.getUTCDate()).padStart(2, '0'),
  };
}

export function DueLine({ due, demo = false }: { due: DueLineDTO; demo?: boolean }) {
  const block = due.dueDate ? dateBlock(due.dueDate) : { month: '—', day: '—' };
  const days = due.daysLeft;
  return (
    <Link
      className={`due-line${days < 0 ? ' due-line--overdue' : ''}`}
      to={`${demo ? '/demo' : ''}/cases/${due.caseId}`}
    >
      <span className="due-line__date mono">
        <span>{block.month}</span>
        <strong>{block.day}</strong>
      </span>
      <span className="due-line__body">
        <span className="due-line__title">{due.title}</span>
        <span className="meta">
          {due.counterparty}
          {due.secondNotice ? ' · second notice' : ''}
        </span>
      </span>
      <span className="due-line__amount mono">
        {due.amountCents === null ? 'No amount' : formatUsd(due.amountCents)}
        <small>
          {days < 0
            ? `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} overdue`
            : `${days} ${days === 1 ? 'day' : 'days'}`}
        </small>
      </span>
    </Link>
  );
}
