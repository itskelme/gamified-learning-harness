---
name: fmt-review-mix
description: Use when earlier items should be assembled into a spaced, interleaved review session with a dated plan toward a known exam date (or the next session when no date is known).
status: draft
---

# fmt-review-mix: checkpoints, spaced and interleaved practice mix

Registry entry: `format.json`. Contract source: game-format-catalog r3 section 4.8.

## Use / avoid
- Use after a unit, for exam preparation with a date, and for day-7 and day-30 twin items.
- Avoid in the first exposure of new material and for a one-session cram with no later session.

## Inputs
`pool[]` (item refs with category, state, due), optional `exam_date`, the resolved rule set, `today`.

## Behaviour
Due items first, confusable categories alternated, a missed item re-queued after `min(gap_items, items behind it)`
and set due at the next session. Default schedule `proportional_gap`: first gap is a fraction of the days to the
exam, interpolated log-linearly between 30% at 7 days and 7.5% at 365 days, clamped to that range (AF-REV-01).
`fixed_intervals` 1/3/7/21 is offered only as "convention, no evidence". In-session accuracy is never reported as
learned; day-7 and day-30 twin scores are the measure. Procedural items inside the mix run in the ladder with a
fresh variant; their step order is untouched.

## Accessibility and PDF
Ordered queue list, readable progress, three-way native radio for confidence, no timer. PDF: dated review plan,
due items with format and due date, a confidence column and the twin sheets.

## Evidence
Spacing direction A (Cepeda 2006, 2008); run structure B; interpolation and clamp C; adaptive scheduling is
`adaptive_response_based` (B in general, C for FSRS specifically).

## Status
Works: `harness/formats/fmt-review-mix/scheduler.js` reproducing AF-REV-01 (gap fraction, clamp, dated plan,
seeded interleaved queue, requeue cases) in `tests/contract/formats.test.js`; the lesson-level player view, driven by
the "review:" checks in `tests/package-browser.mjs` (interleaved queue, dd/mm/aaaa exam date to the scheduler plan
in pt-BR dates, bad dates refused, "today" taken from the local calendar date under fixed São Paulo and Tokyo clocks).
Exists but unexercised: none.
Pending: persistence of due dates across sessions (a reload starts a new queue).
