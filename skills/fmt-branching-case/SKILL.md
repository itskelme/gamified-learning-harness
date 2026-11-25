---
name: fmt-branching-case
description: Use when a declarative topic has a real decision with trade-offs (administration, law, ethics, evidence versus inference) that can be written as a short consequence graph with a stated principle at every ending.
status: draft
---

# fmt-branching-case: decisions with consequences

Registry entry: `format.json`. Contract source: game-format-catalog r3 section 4.6.

## Use / avoid
- Use for scenario decisions where each choice has a quality, feedback and a consequence.
- Avoid for procedures with one correct sequence (use the ladder) and content without real trade-offs.
  The router never invents a scenario: without an authored, sourced graph this format is skipped.

## Inputs
`graph` with `start` and `nodes{}` (text, `choices{}` with text, `to`, `quality`, `misconception_tag`, feedback;
terminal nodes with `principle`), `principle_refs[]`, optional `compare_with`, `source_ref`.
Validation: every node reachable, no dead ends, every terminal has a principle, no undeclared cycles.

## Behaviour
Score = sum of choice qualities on the path, max = best quality at each visited node. A weak ending routes
`worked_debrief_then_requeue_branch`; replay is allowed only after the debrief and a retrieval item on the
principle. Narrative text is never reshuffled. Fixture: AF-BRA-01.

## Accessibility and PDF
Each node is a heading plus a radio group; the path so far is a live list; outline view for screen readers.
PDF: a decision-tree figure and a table of all paths with endings, scores and principles.

## Evidence
HYPOTHESIS H-BRA, C. No verified primary source on administrative or legal branching games; case comparison
d=0.50 (Alfieri 2013) is the closest verified neighbour.

## Status
Works: `harness/formats/fmt-branching-case/grader.js` (validator with cycle check, walker, all-paths table)
reproducing AF-BRA-01 in `tests/contract/formats.test.js`.
Exists but unexercised: the player view (`branching()` in `harness/player/views.js`). No package routes to it yet
(the Prova 3 router skips it: no case graph, `tests/contract/prova3-package.test.js`), and no browser check drives it.
Pending: the humanities fixture and package, and a browser check that walks the view end to end.
