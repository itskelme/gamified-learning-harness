/*
 * plot_spec for the ordered-procedure plots (catalog r3 section 7): the pilot's lesson-level `plot`
 * config plus one solved variant -> plain data (marks, regions, decision, text alternative, binding,
 * provenance, PDF snapshots). harness/plots.js renders the SVG; the spec is the data contract that the
 * PDF, the data table and the tests read. Tests: tests/contract/prova3-package.test.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../procedure-engine.js'), require('../../plots.js'));
  else root.ProcedurePlotSpec = factory(root.ProcedureEngine, root.ProcedurePlots);
})(typeof self !== 'undefined' ? self : this, function (E, Plots) {
  'use strict';

  function plotSpecFor(lesson, ex, solved, opts = {}) {
    const plot = ex.plot;
    if (!plot) throw new Error(`${ex.id}: no plot config (a plot without a data model is rejected)`);
    const need = plot.kind === 'interval' ? [plot.crit, plot.center, plot.lower, plot.upper, plot.margin] : [plot.crit, plot.stat];
    if (plot.dist === 't') need.push(plot.df);
    for (const id of need) if (!solved.values || typeof solved.values[id] !== 'number' || !Number.isFinite(solved.values[id])) throw new Error(`${ex.id}: ${id} not solved`);
    const v = id => solved.values[id];
    const dec = id => { const s = ex.steps.find(x => x.id === id); return s && s.display_decimals !== undefined ? s.display_decimals : E.decimalsOf(lesson, ex.id, id); };
    const mark = (id, role) => ({ id, role, value: v(id), label: E.formatNumber(v(id), dec(id), lesson.locale) });
    const crit = v(plot.crit);
    const spec = {
      kind: plot.kind, dist: plot.dist, df: plot.dist === 't' ? v(plot.df) : null, overlay_normal: !!plot.overlay_normal,
      axis: plot.kind === 'interval' ? { x: plot.center_symbol, unit: plot.unit || '' } : { x: plot.stat_symbol, unit: '' },
      marks: [mark(plot.crit, 'critical')],
      regions: [{ from: -crit, to: crit, label: plot.kind === 'test' ? 'NÃO rejeito H0' : '95% no meio' }, { from: null, to: -crit, label: plot.kind === 'test' ? 'Rejeito H0' : '2,5%' }, { from: crit, to: null, label: plot.kind === 'test' ? 'Rejeito H0' : '2,5%' }],
      alt: { summary: Plots.render(lesson, ex, solved, { revealAll: true }).alt },
      bind: { exercise_id: ex.id, variant_seed: opts.variant_seed === undefined ? 'original' : opts.variant_seed },
      provenance: { source_ref: pageRef(ex), computed_by: 'harness/procedure-engine.js solve()' },
      pdf: { snapshots: [{ variant_seed: opts.variant_seed === undefined ? 'original' : opts.variant_seed, reveal: 'all' }] }
    };
    if (plot.kind === 'interval') spec.marks.push(mark(plot.center, 'center'), mark(plot.lower, 'lower'), mark(plot.upper, 'upper'), mark(plot.margin, 'margin'));
    else { spec.marks.push(mark(plot.stat, 'statistic')); spec.decision = Math.abs(v(plot.stat)) > crit ? 'reject' : 'do_not_reject'; }
    return spec;
  }

  /** "PDF p.N" of the first page the answer key cites for this exercise, or null when none is recorded. */
  function pageRef(ex) {
    const pages = (ex.source_answer_key && ex.source_answer_key.pages) || {};
    const ps = Object.values(pages).filter(p => Number.isInteger(p));
    return ps.length ? `PDF p.${Math.min(...ps)}` : null;
  }

  return { plotSpecFor, pageRef };
});
