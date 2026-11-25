---
name: fmt-step-ladder
description: Use when a lesson unit is an ordered procedure (statistics, finance, physics, code traces) that the learner must perform one step at a time with fixed step order and seeded numeric variants.
status: draft
---

# fmt-step-ladder: guided ordered procedure

Registry entry: `format.json`. Contract source: game-format-catalog r3 section 4.1 (approved by Sofia, t_8a15e9e2 r3).

## Use / avoid
- Use for fixed algorithms: separate the data, choose the method, one calculation per step, interpret.
- Avoid for independent facts (use `fmt-retrieval-cloze` or `fmt-choice-feedback`) and for units declared `reorderable`.

## Inputs (lesson unit of kind `ordered_procedure`)
`statement_template`, typed `variables` (original value plus allowed values or range), `constraints`
(instructor table rows, physical limits), `preserve_answers` (method, decision branch, interpretation),
ordered `steps` (expression, display decimals, tolerance, hints, worked text, ordered `bugs`,
`checkpoint` flags), `source_answer_key` with page numbers. Expected values are computed by the engine
and checked by an independent oracle (`scripts/oracle_prova3.py` for Prova 3); never by a model.
Z versus t and the table rows are per-course data (`conventions`), never a generic n threshold.

## Behaviour
- Step order and step count never change, on any retry or variant.
- Variants: solve in code, check constraints and the decision branch, only then show; a failing draw is discarded.
- Grading: tier 1 (key and declared accepted paths, step tolerance), then declared bugs, then follow-through by
  rounding only. Details and measurements: `docs/formats/fmt-step-ladder.md`.
- Restart options (rule slot `restart_on_error.procedural`): `full_restart`, `restart_at_failed_step_new_numbers`,
  `last_checkpoint_plus_worked_step` (default, `after_errors` 3), `full_restart_after_n_errors`, `none`.
  The default preset `research-hybrid` escalates hint -> worked step plus step twin -> checkpoint return with
  pre-filled read-only earlier steps. `strict-kelme` restarts in full with new numbers. Reference:
  `harness/formats/fmt-step-ladder/escalation.js`, AF-LAD-03 traces in `tests/contract/fmt-step-ladder.test.js`.
- Malformed input (`invalid`) never counts as an error and never triggers a restart.
- Formula steps (`type: "expression"`): the learner types a formula in declared symbols; it is compared with the
  key at seeded sample points (numeric agreement, not a symbolic proof). Use one when choosing or assembling the
  formula is the skill being practised, not for every calculation.
- Unit input (`unit_input: true`): the learner types number and unit; another unit of the same quantity is
  converted, a unit of another quantity is a wrong answer with unit feedback, a missing unit is a no-op.
  Field reference for both: `docs/formats/fmt-step-ladder.md`.

## Events and outcomes
Emits and routes exactly the lists in `format.json`, all inside catalog 3.4 and 3.5.

## Accessibility and PDF
Labelled form field per step, decimal comma or point by locale, worked step as text, no timer, keyboard path.
PDF: worked solution table with intermediates at the declared carry, drawing from the same plot data, answer key.

## Evidence (shown with the option, never as a product claim)
Step-level feedback A; worked examples then backward fading for novices B (near transfer); locking C;
restart composite C (no study compares the restart rules).

## Status
Works: the Prova 3 pilot engine (`harness/procedure-engine.js`, `tests/pilot-engine.test.js`) with the independent
oracle over 1300 values (`scripts/oracle_prova3.py`); the offline pilot player view with linked plots, driven by the
"walkthrough:" and following checks in `tests/pilot-browser.mjs`; the study PDF preview, text-checked on every page
by `scripts/build-pilot.mjs`; the AF-LAD-03 escalation reference with the hybrid trace
(`tests/contract/fmt-step-ladder.test.js`); the package card that links to the pilot player (`tests/package-browser.mjs`).
Works in the engine and the player, on a test fixture only: formula steps and unit input
(`tests/contract/expression-units.test.js`, `tests/expression-units-browser.mjs`). No shipped lesson uses them.
Exists but unexercised: none.
Pending: wiring the rule presets into the player start screen; schema 1.0 migration of the pilot lesson.
