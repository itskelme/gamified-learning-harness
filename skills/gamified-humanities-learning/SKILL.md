---
name: gamified-humanities-learning
description: Turn humanities, language, administration or other conceptual material into a worked study guide, retrieval/case practice and rich slides using the gamified-learning harness. Use for structured learning artifact authoring, not generic summaries or unsupported factual advice.
metadata:
  status: draft-research-verified-pending-release-checks
  version: "0.2"
---

# Gamified humanities learning

Status: the research behind this skill was independently verified on 2026-11-19 (`research/outputs/verification.md`) and the design was approved by the founder (`research/outputs/design-proposal.md`). The skill is not a stable release: the release checks in `docs/ACCEPTANCE.md` that need people are still open, and no learning effect has been measured. Resolve the project through `GAMIFIED_LEARNING_ROOT` or this repository. Read `docs/STATE.md` and `docs/PRODUCT.md` before treating any artifact as complete. Keep skill instructions en-US and output in the learner's language.

Preserve source material and identify the learner's target: recall, explanation, discrimination, application, argument or language production. Verify domain facts against appropriate sources. When the lesson concerns law, medicine or changing policy, record jurisdiction/date and the limits of the source rather than turning a quiz answer into unqualified real-world advice.

Build one lesson representation containing objectives, source/provenance status, concept relationships, slides with recall prompts, worked cases, practice steps, explanations, hints, misconceptions and restart mode. Use schema 1.0, kind `declarative-case` (`docs/SCHEMA.md`): claims tied to sources, a study guide with recall prompts, and practice items in each format's payload contract (cloze, classification, choice with feedback, ordering, branching case, review mix), each resting on claim ids. Open explanations are not graded automatically; do not pretend they are.

Phase 1 is a structured study guide or worked-case PDF: minimal prerequisite concepts, glossary in plain language, decision/concept map, explained example cases, error contrasts, recall prompts and summary. Adapt the retained PDF skill without forcing conceptual learning into arithmetic sections. Use its actual LaTeX workflow and visual QA for the final document; a browser print preview does not finish Phase 1.

Phase 2 should require retrieval and application, not recognition alone. Use question types and guidance by rules R2, R4, R6 and R7. Ask for a rationale when that reveals a misconception, and provide an honest review path for open-ended work rather than claiming a simplistic keyword matcher grades understanding. For language learning distinguish receptive vocabulary, productive retrieval, grammar application and pronunciation; do not claim one quiz covers them all.

Keep the founder's restart-on-error mechanic. Compare whole-run restart with failed-item re-queue, checkpoints and after-N-errors modes. Explain the selected behavior and its tradeoffs. Meaningful repetition uses rephrased questions, analogous cases and delayed unaided retrieval where supported; changing option order alone does not establish durable transfer.

Phase 3 should exceed the FGV reference with original concept-focused slides, purposeful visuals, branching decisions or categorization, explanations and accessible untimed practice. Do not copy FGV source, artwork or prose. Keep cognitive load and learner expertise visible in design decisions; gamification should serve the learning task.

## Design rules

Follow `references/design-rules.md` (rules R1 to R12, the restart defaults, the gamification include and avoid lists, and what must never be promised). Each rule carries a rating; a C rating is a reasoned default, not a research finding, and must be described that way. For declarative quizzes the approved default is a full restart with a new order up to about 10 items and re-queueing the failed item beyond that.

## Authoring with the harness

Build with `node scripts/build-lesson.mjs <lesson.json>` (`docs/AUTHORING.md`): study guide, slides with recall prompts and the case figure, the offline package with the case game, the fallback study PDF and the LaTeX source, all from the one lesson. `lessons/humanities-decisions.lesson.json` is the worked example (fictional case, real sources checked on Crossref). For a short request use `--brief <brief.json>` with at least one source: the draft lists its assumptions, flags every claim no supplied source supports, and is refused when no source is given. Treat a brief draft as a draft until its assumptions and unverified claims are checked. The branching case must have a best path and weaker paths whose debrief explains the principle; every path is walked in `tests/package-browser-humanities.mjs`.

Validate the lesson contract, check all facts/answer keys and error paths, inspect the PDF and generated interface, test versioned progress export/import and document uncertainty. Follow `docs/ACCEPTANCE.md` before stable release. Do not invent an optimal fixed review calendar or claim educational superiority without measurement.
