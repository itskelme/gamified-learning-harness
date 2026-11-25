---
name: fmt-sequence-order
description: Use when the order itself is what must be learned (the steps of a taught procedure, a timeline, legal stages, Parsons-style code ordering), after the learner has seen the worked version.
status: draft
---

# fmt-sequence-order: order is what is learned

Registry entry: `format.json`. Contract source: game-format-catalog r3 section 4.5.

## Use / avoid
- Use for recipe recall after the worked example, timelines with sourced dates, stages, Parsons mode.
- Avoid when the order is arbitrary or before the procedure has been worked.

## Inputs
Either an authored `key_order[]` or `items[]` with `sort_by` (derived key; ties rejected). Every item needs a
label and a rationale. Optional `indent` (Parsons) and distractors.

## Behaviour
Order retry class: the key is stored once and never shuffled; only the presented list changes (AF-SEQ-01 checks
the stored key before and after 200 presentation shuffles). Scoring: adjacent pairs correct (max n-1); positions
correct and Kendall tau distance are reported; full credit only for an exact match.

## Accessibility and PDF
Move-up / move-down buttons and a position number per card (APG rearrangeable listbox pattern), order read out
after each move, drag optional. PDF: numbered blank slots and a key with the reason for each adjacency.

## Evidence
HYPOTHESIS H-SEQ, C. Closest neighbours: Parsons problems were more efficient, not better for learning
(Ericson 2017).

## Status
Works: `harness/formats/fmt-sequence-order/grader.js` (metrics, derived timeline key with tie rejection, grading)
reproducing AF-SEQ-01/02 in `tests/contract/formats.test.js`; the Prova 3 recipe item from the Ex2 step order
(`tests/contract/prova3-package.test.js`); the player view, driven by the "sequence:" check in
`tests/package-browser.mjs` (keyboard move buttons rebuild the recipe, focus follows the moved card).
Exists but unexercised: none.
Pending: none for Prova 3; a humanities timeline fixture (the timeline key is only covered by AF-SEQ-02).
