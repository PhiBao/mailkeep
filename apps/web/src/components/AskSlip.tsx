import type { AskDTO } from '@mailkeep/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Stamp } from './Stamp.js';

export interface AskSlipProps {
  ask: AskDTO;
  busy?: boolean;
  readOnly?: boolean;
  demo?: boolean;
  onAnswer: (askId: string, answer: string) => Promise<void>;
}

export function AskSlip({
  ask,
  busy = false,
  readOnly = false,
  demo = false,
  onAnswer,
}: AskSlipProps) {
  const [pending, setPending] = useState(false);
  const disabled = busy || pending || readOnly;
  async function answer(value: string): Promise<void> {
    setPending(true);
    try {
      await onAnswer(ask.id, value);
    } finally {
      setPending(false);
    }
  }
  return (
    <article className="ask-slip" data-testid={`ask-${ask.id}`}>
      <div className="ask-slip__heading">
        <div>
          {ask.letterId ? (
            <Link className="meta" to={`${demo ? '/demo' : ''}/letters/${ask.letterId}`}>
              {ask.letterTitle}
            </Link>
          ) : (
            <span className="meta">{ask.letterTitle}</span>
          )}
          <h3>{ask.question}</h3>
        </div>
        <Stamp lane="needs_you" />
      </div>
      <p className="ask-slip__evidence mono">{ask.evidence}</p>
      <div className="ask-slip__actions">
        {ask.options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            className={index === 0 ? 'button--primary' : 'button--secondary'}
            disabled={disabled}
            title={readOnly ? 'Demo is read-only' : undefined}
            onClick={() => void answer(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </article>
  );
}
