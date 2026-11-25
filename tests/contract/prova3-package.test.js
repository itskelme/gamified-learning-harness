'use strict';
// Composed package for Prova 3 (catalog r3 section 6.2): the pilot lesson -> one package -> router ->
// every item through its own format grader. Run: node --test tests/contract/prova3-package.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const lesson = require(path.join(ROOT, 'lessons/prova3-statistics.lesson.json'));
const E = require(path.join(ROOT, 'harness/procedure-engine.js'));
const Plots = require(path.join(ROOT, 'harness/plots.js'));
const events = require(path.join(ROOT, 'harness/core/events.js'));
const { route } = require(path.join(ROOT, 'harness/core/router.js'));
const { loadRegistry } = require(path.join(ROOT, 'harness/core/registry.js'));
const { buildProva3Package } = require(path.join(ROOT, 'harness/packages/prova3.js'));
const Spec = require(path.join(ROOT, 'harness/formats/fmt-data-visual-lab/procedure-spec.js'));
const MCQ = require(path.join(ROOT, 'harness/formats/fmt-choice-feedback/grader.js'));
const CLZ = require(path.join(ROOT, 'harness/formats/fmt-retrieval-cloze/grader.js'));
const MAT = require(path.join(ROOT, 'harness/formats/fmt-match-classify/grader.js'));
const SEQ = require(path.join(ROOT, 'harness/formats/fmt-sequence-order/grader.js'));
const SIM = require(path.join(ROOT, 'harness/formats/fmt-data-visual-lab/lab.js'));
const REG = loadRegistry(ROOT);
const item = (pkg, id) => pkg.units[0].items.find(i => i.id === id);

test('the Prova 3 package routes to the catalog 6.2 set in learning-phase order, review at lesson level', () => {
  const pkg = buildProva3Package(lesson);
  const plan = route(pkg, REG, { maxFormatsPerUnit: 8 });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.units[0].formats.map(f => f.format_id),
    ['fmt-retrieval-cloze', 'fmt-match-classify', 'fmt-step-ladder', 'fmt-sequence-order', 'fmt-data-visual-lab', 'fmt-choice-feedback']);
  assert.match(plan.units[0].skipped.find(s => s.format_id === 'fmt-branching-case').reason, /missing fields: graph/);
  assert.deepEqual(plan.lesson_level.map(f => f.format_id), ['fmt-review-mix']);
});

test('every package item cites a PDF page that the lesson records, and no item text is invented', () => {
  const pkg = buildProva3Package(lesson);
  for (const it of pkg.units[0].items) assert.match(it.source_ref, /^PDF p\.\d+/, it.id);
  const m = item(pkg, 'metodo').payload;
  assert.deepEqual(m.categories.map(c => c.id), lesson.methods.map(x => x.id));
  for (const c of m.cases) {
    const ex = lesson.exercises.find(e => e.id === c.id);
    assert.equal(c.text, E.statement(lesson, E.createRun(lesson, ex.id, 'original')));
  }
  const lab = item(pkg, 'lab-ex1').payload;
  assert.equal(lab.prompts[0].expected, E.predictionAnswer(lesson, lesson.exercises[0]));
  assert.equal(lab.prompts[0].question, lesson.exercises[0].explore.predict.question);
  const r = item(pkg, 'receita').payload;
  assert.deepEqual(r.key_order, lesson.exercises.find(e => e.id === 'ex2-ic-media-t').steps.map(s => s.id));
});

test('each item validates with its own format and the key answers grade as correct', () => {
  const pkg = buildProva3Package(lesson), all = [];
  const c = item(pkg, 'simbolos').payload;
  for (const b of c.blanks) {
    const ev = CLZ.gradeBlank(b.spec, b.key_text, 'simbolos', b.id);
    assert.equal(ev.result, 'correct', b.id);
    all.push(ev);
  }
  const m = item(pkg, 'metodo').payload;
  assert.deepEqual(MAT.validate(m.categories, m.cases), []);
  const order = MAT.presentedOrder(m.cases, 20261119, 'metodo', 1);
  const right = Object.fromEntries(m.cases.map(x => [x.id, x.category]));
  const mevs = MAT.grade(m.cases, right, order);
  assert.ok(mevs.every(e => e.result === 'correct'));
  all.push(...mevs);
  const r = item(pkg, 'receita').payload;
  assert.deepEqual(SEQ.validate(r.entries), []);
  all.push(...SEQ.grade('receita', r.key_order, r.key_order));
  const q = item(pkg, 'interp-ex2').payload;
  assert.deepEqual(MCQ.validateItem(q), []);
  const g = MCQ.grade(q, q.options.find(o => o.correct).id);
  assert.equal(g.events[0].result, 'correct');
  all.push(...g.events);
  const lab = item(pkg, 'lab-ex1').payload;
  all.push(...SIM.predictionEvents('lab-ex1', 'predict', lab.prompts[0].expected, lab.prompts[0].expected, lab.data_model.control.var, [lab.data_model.control.min, lab.data_model.control.max]));
  assert.deepEqual(events.checkEvents(all), []);
});

test('a wrong method choice is diagnosed with the case tag and re-queued among confusable cases', () => {
  const m = item(buildProva3Package(lesson), 'metodo').payload;
  const wrong = Object.fromEntries(m.cases.map(x => [x.id, x.category]));
  wrong['ex2-ic-media-t'] = 'z_mean_ci';
  const evs = MAT.grade(m.cases, wrong, m.cases.map(x => x.id));
  const miss = evs.find(e => e.result === 'incorrect');
  assert.equal(miss.misconception_tag, 'sigma_known_vs_unknown');
  assert.deepEqual(evs[evs.length - 1], { type: 'outcome', item_id: 'ex2-ic-media-t', route: 'requeue_later', parameters: { gap_items: 3, interleave_with: 'confusable' } });
});

test('plot_spec for every Prova 3 plot equals the solved values and the renderer text alternative (originals + seeds 1-40)', () => {
  const bad = [];
  for (const ex of lesson.exercises) for (const seed of ['original', ...Array.from({ length: 40 }, (_, i) => i + 1)]) {
    const run = E.createRun(lesson, ex.id, seed), solved = E.solve(lesson, ex, run.variables);
    const spec = Spec.plotSpecFor(lesson, ex, solved, { variant_seed: seed });
    for (const m of spec.marks) if (m.value !== solved.values[m.id]) bad.push(`${ex.id} ${seed} ${m.id}`);
    if (spec.alt.summary !== Plots.render(lesson, ex, solved, { revealAll: true }).alt) bad.push(`${ex.id} ${seed} alt`);
    if (spec.kind === 'test') {
      const key = run.key.steps.find(s => s.id === 'decisao').answer;
      if ((spec.decision === 'reject') !== (key === 'rejeita')) bad.push(`${ex.id} ${seed} decision ${spec.decision} vs ${key}`);
    }
    if (!spec.provenance.source_ref || spec.bind.exercise_id !== ex.id || spec.bind.variant_seed !== seed) bad.push(`${ex.id} ${seed} bind`);
  }
  assert.deepEqual(bad.slice(0, 8), []);
});

test('plot_spec decision is two-sided: a mirrored negative statistic gets the same decision', () => {
  let rejectsSeen = 0;
  for (const ex of lesson.exercises.filter(e => e.plot.kind === 'test')) for (const seed of ['original', 1, 2, 3, 4, 5, 6, 7, 8]) {
    const solved = E.solve(lesson, ex, E.createRun(lesson, ex.id, seed).variables);
    const mirrored = { ...solved, values: { ...solved.values, [ex.plot.stat]: -solved.values[ex.plot.stat] } };
    const a = Spec.plotSpecFor(lesson, ex, solved).decision, b = Spec.plotSpecFor(lesson, ex, mirrored).decision;
    assert.equal(b, a, `${ex.id} ${seed}`);
    if (a === 'reject') rejectsSeen++;
  }
  assert.ok(rejectsSeen > 0, 'some variant rejects H0');
});

test('plot_spec is refused without a data model: missing plot config or unsolved values throw', () => {
  const ex = JSON.parse(JSON.stringify(lesson.exercises[0]));
  const solved = E.solve(lesson, ex, E.createRun(lesson, ex.id, 'original').variables);
  delete ex.plot;
  assert.throws(() => Spec.plotSpecFor(lesson, ex, solved), /no plot/);
  const ex2 = lesson.exercises[0];
  assert.throws(() => Spec.plotSpecFor(lesson, ex2, { values: {} }), /not solved/);
});

test('the package build is deterministic and does not modify the lesson', () => {
  const before = JSON.stringify(lesson);
  assert.deepEqual(buildProva3Package(lesson), buildProva3Package(lesson));
  assert.equal(JSON.stringify(lesson), before);
});

test('without page numbers in the answer key the package has unsourced items and routing stops', () => {
  const L = JSON.parse(JSON.stringify(lesson));
  L.exercises.forEach(e => { delete e.source_answer_key.pages; });
  const plan = route(buildProva3Package(L), REG);
  assert.equal(plan.units.length, 0);
  assert.match(plan.errors[0], /^items without source_ref: prova3\//);
});
