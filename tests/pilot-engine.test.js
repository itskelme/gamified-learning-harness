'use strict';
// Node test suite for the ordered-procedure engine and linked plots (Prova 3 pilot).
// Run: node --test tests/pilot-engine.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const E = require(path.join(ROOT, 'harness/procedure-engine.js'));
const P = require(path.join(ROOT, 'harness/plots.js'));
const lesson = JSON.parse(fs.readFileSync(path.join(ROOT, 'lessons/prova3-statistics.lesson.json'), 'utf8'));
const SEEDS = Array.from({ length: 150 }, (_, i) => 1000 + i * 7919);

function correctInput(run) {
  const step = E.currentStep(lesson, run);
  const key = run.key.steps[run.step];
  if (step.type === 'choice') return key.answer;
  if (step.type === 'givens') {
    const out = {};
    for (const f of step.fields) out[f.var] = E.formatNumber(run.key.values[f.var], E.decimalsOf(lesson, run.exercise, f.var), lesson.locale);
    return out;
  }
  return E.formatNumber(key.answer, step.display_decimals, lesson.locale);
}

test('original data of all five exercises reproduce the PDF answer key at the printed decimals', () => {
  assert.equal(lesson.exercises.length, 5);
  for (const ex of lesson.exercises) {
    const solved = E.solve(lesson, ex, E.originalVariables(ex));
    assert.deepEqual(solved.problems, [], ex.id);
    const printed = ex.source_answer_key.printed;
    assert.ok(Object.keys(printed).length >= 4, ex.id);
    for (const [id, text] of Object.entries(printed)) {
      assert.ok(ex.steps.find(s => s.id === id), `${ex.id}: key refers to missing step ${id}`);
      assert.equal(E.matchesPrinted(solved.values[id], text), true, `${ex.id}.${id}: engine ${solved.values[id]} vs PDF ${text}`);
    }
    for (const [id, choice] of Object.entries(ex.source_answer_key.choices || {})) {
      assert.equal(solved.values[id], choice, `${ex.id}.${id}`);
    }
  }
});

test('printed-key comparator detects a 0,001 difference in a CI bound', () => {
  // PDF p.17 prints EP ~ 0,025; carrying that rounded value gives (0,541; 0,639), not the p.10 key.
  const roundedChainLower = 0.59 - 1.96 * 0.025, roundedChainUpper = 0.59 + 1.96 * 0.025;
  assert.equal(E.matchesPrinted(roundedChainLower, '0,542'), false);
  assert.equal(E.matchesPrinted(roundedChainUpper, '0,638'), false);
  assert.equal(E.matchesPrinted(70.041, '70,040'), false);
  assert.equal(E.matchesPrinted(70.0404, '70,040'), true);
  // Ex2 with the exact t quantile instead of the instructor table moves E off the printed 2,557.
  assert.equal(E.matchesPrinted(2.131449546 * 1.2, '2,557'), false);
});

test('statement template rendered with the original data equals the original statement', () => {
  for (const ex of lesson.exercises) {
    const solved = E.solve(lesson, ex, E.originalVariables(ex));
    assert.equal(E.statement(lesson, { exercise: ex.id, key: solved }), ex.original_statement, ex.id);
  }
});

test('the first attempt uses the original statement and numbers', () => {
  for (const ex of lesson.exercises) {
    const run = E.createRun(lesson, ex.id, 'original');
    assert.equal(run.seed, 'original');
    assert.equal(E.statement(lesson, run), ex.original_statement, ex.id);
  }
});

test('same seed reproduces the same validated variant; variants differ from the original', () => {
  for (const ex of lesson.exercises) {
    const a = E.drawVariant(lesson, ex, 424242), b = E.drawVariant(lesson, ex, 424242);
    assert.deepEqual(a.variables, b.variables, ex.id);
    assert.notDeepEqual(a.variables, E.originalVariables(ex), ex.id);
    const c = E.drawVariant(lesson, ex, 424243);
    assert.notDeepEqual(a.variables, c.variables, ex.id);
  }
});

test('every seeded variant satisfies constraints, keeps method branch and step order', () => {
  for (const ex of lesson.exercises) {
    const base = E.solve(lesson, ex, E.originalVariables(ex));
    const order = base.steps.map(s => s.id);
    const methodStep = ex.steps.find(s => s.role === 'method');
    for (const seed of SEEDS) {
      const v = E.drawVariant(lesson, ex, seed);
      const solved = E.solve(lesson, ex, v.variables);
      assert.deepEqual(solved.problems, [], `${ex.id} seed ${seed}`);
      assert.deepEqual(solved.steps.map(s => s.id), order);
      assert.equal(solved.steps.find(s => s.id === methodStep.id).answer, ex.branch);
      assert.equal(E.statement(lesson, { exercise: ex.id, key: solved }).includes('{'), false);
    }
  }
});

test('a variant that leaves the instructor t table is rejected before delivery', () => {
  const ex = lesson.exercises.find(e => e.id === 'ex2-ic-media-t');
  const bad = { ...E.originalVariables(ex), n: 18 }; // gl = 17 is not in the table excerpt
  const solved = E.solve(lesson, ex, bad);
  assert.ok(solved.problems.some(p => /tabela/.test(p)), solved.problems.join('; '));
});

test('locale-aware number input accepts comma or point and rejects malformed input', () => {
  assert.equal(E.parseNumber('2,5', 'pt-BR'), 2.5);
  assert.equal(E.parseNumber('2.5', 'pt-BR'), 2.5);
  assert.equal(E.parseNumber(' -0,0246 ', 'pt-BR'), -0.0246);
  assert.equal(E.parseNumber('1.234,5', 'pt-BR'), 1234.5);
  assert.equal(E.parseNumber('54,2%', 'pt-BR', { percent: true }), 0.542);
  for (const bad of ['', 'abc', '2,5,1', '1e999', '--2']) assert.ok(Number.isNaN(E.parseNumber(bad, 'pt-BR')), bad);
  assert.equal(E.formatNumber(70.04, 3, 'pt-BR'), '70,040');
});

test('malformed input is not counted as an error', () => {
  const run = E.createRun(lesson, 'ex1-ic-media-z', 'original');
  run.step = run.key.steps.findIndex(s => s.id === 'ep');
  const r = E.submit(lesson, run, 'abc');
  assert.equal(r.status, 'invalid');
  assert.equal(run.errors, 0);
  assert.equal(run.attempts, 0);
});

test('known misconception gets targeted feedback (rounded standard error, PDF p.10)', () => {
  const run = E.createRun(lesson, 'ex3-ic-proporcao', 'original');
  run.step = run.key.steps.findIndex(s => s.id === 'E');
  const r = E.submit(lesson, run, '0,049');
  assert.equal(r.status, 'wrong');
  assert.equal(r.bug, 'ep-arredondado-cedo');
});

test('wrong answer under failed-step mode with a new variant recomputes all earlier results', () => {
  const run = E.createRun(lesson, 'ex5-teste-t-conjunto', 'original');
  const target = run.key.steps.findIndex(s => s.id === 'ep');
  while (run.step < target) assert.equal(E.submit(lesson, run, correctInput(run)).status, 'correct');
  const oldKey = JSON.parse(JSON.stringify(run.key));
  assert.equal(E.submit(lesson, run, '9,999').status, 'wrong');
  E.retry(lesson, run, { policy: 'failed-step', newVariant: true, seed: 777 });
  assert.equal(run.seed, 777);
  assert.equal(run.step, target, 'failed-step returns to the failed step');
  assert.notDeepEqual(run.key.values, oldKey.values);
  const fresh = E.solve(lesson, E.exerciseById(lesson, run.exercise), run.variables);
  for (let i = 0; i < target; i++) {
    const id = run.key.steps[i].id;
    assert.deepEqual(run.key.steps[i], fresh.steps[i], `step ${id} must be recomputed for the new variant`);
    assert.equal(run.completed[i].display, E.displayFor(lesson, run, i), `completed ${id} shows the fresh value`);
  }
  assert.deepEqual(run.key.steps.map(s => s.id), oldKey.steps.map(s => s.id));
});

test('restart policies return to the documented step', () => {
  const exId = 'ex4-teste-z-duas-medias';
  const expect = { full: 0, 'failed-step': null, checkpoint: 'cp', 'after-n-errors': null };
  for (const policy of Object.keys(expect)) {
    const run = E.createRun(lesson, exId, 'original');
    const target = run.key.steps.findIndex(s => s.id === 'z');
    while (run.step < target) E.submit(lesson, run, correctInput(run));
    E.submit(lesson, run, '0');
    E.retry(lesson, run, { policy, newVariant: false, afterN: 2 });
    const ex = E.exerciseById(lesson, exId);
    let cp = 0; for (let i = 0; i < target; i++) if (ex.steps[i].checkpoint) cp = i + 1;
    const want = policy === 'full' ? 0 : policy === 'checkpoint' ? cp : target;
    assert.equal(run.step, want, policy);
    if (policy === 'after-n-errors') {
      E.submit(lesson, run, '0');
      E.retry(lesson, run, { policy, newVariant: false, afterN: 2 });
      assert.equal(run.step, 0, 'second error triggers full restart');
    }
  }
});

test('full walkthrough of all five original exercises completes', () => {
  for (const ex of lesson.exercises) {
    const run = E.createRun(lesson, ex.id, 'original');
    let guard = 0;
    while (!run.finished && guard++ < 50) assert.equal(E.submit(lesson, run, correctInput(run)).status, 'correct', `${ex.id} step ${run.step}`);
    assert.equal(run.finished, true, ex.id);
    assert.equal(run.errors, 0);
  }
});

function runAt(exId, stepId) {
  const run = E.createRun(lesson, exId, 'original');
  run.step = run.key.steps.findIndex(s => s.id === stepId);
  assert.ok(run.step >= 0, stepId);
  return run;
}

test('D1: Z vs t is decided by sigma known, not by n >= 30 (n = 31 keeps the t branch)', () => {
  const ex = lesson.exercises.find(e => e.id === 'ex2-ic-media-t');
  assert.ok(ex.variables.n.values.includes(31), 'one-sample n must allow 31 (gl = 30 is a table row)');
  const solved = E.solve(lesson, ex, { ...E.originalVariables(ex), n: 31 });
  assert.deepEqual(solved.problems, []);
  assert.equal(solved.values.metodo, 't_mean_ci');
  assert.equal(solved.values.tc, 2.042);
  const allowed = new Set([10, 12, 15, 16, 19, 20, 30]);
  for (const seed of SEEDS) assert.ok(allowed.has(E.solve(lesson, ex, E.drawVariant(lesson, ex, seed).variables).values.gl), `seed ${seed}`);
});

test('D2: Ex5 accepts both 2,724 and 2,725 and names the carry path, never as a bug', () => {
  for (const typed of ['2,724', '2,725']) {
    const run = runAt('ex5-teste-t-conjunto', 't');
    const r = E.submit(lesson, run, typed);
    assert.equal(r.status, 'correct', typed);
    assert.equal(r.bug, undefined);
  }
  const run = runAt('ex5-teste-t-conjunto', 't');
  assert.equal(E.submit(lesson, run, '2,725').path, 'rounded-printed');
});

test('D4: Ex2 learner steps accept the exact-t path while the printed comparator flags it', () => {
  const ex = lesson.exercises.find(e => e.id === 'ex2-ic-media-t');
  const exact = E.solve(lesson, ex, E.originalVariables(ex), { overrides: ex.accepted_paths.find(p => p.id === 'exact-t').overrides });
  assert.equal(E.matchesPrinted(exact.values.E, '2,557'), false, 'source fidelity: exact-t drifts from the key');
  for (const id of ['E', 'lower', 'upper']) {
    const run = runAt(ex.id, id);
    const typed = E.formatNumber(exact.values[id], 3, 'pt-BR');
    const r = E.submit(lesson, run, typed);
    assert.equal(r.status, 'correct', `${id}=${typed}`);
    assert.equal(r.path, 'exact-t');
  }
  const run = runAt(ex.id, 'lower');
  assert.equal(E.submit(lesson, run, '35,845').status, 'wrong', 'bounds tolerance is +-0,001');
});

test('Ex3 bound from the rounded EP 0,025 chain is rejected for the learner too', () => {
  const run = runAt('ex3-ic-proporcao', 'lower');
  assert.equal(E.submit(lesson, run, '0,541').status, 'wrong');
  const ok = runAt('ex3-ic-proporcao', 'lower');
  assert.equal(E.submit(lesson, ok, '54,2%').status, 'correct');
});

test('explore prediction answer is computed from the model, not hand-coded', () => {
  const want = { 'ex1-ic-media-z': 'diminui', 'ex2-ic-media-t': 'aumenta', 'ex3-ic-proporcao': 'diminui', 'ex4-teste-z-duas-medias': 'aumenta', 'ex5-teste-t-conjunto': 'aumenta' };
  for (const ex of lesson.exercises) assert.equal(E.predictionAnswer(lesson, ex), want[ex.id], ex.id);
});

test('expression language cannot reach host objects', () => {
  for (const src of ['constructor', 'this', 'globalThis', 'n.constructor', 'process']) {
    assert.throws(() => E.evaluate(src, { n: 1 }), /./, src);
  }
  assert.equal(E.evaluate('sqrt(n) + 2^3', { n: 16 }), 12);
});

test('linked plots are generated from the solved values and change with the variant', () => {
  for (const ex of lesson.exercises) {
    const original = E.solve(lesson, ex, E.originalVariables(ex));
    const variant = E.solve(lesson, ex, E.drawVariant(lesson, ex, 31337).variables);
    const a = P.render(lesson, ex, original, { revealAll: true });
    const b = P.render(lesson, ex, variant, { revealAll: true });
    assert.notEqual(a.svg, b.svg, ex.id);
    assert.notEqual(a.alt, b.alt, ex.id);
    for (const id of ex.plot.label_values) {
      const step = ex.steps.find(s => s.id === id);
      const shown = E.formatNumber(variant.values[id], step.display_decimals, lesson.locale);
      assert.ok(b.svg.includes(shown), `${ex.id}: plot shows ${id}=${shown}`);
      assert.ok(b.alt.includes(shown), `${ex.id}: text alternative states ${id}=${shown}`);
    }
    assert.match(a.svg, /^<svg [^>]*role="img"/);
  }
});

test('learner tolerance on CI bounds, margins and test statistics never absorbs a 0,001 difference beyond the declared paths', () => {
  for (const ex of lesson.exercises) {
    const p = ex.plot, strict = new Set([p.lower, p.upper, p.margin, p.stat].filter(Boolean));
    for (const s of ex.steps.filter(x => strict.has(x.id) || x.role === 'statistic')) {
      assert.ok(s.tolerance.abs <= 0.001, `${ex.id}.${s.id}: tolerance ${s.tolerance.abs} > 0,001`);
      if (p.percent && (s.id === p.lower || s.id === p.upper)) assert.ok(s.tolerance.abs <= 0.0005, `${ex.id}.${s.id}: proportion bound tolerance ${s.tolerance.abs}`);
    }
  }
});

test('compact plot (narrow screens) uses a 360-unit viewBox, keeps every label inside it and does not change the text alternative', () => {
  for (const ex of lesson.exercises) {
    const solved = E.solve(lesson, ex, E.originalVariables(ex));
    const wide = P.render(lesson, ex, solved, { revealAll: true }), narrow = P.render(lesson, ex, solved, { revealAll: true, compact: true });
    assert.match(narrow.svg, /viewBox="0 0 360 /, ex.id);
    assert.match(wide.svg, /viewBox="0 0 640 /, ex.id);
    assert.equal(narrow.alt, wide.alt, ex.id);
    for (const m of narrow.svg.matchAll(/<text x="([\d.]+)"/g)) assert.ok(Number(m[1]) >= 0 && Number(m[1]) <= 360, `${ex.id}: label x=${m[1]}`);
    assert.ok(!narrow.svg.includes('tracejado: normal Z'), `${ex.id}: wide legend omitted in compact (stays in the caption)`);
  }
});

test('plot reveals only values the learner has already produced', () => {
  const ex = lesson.exercises.find(e => e.id === 'ex4-teste-z-duas-medias');
  const solved = E.solve(lesson, ex, E.originalVariables(ex));
  const early = P.render(lesson, ex, solved, { revealed: new Set(['givens']) });
  assert.equal(early.svg.includes('2,500'), false);
  const late = P.render(lesson, ex, solved, { revealed: new Set(ex.steps.map(s => s.id)) });
  assert.ok(late.svg.includes('2,500'));
});

test('test plots keep the "Rejeito H0" tail labels clear of the statistic line (wide) and on top with a halo (all layouts)', () => {
  const HALF_LABEL = 32; // half the width of "Rejeito H0" at font-size 12, in SVG units
  for (const ex of lesson.exercises.filter(e => e.plot.kind === 'test')) {
    for (const vars of [E.originalVariables(ex), ...SEEDS.slice(0, 40).map(s => E.drawVariant(lesson, ex, s).variables)]) {
      const solved = E.solve(lesson, ex, vars);
      for (const compact of [false, true]) {
        const svg = P.render(lesson, ex, solved, { revealAll: true, compact }).svg;
        const statX = Number(svg.match(/<line x1="([\d.]+)" y1="[\d.]+" x2="\1" y2="[\d.]+" stroke="#b35400"/)[1]);
        const tails = [...svg.matchAll(/<text x="([\d.]+)"[^>]*>Rejeito H0<\/text>/g)];
        assert.equal(tails.length, 2, ex.id);
        for (const m of tails) {
          assert.ok(svg.indexOf(m[0]) > svg.indexOf('stroke="#b35400"'), `${ex.id}: tail label is painted above the statistic line`);
          assert.match(m[0], /paint-order="stroke"[^>]*stroke="#fff"/, `${ex.id}: tail label has a white halo`);
          if (!compact) assert.ok(Math.abs(Number(m[1]) - statX) >= HALF_LABEL, `${ex.id}: tail label at x=${m[1]} crosses the statistic at x=${statX}`);
        }
      }
    }
  }
});

test('lesson contract requires learner-facing restart help separate from the source rationale', () => {
  assert.deepEqual(E.validateLesson(lesson, { seedCount: 5 }), []);
  for (const k of ['learner_help', 'source_rationale']) {
    const broken = JSON.parse(JSON.stringify(lesson));
    delete broken.restart[k];
    assert.ok(E.validateLesson(broken, { seedCount: 5 }).includes(`missing restart.${k}`), k);
  }
});

// ------------------------------------------------------------------ round 3: carry the accepted values
// A learner types each step at the decimals the app asks for and computes the next step from what they
// typed (and saw accepted). Decimal-exact half-up rounding, as with a calculator.
const halfUp = (v, d) => { const x = Number(v.toPrecision(12)), f = 10 ** d; return Math.sign(x) * Math.round(Math.abs(x) * f + 1e-7) / f; };
const T_TABLE = lesson.conventions.t_table;
const LEARNER_FNS = { sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max,
  tcrit: df => (Object.hasOwn(T_TABLE, String(df)) ? T_TABLE[String(df)] : NaN), intable: df => Object.hasOwn(T_TABLE, String(df)),
  tquant: df => E.tQuantile(1 - (1 - lesson.conventions.confidence) / 2, df) };
const CARRY_SEEDS = ['original', ...Array.from({ length: 200 }, (_, i) => i + 1)];

/** Play one run through E.submit, typing what a learner computes from their own typed values. */
function playCarrying(exId, seed, typeFor) {
  const run = E.createRun(lesson, exId, seed), ex = E.exerciseById(lesson, exId);
  const scope = Object.assign(Object.create(null), { z95: lesson.conventions.z95 }, run.variables);
  const rejected = [], paths = [];
  while (!run.finished) {
    const step = E.currentStep(lesson, run);
    if (step.type !== 'numeric') { assert.equal(E.submit(lesson, run, correctInput(run)).status, 'correct'); continue; }
    const v = E.evaluate(step.expr, scope, LEARNER_FNS), typed = typeFor(step, v);
    const r = E.submit(lesson, run, E.formatNumber(typed, step.display_decimals, lesson.locale));
    if (r.status !== 'correct') {
      rejected.push(`${seed} ${step.id}: typed ${E.formatNumber(typed, step.display_decimals, lesson.locale)}, key ${E.formatNumber(run.key.values[step.id], step.display_decimals, lesson.locale)}`);
      E.retry(lesson, run, { policy: 'failed-step', newVariant: false });
      // Continue with the key so later steps are still exercised.
      scope[step.id] = run.key.values[step.id];
      E.submit(lesson, run, correctInput(run));
      continue;
    }
    if (r.path) paths.push(r.path);
    scope[step.id] = typed;
  }
  return { run, rejected, paths, ex };
}

test('carry: a learner who carries the displayed values is accepted at every step (originals + seeds 1-200)', () => {
  const bad = [];
  for (const ex of lesson.exercises) for (const seed of CARRY_SEEDS) bad.push(...playCarrying(ex.id, seed, (st, v) => halfUp(v, st.display_decimals)).rejected.map(s => `${ex.id} ${s}`));
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} rejected steps`);
  // Stateless (no stored learner values): the declared display-carry path alone accepts the same answers.
  const stateless = [];
  for (const ex of lesson.exercises) for (const seed of CARRY_SEEDS) {
    const run = E.createRun(lesson, ex.id, seed);
    const scope = Object.assign(Object.create(null), { z95: lesson.conventions.z95 }, run.variables);
    ex.steps.forEach((st, i) => {
      if (st.type !== 'numeric') return;
      const typed = halfUp(E.evaluate(st.expr, scope, LEARNER_FNS), st.display_decimals);
      const r = E.check(lesson, { ...run, step: i }, E.formatNumber(typed, st.display_decimals, lesson.locale));
      if (!r.correct) stateless.push(`${ex.id} ${seed} ${st.id}`);
      scope[st.id] = typed;
    });
  }
  assert.deepEqual(stateless.slice(0, 10), [], `${stateless.length} rejected without stored values`);
});

test('carry: a learner one unit off at ONE step (where the step allows it) who then carries honestly is followed through', () => {
  // Round 4 policy: follow-through accepts honest rounding of the learner's own values, not a fresh tolerance per
  // step. Stacking a unit at every step is the drift the bound rejects (next tests); one slip carried honestly is not.
  const bad = [], seen = new Set();
  let slips = 0;
  for (const ex of lesson.exercises) for (const seed of CARRY_SEEDS) {
    const eligible = ex.steps.filter(st => st.type === 'numeric' && 1.5 * 10 ** -st.display_decimals <= (st.tolerance.abs || 0));
    for (const slipAt of eligible.map(st => st.id)) {
      slips++;
      const res = playCarrying(ex.id, seed, (st, v) => {
        const unit = 10 ** -st.display_decimals, base = halfUp(v, st.display_decimals);
        return st.id === slipAt ? halfUp(base + unit, st.display_decimals) : base;
      });
      bad.push(...res.rejected.map(s => `${ex.id} slip@${slipAt} ${s}`));
      res.paths.forEach(p => seen.add(p));
    }
  }
  assert.ok(slips > 1000, `slips ${slips}`);
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} rejected steps`);
  assert.ok(seen.has('learner-carry'), 'some step is accepted only through the learner-carry path');
});

test('carry: honest follow-through after tier-1 edges on every earlier step is always accepted', () => {
  // Edge learner (farthest accepted value, both directions) on every numeric step but the last, then the honest
  // rounding of their own carried result on the last one: always within rounding of learner-carry, so accepted.
  let accepted = 0;
  const plain = [];
  for (const ex of lesson.exercises) for (const seed of CARRY_SEEDS.slice(0, 80)) for (const dir of [1, -1]) {
    const run = E.createRun(lesson, ex.id, seed), numeric = ex.steps.filter(s => s.type === 'numeric');
    const lastId = numeric[numeric.length - 1].id;
    while (!run.finished) {
      const st = E.currentStep(lesson, run);
      if (st.type !== 'numeric') { E.submit(lesson, run, correctInput(run)); continue; }
      const u = 10 ** -st.display_decimals, mine = Object.create(null);
      for (const c of run.completed) if (c && typeof c.value === 'number') mine[c.id] = c.value;
      const target = E.solve(lesson, ex, run.variables, { carried: mine }).values[st.id];
      const fmt = x => E.formatNumber(E.roundTo(x, st.display_decimals), st.display_decimals, lesson.locale);
      if (st.id === lastId) {
        const r = E.submit(lesson, run, fmt(target));
        if (r.status === 'correct') accepted++;
        else plain.push(`${ex.id} ${seed} ${dir} ${st.id}: ${r.bug || 'wrong'}`);
        break;
      }
      let typed = null;
      for (let k = Math.ceil(E.toleranceFor(st, target) / u) + 3; k >= 0 && typed === null; k--) if (E.check(lesson, run, fmt(target + dir * k * u)).correct) typed = fmt(target + dir * k * u);
      E.submit(lesson, run, typed === null ? correctInput(run) : typed);
    }
  }
  assert.deepEqual(plain.slice(0, 5), [], `${plain.length} rejections`);
  assert.equal(accepted, lesson.exercises.length * 80 * 2);
});

test('carry: accepted learner values persist, restore reproduces the grading and forged carried values are rejected', () => {
  // Ex4 seed 3 (one slip, then honest carry; found by probe): v1 typed 2,559 (key 2,561, inside ±0,002), then the
  // learner's own sum 8,011 and EP 2,830; z = 3,534 is accepted only by following the learner's own values.
  const run = E.createRun(lesson, 'ex4-teste-z-duas-medias', 3);
  while (E.currentStep(lesson, run).id !== 'v1') E.submit(lesson, run, correctInput(run));
  assert.equal(E.submit(lesson, run, '2,559').status, 'correct');
  assert.equal(E.submit(lesson, run, correctInput(run)).status, 'correct');
  assert.equal(E.submit(lesson, run, '8,011').status, 'correct');
  assert.equal(E.submit(lesson, run, '2,830').status, 'correct');
  assert.equal(run.completed.find(c => c.id === 'v1').value, 2.559);
  // Save before z, reload, then grade z: the reloaded run must follow the stored values.
  const saved = JSON.parse(JSON.stringify(E.serializeRun(run)));
  const back = E.restoreRun(lesson, saved);
  assert.deepEqual(back.completed.map(c => c.value), run.completed.map(c => c.value));
  const z = E.submit(lesson, back, '3,534');
  assert.equal(z.status, 'correct');
  assert.equal(z.path, 'learner-carry');
  assert.match(z.note, new RegExp(E.formatNumber(run.key.values.z, 3, lesson.locale)), 'the note states the key value');
  const lost = JSON.parse(JSON.stringify(saved));
  lost.completed.forEach(c => delete c.value);
  assert.equal(E.check(lesson, E.restoreRun(lesson, lost), '3,534').correct, false, 'without the stored values 3,534 is not followed');
  const forged = JSON.parse(JSON.stringify(saved));
  forged.completed.find(c => c.id === 'v1').value = 2.5;
  assert.throws(() => E.restoreRun(lesson, forged), /valor/i);
});

test('carry: a new variant drops the old carried values, so nothing stale feeds the grading', () => {
  const run = E.createRun(lesson, 'ex4-teste-z-duas-medias', 'original');
  while (E.currentStep(lesson, run).id !== 'v1') E.submit(lesson, run, correctInput(run));
  E.submit(lesson, run, '2,002');
  E.submit(lesson, run, '9,999');
  E.retry(lesson, run, { policy: 'failed-step', newVariant: true, seed: 4242 });
  assert.ok(run.completed.every(c => c.value === undefined && c.how === 'recomputed'));
});

test('carry: the rounded EP 0,025 chain of PDF p.17 is still rejected end to end (Ex3)', () => {
  const run = E.createRun(lesson, 'ex3-ic-proporcao', 'original');
  while (E.currentStep(lesson, run).id !== 'ep') E.submit(lesson, run, correctInput(run));
  assert.equal(E.submit(lesson, run, '0,025').status, 'wrong');
  const ok = E.createRun(lesson, 'ex3-ic-proporcao', 'original');
  while (E.currentStep(lesson, ok).id !== 'lower') E.submit(lesson, ok, correctInput(ok));
  assert.equal(E.submit(lesson, ok, '0,541').status, 'wrong');
});

// Arithmetic self-consistency of rendered text. Independent parser (not the engine's).
function arithmeticFindings(text) {
  const out = { checked: 0, bad: [], unparsed: [] };
  const NUM = /^[−-]?\d+(?:,\d+)?$/, EXPR = /^[\d,\s×÷/+\-−()√²]*\d[\d,\s×÷/+\-−()√²]*$/;
  const toJs = s => s.replace(/(\d),(\d)/g, '$1.$2').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
    .replace(/²/g, '**2').replace(/√(\d+(?:\.\d+)?)/g, 'Math.sqrt($1)').replace(/√\(/g, 'Math.sqrt(');
  const val = s => Function(`"use strict"; return (${toJs(s)});`)();
  const strip = s => s.trim().replace(/(\s+[A-Za-zÀ-ÿ]+)+$/u, '').trim();
  const cleaned = text.replace(/\((?:=\s*)?[^()]*%\)/g, '');
  for (const clause of cleaned.split(/;|⇒|\.(?=\s|$)|\s+e\s+/)) {
    const parts = clause.split(/\s*(=|≈)\s*/);
    for (let i = 0; i + 2 < parts.length; i += 2) {
      const L = strip(parts[i]), R = strip(parts[i + 2]);
      // An operator expression followed by a result must be checkable; anything else is a label.
      const arithmetic = EXPR.test(L) && /\d\s*[×÷/+\-−]\s*[\d(√]|√|²/.test(L);
      let checked = false;
      if (EXPR.test(L) && EXPR.test(R)) {
        let l; try { l = val(L); } catch (e) { l = NaN; }
        if (Number.isFinite(l) && NUM.test(R)) {
          const d = (R.split(',')[1] || '').length, r = Number(R.replace('−', '-').replace(',', '.'));
          out.checked++; checked = true;
          if (halfUp(l, d) !== r) out.bad.push(`"${L} ${parts[i + 1]} ${R}" (${l.toFixed(d + 3)})`);
        } else if (Number.isFinite(l)) {
          let r; try { r = val(R); } catch (e) { r = NaN; }
          if (Number.isFinite(r)) {
            out.checked++; checked = true;
            if (Math.abs(l - r) > 1e-9 * Math.max(1, Math.abs(r))) out.bad.push(`"${L} = ${R}"`);
          }
        }
      }
      if (arithmetic && !checked) out.unparsed.push(`${L} ${parts[i + 1]} ${R}`);
    }
  }
  return out;
}

function lessonTemplates(ex) {
  const out = [ex.statement_template, ex.translation_template, ex.interpretation_template, ...(ex.common_mistakes || []), ...(ex.accepted_paths || []).map(p => p.note)];
  for (const s of ex.steps) {
    out.push(['prompt', s.prompt], ['worked', s.worked], ['misconception', s.misconception], ...(s.hints || []).map(h => ['hint', h]));
    for (const b of s.bugs || []) out.push(['bug', b.feedback]);
    for (const o of E.optionsOf(lesson, s)) out.push(['option', o.label], ['option', o.feedback]);
  }
  return out.map(t => (Array.isArray(t) ? t : ['text', t])).filter(([, t]) => typeof t === 'string');
}

test('arithmetic parser control: catches the round-2 Ex5 line and accepts a consistent one', () => {
  assert.equal(arithmeticFindings('t = (7,8 − 6,5) / 0,477 = 1,3/0,477 ≈ 2,724.').bad.length, 1);
  assert.equal(arithmeticFindings('t = (7,8 − 6,5) / 0,4772 = 1,3/0,4772 ≈ 2,724.').bad.length, 0);
  assert.equal(arithmeticFindings('11 × 1,44 + 9 × 1,00 = 24,84.').checked, 1);
  assert.equal(arithmeticFindings('Sconj = √1,242 = 1,1145 ≈ 1,114.').bad.length, 1, '1,1145 does not round to 1,114');
  assert.equal(arithmeticFindings('E = 1,96 × 0,883 = 1,730 min.').bad.length, 1);
});

test('every rendered "a op b = c" line reproduces its printed result (all templates, originals + seeds 1-200)', () => {
  const bad = [], unparsed = new Set();
  let checked = 0;
  for (const ex of lesson.exercises) {
    const sets = [['original', E.originalVariables(ex)], ...Array.from({ length: 200 }, (_, i) => [`seed ${i + 1}`, E.drawVariant(lesson, ex, i + 1).variables])];
    for (const [tag, vars] of sets) {
      const key = E.solve(lesson, ex, vars);
      for (const [kind, tpl] of lessonTemplates(ex)) {
        const f = arithmeticFindings(E.renderTemplate(lesson, ex, key, tpl));
        checked += f.checked;
        f.bad.forEach(b => bad.push(`${ex.id} ${tag} ${kind}: ${b}`));
        f.unparsed.forEach(u => unparsed.add(`${ex.id} ${kind}: ${u}`));
      }
    }
  }
  assert.ok(checked > 5000, `checked ${checked}`);
  assert.deepEqual([...unparsed], []);
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} inconsistent lines`);
});

test('lesson contract requires both carry-path notes and worked lines that can reproduce themselves', () => {
  for (const k of ['display', 'learner']) {
    const broken = JSON.parse(JSON.stringify(lesson));
    delete broken.carry_paths[k];
    assert.ok(E.validateLesson(broken, { seedCount: 5 }).includes(`missing carry_paths.${k}`), k);
  }
  // Fixed printed forms that double-round (original Ex5: Sconj 1,11445 -> "1,1145 ≈ 1,114") are reported.
  const broken = JSON.parse(JSON.stringify(lesson));
  broken.exercises.find(e => e.id === 'ex5-teste-t-conjunto').steps.find(s => s.id === 'sp').worked = 'Sconj = √{sp2:carry} = {sp:4} ≈ {sp}.';
  assert.ok(E.validateLesson(broken, { seedCount: 5 }).some(p => /ex5-teste-t-conjunto\.sp \(original\): .*reproduz/.test(p)), 'unreproducible line reported');
});

// ------------------------------------------------------------------ round 4 (t_85775a5a): follow-through bound
// Policy (docs/formats/fmt-step-ladder.md "Grading tiers and the follow-through bound"): tier 2 accepts a value
// only when it is the rounding (half a display unit) of a carry path, never with the step tolerance on top, so
// tolerances cannot stack. Declared bugs are diagnosed before tier 2.

/** Play the ORIGINAL data with typed overrides for some numeric steps; key values elsewhere. */
function playTyped(exId, typed) {
  const run = E.createRun(lesson, exId, 'original'), out = {};
  while (!run.finished) {
    const step = E.currentStep(lesson, run);
    const input = typed[step.id] !== undefined ? typed[step.id] : correctInput(run);
    const r = E.submit(lesson, run, input);
    out[step.id] = r;
    if (r.status !== 'correct') break;
  }
  return out;
}

test('Ex3 EP 0,025 (the p.17 summary-sheet EP) is diagnosed as early rounding, not as a missing root', () => {
  const ep = lesson.exercises.find(e => e.id === 'ex3-ic-proporcao').steps.find(s => s.id === 'ep');
  assert.equal(ep.bugs[0].id, 'ep-arredondado-cedo', 'early rounding is checked before the root bugs');
  const r = playTyped('ex3-ic-proporcao', { ep: '0,025' }).ep;
  assert.equal(r.status, 'wrong');
  assert.equal(r.bug, 'ep-arredondado-cedo');
  assert.doesNotMatch(r.feedback, /raiz cobre/);
  // The missing-root bugs keep their own diagnoses.
  assert.equal(playTyped('ex3-ic-proporcao', { ep: '0,00123' }).ep.bug, 'raiz-parcial');
  assert.equal(playTyped('ex3-ic-proporcao', { ep: '0,00060475' }).ep.bug, 'sem-raiz');
});

test('follow-through bound: stacked tolerance edges never reach the p.17 interval or the Ex5 t 2,714', () => {
  // Sofia r3 repro_edge_note chains, each accepted at 2d6573e through learner-carry.
  const bothBounds = r => !!(r.lower && r.lower.status === 'correct' && r.upper && r.upper.status === 'correct');
  const a = playTyped('ex3-ic-proporcao', { E: '0,0486', lower: '0,541', upper: '0,639' });
  assert.equal(bothBounds(a), false, 'p.17 interval (0,541; 0,639) is not accepted after one edge E');
  assert.equal(bothBounds(playTyped('ex3-ic-proporcao', { lower: '0,541', upper: '0,639' })), false, 'nor after the key E');
  const b = playTyped('ex3-ic-proporcao', { prod: '0,2425', var: '0,00060867', ep: '0,0248', E: '0,0490', lower: '0,541', upper: '0,639' });
  assert.ok(Object.values(b).some(r => r.status === 'wrong'), 'stacked edges chain does not finish');
  assert.notEqual((b.E || {}).status, 'correct', 'E 0,0490 (the bug value) is never accepted');
  const c = playTyped('ex5-teste-t-conjunto', { sp2: '1,243', sp: '1,116', raiz: '0,4284', ep: '0,479', t: '2,714' });
  assert.notEqual((c.t || {}).status, 'correct', 'Ex5 t 2,714 (key 2,724) is not accepted');
});

test('follow-through bound: tier 2 adds no tolerance (a carry-path acceptance is within rounding of that path)', () => {
  // Adversarial edge learner: at every numeric step type the farthest value the engine accepts (both directions).
  // A value accepted through a carry path must be the rounding of that path's value: no step tolerance on top.
  const over = [];
  for (const ex of lesson.exercises) for (const seed of ['original', ...Array.from({ length: 60 }, (_, i) => i + 1)]) for (const dir of [1, -1]) {
    const run = E.createRun(lesson, ex.id, seed);
    const dc = E.solve(lesson, ex, run.variables, { carry: 'display' }).values;
    while (!run.finished) {
      const st = E.currentStep(lesson, run);
      if (st.type !== 'numeric') { E.submit(lesson, run, correctInput(run)); continue; }
      const u = 10 ** -st.display_decimals, mine = Object.create(null);
      for (const cpl of run.completed) if (cpl && typeof cpl.value === 'number') mine[cpl.id] = cpl.value;
      const target = E.solve(lesson, ex, run.variables, { carried: mine }).values[st.id];
      let typed = null;
      for (let k = Math.ceil(E.toleranceFor(st, target) / u) + 3; k >= 0 && typed === null; k--) {
        const cand = E.formatNumber(E.roundTo(target + dir * k * u, st.display_decimals), st.display_decimals, lesson.locale);
        if (E.check(lesson, run, cand).correct) typed = cand;
      }
      if (typed === null) typed = correctInput(run);
      const v = E.parseNumber(typed, lesson.locale), r = E.check(lesson, run, typed);
      const pathValue = { 'display-carry': dc[st.id], 'learner-carry': target }[r.path];
      if (pathValue !== undefined && Math.abs(v - pathValue) > u / 2 + 1e-9 * Math.max(1, Math.abs(pathValue))) {
        over.push(`${ex.id} ${seed} ${st.id}: ${typed} via ${r.path} ${pathValue.toFixed(st.display_decimals + 2)}`);
      }
      assert.equal(E.submit(lesson, run, typed).status, 'correct');
    }
  }
  assert.deepEqual(over.slice(0, 8), [], `${over.length} carry-path acceptances beyond rounding`);
});

test('follow-through: decision steps evaluated on any accepted learner values agree with the key (no decision flips)', () => {
  const flips = [];
  for (const ex of lesson.exercises) for (const seed of ['original', ...Array.from({ length: 60 }, (_, i) => i + 1)]) for (const dir of [1, -1]) {
    const run = E.createRun(lesson, ex.id, seed);
    while (!run.finished) {
      const st = E.currentStep(lesson, run), i = run.step;
      const mine = Object.create(null);
      for (const cpl of run.completed) if (cpl && typeof cpl.value === 'number') mine[cpl.id] = cpl.value;
      if (st.type === 'choice' && Object.keys(mine).length) {
        const learner = E.solve(lesson, ex, run.variables, { carried: mine }).values[st.id];
        if (learner !== run.key.steps[i].answer) flips.push(`${ex.id} ${seed} ${st.id}`);
      }
      if (st.type !== 'numeric') { E.submit(lesson, run, correctInput(run)); continue; }
      const u = 10 ** -st.display_decimals, target = E.solve(lesson, ex, run.variables, { carried: mine }).values[st.id];
      let done = false;
      for (let k = Math.ceil(E.toleranceFor(st, target) / u) + 3; k >= 0 && !done; k--) {
        const cand = E.formatNumber(E.roundTo(target + dir * k * u, st.display_decimals), st.display_decimals, lesson.locale);
        if (E.check(lesson, run, cand).correct) { E.submit(lesson, run, cand); done = true; }
      }
      if (!done) E.submit(lesson, run, correctInput(run));
    }
  }
  assert.deepEqual(flips, []);
});

test('display-carry note is shown only when the typed value is the rounding of the display-carry result', () => {
  // Ex3 original: E 0,0486 is 4 units from the display-carry value 0,0482; at 2d6573e it got the display-carry note.
  const r = playTyped('ex3-ic-proporcao', { E: '0,0486' }).E;
  assert.notEqual(r.path, 'display-carry');
  // Honest display carry (EP 0,0246 -> E = 1,96 x 0,0246 = 0,0482) needs no note at all: it is the key at 4 decimals.
  for (const ex of lesson.exercises) for (const seed of ['original', 1, 2, 3, 4, 5]) {
    const run = E.createRun(lesson, ex.id, seed), dc = E.solve(lesson, ex, run.variables, { carry: 'display' }).values;
    while (!run.finished) {
      const st = E.currentStep(lesson, run);
      const res = E.submit(lesson, run, correctInput(run));
      if (res.path === 'display-carry') {
        const typed = run.completed[run.completed.length - 1].value;
        assert.ok(Math.abs(typed - dc[st.id]) <= 10 ** -st.display_decimals / 2 + 1e-12, `${ex.id} ${seed} ${st.id}`);
      }
    }
  }
});

test('a value that equals a declared bug is diagnosed before follow-through (tier 2) acceptance', () => {
  // Synthetic: declare a bug whose value equals the learner-carry result of an EP typed at the tier-1 edge.
  const L2 = JSON.parse(JSON.stringify(lesson));
  const ex = L2.exercises.find(e => e.id === 'ex3-ic-proporcao');
  const stE = ex.steps.find(s => s.id === 'E');
  // Narrow tier 1 to rounding so 0,0484 (key 0,0482) is outside it and only follow-through or the bug can match.
  stE.tolerance = { abs: 0.00005 };
  stE.bugs.push({ id: 'bug-igual-ao-carry', expr: 'zc * 0.0247', feedback: 'diagnóstico sintético' });
  const run = E.createRun(L2, ex.id, 'original');
  const key = id => E.formatNumber(run.key.values[id], ex.steps.find(s => s.id === id).display_decimals, L2.locale);
  while (E.currentStep(L2, run).id !== 'ep') {
    const st = E.currentStep(L2, run), k = run.key.steps[run.step];
    E.submit(L2, run, st.type === 'givens' ? Object.fromEntries(st.fields.map(f => [f.var, E.formatNumber(run.variables[f.var], E.decimalsOf(L2, ex.id, f.var), L2.locale)])) : st.type === 'choice' ? k.answer : key(st.id));
  }
  assert.equal(E.submit(L2, run, '0,0247').status, 'correct');
  const r = E.submit(L2, run, E.formatNumber(1.96 * 0.0247, 4, L2.locale));
  assert.equal(r.status, 'wrong');
  assert.equal(r.bug, 'bug-igual-ao-carry');
});

test('pt-BR source view: key_path text starts with no English path id', () => {
  for (const ex of lesson.exercises) if (ex.key_path) assert.doesNotMatch(ex.key_path, /^[a-z]+(?:-[a-z]+)+:/, ex.id);
});
