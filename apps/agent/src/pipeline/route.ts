import { type CaseStatus, KINDS, type Kind, type Lane, type Relation, T } from '@mailkeep/shared';

export interface RouteAnswer {
  type: 'noul' | 'choice';
  noul?: number;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
}

export interface RoutePast {
  letterId: string;
  caseId: string | null;
  caseStatus: CaseStatus | null;
  kind: Kind | null;
  lane: Lane | null;
  receivedAt: string;
  senderOrg: string | null;
  accountTail: string | null;
}

export interface RouteInput {
  letterId: string;
  today: string;
  senderOrg: string | null;
  accountTail?: string | null;
  title: string;
  qualityFlagged: boolean;
  r2Failed: boolean;
  scamRuleHits: string[];
  answers: Record<string, RouteAnswer>;
  past: RoutePast[];
  amountCandidates: Array<{ id: string; amountCents: number }>;
  dateCandidates: Array<{ id: string; iso: string }>;
  forced?: { kind?: Kind; linkLetterId?: string; rejectLinkLetterId?: string; scam?: boolean };
}

export interface RouteCheck {
  key: string;
  label: string;
  qtype: 'noul' | 'choice' | 'code';
  answer: string;
  probability: number | null;
  confidence: number | null;
  threshold: number | null;
  outcome: string;
}

export interface RouteRelation {
  otherLetterId: string;
  relation: Relation;
  probability: number;
  status: 'accepted' | 'asked' | 'rejected';
}

export interface RouteAsk {
  qtype: 'link' | 'paid' | 'scam' | 'kind' | 'check' | 'retake';
  question: string;
  evidence: string;
  options: Array<{ value: string; label: string }>;
}

export interface CaseChange {
  action: 'open' | 'update' | 'paid' | 'watch' | 'reopen';
  caseId: string | null;
  title: string;
  counterparty: string;
  accountTail?: string | null;
  kind: Kind;
  status: CaseStatus;
  amountCents: number | null;
  dueDate: string | null;
  secondNotice: boolean;
  contradiction: boolean;
}

export interface RouteOutput {
  lane: Lane;
  kind: Kind | null;
  amountCents: number | null;
  dueDate: string | null;
  relations: RouteRelation[];
  caseChange: CaseChange | null;
  asks: RouteAsk[];
  notes: string[];
  checks: RouteCheck[];
  familyAlert: boolean;
}

const LABELS: Record<string, string> = {
  kind: 'Kind of letter',
  needs_action: 'Needs action',
  scam_payment: 'Scam payment method',
  scam_pressure: 'Scam pressure',
  scam_impersonation: 'Government impersonation',
  scam_secrecy: 'Scam secrecy',
  scam_prize_fee: 'Prize fee',
  amount_due: 'Amount due',
  due_date: 'Due date',
};

function noul(answers: Record<string, RouteAnswer>, key: string): number {
  const answer = answers[key];
  return answer?.type === 'noul' ? (answer.noul ?? 0) : 0;
}

function choice(answers: Record<string, RouteAnswer>, key: string) {
  const answer = answers[key];
  if (answer?.type !== 'choice') return { value: null, confidence: 0, probabilities: {} };
  return {
    value: answer.choice ?? null,
    confidence: answer.confidence ?? 0,
    probabilities: answer.probabilities ?? {},
  };
}

function daysLeft(today: string, dueDate: string): number {
  const start = Date.parse(`${today}T00:00:00Z`);
  const end = Date.parse(`${dueDate}T00:00:00Z`);
  return Math.floor((end - start) / 86_400_000);
}

function checkOutcome(
  key: string,
  answer: RouteAnswer | undefined,
): { threshold: number | null; outcome: string } {
  const probability = answer?.type === 'noul' ? (answer.noul ?? null) : null;
  if (key.startsWith('same_matter_')) {
    return {
      threshold: T.linkAccept,
      outcome:
        probability === null
          ? 'missing'
          : probability >= T.linkAccept
            ? 'linked'
            : probability >= T.linkAsk
              ? 'ask link'
              : 'no link',
    };
  }
  if (key.startsWith('follow_up_')) {
    return { threshold: T.followUp, outcome: (probability ?? 0) >= T.followUp ? 'reminder' : 'no' };
  }
  if (key.startsWith('completes_')) {
    return {
      threshold: T.completesAccept,
      outcome:
        (probability ?? 0) >= T.completesAccept
          ? 'paid signal'
          : (probability ?? 0) >= T.completesAsk
            ? 'ask paid'
            : 'no',
    };
  }
  if (key.startsWith('sender_consistent_')) {
    return {
      threshold: T.senderInconsistent,
      outcome: (probability ?? 1) < T.senderInconsistent ? 'sender mismatch' : 'consistent',
    };
  }
  if (key.startsWith('scam_')) {
    return {
      threshold: T.scamAny,
      outcome: (probability ?? 0) >= T.scamAny ? 'careful' : 'no hit',
    };
  }
  if (key === 'needs_action') {
    return {
      threshold: T.needsAction,
      outcome: (probability ?? 0) >= T.needsAction ? 'action' : 'quiet',
    };
  }
  if (key === 'amount_due' || key === 'due_date') {
    return {
      threshold: T.fieldConfidence,
      outcome: (answer?.confidence ?? 0) >= T.fieldConfidence ? 'use field' : 'do not use',
    };
  }
  if (key === 'kind') {
    const best = Math.max(0, ...Object.values(answer?.probabilities ?? {}));
    return { threshold: T.kindAccept, outcome: best >= T.kindAccept ? 'accepted' : 'ask kind' };
  }
  return { threshold: null, outcome: 'recorded' };
}

function buildChecks(input: RouteInput): RouteCheck[] {
  return Object.entries(input.answers).map(([key, answer]) => {
    const verdict = checkOutcome(key, answer);
    const probability =
      answer.type === 'noul'
        ? (answer.noul ?? null)
        : answer.choice
          ? (answer.probabilities?.[answer.choice] ?? null)
          : null;
    return {
      key,
      label: LABELS[key] ?? key.replace(/_\d+$/, '').replaceAll('_', ' '),
      qtype: answer.type,
      answer:
        answer.type === 'choice' ? (answer.choice ?? 'missing') : String(probability ?? 'missing'),
      probability,
      confidence: answer.confidence ?? null,
      threshold: verdict.threshold,
      outcome: verdict.outcome,
    };
  });
}

export function route(input: RouteInput): RouteOutput {
  const asks: RouteAsk[] = [];
  const notes: string[] = [];
  const relations: RouteRelation[] = [];
  const counterparty = input.senderOrg ?? 'Unknown sender';
  const kindChoice = choice(input.answers, 'kind');
  const forcedKind = input.forced?.kind;
  const kindUncertain =
    !forcedKind &&
    (!kindChoice.value || Math.max(0, ...Object.values(kindChoice.probabilities)) < T.kindAccept);
  const kind = forcedKind ?? (kindUncertain ? null : (kindChoice.value as Kind));
  const amountChoice = choice(input.answers, 'amount_due');
  const dueChoice = choice(input.answers, 'due_date');
  const selectedAmount =
    amountChoice.confidence >= T.fieldConfidence &&
    amountChoice.value &&
    amountChoice.value !== 'none'
      ? (input.amountCandidates.find((candidate) => candidate.id === amountChoice.value)
          ?.amountCents ?? null)
      : null;
  const selectedDue =
    dueChoice.confidence >= T.fieldConfidence && dueChoice.value && dueChoice.value !== 'none'
      ? (input.dateCandidates.find((candidate) => candidate.id === dueChoice.value)?.iso ?? null)
      : null;

  const candidates = input.past
    .map((past, index) => ({
      past,
      index,
      probability: noul(input.answers, `same_matter_${index}`),
    }))
    .sort((left, right) => right.probability - left.probability);
  const forcedCandidate = input.forced?.linkLetterId
    ? candidates.find((candidate) => candidate.past.letterId === input.forced?.linkLetterId)
    : undefined;
  const accepted =
    forcedCandidate ??
    candidates.find(
      (candidate) =>
        candidate.past.letterId !== input.forced?.rejectLinkLetterId &&
        candidate.probability >= T.linkAccept,
    );
  const askCandidate = accepted
    ? undefined
    : candidates.find(
        (candidate) =>
          candidate.past.letterId !== input.forced?.rejectLinkLetterId &&
          candidate.probability >= T.linkAsk,
      );
  const linked = accepted?.past;
  const linkedIndex = accepted?.index;

  if (accepted && linked) {
    relations.push({
      otherLetterId: linked.letterId,
      relation: 'same_matter',
      probability: accepted.probability,
      status: 'accepted',
    });
    if (noul(input.answers, `follow_up_${accepted.index}`) >= T.followUp) {
      relations.push({
        otherLetterId: linked.letterId,
        relation: 'follow_up',
        probability: noul(input.answers, `follow_up_${accepted.index}`),
        status: 'accepted',
      });
    }
    const completes = noul(input.answers, `completes_${accepted.index}`);
    if (completes >= T.completesAccept) {
      relations.push({
        otherLetterId: linked.letterId,
        relation: 'completes',
        probability: completes,
        status: 'accepted',
      });
    } else if (completes >= T.completesAsk) {
      asks.push({
        qtype: 'paid',
        question: `Was the ${linked.senderOrg ?? counterparty} ${linked.kind ?? 'letter'} paid?`,
        evidence: `completion probability ${completes.toFixed(2)} is below ${T.completesAccept.toFixed(2)}`,
        options: [
          { value: 'paid', label: 'Paid' },
          { value: 'not_paid', label: 'Not paid' },
          { value: 'not_ours', label: 'Not ours' },
        ],
      });
    }
    const senderAnswer = input.answers[`sender_consistent_${accepted.index}`];
    const senderConsistent = senderAnswer?.type === 'noul' ? (senderAnswer.noul ?? null) : null;
    if (
      accepted.probability >= T.linkAsk &&
      senderConsistent !== null &&
      senderConsistent < T.senderInconsistent &&
      linked.lane !== 'careful'
    ) {
      relations.push({
        otherLetterId: linked.letterId,
        relation: 'sender_mismatch',
        probability: senderConsistent,
        status: 'accepted',
      });
    }
  } else if (askCandidate) {
    relations.push({
      otherLetterId: askCandidate.past.letterId,
      relation: 'same_matter',
      probability: askCandidate.probability,
      status: 'asked',
    });
    asks.push({
      qtype: 'link',
      question: `Is this about the same ${askCandidate.past.senderOrg ?? counterparty} ${askCandidate.past.kind ?? 'matter'} as the letter from ${askCandidate.past.receivedAt.slice(0, 10)}?`,
      evidence: `same-matter probability ${askCandidate.probability.toFixed(2)} is below ${T.linkAccept.toFixed(2)}`,
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    });
  }

  const followUp = linked
    ? noul(input.answers, `follow_up_${linkedIndex ?? 0}`) >= T.followUp
    : false;
  const completes = linked
    ? noul(input.answers, `completes_${linkedIndex ?? 0}`) >= T.completesAccept
    : false;
  const linkedSenderAnswer = linked
    ? input.answers[`sender_consistent_${linkedIndex ?? 0}`]
    : undefined;
  const senderMismatch = linked
    ? linkedSenderAnswer?.type === 'noul' &&
      (linkedSenderAnswer.noul ?? 1) < T.senderInconsistent &&
      linked.lane !== 'careful'
    : false;
  const scam =
    input.forced?.scam ??
    (Object.entries(input.answers).some(
      ([key, answer]) =>
        key.startsWith('scam_') && answer.type === 'noul' && (answer.noul ?? 0) >= T.scamAny,
    ) ||
      input.scamRuleHits.length > 0 ||
      senderMismatch);

  let lane: Lane = 'needs_you';
  let amountCents: number | null = selectedAmount;
  let dueDate: string | null = selectedDue;
  let caseChange: CaseChange | null = null;
  let familyAlert = false;
  const baseCase = {
    caseId: linked?.caseId ?? null,
    title: input.title,
    counterparty,
    accountTail: input.accountTail ?? null,
    kind: kind ?? linked?.kind ?? 'other',
    amountCents,
    dueDate,
    secondNotice: false,
    contradiction: false,
  } as const;

  if (linked && followUp && (linked.caseStatus === 'paid' || linked.caseStatus === 'closed')) {
    relations.push({
      otherLetterId: linked.letterId,
      relation: 'contradicts',
      probability: noul(input.answers, `follow_up_${linkedIndex ?? 0}`),
      status: 'accepted',
    });
    lane = 'needs_you';
    caseChange = {
      ...baseCase,
      action: 'reopen',
      status: 'open',
      secondNotice: true,
      contradiction: true,
    };
    notes.push('Past-due notice for a bill marked paid.');
    familyAlert = true;
  } else if (scam) {
    lane = 'careful';
    amountCents = null;
    dueDate = null;
    caseChange = {
      ...baseCase,
      action: 'watch',
      title: `Careful: ${counterparty}`,
      status: 'watch',
      amountCents: null,
      dueDate: null,
    };
    notes.push('This letter looks like a scam. Do not pay or call the number on it.');
    familyAlert = true;
  } else if (
    linked &&
    followUp &&
    (linked.caseStatus === 'open' || linked.caseStatus === 'overdue')
  ) {
    lane = 'needs_you';
    caseChange = { ...baseCase, action: 'update', status: linked.caseStatus, secondNotice: true };
    notes.push('Second notice for this bill.');
    familyAlert = true;
  } else if (linked && completes) {
    lane = 'handled';
    amountCents = null;
    caseChange = { ...baseCase, action: 'paid', status: 'paid', amountCents: null };
    notes.push(`Good news: ${counterparty} says it was paid.`);
  } else if (kindUncertain) {
    lane = 'needs_you';
    asks.push({
      qtype: 'kind',
      question: 'What kind of letter is this?',
      evidence: `highest kind probability ${Math.max(0, ...Object.values(kindChoice.probabilities)).toFixed(2)} is below ${T.kindAccept.toFixed(2)}`,
      options: KINDS.map((value) => ({ value, label: value.replaceAll('_', ' ') })),
    });
  } else {
    const marketing = kindChoice.probabilities.marketing ?? 0;
    const info = Math.max(
      kindChoice.probabilities.statement ?? 0,
      kindChoice.probabilities.payment_confirmation ?? 0,
      kindChoice.probabilities.personal ?? 0,
    );
    const needsAction = noul(input.answers, 'needs_action');
    if (marketing >= T.junk && needsAction < 0.3 && amountCents === null) {
      lane = 'handled';
      notes.push('Filed in Other mail.');
    } else if (info >= T.infoQuiet && needsAction < 0.5) {
      lane = 'handled';
      notes.push('Nothing needed the family.');
    } else if (
      kind &&
      ['bill', 'renewal', 'appointment', 'government', 'collection'].includes(kind) &&
      needsAction >= T.needsAction
    ) {
      const remaining = dueDate ? daysLeft(input.today, dueDate) : null;
      const needsYou =
        kind === 'government' ||
        kind === 'collection' ||
        (amountCents !== null && amountCents >= T.bigAmountCents) ||
        ((kind === 'bill' || kind === 'renewal') && dueDate === null) ||
        (remaining !== null && remaining <= T.dueSoonDays);
      lane = needsYou ? 'needs_you' : 'headsup';
      caseChange = {
        ...baseCase,
        action: linked?.caseId ? 'update' : 'open',
        status: 'open',
        kind,
      };
      notes.push(needsYou ? 'This needs a family member.' : 'A reminder is enough.');
    } else {
      lane = 'needs_you';
      asks.push({
        qtype: 'check',
        question: 'Can you look at this one?',
        evidence: 'The letter did not match a safe automatic route.',
        options: [
          { value: 'handled_it', label: 'Handled it' },
          { value: 'not_ours', label: 'Not ours' },
          { value: 'scam', label: 'Scam' },
        ],
      });
    }
  }

  if (input.qualityFlagged || input.r2Failed) {
    const reviewCaseChange = caseChange && caseChange.action !== 'watch';
    if (lane === 'handled' || reviewCaseChange) {
      if (lane === 'handled') lane = 'needs_you';
      caseChange = null;
      asks.push({
        qtype: 'check',
        question: 'Can you check this letter?',
        evidence: input.qualityFlagged
          ? 'The photo quality was flagged.'
          : 'The summary step failed.',
        options: [
          { value: 'handled_it', label: 'Handled it' },
          { value: 'not_ours', label: 'Not ours' },
          { value: 'scam', label: 'Scam' },
        ],
      });
    }
  }

  if (lane === 'needs_you' && asks.length === 0 && !familyAlert) familyAlert = true;
  if (scam) amountCents = null;
  return {
    lane,
    kind,
    amountCents,
    dueDate,
    relations,
    caseChange,
    asks,
    notes,
    checks: buildChecks(input),
    familyAlert,
  };
}
