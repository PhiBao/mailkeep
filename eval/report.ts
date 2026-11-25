export interface TruthLink {
  to: string;
  relation: string;
  optional?: boolean;
}

export interface LetterTruth {
  kind_ok: string[];
  lanes_ok: string[];
  needs_action: boolean;
  amount_cents: number | null;
  due_date: string | null;
  scam: boolean;
  links: TruthLink[];
  closes: string | null;
}

export interface EvalLetterResult {
  id: string;
  letterId: string;
  truth: LetterTruth;
  lane: string | null;
  kind: string | null;
  amountCents: number | null;
  dueDate: string | null;
  relations: Array<{ to: string; relation: string }>;
  asks: string[];
  status: string;
  error: string | null;
  costMicrousd: number;
  latencyMs: number;
}

export interface EvalMetrics {
  letters: number;
  laneAccuracy: number;
  unsafe: number;
  falseAlarms: number;
  scamsCaught: number;
  scamsTotal: number;
  linkPrecision: number;
  linkRecall: number;
  amountAccuracy: number;
  dueAccuracy: number;
  askRate: number;
  averageCostMicrousd: number;
  averageLatencyMs: number;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

export function computeMetrics(results: EvalLetterResult[]): EvalMetrics {
  const laneCorrect = results.filter((result) =>
    result.truth.lanes_ok.includes(result.lane ?? ''),
  ).length;
  const unsafe = results.filter(
    (result) =>
      (result.truth.scam && ['handled', 'headsup'].includes(result.lane ?? '')) ||
      (result.truth.needs_action &&
        result.truth.amount_cents !== null &&
        result.lane === 'handled'),
  ).length;
  const falseAlarms = results.filter(
    (result) => !result.truth.scam && result.lane === 'careful',
  ).length;
  const scams = results.filter((result) => result.truth.scam);
  const scamsCaught = scams.filter((result) => result.lane === 'careful').length;

  let correctLinks = 0;
  let predictedLinks = 0;
  let requiredLinks = 0;
  for (const result of results) {
    const predicted = new Map<string, Set<string>>();
    for (const relation of result.relations) {
      const set = predicted.get(relation.to) ?? new Set<string>();
      set.add(relation.relation);
      predicted.set(relation.to, set);
    }
    predictedLinks += predicted.size;
    for (const link of result.truth.links.filter((item) => !item.optional)) {
      requiredLinks += 1;
      if (predicted.get(link.to)?.has(link.relation)) correctLinks += 1;
    }
  }

  const amountTruth = results.filter((result) => result.truth.amount_cents !== null);
  const dueTruth = results.filter((result) => result.truth.due_date !== null);
  const amountCorrect = amountTruth.filter(
    (result) => result.amountCents === result.truth.amount_cents,
  ).length;
  const dueCorrect = dueTruth.filter((result) => result.dueDate === result.truth.due_date).length;
  const uncertaintyAsks = results.filter(
    (result) =>
      result.lane === 'needs_you' &&
      result.asks.some((ask) => ['link', 'kind', 'check'].includes(ask)),
  ).length;

  return {
    letters: results.length,
    laneAccuracy: ratio(laneCorrect, results.length),
    unsafe,
    falseAlarms,
    scamsCaught,
    scamsTotal: scams.length,
    linkPrecision: ratio(correctLinks, predictedLinks),
    linkRecall: ratio(correctLinks, requiredLinks),
    amountAccuracy: ratio(amountCorrect, amountTruth.length),
    dueAccuracy: ratio(dueCorrect, dueTruth.length),
    askRate: ratio(uncertaintyAsks, results.length),
    averageCostMicrousd: Math.round(
      results.reduce((sum, result) => sum + result.costMicrousd, 0) / Math.max(1, results.length),
    ),
    averageLatencyMs: Math.round(
      results.reduce((sum, result) => sum + result.latencyMs, 0) / Math.max(1, results.length),
    ),
  };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const TUNING_LOG = `| Round | Changes | Lane | Link precision | Link recall | Amount exact | Due exact | False alarms | Never unsafe |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Baseline (2026-11-24.1) | A§9/A§10 starting wording and thresholds | 63.3% | 38.9% | 77.8% | 22.2% | 77.8% | 5 | 30/30 |
| Round 1 (2026-11-24.2) | Specific same-matter evidence; required-action and scam wording; field confidence 0.80 → 0.70 | 73.3% | 70.0% | 77.8% | 44.4% | 66.7% | 5 | 30/30 |
| Round 2 (2026-11-24.3, final) | Contextual gift-card rule; retire unsupported impersonation judgment; explicit amount/deadline and quiet-mail wording; infoQuiet 0.85 → 0.75; non-thinking bounded OCR | 96.7% | 72.7% | 88.9% | 11.1% | 88.9% | 1 | 30/30 |

Round 2 removed the L16 timeout but exposed two unresolved quality gaps: same_matter sometimes selects an older letter (L03 → L01 instead of L02), and the more explicit amount question lowered choice confidence below the 0.70 field gate on eight payable letters. The two-round tuning budget is exhausted; no further prompt or threshold changes are allowed before the held-out run.
`;

export function renderEvalMarkdown(input: {
  runId: string;
  generatedAt: string;
  heldout: boolean;
  metrics: EvalMetrics;
  results: EvalLetterResult[];
  modelIds: string[];
  thresholdsVersion: string;
  previousMarkdown?: string | undefined;
}): string {
  const failures = input.results.flatMap((result) => {
    const reasons: string[] = [];
    if (!result.truth.lanes_ok.includes(result.lane ?? ''))
      reasons.push(`lane ${result.lane ?? 'missing'}`);
    if (result.truth.scam && result.lane !== 'careful') reasons.push('scam not caught');
    if (!result.truth.scam && result.lane === 'careful') reasons.push('false scam alarm');
    if (result.truth.amount_cents !== null && result.amountCents !== result.truth.amount_cents)
      reasons.push('amount mismatch');
    if (result.truth.due_date !== null && result.dueDate !== result.truth.due_date)
      reasons.push('due mismatch');
    for (const link of result.truth.links.filter((item) => !item.optional)) {
      if (
        !result.relations.some((item) => item.to === link.to && item.relation === link.relation)
      ) {
        reasons.push(`missing ${link.relation} → ${link.to}`);
      }
    }
    return reasons.length > 0 ? [`| ${result.id} | ${reasons.join('; ')} |`] : [];
  });

  const markdown = `# Mailkeep EVAL\n\n- Run: \`${input.runId}\`\n- Generated: ${input.generatedAt}\n- Split: ${input.heldout ? 'held-out (run once, untuned)' : 'non-held-out'}\n- Models: ${input.modelIds.map((model) => `\`${model}\``).join(', ')}\n- Thresholds: \`${input.thresholdsVersion}\`\n\n${input.heldout ? '' : `## Tuning log\n\n${TUNING_LOG}\n\nHeld-out letters were not used for any tuning round.\n`}\n## Targets\n\n- Never unsafe: ${input.metrics.letters}/${input.metrics.letters}\n- Scams caught: ${input.metrics.scamsTotal}/${input.metrics.scamsTotal}\n- Link precision ≥ 0.90; recall ≥ 0.80\n- Lane accuracy ≥ 0.85\n- Ask rate ≤ 0.25\n\n## Summary\n\n| Metric | Result |\n|---|---:|\n| Letters | ${input.metrics.letters} |\n| Lane accuracy | ${pct(input.metrics.laneAccuracy)} |\n| Never unsafe | ${input.metrics.letters - input.metrics.unsafe}/${input.metrics.letters} |\n| False scam alarms | ${input.metrics.falseAlarms} |\n| Scams caught | ${input.metrics.scamsCaught}/${input.metrics.scamsTotal} |\n| Link precision | ${pct(input.metrics.linkPrecision)} |\n| Link recall | ${pct(input.metrics.linkRecall)} |\n| Amount exact | ${pct(input.metrics.amountAccuracy)} |\n| Due exact | ${pct(input.metrics.dueAccuracy)} |\n| Ask rate | ${pct(input.metrics.askRate)} |\n| Average cost | $${(input.metrics.averageCostMicrousd / 1_000_000).toFixed(4)} |\n| Average decision latency | ${input.metrics.averageLatencyMs} ms |\n\n## Letters\n\n| ID | Lane | Kind | Amount | Due | Relations | Asks | Cost (µ$) | Latency (ms) |\n|---|---|---|---:|---|---|---|---:|---:|\n${input.results.map((result) => `| ${result.id} | ${result.lane ?? '—'} | ${result.kind ?? '—'} | ${result.amountCents ?? '—'} | ${result.dueDate ?? '—'} | ${result.relations.map((item) => `${item.relation}→${item.to}`).join(', ') || '—'} | ${result.asks.join(', ') || '—'} | ${result.costMicrousd} | ${result.latencyMs} |`).join('\n')}\n\n## Failures\n\n| Letter | Reason |\n|---|---|\n${failures.length > 0 ? failures.join('\n') : '| — | None |'}\n`;
  if (input.heldout && input.previousMarkdown?.trim()) {
    const section = markdown.replace('# Mailkeep EVAL', '## Held-out (run once, untuned)');
    return `${input.previousMarkdown.trim()}\n\n${section}`;
  }
  return markdown;
}
