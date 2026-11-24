import type { CaseDTO, LetterSummaryDTO, RelationDTO } from '@mailkeep/shared';
import { Slip } from './Slip.js';

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

type ThreadItem =
  | { type: 'letter'; date: string; letter: LetterSummaryDTO }
  | { type: 'event'; date: string; event: CaseDTO['events'][number] };

function relationLabel(relation: RelationDTO, accountTail: string | null): string {
  const probability = relation.probability.toFixed(2);
  if (relation.relation === 'follow_up') return `↳ second notice for this bill · ${probability}`;
  if (relation.relation === 'completes') return `↳ says it was paid · ${probability}`;
  if (relation.relation === 'sender_mismatch') return `↳ sender does not match · ${probability}`;
  if (relation.relation === 'contradicts') return `↳ contradicts a paid mark · ${probability}`;
  return `↳ same account${accountTail ? ` ••${accountTail}` : ''} · ${probability}`;
}

function eventLabel(event: CaseDTO['events'][number]): string {
  const answer = event.detail.answer;
  if (event.type === 'answered' && typeof answer === 'string') {
    return `${event.actor === 'member' ? 'Family' : 'Mailkeep'} answered: ${answer}`;
  }
  if (event.type === 'marked_paid') return 'Family marked this paid';
  if (event.type === 'closed') return 'Case closed';
  if (event.type === 'reopened') return 'Case reopened';
  if (event.type === 'reminder_received') return 'Second notice received';
  if (event.type === 'contradiction') return 'Past-due notice after a paid mark';
  return `${event.actor === 'member' ? 'Family' : 'Mailkeep'} · ${event.type.replaceAll('_', ' ')}`;
}

export function Thread({ data, demo = false }: { data: CaseDTO; demo?: boolean }) {
  const items: ThreadItem[] = [
    ...data.letters.map((letter) => ({
      type: 'letter' as const,
      date: letter.receivedAt,
      letter,
    })),
    ...data.events.map((event) => ({ type: 'event' as const, date: event.createdAt, event })),
  ].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));

  return (
    <div className="thread">
      {items.map((item) => {
        if (item.type === 'event') {
          return (
            <div className="thread__event mono" key={`event-${item.event.id}`}>
              <span>{dateFormat.format(new Date(item.date))}</span> · {eventLabel(item.event)}
            </div>
          );
        }
        const relations = data.relations.filter((relation) => relation.letterId === item.letter.id);
        return (
          <div className="thread__letter" key={`letter-${item.letter.id}`}>
            <Slip letter={item.letter} to={`${demo ? '/demo' : ''}/letters/${item.letter.id}`} />
            {relations.map((relation) => (
              <p className="thread__relation mono" key={relation.id}>
                {relationLabel(relation, data.accountTail)}
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
