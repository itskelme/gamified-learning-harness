---
name: fmt-data-visual-lab
description: Use when a unit has a validated data model and the learner should predict, manipulate a control and read a chart (interval width versus n, critical regions, distributions), after the procedure steps.
status: draft
---

# fmt-data-visual-lab: guided simulation and chart reading

Registry entry: `format.json`. Contract source: game-format-catalog r3 sections 4.7 and 7 (visual contract).

## Use / avoid
- Use after the steps, to explain a relationship (why the interval narrows with n, where the cutoff sits).
- Avoid as a replacement for the steps, before the learner has a schema, or when the plot would be decorative.
  A plot without a data model or data is rejected at load; the router never fabricates one.

## Inputs
`data_model` (variables with units and valid ranges, expressions evaluated by the shared evaluator),
`plot_spec` (kind, data source, marks, regions, axis labels with units, `bind` to variables and seed,
`alt.summary_template`, `provenance`, `pdf.snapshots`), `prompts[]` (predict, manipulate, read) with an oracle each.

## Behaviour
Procedural retry class: prompt order and starting control values fixed; a new variant redraws every plot from
the new data. Moving a control is logged (`control_changed`) and never scored. Fixture: AF-SIM-01.

## Accessibility and PDF
Slider plus numeric input plus click on track (WCAG 2.2 SC 2.5.7), data table of plotted points, generated text
summary, no colour-only marks, no animation, a "step" button instead of auto-play. PDF: 2 or 3 snapshots of the
same `plot_spec` at declared control values, the data table and the prediction with its answer.

## Evidence
Guidance A (Alfieri 2011); simulation as a supplement B; prediction-first prompt C; an animated abstract graph is
the weakest cell (Berney & Bétrancourt 2016), so no animation by default.

## Status
Works: the Prova 3 renderer `harness/plots.js` (CI bounds, Z and t curves, cutoffs, rejection regions, test
statistic, text alternative, compact 360-unit layout) driven by the solved variant (`tests/pilot-engine.test.js`);
`harness/formats/fmt-data-visual-lab/lab.js` reproduces AF-SIM-01 including its plot_spec sha256
(`tests/contract/formats.test.js`); `harness/formats/fmt-data-visual-lab/procedure-spec.js` turns each Prova 3 plot
into plot_spec data that matches the solved values, the renderer's text alternative and the decision key
(`tests/contract/prova3-package.test.js`); the package player view, driven by the "lab:" check in
`tests/package-browser.mjs` (controls locked until the prediction, moves logged and never scored, plot redrawn by the
engine, values table fits at 360/768/1440 px).
Exists but unexercised: none.
Pending: rendering SVG from plot_spec alone (plots.js still reads the lesson plot config); a lab view for packages
other than Prova 3.
