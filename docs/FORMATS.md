# Formats, registry, routing and rules

Status: wave 1 of card t_85775a5a (in progress). Contract source: `game-format-catalog.md` r3
(sha256 3b52ce28...1dc9) and its fixtures r3 (sha256 1af7b5c8...3e83, copied to
`tests/fixtures/catalog-r3/`), both approved by Sofia in t_8a15e9e2 r3. Design source:
`design-proposal.md` rev 2 (sha256 92e22eaa...3889) plus the binding comments on t_85775a5a.

## Pieces

| Piece | File | Contract test |
| --- | --- | --- |
| Portable PRNG (mulberry32 + FNV-1a, anchor 1122880180) | `harness/core/prng.js` | `tests/core.test.js` (AF-COM-01, MCQ/MAT/SEQ orders, SEQ order hash) |
| Closed events and routes (catalog 3.4, 3.5) | `harness/core/events.js` | `tests/core.test.js` (AF-COM-02 over every fixture event, negative controls) |
| Registry: one `skills/<format>/format.json` per format | `harness/core/registry.js` | `tests/contract/registry.test.js` |
| Router | `harness/core/router.js` | `tests/contract/router.test.js` (catalog 6.2 and 6.3) |
| Rules: catalogue, 4 presets, overrides | `rules/`, `harness/core/rules.js` | `tests/contract/rules.test.js` |
| Ladder escalation (AF-LAD-03 + hybrid) | `harness/formats/fmt-step-ladder/escalation.js` | `tests/contract/fmt-step-ladder.test.js` |

| Graders for the other seven formats | `harness/formats/<format>/grader.js` (`lab.js`, `scheduler.js` for lab and review) | `tests/contract/formats.test.js` (AF-MCQ-01, CLZ-01, MAT-01, SEQ-01/02, BRA-01, SIM-01 incl. plot_spec sha256, REV-01, JS-side AF-COM-02) |
| Prova 3 plot_spec | `harness/formats/fmt-data-visual-lab/procedure-spec.js` | `tests/contract/prova3-package.test.js` |
| Prova 3 composed package | `harness/packages/prova3.js` | `tests/contract/prova3-package.test.js` (catalog 6.2 routing, every item through its grader) |

Run: `npm run test:contract` and `npm run mutation:core` (35 mutants, all must be killed).

Documented deviations from the Python reference, both stricter and outside the fixture inputs: cloze text
folding is lower-case plus ß -> ss (not full Unicode casefold), and cloze numbers accept plain decimals only
(Python `float()` also takes `1e3`, `inf`, `nan`, `1_000`; the learner grader treats them as `invalid`).

## Prova 3 package

`buildProva3Package(lesson)` derives six items from the validated pilot lesson and invents no text:
symbols cloze (z = 1,96 from `conventions.z95`, gl = n − 1 from the Ex2 key), method classification (the
five original statements against `methods`, tags by confusion), the five ladders, the Ex2 recipe order
(step titles and prompts), the Ex1 lab (explore control, plot_spec, prediction from `predictionAnswer`) and
the Ex2 interpretation choice (its options and feedback). Each `source_ref` is a page from
`source_answer_key.pages` (decision map: p.5; z table: p.4). Without page numbers the items have no source
and the router refuses the plan (test).

## The eight formats

Registry order (also the router's tie-break): `fmt-step-ladder`, `fmt-choice-feedback`,
`fmt-retrieval-cloze`, `fmt-match-classify`, `fmt-sequence-order`, `fmt-branching-case`,
`fmt-data-visual-lab`, `fmt-review-mix`. Each has `skills/<id>/SKILL.md` (status `draft` until Sofia's
release QA) and `format.json`. The SKILL.md "Status" section says what works today and what is pending.

## Routing

Per unit: include a format when the unit's content kind is accepted, every required payload field exists
and one of the unit's objective verbs matches. Otherwise it is skipped, with every failing condition in
the order kind; fields; verb. Selected formats are ordered by learning phase (`retrieval`,
`discrimination`, `perform`, `reconstruct`, `simulation`, `application`, `review`) and capped at 4 per
unit by default (per-package overrides: "Cap overrides" below); dropped formats are listed with the reason. The router never creates content. Items
without a `source_ref` stop routing with the error `items without source_ref: <unit/item, ...>`.

Implementation decisions (not in the catalog text, open to Sofia's review):
- `fmt-review-mix` is planned once per lesson (`lesson_level`) and is not counted in the per-unit cap,
  because it mixes items across units. Without this, a Prova 3 unit with the minimum set (ladder, match,
  lab, choice, review) would always drop the review.
- `reconstruct` (sequence-order) sits between `perform` and `simulation`, following catalog 6.2.
- `order_key` exists when an item has an authored `key_order` or a data-derived `sort_by`.

### Cap overrides

Catalog r3 6.1 step 4 caps a unit "at what the time budget allows", with a default of 4 formats per unit
(`DEFAULT_MAX_FORMATS_PER_UNIT` in `harness/core/router.js`). A package may raise the cap only through
`harness/packages/caps.js`, with a reason. `scripts/build-package.mjs` reads the cap from there and writes
`max_formats_per_unit` and `max_formats_per_unit_reason` into the package manifest.
`tests/contract/format-cap.test.js` checks that this table matches `caps.js` and the router.

| Package | Cap | Dropped at the default cap of 4 | Reason |
| --- | --- | --- | --- |
| `prova3` | 6 | `fmt-data-visual-lab`, `fmt-choice-feedback` | Catalog 6.2 plans six per-unit formats for this unit, one per item derived from the lesson (symbols, method choice, steps, recipe order, plot, interpretation). The time budget is a full exam-review session, not one short sitting, so all six fit. |

At the default cap the Prova 3 unit would keep cloze, match, ladder and sequence, and would drop the lab
and the interpretation item, both listed in the catalog 6.2 plan. `fmt-review-mix` is lesson level and
never counts toward the cap. The humanities package uses the default.

## Rules

Plain data: `rules/catalogue.json` (slots, options, ratings, parameters, kind restrictions) and
`rules/presets/{research-hybrid,exam-prep,fgv-style-quiz,strict-kelme}.json`. Layers, later wins:
catalogue defaults -> preset -> overrides. `rule_set_id = <preset>@<version>+ovr:<sha256 prefix of the
canonical overrides>` (or `+ovr:none`). Load-time validation fails the build on: unknown slot, option
or parameter; wrong parameter type; `free_order` on ordered procedures; `explain_only_no_answer` on
declarative content; `numbers_then_context_after_k_variants` without `context_variants`; an option with
an empty rating. A `GAP` rating is displayed only as "GAP: no rating"; its rationale stays in `note`.

The default preset is `research-hybrid` (D4 default, until Kelme decides). Its restart pair
(`last_checkpoint_plus_worked_step` with `after_errors` 3 plus `hint_then_show_step` with 1 hint) is the
hybrid escalation: error 1 hint; error 2 worked step plus a twin of that step with new numbers; error 3,
or errors in two different checkpoint blocks, checkpoint return with the earlier steps pre-filled
read-only and a new variant seed. With `after_errors` 2 it reproduces Minerva's single-option
`last_checkpoint_plus_worked_step` trace exactly (test). `strict-kelme` restarts in full with new
numbers and the same step order everywhere.

## Locale contract for typed numbers

Decision (card t_fd19236f, ACCEPTANCE line 23). Before it, a pt-BR learner who typed `1.960` in a cloze blank or a
step got it read as 1,96: thousands-shaped text was taken as a decimal. Now one rule holds for both parsers (the
step engine `harness/procedure-engine.js` and the cloze grader `harness/formats/fmt-retrieval-cloze/grader.js`):

- In a comma-decimal locale (`pt`, `es`, `fr`, `de`, `it`) the point is the thousands separator. Text with exactly
  one point followed by exactly three digits and no comma (`1.960`, `12.345`, `-1.960`) is **thousands-shaped**: it
  is refused as ambiguous. That is a no-op (no score, no error, no restart), and the learner sees both readings:
  "“1.960” tem ponto de milhar. Para um número decimal, use vírgula: 1,960. Para milhar, escreva sem o ponto: 1960."
- A point followed by 1, 2 or 4+ digits is still a decimal point (`1.96`, `0.0482`): learners on an English keyboard
  are not penalised. Grouped text with a decimal comma (`1.960,5`) is read as grouping.
- An integer part of 0 cannot be a thousands group, so `0.950`, `0.050`, `-0.975` and `+0.025` are decimals
  (0,95; 0,05; -0,975; 0,025). These are the shapes of α, a confidence level and a z/t quantile in Prova 3
  (Sofia, round 1 of t_fd19236f: before this rule they were refused with the advice "escreva 0950").
- Spaces inside a number (`1 960`) are malformed in both parsers, as in the catalog's Python parse. Spaces at
  the ends are trimmed.
- The mirror rule holds in point-decimal locales: `1,960` is refused in `en-US`, `0,950` is 0.95, `1,960.5` is grouping.
- Without a locale the cloze grader keeps the catalog parse (AF-CLZ-01: any comma is a decimal comma).

One case table, `tests/fixtures/locale-numbers.json`, drives both parsers in `tests/contract/locale.test.js`, so they
cannot drift apart. The package browser suite types `1.960` in a pt-BR blank and checks the refusal on screen.
RED before the fix: `docs/evidence/wave2-t_fd19236f/red/locale-before-fix.txt`.

## Done in wave 2 (card t_fd19236f)

- Branching view exercised end to end on the humanities package (`tests/package-browser-humanities.mjs`: every
  `allPaths` path, keyboard only). The branching contract runs on AF-BRA-01 and on the composed package
  (`tests/contract/humanities-package.test.js`).
- Schema 1.0 and the two migrations (`docs/SCHEMA.md`).
- Rule presets and the four procedural restart policies chosen on screen (resolved at build time by
  `harness/core/rules.js` for every preset x restart pair; `tests/package-browser-progress.mjs`).
- SVG from plot_spec alone (`ProcedurePlots.renderSpec`; `tests/contract/plot-spec-render.test.js`).
- Package progress persists across reloads, exports and imports; a file for another content digest is refused.
- Composers by kind (`harness/packages/compose.js`): curated Prova 3 and humanities, generic ordered-procedure,
  declarative-case and slides-practice. Any lesson file builds through `scripts/build-lesson.mjs` (`docs/AUTHORING.md`).
