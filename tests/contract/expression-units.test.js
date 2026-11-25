// Expression steps (a typed formula, compared with the key at sample points) and unit input on numeric steps
// (dimension check and conversion). The fixture (tests/fixtures/expression-units-fixture.js) is the shipped teste-z lesson with
// a formula step before the statistic and unit input on the standard error (grams).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const E = require(path.join(ROOT, 'harness/procedure-engine.js'));

const { fixture } = require(path.join(ROOT, 'tests/fixtures/expression-units-fixture.js'));

/** A run placed at the given step with the earlier steps completed by the key. */
function runAt(lesson, stepId, seed = 'original') {
  const run = E.createRun(lesson, lesson.exercises[0].id, seed);
  const ex = lesson.exercises[0];
  while (ex.steps[run.step].id !== stepId) {
    const step = ex.steps[run.step], key = run.key.steps[run.step].answer;
    const input = step.type === 'givens' ? Object.fromEntries(Object.entries(key).map(([k, v]) => [k, String(v)]))
      : step.type === 'choice' ? key
      : step.type === 'expression' ? key
      : E.formatNumber(key, step.display_decimals + 2, lesson.locale) + (step.unit_input ? ' ' + step.unit : '');
    assert.equal(E.submit(lesson, run, input).status, 'correct', `${step.id} accepts its key`);
  }
  return run;
}

test('the fixture passes the lesson contract, original data and seeded variants', () => {
  assert.deepEqual(E.validateLesson(fixture(), { seedCount: 25 }), []);
});

test('expression step: equivalent forms are accepted, whatever the spelling', () => {
  const lesson = fixture();
  for (const typed of [
    '(xbar - mu0) / ep', '(xbar-mu0)/ep', 'xbar/ep - mu0/ep', '(media − mu) ÷ EP', '-(mu0 - xbar)/ep',
    '(XBAR - MU0)/Ep', '(xbar - mu0) * ep^-1', '2(xbar - mu0)/(2ep)', '(xbar - mu0)/sqrt(ep^2)', '(xbar - mu0)/√(ep²)',
    '(1,5xbar - 1,5mu0)/(1,5ep)'
  ]) {
    const run = runAt(lesson, 'formula'), r = E.submit(lesson, run, typed);
    assert.equal(r.status, 'correct', typed);
    assert.equal(run.completed.at(-1).display, 'z = (x̄ − μ₀) / EP');
    assert.equal(run.completed.at(-1).value, undefined, 'a formula carries no number');
  }
});

test('expression step: a different formula is wrong; a declared misconception gets its own feedback', () => {
  const lesson = fixture();
  const wrong = (typed, bug) => {
    const run = runAt(lesson, 'formula'), r = E.submit(lesson, run, typed);
    assert.equal(r.status, 'wrong', typed);
    assert.equal(r.bug, bug, typed);
    assert.equal(run.errors, 1);
    assert.equal(run.awaitingRetry, true);
    return r;
  };
  assert.match(wrong('(mu0 - xbar)/ep', 'invertida').feedback, /menos o valor da hipótese/);
  assert.match(wrong('xbar - mu0', 'sem-ep').feedback, /erro padrão/);
  assert.match(wrong('(xbar - mu0) * ep', null).feedback, /dividida pelo erro padrão/);
  wrong('(xbar + mu0)/ep', null);
  wrong('xbar/ep - mu0', null);
});

test('expression step: a formula that only matches the current numbers is still wrong', () => {
  // With the original data (xbar 497, mu0 500, ep 1) the key is -3; "xbar - mu0 + ep - 1" is also -3 there.
  const lesson = fixture(), run = runAt(lesson, 'formula');
  assert.equal(run.key.values.formula, -3);
  assert.equal(E.evaluate('xbar - mu0 + ep - 1', { xbar: 497, mu0: 500, ep: 1 }), -3);
  assert.equal(E.submit(lesson, run, 'xbar - mu0 + ep - 1').status, 'wrong');
});

test('expression step: text that is not a formula in the symbols is a no-op, never an error', () => {
  const lesson = fixture();
  const cases = [
    ['', 'malformed'], ['(xbar - mu0', 'malformed'], ['xbar - / ep', 'malformed'], ['xbar = mu0', 'malformed'],
    ['(xbar - sigma)/ep', 'unknown_symbol'], ['constructor', 'unknown_symbol'], ['-3', 'no_symbols'], ['497 - 500', 'no_symbols'],
    ['(xbar - mu0)/1.960', 'ambiguous_grouping'], ['sqrt', 'malformed'], [null, 'malformed'], [{}, 'malformed']
  ];
  for (const [typed, issue] of cases) {
    const run = runAt(lesson, 'formula'), before = JSON.stringify(E.serializeRun(run)), r = E.submit(lesson, run, typed);
    assert.equal(r.status, 'invalid', String(typed));
    assert.equal(r.issue, issue, String(typed));
    assert.ok(r.message.length > 10);
    assert.equal(JSON.stringify(E.serializeRun(run)), before, 'run untouched');
  }
  const r = E.submit(lesson, runAt(lesson, 'formula'), '(xbar - sigma)/ep');
  assert.match(r.message, /“sigma” não é um símbolo deste passo\. Use: xbar, mu0, ep\./);
});

test('expression step: later steps can use its value; restart with new numbers recomputes it; progress round-trips', () => {
  const lesson = fixture((l, ex) => { ex.steps.find(s => s.id === 'z').expr = 'formula'; });
  assert.deepEqual(E.validateLesson(lesson, { seedCount: 10 }), []);
  const run = runAt(lesson, 'z');
  assert.equal(run.key.values.z, run.key.values.formula);
  const restored = E.restoreRun(lesson, JSON.parse(JSON.stringify(E.serializeRun(run))));
  assert.deepEqual(E.serializeRun(restored), E.serializeRun(run));
  assert.equal(E.submit(lesson, run, '99').status, 'wrong');
  E.retry(lesson, run, { policy: 'full', newVariant: true, seed: 12 });
  const again = runAt(lesson, 'formula', 12);
  assert.equal(E.submit(lesson, again, '(xbar - mu0)/ep').status, 'correct', 'the same formula holds for other data');
});

test('expression step: the build refuses a step that could not be graded soundly', () => {
  const problems = change => E.validateLesson(fixture(change), { seedCount: 2 }).join('\n');
  assert.match(problems((l, ex, f) => { delete f.symbols; }), /formula: needs symbols/);
  assert.match(problems((l, ex, f) => { delete f.display; }), /formula: needs display/);
  assert.match(problems((l, ex, f) => { f.expr = '(xbar - mu0) / sigma'; }), /formula: expr must use only the declared symbols/);
  assert.match(problems((l, ex, f) => { f.symbols[1] = { name: 'mu0' }; }), /symbol mu0 needs sample \[min, max\] with max > min/);
  assert.match(problems((l, ex, f) => { f.symbols[2] = { name: 'ep', ref: 'z', sample: [1, 2] }; }), /refers to z, which is not a variable, a convention or an earlier numeric step/);
  assert.match(problems((l, ex, f) => { f.bugs[0].expr = 'xbar/ep - mu0/ep'; }), /bug invertida is equivalent to the key/);
  assert.match(problems((l, ex, f) => { f.symbols[0].aliases = ['sqrt']; }), /symbol name "sqrt" cannot be typed/);
  assert.match(problems((l, ex, f) => { f.symbols[1].aliases = ['xbar']; }), /duplicate symbol name xbar/);
  assert.match(problems((l, ex, f) => { f.expr = 'ep / ep'; }), /expr does not vary over the sample ranges/);
  assert.match(problems((l, ex, f) => { f.expr = 'sqrt(ep - 5)'; }), /expr is finite at too few sample points/);
});

test('unit input: the same quantity in another unit is converted before grading', () => {
  const lesson = fixture();
  for (const typed of ['1 g', '1,000 g', '1g', '0,001 kg', '1000 mg', '1,0 G', '0.001 KG']) {
    const run = runAt(lesson, 'ep'), r = E.submit(lesson, run, typed);
    assert.equal(r.status, 'correct', typed);
    assert.ok(Math.abs(run.completed.at(-1).value - 1) < 1e-9, 'the carried value is in the step unit');
    assert.equal(run.completed.at(-1).display, '1,000 g');
  }
});

test('unit input: wrong dimension is a wrong answer with unit feedback; wrong size is a plain wrong answer', () => {
  const lesson = fixture();
  let run = runAt(lesson, 'ep'), r = E.submit(lesson, run, '1 m');
  assert.equal(r.status, 'wrong');
  assert.equal(r.unitMismatch, true);
  assert.match(r.feedback, /A unidade “m” mede outra grandeza\. A resposta deste passo é em g/);
  assert.equal(run.errors, 1);
  run = runAt(lesson, 'ep'); r = E.submit(lesson, run, '1 kg');
  assert.equal(r.status, 'wrong');
  assert.equal(r.unitMismatch, false);
  run = runAt(lesson, 'ep'); r = E.submit(lesson, run, '6 g'); // declared bug of the lesson: sigma not divided
  assert.equal(r.status, 'wrong');
  const custom = fixture((l, ex, f, ep) => { ep.unit_feedback = 'Erro padrão tem a unidade dos dados: {sigma} está em gramas.'; });
  r = E.submit(custom, runAt(custom, 'ep'), '1 s');
  assert.equal(r.feedback, 'Erro padrão tem a unidade dos dados: 6 está em gramas.');
});

test('unit input: a missing, unknown or unreadable unit is a no-op', () => {
  const lesson = fixture();
  for (const [typed, issue] of [['1', 'missing_unit'], ['1,000', 'missing_unit'], ['1 gramas', 'unknown_unit'], ['1 g/', 'malformed'], ['g', 'malformed'], ['um grama', 'malformed'], ['1.960 g', 'ambiguous_grouping'], ['', 'malformed'], [null, 'malformed']]) {
    const run = runAt(lesson, 'ep'), before = JSON.stringify(E.serializeRun(run)), r = E.submit(lesson, run, typed);
    assert.equal(r.status, 'invalid', String(typed));
    assert.equal(r.issue, issue, String(typed));
    assert.equal(JSON.stringify(E.serializeRun(run)), before, 'run untouched');
  }
  assert.match(E.submit(lesson, runAt(lesson, 'ep'), '1').message, /Inclua a unidade depois do número \(este passo pede g\)/);
});

test('unit input: a saved value is checked in the step unit when progress is restored', () => {
  const lesson = fixture(), run = runAt(lesson, 'formula');
  const saved = JSON.parse(JSON.stringify(E.serializeRun(run)));
  assert.doesNotThrow(() => E.restoreRun(lesson, saved));
  saved.completed.find(c => c.id === 'ep').value = 1000; // "1000 mg" was typed, but 1000 is not the value in grams
  assert.throws(() => E.restoreRun(lesson, saved), /Valor salvo inválido no passo ep/);
});

test('units: compound units reduce to the same dimensions and the right factor', () => {
  const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`);
  const kmh = E.parseUnit('km/h'), ms = E.parseUnit('m/s');
  assert.ok(E.sameDimensions(kmh.dims, ms.dims));
  close(72 * kmh.factor / ms.factor, 20);
  assert.ok(E.sameDimensions(E.parseUnit('kg·m/s²').dims, E.parseUnit('N').dims));
  assert.ok(E.sameDimensions(E.parseUnit('N m').dims, E.parseUnit('J').dims));
  assert.ok(E.sameDimensions(E.parseUnit('J/s').dims, E.parseUnit('kW').dims));
  close(E.parseUnit('kW').factor / E.parseUnit('J/s').factor, 1000);
  close(E.parseUnit('L').factor / E.parseUnit('cm^3').factor, 1000);
  close(E.parseUnit('g/cm³').factor / E.parseUnit('kg/m^3').factor, 1000);
  assert.ok(!E.sameDimensions(E.parseUnit('m/s').dims, E.parseUnit('m/s^2').dims));
  assert.ok(!E.sameDimensions(E.parseUnit('N').dims, E.parseUnit('J').dims));
  assert.deepEqual(E.parseUnit('furlong'), { unknown: 'furlong' });
  assert.equal(E.parseUnit(''), null);
  assert.equal(E.parseUnit('m//s'), null);
  // A unit outside the table is its own dimension for the step that declares it.
  const lesson = fixture((l, ex, f, ep) => { ep.unit = 'g/embalagem'; });
  assert.deepEqual(E.validateLesson(lesson, { seedCount: 2 }), []);
  assert.equal(E.submit(lesson, runAt(lesson, 'ep'), '1 g/embalagem').status, 'correct');
  assert.equal(E.submit(lesson, runAt(lesson, 'ep'), '0,001 kg/embalagem').status, 'correct');
  assert.equal(E.submit(lesson, runAt(lesson, 'ep'), '1 g').unitMismatch, true);
  assert.match(E.validateLesson(fixture((l, ex, f, ep) => { ep.unit = ''; }), { seedCount: 2 }).join('\n'), /ep: unit_input needs a readable unit/);
});

test('lessons without the new fields behave as before', () => {
  const lesson = require(path.join(ROOT, 'lessons/teste-z-uma-media.lesson.json'));
  const run = E.createRun(lesson, lesson.exercises[0].id, 'original');
  while (lesson.exercises[0].steps[run.step].id !== 'ep') {
    const step = lesson.exercises[0].steps[run.step], key = run.key.steps[run.step].answer;
    E.submit(lesson, run, step.type === 'givens' ? Object.fromEntries(Object.entries(key).map(([k, v]) => [k, String(v)])) : step.type === 'choice' ? key : String(key).replace('.', ','));
  }
  assert.equal(E.submit(lesson, run, '1 g').status, 'invalid', 'a unit is not read unless the step asks for it');
  assert.equal(E.submit(lesson, run, '1').status, 'correct');
});
