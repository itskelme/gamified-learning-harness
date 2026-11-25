---
name: fmt-retrieval-cloze
description: Use when the learner must produce a missing word, symbol, number or short phrase from memory (definitions, formula names, key terms, dates) with normalized, tolerance-aware grading.
status: draft
---

# fmt-retrieval-cloze: short answer and cloze

Registry entry: `format.json`. Contract source: game-format-catalog r3 section 4.3.

## Use / avoid
- Use for definitions, symbols, numeric facts, rules, key terms from slides, one-phrase interpretations.
- Avoid for open-ended explanation and for answers with many phrasings unless `accepted[]` is complete.

## Inputs
`template` with `{{blank_id}}` markers or a `stem`; `blanks[]` with spec `number` (value, tolerance) or `text`
(accepted[], near_miss_min_len); `cue_ladder[]`; `explanation`; `source_ref`.

## Behaviour
Normalization: Unicode NFC, trim, case fold, collapsed spaces; numbers accept decimal comma or point and a
trailing percent sign. A one-edit near miss (minimum length 6) gets a free retry and is never an error;
`invalid` (empty, unparsable) is never scored. Cues mark the attempt as assisted. Fixture: AF-CLZ-01.

## Accessibility and PDF
Labelled text input per blank, locale-aware numbers, cue as text, no timer; an optional choose-from-list
alternative is flagged assisted. PDF: printed blanks with a lined key and the cue ladder as a hint box.

## Evidence
Production retrieval with feedback A/B (Rowland 2014: cued recall g=0.61 vs recognition 0.29).

## Status
Works: `harness/formats/fmt-retrieval-cloze/grader.js` reproducing every AF-CLZ-01 input, cue routing and template
parsing in `tests/contract/formats.test.js`; the Prova 3 symbols item (`tests/contract/prova3-package.test.js`); the
player view, driven by the "cloze:" check in `tests/package-browser.mjs` (key answers correct, a wrong number
incorrect, the cue logged as hint_shown and later answers marked assisted).
Exists but unexercised: none.
Pending: none for Prova 3; a humanities recall fixture.
