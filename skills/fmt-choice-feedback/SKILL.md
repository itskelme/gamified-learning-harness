---
name: fmt-choice-feedback
description: Use when the learner must pick between plausible statements (interpretations, misconceptions, exam-format questions) and read explanatory feedback tied to the misconception of the option they chose.
status: draft
---

# fmt-choice-feedback: multiple choice with explanatory feedback

Registry entry: `format.json`. Contract source: game-format-catalog r3 section 4.2.

## Use / avoid
- Use for discrimination between confusable statements, interpretation of results, misconception diagnosis.
- Avoid as the only first-pass mode for facts the learner must produce, and avoid option text that refers to
  position ("all of the above", "both A and B"); validation rejects it.

## Inputs
`stem`, `options[]` (id, text, correct, `misconception_tag`, feedback), `explanation`, `source_ref`,
optional `confusable_with[]` and `confidence_prompt`. Every distractor is a plausible misconception with a tag.

## Behaviour
Declarative retry class: item and option order reshuffled with the presentation seed
(`harness/core/prng.js`, AF-MCQ-01); which option is correct never changes. A miss is re-queued after 3 to 6
items (`requeue_later`); durability needs a re-test at a later session. The "remove two wrong answers"
lifeline exists only as `fifty_fifty_assisted`, off by default, and counts as assisted.

## Accessibility and PDF
Native radio group, feedback in a live region, no timer by default. PDF: lettered options in one fixed order
plus a key page with the explanation and misconception tag per distractor.

## Evidence
Retrieval practice with explanatory feedback B/A (Adesope 2017; Van der Kleij 2015); lures can implant false
facts without feedback (Butler & Roediger 2008); confidence flag C.

## Status
Works: `harness/formats/fmt-choice-feedback/grader.js` (validation incl. position-referring text in en and pt-BR,
seeded order, grading, 50/50 assisted lifeline) reproducing AF-MCQ-01 in `tests/contract/formats.test.js`; the
Prova 3 interpretation item (`tests/contract/prova3-package.test.js`); the player view, driven by the "choice:" check
in `tests/package-browser.mjs` (a distractor shows its own feedback, the item reopens reshuffled after 3 answers).
Exists but unexercised: none.
Pending: a 50/50 lifeline button on the page (the grader supports the lifeline; the view does not offer it yet).
