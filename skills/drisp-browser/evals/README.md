# Trigger eval — `drisp-browser` skill description

Eval set for testing whether the skill's `description` triggers reliably. Follows
the [agentskills.io description-optimization](https://agentskills.io) loop:
design queries → train/validation split → measure trigger rate → iterate → pick by
validation pass rate.

## Files

- `train_queries.json` — 12 queries (6 should-trigger, 6 should-not), used to guide changes.
- `validation_queries.json` — 8 queries (4 should-trigger, 4 should-not), held out to check generalization.

Both sets are deliberately **hard**: the negatives are keyword-collision near-misses
(coding/build/review tasks that literally say "navigate to", "go to", "click",
"submit", "add to cart", "button", "form", "screenshot", "checkout", "signup"),
and several positives are implicit (no URL, or phrased like a bug report) to test recall.

## How it was run

Each query was scored by an LLM judge given the candidate `description` plus a
realistic competing-skill menu (frontend-design, write-test-code, code-review,
diagnose), deciding via progressive-disclosure logic whether it would load the skill.
3 runs per description variant; a should-trigger query passes if trigger rate > 0.5,
a should-not query passes if trigger rate < 0.5.

## Result (2026-06-07)

| Variant                                 | chars | train | validation | fresh holdout |
| --------------------------------------- | ----- | ----- | ---------- | ------------- |
| Baseline (pushy)                        | 1012  | 12/12 | 8/8        | —             |
| Candidate A                             | 887   | 12/12 | 8/8        | —             |
| Candidate B (→shipped, polished to 937) | 862   | 12/12 | 8/8        | 10/10         |

**Finding:** a capable router reads _intent_, so trigger accuracy was already perfect —
the baseline's keyword soup didn't over-trigger and the candidates' boundary clauses
didn't tighten anything measurably. The win was therefore **clarity + cost**: the
shipped description is shorter (937 vs 1012 chars, more headroom under the 1024 limit),
adds an explicit "do NOT load" boundary (more robust under real-session context
pressure), and preserves the project's deliberate recall bias ("when in doubt, load it").

## Re-running

The judge harness is ad hoc (parallel subagents). To re-check after a description
change, score both JSON sets with the new `description` text and confirm no regression
on train/validation, then run a fresh holdout of ~10 unseen queries.
