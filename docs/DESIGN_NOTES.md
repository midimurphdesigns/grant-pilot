# Design notes

Non-obvious calls and the reasoning behind them. Things a reviewer would otherwise have to reverse-engineer from the code.

## The drafter doesn't write prose

Every section the drafter emits has guidance + applicant-prompts, not prose. The reasoning is in ADR-007: federal grant applications require verifiable claims and applicant-specific voice, both of which LLMs hallucinate. The agent's job is to compress the reading work (parse the NOFO, surface what it asks for, structure the response) — not to write *as* the applicant.

This is a deliberate honesty signal. "AI writes your grant for you" is an easier marketing line; it would also be a worse product.

## Discovery uses 2–4 broad keywords, not specific phrases

The first version of the discovery prompt produced queries like `"commercial construction infrastructure small contractor Arizona Phoenix metro"`. Zero useful hits.

grants.gov's keyword index does **strict AND-matching** — every term must appear in the opportunity. Long queries get zero matches. The fix was to instruct the prompt to emit 2–4 of the most distinctive nouns, drop geography (handled at eligibility time), and drop size qualifiers ("small business" rarely appears verbatim in NOFOs). After that change, all 5 eval intents produce real, plausibly-relevant candidates.

The lesson: prompt design and external-API behavior are coupled. You can't tune one without understanding the other.

## SAM.gov inactive registration is hoisted to a hard blocker

The eligibility sub-agent asks the model for a verdict (`pass` / `fail` / `uncertain`) and a reasons list. Independently, it also checks SAM.gov registration status if a UEI is in the profile. If SAM is inactive, the eligibility result's `blockers` array gets that prepended *regardless of what the model said*.

Why bypass the model? SAM.gov registration is a categorical hard gate — federal grants do not award to unregistered entities. Letting the model "decide" creates a path where a model answers `pass` despite a fatal disqualifier. The hoist makes the constraint structural rather than emergent.

## The planner never throws

Sub-agent failures, search-API errors, JSON parse failures — all of them surface as `TranscriptStep` entries (typed `decision` or as part of an envelope) rather than thrown exceptions. The hosted demo and the recorder both consume `PlannerRun` directly; neither has to wrap calls in `try/catch`.

This is what production-shape error handling looks like in agent code: structured failures that compose, not exceptions that bubble.

## Per-sub-agent fallback ladder, not one shared ladder

Each sub-agent calls `callLadder` independently. Cost ceilings stack: the planner's cost is the sum of its sub-agents' costs, each of which has its own bounded ladder. A shared ladder would make the planner's cost coupling implicit; per-sub-agent ladders make it explicit and predictable.

## Why $3/day, not $1 or $10

$3/day = ~45–60 demo runs at $0.05–0.07/run. That's enough for a typical day of LinkedIn-driven traffic without unlocking a runaway cost surface. $1 would hit the cap from a single recruiter sharing the link. $10 wastes money on the long tail. The cap is environment-tunable so it can be raised during launch week and dropped back afterward.

## Why no free-form input on the hosted demo

A text box accepting free-form input from strangers is two risks at once: prompt injection (someone asks the agent to do something unrelated) and open-ended cost (someone writes a 10K-token intent). The 5-intent allowlist eliminates both. It also means the demo's behavior is deterministic enough to be embedded in a blog post screenshot.

The allowlist is the same 5 intents the eval scores against and the same 5 that have pre-recorded runs. So when the daily budget cap is hit, the demo gracefully degrades to the recording for the same intent the visitor selected — a real result, just one we already paid for.

## Why three sub-agents, not five or seven

The temptation is to add a "budget builder" sub-agent, a "compliance reviewer" sub-agent, a "prior-art search" sub-agent. Each of those is plausible. None of them is necessary to demonstrate the *shape* the project is meant to prove (sub-agent orchestration + tool selection + failure recovery). Adding them would be framework creep that dilutes the headline.

Three is the smallest count that demonstrates the shape: discovery (one tool), eligibility (two tools, with a hard-gate hoist), drafter (one tool). Each shows a different sub-agent failure mode (empty results, ambiguous criteria, missing fields). Together they tell a complete story.

## Why eval scores structure, not specific outputs

Federal grant listings change weekly. An eval that asserts "the agent must surface opportunity FOO-1234" rots within a month. The scorer instead checks the *shape* of the run: discovery surfaced candidates, verdicts cited reasons, drafter produced ≥3 sections, total cost ≤ $0.20. Same pattern fedbench uses.

If the agent regresses (returns no candidates, or skips reasons, or produces a stub draft), the eval catches it. If grants.gov shuffles its catalog, the eval keeps passing.
