---
name: fmt-match-classify
description: Use when the learner must decide which rule, method or category applies to each case (Z vs t vs proportion, contract types, tenses) and the categories are genuinely confusable.
status: draft
---

# fmt-match-classify: matching and classification

Registry entry: `format.json`. Contract source: game-format-catalog r3 section 4.4.

## Use / avoid
- Use for choose-the-method decisions and discrimination between confusable categories, interleaved.
- Avoid for plain vocabulary lists (interleaving reverses for words) and for categories that are not confusable.

## Inputs
`categories[]` (id, label, decisive cue) and `cases[]` (id, text, category, `misconception_tag`, `cue_span`),
optional `confusable_with[]`, mode `classify` or `pair`.

## Behaviour
Declarative retry class: case order reshuffled (AF-MAT-01). A wrong assignment routes `requeue_later` with
`interleave_with: confusable`. Answer events are compared keyed by item id; order across items is not
contractual, order within one item (answer before its outcome) is. The confusion record is derived from
`answer_submitted`, never a separate event. In Prova 3 the same cases serve as the ladder's method step.

## Accessibility and PDF
Native select per case (no drag needed), table view of results. PDF: the decision map plus a keyword-to-category
table with a blank column and a key.

## Evidence
Interleaving of similar categories g=0.42 (Brunmair & Richter 2019), classify mode with decisive-cue feedback B;
pair mode C.

## Status
Works: `harness/formats/fmt-match-classify/grader.js` reproducing AF-MAT-01 (events, derived score, confusion view)
in `tests/contract/formats.test.js`; the Prova 3 method-choice item built from the five original statements
(`tests/contract/prova3-package.test.js`); the player view, driven by the "match:" check in `tests/package-browser.mjs`
(a wrong method is diagnosed and locked, and only the missed case returns after 3 other answers).
Exists but unexercised: none.
Pending: none for Prova 3; a humanities classification fixture.
