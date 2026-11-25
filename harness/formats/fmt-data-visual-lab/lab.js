/*
 * fmt-data-visual-lab model helpers (catalog r3 sections 4.7 and 7, fixture AF-SIM-01).
 * Port of sim_state / pdf_micro and the AF-SIM-01 plot_spec in catalog-tools/format_fixtures.py.
 * Moving a control is logged (control_changed) and never scored.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../core/prng.js'), require('node:crypto'));
  else root.DataVisualLab = factory(root.HarnessPrng, null);
})(typeof self !== 'undefined' ? self : this, function (prng, nodeCrypto) {
  'use strict';
  const halfUp = prng.halfUp;

  /** erfc with fractional error < 1.2e-7 (Chebyshev fit, Numerical Recipes erfcc). */
  function erfc(x) {
    const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
    const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 +
      t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
    return x >= 0 ? r : 2 - r;
  }

  function pdfMicro(x) { return Math.floor(Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI) * 1e6 + 0.5); }

  /** Normal mean interval, sigma known: x_bar +/- z * sigma / sqrt(n). */
  function simState(n, sigma = 8.0, xbar = 72.0, z = 1.96) {
    const se = sigma / Math.sqrt(n), e = z * se;
    return { n, se: halfUp(se, 4), margin: halfUp(e, 4), lower: halfUp(xbar - e, 3), upper: halfUp(xbar + e, 3), width: halfUp(2 * e, 4) };
  }

  function expectedWidthChange(nFrom, nTo, sigma, xbar, z) {
    const r = simState(nTo, sigma, xbar, z).width / simState(nFrom, sigma, xbar, z).width;
    return Math.abs(r - 0.5) < 1e-9 ? 'halve' : Math.abs(r - 2) < 1e-9 ? 'double' : Math.abs(r - 1) < 1e-9 ? 'stay equal' : 'other';
  }

  function afSimPlotSpec() {
    const xs = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
    return {
      kind: 'line', x: xs, y_micro: xs.map(pdfMicro),
      marks: [{ x: -1.96, label: '-z' }, { x: 1.96, label: '+z' }],
      tail_area_each_exact: halfUp(0.5 * erfc(1.96 / Math.SQRT2), 6),
      tail_area_instructor_table: halfUp(0.5 - 0.4750, 4),
      note: 'exact 0.024998 vs table 0.5-0.4750=0.0250: show both, accept either'
    };
  }

  /** json.dumps(v, sort_keys=True, separators=(",", ":")) with Python's default ensure_ascii. */
  function canonicalJson(v) {
    if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${canonicalJson(k)}:${canonicalJson(v[k])}`).join(',')}}`;
    if (typeof v === 'string') return JSON.stringify(v).replace(/[\u007f-￿]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
    return JSON.stringify(v);
  }
  function specSha256(spec) {
    if (!nodeCrypto) throw new Error('specSha256 runs at build time (Node)');
    return nodeCrypto.createHash('sha256').update(canonicalJson(spec)).digest('hex');
  }

  /** Prediction first, then the control moves (logged, never scored), then completion and route. */
  function predictionEvents(itemId, stepId, pick, expected, controlId, values) {
    const ok = pick === expected;
    return [
      { type: 'answer_submitted', item_id: itemId, step_id: stepId, response: pick, result: ok ? 'correct' : 'incorrect', score: { earned: ok ? 1 : 0, max: 1 }, assisted: false },
      ...values.map(value => ({ type: 'control_changed', item_id: itemId, control_id: controlId, value })),
      { type: 'item_completed', item_id: itemId, score: { earned: ok ? 1 : 0, max: 1 }, unaided: true },
      { type: 'outcome', item_id: itemId, route: ok ? 'advance' : 'worked_debrief', parameters: {} }
    ];
  }

  function fillAlt(template, values) { return template.replace(/\{([a-z_]+)\}/g, (m, k) => (k in values ? String(values[k]) : m)); }

  return { erfc, pdfMicro, simState, expectedWidthChange, afSimPlotSpec, canonicalJson, specSha256, predictionEvents, fillAlt };
});
