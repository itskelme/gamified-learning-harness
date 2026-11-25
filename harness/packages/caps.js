'use strict';
// Per-package overrides of the router's per-unit format cap (default 4, catalog r3 6.1 step 4: "cap the plan at what
// the time budget allows"). A package not listed here uses the default. Every override needs a reason, and
// docs/FORMATS.md ("Cap overrides") must document it; tests/contract/format-cap.test.js enforces both.
module.exports = {
  prova3: {
    max_formats_per_unit: 6,
    reason: 'Catalog 6.2 plans six per-unit formats for this unit, one per item derived from the lesson ' +
      '(symbols, method choice, steps, recipe order, plot, interpretation). The time budget is a full exam-review ' +
      'session, not one short sitting, so all six fit.'
  }
};
