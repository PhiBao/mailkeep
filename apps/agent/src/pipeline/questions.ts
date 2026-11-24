import type { Kind, Lane } from '@mailkeep/shared';

export interface DecisionNew {
  sender: string | null;
  claimsGovernment: boolean;
  text: string;
  phones: string[];
}

export interface DecisionPast {
  id: string;
  received: string;
  sender: string | null;
  kind: Kind | null;
  caseStatus: string;
  amount: string | null;
  due: string | null;
  lane: Lane | null;
  text: string;
  phones: string[];
}

export interface AmountCandidate {
  id: string;
  text: string;
  context: string;
}

export interface DateCandidate {
  id: string;
  iso: string;
  text: string;
  context: string;
}

export interface QuestionInput {
  today: string;
  new: DecisionNew;
  past: DecisionPast[];
  amountCandidates: AmountCandidate[];
  dateCandidates: DateCandidate[];
}

const KIND_CRITERIA: Record<Kind, string> = {
  bill: 'asks the recipient to pay an amount',
  statement: 'account statement or explanation of benefits that is not a request for payment',
  renewal: 'a policy, registration or membership that must be renewed',
  appointment: 'a date the recipient must attend, such as an appointment or jury duty',
  government: 'a tax, benefits or legal notice from a government office',
  collection: 'a debt collector or past-due demand',
  payment_confirmation: 'confirms a payment was received or an account is paid',
  marketing: 'an advert, offer, catalog, prize notice or donation request',
  personal: 'a personal letter or card',
  other: 'none of these',
};

export function buildRequest(input: QuestionInput, model: string) {
  const questions: Record<string, unknown> = {
    kind: {
      type: 'choice',
      instructions: 'What kind of letter is `new`?',
      criteria: KIND_CRITERIA,
    },
    needs_action: {
      type: 'noul',
      instructions:
        'The recipient of `new` must do something because of it: pay, reply, call, sign, renew or attend.',
    },
    scam_payment: {
      type: 'noul',
      instructions:
        '`new` asks to be paid with gift cards, cryptocurrency, a wire transfer or a payment app.',
    },
    scam_pressure: {
      type: 'noul',
      instructions:
        '`new` threatens arrest, loss of benefits or loss of property unless the recipient responds immediately.',
    },
    scam_impersonation: {
      type: 'noul',
      instructions:
        '`new` is designed to look like it comes from a government office, but it comes from a private company or says it is not affiliated with the government.',
    },
    scam_secrecy: {
      type: 'noul',
      instructions: '`new` tells the recipient not to tell their bank, family or anyone else.',
    },
    scam_prize_fee: {
      type: 'noul',
      instructions:
        '`new` says the recipient won a prize or money and must pay a fee to receive it.',
    },
  };

  if (input.amountCandidates.length > 0) {
    questions.amount_due = {
      type: 'choice',
      instructions: 'Which amount in `amount_candidates` must the recipient pay because of `new`?',
      criteria: {
        ...Object.fromEntries(
          input.amountCandidates.map((candidate) => [
            candidate.id,
            `${candidate.text} — ${candidate.context}`,
          ]),
        ),
        none: '`new` does not ask the recipient to pay any amount',
      },
    };
  }
  if (input.dateCandidates.length > 0) {
    questions.due_date = {
      type: 'choice',
      instructions:
        'Which date in `date_candidates` is the deadline the recipient must act by because of `new`?',
      criteria: {
        ...Object.fromEntries(
          input.dateCandidates.map((candidate) => [
            candidate.id,
            `${candidate.text} — ${candidate.context}`,
          ]),
        ),
        none: '`new` states no deadline for the recipient',
      },
    };
  }

  input.past.forEach((past, index) => {
    questions[`same_matter_${index}`] = {
      type: 'noul',
      instructions: `\`new\` and \`past[${index}]\` concern the same underlying account, member, policy, parcel or case. Answer true when the identifiers or subject match, even if the sender name or letter kind differs; answer false for a different account or matter.`,
    };
    questions[`follow_up_${index}`] = {
      type: 'noul',
      instructions: `\`new\` is a reminder, second notice, past-due notice or final notice about the same payment or request as \`past[${index}]\`.`,
    };
    questions[`completes_${index}`] = {
      type: 'noul',
      instructions: `\`new\` confirms that the payment or request in \`past[${index}]\` has been received, paid or completed.`,
    };
    if (past.lane !== 'careful') {
      questions[`sender_consistent_${index}`] = {
        type: 'noul',
        instructions: `\`new\` and \`past[${index}]\` come from the same real organisation, with matching return address, phone numbers and account number format.`,
      };
    }
  });

  return {
    model,
    state: {
      today: input.today,
      new: {
        sender: input.new.sender,
        claims_government: input.new.claimsGovernment,
        text: input.new.text.slice(0, 6000),
        phones: input.new.phones,
      },
      past: input.past.map((past) => ({
        id: past.id,
        received: past.received,
        sender: past.sender,
        kind: past.kind,
        case_status: past.caseStatus,
        amount: past.amount,
        due: past.due,
        lane: past.lane,
        text: past.text.slice(0, 600),
        phones: past.phones,
      })),
      amount_candidates: input.amountCandidates,
      date_candidates: input.dateCandidates,
    },
    questions,
  };
}
