export const T = {
  scamAny: 0.5, // any scam_* noul ≥ → CAREFUL
  senderInconsistent: 0.3, // sender_consistent_i < this, with same_matter_i ≥ 0.5 → sender_mismatch → CAREFUL
  linkAccept: 0.85, // same_matter_i ≥ → link to past[i]'s case
  linkAsk: 0.5, // 0.5 ≤ p < 0.85 → Ask(link)
  followUp: 0.8, // follow_up_i ≥ (on the linked letter) → reminder
  completesAccept: 0.9, // completes_i ≥ → paid signal closes the case
  completesAsk: 0.6, // 0.6 ≤ p < 0.9 → Ask(paid)
  kindAccept: 0.6, // max kind probability below → Ask(kind)
  junk: 0.9, // P(marketing) ≥ and needs_action < 0.3 and no amount → handled
  infoQuiet: 0.85, // P(statement|payment_confirmation|personal) ≥ and needs_action < 0.5 → handled
  needsAction: 0.6,
  fieldConfidence: 0.7, // amount_due / due_date choice confidence ≥ → use it
  bigAmountCents: 50000, // ≥ $500 → needs_you
  dueSoonDays: 7,
  thresholdsVersion: '2026-11-24.2',
} as const;
