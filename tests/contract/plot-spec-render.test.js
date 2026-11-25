// SVG from plot_spec alone (card t_fd19236f): ProcedurePlots.renderSpec(spec) reads only the spec.
// 1. It equals the lesson-driven render(revealAll) byte for byte, for every Prova 3 exercise, original and seeded
//    variants, wide and compact.
// 2. It never touches the engine or the lesson: the engine's formatting functions are replaced with throwing stubs
//    while it runs, and the spec is frozen.
// 3. It follows the spec: an edited mark label or df shows up in the SVG; a spec without its marks is refused.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const E = require(path.join(ROOT, 'harness/procedure-engine.js'));
const Plots = require(path.join(ROOT, 'harness/plots.js'));
const Spec = require(path.join(ROOT, 'harness/formats/fmt-data-visual-lab/procedure-spec.js'));
const lesson = require(path.join(ROOT, 'lessons/prova3-statistics.lesson.json'));

const deepFreeze = o => { if (o && typeof o === 'object') { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); } return o; };
const cases = [];
for (const ex of lesson.exercises) {
  cases.push([ex, 'original', E.originalVariables(ex)]);
  for (const seed of [1, 2, 3, 7, 11, 101, 2026]) cases.push([ex, seed, E.drawVariant(lesson, ex, seed).variables]);
}

test('renderSpec(plot_spec) equals render(lesson, revealAll) for every exercise and variant, wide and compact', () => {
  for (const [ex, seed, vars] of cases) {
    const solved = E.solve(lesson, ex, vars), spec = Spec.plotSpecFor(lesson, ex, solved, { variant_seed: seed });
    for (const compact of [false, true]) {
      const a = Plots.render(lesson, ex, solved, { revealAll: true, compact }), b = Plots.renderSpec(spec, { compact });
      assert.equal(b.svg, a.svg, `${ex.id} ${seed} compact=${compact}`);
      assert.equal(b.alt, a.alt);
    }
    assert.equal(spec.alt.summary, Plots.renderSpec(spec).alt, `${ex.id} ${seed}: spec alt and drawn alt agree`);
  }
});

test('renderSpec reads no lesson or engine state (frozen spec, engine formatters stubbed to throw)', () => {
  const ex = lesson.exercises.find(e => e.plot.dist === 't');
  const spec = deepFreeze(JSON.parse(JSON.stringify(Spec.plotSpecFor(lesson, ex, E.solve(lesson, ex, E.originalVariables(ex))))));
  const saved = {};
  for (const k of ['formatNumber', 'decimalsOf', 'solve', 'exerciseById']) { saved[k] = E[k]; E[k] = () => { throw new Error(`engine.${k} used by renderSpec`); }; }
  try { assert.match(Plots.renderSpec(spec).svg, /^<svg /); }
  finally { Object.assign(E, saved); }
});

test('renderSpec follows the spec: edited labels and df are drawn; incomplete specs are refused', () => {
  const ex = lesson.exercises.find(e => e.plot.kind === 'interval' && e.plot.dist === 't');
  const spec = JSON.parse(JSON.stringify(Spec.plotSpecFor(lesson, ex, E.solve(lesson, ex, E.originalVariables(ex)))));
  spec.marks.find(m => m.role === 'upper').label = '999,99';
  spec.df = 42;
  const { svg, alt } = Plots.renderSpec(spec);
  assert.match(svg, />999,99</);
  assert.match(svg, /gl = 42/);
  assert.match(alt, /42 graus de liberdade/);
  const noUpper = { ...spec, marks: spec.marks.filter(m => m.role !== 'upper') };
  assert.throws(() => Plots.renderSpec(noUpper), /missing marks upper/);
  assert.throws(() => Plots.renderSpec({ ...spec, df: null }), /without df/);
  assert.throws(() => Plots.renderSpec({ kind: 'interval' }), /without marks/);
});
