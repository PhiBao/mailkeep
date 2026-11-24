import type { LetterSummaryDTO } from '@mailkeep/shared';
import { Link } from 'react-router';
import { Stamp } from './Stamp.js';

export interface SlipProps {
  letter: LetterSummaryDTO;
  to?: string;
}

const receivedDate = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function Slip({ letter, to }: SlipProps) {
  const sender = letter.senderOrg ?? 'Letter';
  const date = receivedDate.format(new Date(letter.receivedAt));
  return (
    <Link className="slip" to={to ?? `/letters/${letter.id}`}>
      <span className="slip__thumb">
        <img src={letter.imageUrl} alt={`Letter from ${sender}`} />
      </span>
      <span>
        <span className="slip__title">{letter.title}</span>
        <span className="slip__meta">
          {sender} · {date}
        </span>
        {letter.summaryParent ? (
          <span className="slip__summary">{letter.summaryParent}</span>
        ) : null}
      </span>
      {letter.lane ? (
        <span className="slip__stamp">
          <Stamp lane={letter.lane} />
        </span>
      ) : null}
    </Link>
  );
}
