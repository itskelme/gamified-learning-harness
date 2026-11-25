# Format boundary: fmt-step-ladder (ordered procedure)

Status: pilot engine, migration into the shared harness in progress (card t_85775a5a, wave 1).
Implementation today: `harness/procedure-engine.js` (pure functions, no DOM), `harness/plots.js`
(linked SVG plots), `harness/app.js` (browser shell), `templates/ordered-procedure.html`.
Reference lesson: `lessons/prova3-statistics.lesson.json`.

## Input boundary

One lesson JSON with `format: "ordered-procedure"` and `format_version: "0.2.0"` (the pilot format).
Schema 1.0 (`schemas/lesson.schema.json`) and the migration 0.2.0 -> 1.0 land in wave 1. Until then
`validateLesson(lesson, { seedCount })` is the contract, and the build fails on any problem it returns.

Required top level: `id`, `title`, `language`, `locale`, `conventions`, `restart`
(`learner_help` for practice copy, `source_rationale` for the sources view), `carry_paths`
(`display` and `learner`, each with `label` and `note`), `methods`, `exercises`.

Per exercise: `id`, `statement_template` (renders `original_statement` from the original data),
`variables` (each with `original` plus `values` or `min`/`max`/`decimals`), `constraints`
(expressions that every shown variant must satisfy), `preserve_answers` (step ids whose answer must
not change across variants: method, decision branch, interpretation), ordered `steps`,
`source_answer_key` (printed PDF values with page numbers), optional `accepted_paths`, `key_path`
(learner-language description of the key's path; no internal path ids), `plot`, `explore`.

Per step: `id`, `type` (`givens`, `choice`, `numeric`, `expression`), `title`, `prompt`, `worked`, `hints[]`,
`misconception`. Numeric steps add `expr`, `display_decimals`, `tolerance` (`abs` and/or `rel`) and
an optional ordered `bugs[]` (`id`, `expr`, `feedback`). `checkpoint: true` marks a block start for the
checkpoint restart.

Expressions use the engine's own small language (numbers, identifiers from an explicit scope,
arithmetic, comparisons, whitelisted functions). No property access and no host objects.

### Formula steps (`type: "expression"`)

The learner types a formula instead of a number. Fields: `expr` (the key, in the engine language, using only
the declared symbols), `display` (the formula as listed once accepted), `symbols[]` and optional `bugs[]`
(`id`, `expr`, `feedback`). Each symbol has a `name` the learner can type, optional `aliases`, an optional
`ref` (the variable, convention or earlier numeric step it stands for; default: the name) and a `sample`
range `[min, max]`. A symbol that refers to a variable takes the variable's `min` and `max` when `sample`
is absent; the range must not be a single value.

Typed text is rewritten into the engine language and never evaluated by the host. Accepted spellings: decimal
comma or point, `×` `·` `÷` `:` `−` `√` `²` `³`, `sqrt( )` or `raiz( )`, `abs( )`, implicit products (`2n`,
`z sigma`, `)(`), and symbol names in any letter case when that is unambiguous.

Grading: the typed formula and the key are evaluated on the current data and on eight seeded points drawn
inside the symbols' ranges. The answer is correct when both agree (relative 1e-9) at every point where the
key is finite, on at least three points. The same comparison against each `bugs[].expr` picks a declared
misconception. Agreement at sample points is strong evidence that two formulas are equivalent; it is not a
proof, and the engine does no symbolic algebra. A formula that only happens to give the right number for the
current data is rejected, because the other points differ.

Not an answer, so never an attempt or an error: an unreadable formula, a name that is not a symbol of the step,
a number in a thousands-shaped form, and a formula with no symbol at all (the learner typed the result). Each
returns `invalid` with a message that names the step's symbols.

The step's value for the current data is stored under its id, so later steps may use it in their `expr`.
`validateLesson` refuses a formula step with no `display` or `symbols`, a name that cannot be typed or is
used twice, a `ref` that is not a variable, a convention or an earlier step, a missing or single-value range,
a key that uses an undeclared name, is finite at fewer than three sample points or does not vary over the
ranges, and a bug that is equivalent to the key.

### Unit input (`unit_input: true` on a numeric step)

The learner types the number with its unit. `unit` names the unit the key is in. Units reduce to SI base
dimensions and a factor: `m km cm mm µm`, `kg g mg t`, `s ms min h`, `Hz N kN J kJ W kW Pa kPa`, `L mL`,
`A mA C V ohm`, `K mol`, `%`, with products, quotients and integer powers (`km/h`, `kg·m/s²`, `g/cm^3`).
A token of `unit` outside that table (`embalagens`) counts as its own dimension for that step. Temperatures
with an offset (°C, °F) are not supported.

- Same dimension, other unit: the value is converted to the step's unit and then graded by the tiers below.
  The value carried to later steps and saved in progress is always in the step's unit.
- Another dimension: a wrong answer, with `unitMismatch: true` and either the step's `unit_feedback` or a
  standard sentence. It follows the restart rule like any wrong answer.
- No unit, an unknown unit or unreadable text: `invalid`, never an attempt.

`unit_input` cannot be combined with `percent`. Steps without `unit_input` read a bare number as before.

Checks: `tests/contract/expression-units.test.js` (13 tests, including eight hand-made engine mutants of which
seven fail the suite; the survivor is a runtime guard that build validation already enforces) and
`tests/expression-units-browser.mjs` (keyboard walkthrough of both step kinds in the built player at 390 px).
No shipped lesson uses these fields yet, and their effect on learning is not measured.

## Output boundary

Engine exports: `validateLesson`, `solve`, `drawVariant`, `createRun`, `submit`, `check`, `hint`,
`retry`, `serializeRun`, `restoreRun`, `renderTemplate`, `formatNumber`, `parseNumber`,
`matchesPrinted`, `predictionAnswer`, `tQuantile`, `parseLearnerExpression`, `parseUnit`, `parseQuantity`,
`sameDimensions`, plus helpers. `submit` returns
`{ status: correct | wrong | invalid | locked, ... }`; `invalid` (empty or unparsable input) never
counts as an attempt or an error. Mapping these results onto the catalog event vocabulary
(catalog r3 sections 3.4 and 3.5) is wave 1 work.

## Grading tiers and the follow-through bound

Decided in round 4 after Sofia's measurement (t_8864e150 r3, `drift_probe.mjs`).

1. Tier 1: the key and each declared `accepted_paths` value, within the step `tolerance`.
2. Declared bugs, in array order, within the step tolerance around each bug value. They are checked
   before follow-through, so a documented misconception is diagnosed, not followed through. Order
   matters: in Ex3 `ep-arredondado-cedo` (`round(ep, 3)`) comes before the root bugs, so EP 0,025
   is diagnosed as early rounding, not as a missing root.
3. Tier 2, follow-through: rounding only. The typed value must be within half a display unit of a
   carry path: `display-carry` (every earlier result rounded to the decimals the app asked for) or
   `learner-carry` (the learner's own accepted earlier values). The step tolerance is not added on
   top, so tolerances cannot stack from step to step. The note shown names the key value.

What is bounded, and by what: a value accepted at a step is either within tier-1 tolerance of a
declared answer, or the honest rounding of a carry chain whose every link was itself accepted.
Remaining drift is only the propagation of earlier tier-1 tolerances through the formulas.

Measured with Sofia's unmodified `drift_probe.mjs` (sha256 18e3085f...930e, originals + seeds 1-200,
edge+ mode, max deviation from the key in display units, 2d6573e -> round 4): Ex1 upper 3 -> 1,
Ex2 upper 3 -> 2, Ex3 E 10 -> 4, Ex4 z 91 -> 36, Ex5 t 95 -> 44. Decision flips: 0 before and after.
Evidence: `docs/evidence/harness-wave1/drift_probe.out`.

Rejected alternative, a cumulative cap on |typed - key|. It rejected 177 steps in honest single-slip
chains (one step typed 1 unit off inside its tolerance, everything after carried honestly). Example:
Ex4 seed 5, v1 typed 1 unit off and accepted, then z carried honestly is 10,490 against the key 10,495. That rejects a learner for an answer the app had already accepted.

Regression guards (tests/pilot-engine.test.js): the p.17 interval (0,541; 0,639), E 0,0490 and Ex5
t 2,714 are not accepted on the documented chains; a carry-path acceptance is never beyond rounding;
honest follow-through after tier-1 edges is always accepted; decision steps evaluated on any accepted
learner values agree with the key; bug precedence over tier 2.

Known residuals:
- Ex4 z and Ex5 t still reach 36 and 44 display units from the key under adversarial edges, because
  the tier-1 tolerances of their inputs (Ex4 v1/v2 ±0,002, Ex5 raiz ±0,0003) are amplified by the
  division. Narrowing those tier-1 tolerances is the remaining lever. It was not evaluated in this
  round, and it must keep the display-carry test green (honest rounders at every step).
- In Ex3, the EP tolerance (±0,0002) admits an EP typed at 3 decimals (e.g. 0,0260 for 0,0258) in
  10 of 402 edge-learner runs. The next step then diagnoses `ep-arredondado-cedo`, which matches what
  the learner typed.
