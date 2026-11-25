// "Fonte e convenções" copy is derived from the lesson (Sofia, t_fd19236f round 1: the teste-z PDF said its graphs
// show "o intervalo", but teste-z has no interval). ProcedurePlots.figuresCopy(lesson) names only what the lesson's
// plots draw; harness/app.js prints it. The structural half (no empty table, heading or list in the printed DOM or
// the Fonte view) is scripts/lib/empty-sections.mjs, run by the builds and by tests/a11y-browser.mjs.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const Plots = require(path.join(ROOT, 'harness/plots.js'));
const prova3 = require(path.join(ROOT, 'lessons/prova3-statistics.lesson.json'));
const testeZ = require(path.join(ROOT, 'lessons/teste-z-uma-media.lesson.json'));

const only = (lesson, kind) => ({ ...lesson, exercises: lesson.exercises.filter(e => e.plot && e.plot.kind === kind) });

test('teste-z (one hypothesis test, no interval): the figure copy never mentions an interval', () => {
  const c = Plots.figuresCopy(testeZ);
  assert.equal(typeof c, 'string');
  assert.doesNotMatch(c, /intervalo/i);
  assert.match(c, /estatística do teste/);
  assert.match(c, /valores críticos/);
});

test('Prova 3 (intervals and tests): the copy names both the interval and the test statistic', () => {
  const c = Plots.figuresCopy(prova3);
  assert.match(c, /o intervalo/);
  assert.match(c, /estatística do teste/);
});

test('interval-only lesson: interval named, no test statistic', () => {
  const c = Plots.figuresCopy(only(prova3, 'interval'));
  assert.match(c, /o intervalo/);
  assert.doesNotMatch(c, /estatística/);
});

test('the Fonte view prints figuresCopy, not a fixed sentence (source check on harness/app.js)', () => {
  const src = require('node:fs').readFileSync(path.join(ROOT, 'harness/app.js'), 'utf8');
  assert.match(src, /const figures = P\.figuresCopy\(L\);/);
  assert.match(src, /h\('p', \{ text: figures \}\)/);
  assert.doesNotMatch(src, /Os gráficos mostram/, 'the figure sentence lives in plots.js only');
});

test('a lesson without plots has no figure copy (the section is not printed)', () => {
  assert.equal(Plots.figuresCopy({ ...testeZ, exercises: testeZ.exercises.map(({ plot, ...e }) => e) }), null);
});
