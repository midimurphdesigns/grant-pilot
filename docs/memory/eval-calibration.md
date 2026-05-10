# Eval threshold calibration

History of the `MIN_SCORE_FOR_ELIGIBILITY` threshold and the per-intent score distributions that drove its tuning. Future sessions: if you change the threshold, re-run `bun run eval:record` and append the new distribution here.

## Why a threshold exists

Discovery returns 5 ranked candidates with scores 0–100. Each subsequent eligibility check costs ~$0.02–0.04 (full `grant_detail` fetch + Sonnet call + optional SAM lookup). Without a threshold, the planner would burn tokens on candidates the ranker already flagged as obviously-irrelevant.

`MAX_ELIGIBILITY_CHECKS = 3` is the upper bound; the threshold determines whether all 3 fire or fewer.

## Calibration v1: threshold = 50 (rejected)

Initial value. Worked for `vt-nonprofit-workforce` (top score 72) and `tx-cyber-woman-owned` (top 52) but skipped eligibility entirely on `ia-ag-coop` (top 35) where the top candidate was a real, plausibly-relevant USDA Meat & Poultry Processing Expansion grant.

## Discovery prompt fix

Before lowering the threshold further, tightened the discovery prompt. The first version produced over-specific queries (e.g., `"commercial construction infrastructure small contractor Arizona Phoenix metro"`) that returned irrelevant candidates because grants.gov AND-matches every term. New prompt instructs 2–4 broad nouns and drops geography. Score distributions improved across the board.

## Calibration v2: threshold = 40 (rejected)

Caught more intents but still skipped `ia-ag-coop` (top 35).

## Calibration v3: threshold = 30 (current)

| Intent                  | Top score | All 5 scores            | Eligibility checks fired |
|-------------------------|-----------|-------------------------|--------------------------|
| az-construction         | 52        | 52, 45, 38, 35, 28      | 3                        |
| vt-nonprofit-workforce  | 72        | 72, 55, 40, 20, 18      | 3                        |
| tx-cyber-woman-owned    | 52        | 52, 45, 28, 25, 18      | 2                        |
| oh-veteran-mfg          | 42        | 42, 3, 2, 2, 2          | 1                        |
| ia-ag-coop              | 35        | 35, 22, 10, 5, 5        | 1                        |

Captures every plausibly-relevant top candidate (≥30) while still filtering obvious noise (sub-25 scores from keyword-collision matches that have nothing to do with the intent).

## Rule

Don't raise the threshold above 40 without re-running the eval and updating this file. Lowering it costs more per run and produces lower-signal eligibility checks; raising it risks skipping the only good candidate the search returned.
