/**
 * Transcript renderer — turns a PlannerRun into human-readable output
 * for stdout and for blog-post screenshots. Intentionally plain text;
 * the hosted demo's React UI consumes the structured PlannerRun directly.
 */

import type { PlannerRun, TranscriptStep } from "../agent/planner";

export function renderTranscript(run: PlannerRun): string {
  const lines: string[] = [];
  lines.push("=== grant-pilot transcript ===");
  lines.push("");
  lines.push(`Intent: ${run.summary.intent}`);
  lines.push("");

  for (const step of run.steps) {
    lines.push(...renderStep(step));
    lines.push("");
  }

  lines.push("--- Summary ---");
  for (const item of run.summary.shortlist) {
    const verdict = item.verdict === "not-checked" ? "(not checked)" : item.verdict.toUpperCase();
    lines.push(`  [${verdict.padEnd(12)}] ${item.score.toString().padStart(3)}  ${item.opportunityNumber} — ${item.title}`);
    for (const b of item.blockers) lines.push(`      blocker: ${b}`);
  }
  lines.push("");
  lines.push(`Drafted for: ${run.summary.draftFor ?? "(none)"}`);
  lines.push(`Total cost:  $${run.summary.totalCostUSD.toFixed(4)}`);
  lines.push(`Total time:  ${run.summary.totalLatencyMs}ms`);
  return lines.join("\n");
}

function renderStep(step: TranscriptStep): string[] {
  if (step.kind === "decision") {
    return [`[decision] ${step.message}`];
  }

  if (step.kind === "discovery") {
    const r = step.envelope.result;
    const prov = step.envelope.provenance;
    const head = `[discovery] ${prov.rung}/${prov.model} · ${prov.latencyMs}ms · $${prov.costUSD.toFixed(4)}`;
    if (r.kind === "error") return [head, `  error: ${r.message}`];
    if (r.kind === "empty")
      return [head, `  query: "${r.query}" — no hits`, `  rationale: ${r.queryRationale}`];
    const out = [head, `  query: "${r.query}"`, `  rationale: ${r.queryRationale}`, `  candidates:`];
    for (const c of r.candidates) {
      out.push(`    ${c.score.toString().padStart(3)}  ${c.opportunityNumber} — ${c.title}`);
      out.push(`         ${c.rationale}`);
    }
    return out;
  }

  if (step.kind === "eligibility") {
    const r = step.envelope.result;
    const prov = step.envelope.provenance;
    const head = `[eligibility] ${step.opportunityNumber} · ${prov.rung}/${prov.model} · ${prov.latencyMs}ms · $${prov.costUSD.toFixed(4)}`;
    if (r.kind === "error") return [head, `  error: ${r.message}`];
    const out = [head, `  verdict: ${r.verdict.toUpperCase()}`];
    for (const reason of r.reasons) out.push(`  - ${reason}`);
    for (const b of r.blockers) out.push(`  ! blocker: ${b}`);
    if (r.notes) out.push(`  notes: ${r.notes}`);
    out.push(`  sam: ${r.samRegistration.message}`);
    return out;
  }

  // drafter
  const r = step.envelope.result;
  const prov = step.envelope.provenance;
  const head = `[drafter] ${step.opportunityNumber} · ${prov.rung}/${prov.model} · ${prov.latencyMs}ms · $${prov.costUSD.toFixed(4)}`;
  if (r.kind === "error") return [head, `  error: ${r.message}`];
  const out = [head, `  summary: ${r.summary}`, `  sections:`];
  for (const s of r.sections) {
    out.push(`    # ${s.heading}`);
    out.push(`      ${s.guidance}`);
    for (const p of s.promptsForApplicant) out.push(`      - ${p}`);
  }
  if (r.watchOuts.length > 0) {
    out.push(`  watch-outs:`);
    for (const w of r.watchOuts) out.push(`    ! ${w}`);
  }
  return out;
}
