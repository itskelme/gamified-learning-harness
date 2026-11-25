---
name: gamified-stem-learning
description: Turn programming or exact-science course material and exercise lists into a checked worked-solution guide, atomic-step practice, and an interactive lesson using the gamified-learning harness. Use for learning artifact authoring, not generic coding or final answers alone.
metadata:
  status: draft-research-verified-pending-release-checks
  version: "0.3"
---

# Gamified STEM learning

Status: the research behind this skill was independently verified on 2026-11-19 (`research/outputs/verification.md`) and the design was approved by the founder (`research/outputs/design-proposal.md`). The skill is not a stable release: the release checks in `docs/ACCEPTANCE.md` that need people (a screen-reader session, a learning pilot) are still open, and no learning effect has been measured. Resolve the project root from `GAMIFIED_LEARNING_ROOT` or the repository containing this skill. Read `docs/STATE.md` and `docs/ARCHITECTURE.md` there when beginning work.

Use the supplied exercise list, instructor notation, methods, units and rounding conventions. Preserve the original statements. For sparse input, state assumptions and create clearly identified original exercises. Independently compute every intermediate result before authoring learning content. If an answer key disagrees materially with the calculation, investigate and explain the discrepancy rather than changing arithmetic to match it.

Represent the lesson once using the project schema: objectives, source status, concepts/slides, givens, atomic steps, worked reasoning, acceptable answers/tolerances, hints, misconceptions and restart policy. Write schema 1.0 lessons of kind `ordered-procedure` (`docs/SCHEMA.md`): exercises in the step-engine contract with variables, constraints, roles, templates and seeded variants that recompute every answer. Formula steps (a typed formula compared with the key at seeded sample points, which is numeric agreement and not a symbolic proof) and unit input (dimension check and conversion) are available: `docs/formats/fmt-step-ladder.md`. Program traces are not validated yet; extend the engine with tests before relying on them. Do not pretend unsupported validation already exists.

Use the retained `didactic-worked-solutions` skill for the real PDF, preserving its beginner explanations, data extraction, strategy choice, arithmetic decomposition, diagrams, plain interpretation and visual QA. Produce the learner's language. Keep PDF and interactive values tied to the same independently verified representation. The starter HTML print view is a preview, not the final PDF.

In practice, make learners perform meaningful solution steps. Separate strategy choice, data selection, computation and interpretation. Provide a hint ladder and worked feedback tied to actual misconceptions. Choose guidance and fading by rules R1 and R9; do not universally force novices to solve before seeing an example.

Keep full restart available as a strong founder preference. Compare full, failed-step, checkpoint and after-N-errors modes. State the selected mode and why; distinguish design inference from evidence. Invalid input must not count as a conceptual error. For generated variants, preserve assumptions and recompute the entire answer key. Shuffling choices or repeating identical numbers is not transfer practice.

Phase 3 needs meaningful interactive models, original diagrams and concept-focused slides, not decorative motion. Any simulator must state its model, valid range, units and limitations. Trace/code exercises need actual correctness checks. Use local versioned progress and export/import; distinguish assisted performance from independent performance.

## Design rules

Follow `references/design-rules.md` (rules R1 to R12, the restart defaults, the gamification include and avoid lists, and what must never be promised). Each rule carries a rating; a C rating is a reasoned default, not a research finding, and must be described that way. For procedures the approved default is the `research-hybrid` preset, with `strict-kelme` (full restart with new numbers) always offered.

## Authoring with the harness

Build any lesson with `node scripts/build-lesson.mjs <lesson.json>`: it migrates and validates the file, then writes the step player, the offline package (composed from the lesson by kind), slides, the fallback study PDF and the LaTeX source to `build/lessons/<id>/` (`docs/AUTHORING.md`). `lessons/teste-z-uma-media.lesson.json` is a small complete example. Typed numbers follow the locale contract in `docs/FORMATS.md` ("1.960" is refused as thousands-shaped in pt-BR). Plots are drawn from a `plot_spec` alone, so the same figure appears in the player, slides and LaTeX. Run `node tests/a11y-browser.mjs` on the final artifacts.

Validate the lesson, build and inspect output, exercise correct/error/restart paths, inspect the actual PDF, and report what is complete and pending. `docs/ACCEPTANCE.md` defines the release bar. Do not claim learning efficacy or superiority based only on passing software tests.
