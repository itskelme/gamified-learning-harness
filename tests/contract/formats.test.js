'use strict';
// Contract tests for the seven non-ladder formats against Minerva's catalog fixtures r3.
// Run: node --test tests/contract/formats.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/catalog-r3/game-format-catalog.fixtures.json'), 'utf8'));
const events = require(path.join(ROOT, 'harness/core/events.js'));
const MCQ = require(path.join(ROOT, 'harness/formats/fmt-choice-feedback/grader.js'));
const CLZ = require(path.join(ROOT, 'harness/formats/fmt-retrieval-cloze/grader.js'));
const MAT = require(path.join(ROOT, 'harness/formats/fmt-match-classify/grader.js'));
const SEQ = require(path.join(ROOT, 'harness/formats/fmt-sequence-order/grader.js'));
const BRA = require(path.join(ROOT, 'harness/formats/fmt-branching-case/grader.js'));
const SIM = require(path.join(ROOT, 'harness/formats/fmt-data-visual-lab/lab.js'));
const REV = require(path.join(ROOT, 'harness/formats/fmt-review-mix/scheduler.js'));
const plain = x => JSON.parse(JSON.stringify(x));
const EMITTED = [];
const keep = evs => { EMITTED.push(...evs); return evs; };

// ------------------------------------------------------------------------------------------- AF-MCQ-01
test('AF-MCQ-01: presentation orders, events and feedback for the pick reproduce the fixture', () => {
  const f = fx['AF-MCQ-01'];
  assert.deepEqual(MCQ.presentedOrder(f.item, 20261119, 1), f.presented_attempt1);
  assert.deepEqual(MCQ.presentedOrder(f.item, 20261119, 2), f.presented_attempt2);
  const r = MCQ.grade(f.item, f.learner_pick);
  assert.deepEqual(plain(keep(r.events)), f.expected_events);
  assert.equal(r.feedback, f.feedback_text_for_pick);
  assert.deepEqual(MCQ.validateItem(f.item), []);
  for (const [t, v] of Object.entries(f.validation.rejected_examples)) assert.equal(MCQ.refersToPosition(t), v, t);
  assert.equal(MCQ.refersToPosition('Todas as alternativas acima'), true);
  assert.equal(MCQ.refersToPosition('O intervalo contém a média populacional com 95% de confiança.'), false);
});

test('AF-MCQ-01: a correct pick advances; the 50/50 lifeline keeps the key and counts as assisted', () => {
  const f = fx['AF-MCQ-01'];
  const ok = keep(MCQ.grade(f.item, 'o1').events);
  assert.deepEqual(ok.map(e => e.route || e.result), ['correct', 'advance']);
  const shown = MCQ.fiftyFifty(f.item, 20261119, 1);
  assert.ok(shown.includes('o1') && shown.length === 2, shown);
  assert.equal(MCQ.grade(f.item, 'o1', { assisted: true }).events[0].assisted, true);
  const bad = JSON.parse(JSON.stringify(f.item));
  bad.options[2].text = 'All of the above';
  delete bad.options[1].misconception_tag;
  // One problem per defect, reported in option order.
  assert.deepEqual(MCQ.validateItem(bad), ['distractor o2 needs misconception_tag and feedback', 'option o3 refers to position']);
});

// ------------------------------------------------------------------------------------------- AF-CLZ-01
test('AF-CLZ-01: every input of the fixture grades to the same event (number and text specs)', () => {
  const f = fx['AF-CLZ-01'];
  for (const c of f.results) assert.deepEqual(plain(keep([CLZ.gradeBlank(f.blank_specs[c.spec], c.input)])[0]), c.event, `${c.spec} ${JSON.stringify(c.input)}`);
  const errs = f.results.filter(c => events.isError(c.event.result)).map(c => ({ spec: c.spec, input: c.input }));
  assert.deepEqual(errs, f.errors_derived_by_rule_3_4);
});

test('cloze: stricter number parsing than Python float, near miss never an error, cue routing', () => {
  for (const raw of ['1e3', 'inf', 'nan', '1_000', '1.2.3', '12,0,0']) assert.equal(CLZ.parseNumber(raw), null, raw);
  assert.equal(CLZ.parseNumber(' 1,96 '), 1.96);
  const spec = { type: 'text', accepted: ['hipercorreção'], near_miss_min_len: 6 };
  assert.equal(CLZ.gradeBlankResult(spec, 'Hipercorreção'.normalize('NFD')), 'correct', 'NFC normalisation');
  assert.equal(CLZ.gradeBlankResult(spec, 'hipercoreção'), 'near_miss');
  // Below the minimum length a one-edit answer is a different word, not a typo.
  assert.equal(CLZ.gradeBlankResult({ type: 'text', accepted: ['média'] }, 'mídia'), 'incorrect');
  const ev = CLZ.gradeBlank({ type: 'number', value: 1.96, tolerance: 0 }, '1,64', 'symbols', 'z95');
  assert.equal(CLZ.routeFor(ev, 0, 1).route, 'hint_next_level');
  assert.equal(CLZ.routeFor(ev, 1, 1).route, 'requeue_later');
  assert.deepEqual(CLZ.parseTemplate('z = {{z95}} e gl = {{gl}}.'), [{ text: 'z = ' }, { blank: 'z95' }, { text: ' e gl = ' }, { blank: 'gl' }, { text: '.' }]);
});

// ------------------------------------------------------------------------------------------- AF-MAT-01
test('AF-MAT-01: presented order, events in presented order, derived score and confusion view', () => {
  const f = fx['AF-MAT-01'];
  assert.deepEqual(MAT.validate(f.categories, f.items), []);
  const order = MAT.presentedOrder(f.items, 20261119, 'match-sigma', 1);
  assert.deepEqual(order, f.presented_item_order);
  const evs = keep(MAT.grade(f.items, f.learner_assignment, order));
  assert.deepEqual(plain(evs), f.expected_events);
  assert.deepEqual(plain(MAT.derive(f.items, evs)), f.derived);
});

// ------------------------------------------------------------------------------------------- AF-SEQ-01/02
test('AF-SEQ-01/02: metrics for swapped, perfect, reversed and the derived timeline key', () => {
  const f = fx['AF-SEQ-01'];
  assert.deepEqual(SEQ.metrics(f.key_order, f.learner_answer), f.expected);
  assert.deepEqual(SEQ.metrics(f.key_order, f.key_order), f.perfect);
  assert.deepEqual(SEQ.metrics(f.key_order, [...f.key_order].reverse()), f.reverse);
  assert.deepEqual(SEQ.presentedOrder(f.key_order, 20261119, 'recipe', 1), f.presented_attempt1);
  const g = fx['AF-SEQ-02'];
  assert.deepEqual(SEQ.deriveKey(g.timeline_input_unsorted, 'date'), g.derived_key);
  assert.deepEqual(SEQ.metrics(g.derived_key, g.learner_answer), g.expected);
  assert.throws(() => SEQ.deriveKey([{ id: 'a', date: '2026-01-01' }, { id: 'b', date: '2026-01-01' }], 'date'), /ties/);
});

test('sequence: result is correct only for an exact match, partial otherwise; a non-permutation is invalid', () => {
  const f = fx['AF-SEQ-01'];
  const exact = keep(SEQ.grade('recipe', f.key_order, f.key_order));
  assert.deepEqual(exact.map(e => e.result || e.route), ['correct', 'advance']);
  const sw = keep(SEQ.grade('recipe', f.key_order, f.learner_answer, 1));
  assert.equal(sw[0].result, 'partial');
  assert.deepEqual(sw[0].score, { earned: f.expected.adjacent_pairs_correct, max: f.expected.adjacent_pairs_total });
  assert.equal(sw[1].route, 'retry_same');
  assert.equal(SEQ.grade('recipe', f.key_order, f.learner_answer, 2)[1].route, 'worked_debrief');
  const inv = keep(SEQ.grade('recipe', f.key_order, f.key_order.slice(1)));
  assert.equal(inv[0].result, 'invalid');
  assert.equal(inv[0].score, undefined);
});

// ------------------------------------------------------------------------------------------- AF-BRA-01
// The reference graph of format_fixtures.py (BRANCH); the fixture stores only its results.
const BRANCH = {
  start: 'n1',
  nodes: {
    n1: { text: 'Sales fell 12% after the hours changed. The manager blames the hours. What do you do first?',
      choices: { a: { text: "Accept the manager's explanation", to: 'n2', quality: 0, misconception_tag: 'post_hoc_causation' },
        b: { text: 'Separate the measurement from the causal claim and request records', to: 'n2', quality: 2 },
        c: { text: 'Cut prices immediately', to: 'n2', quality: 0, misconception_tag: 'action_before_diagnosis' } } },
    n2: { text: 'You have monthly records. Which comparison best tests the hours explanation?',
      choices: { a: { text: 'Compare the same hours last year and check other changes', to: 't_good', quality: 2 },
        b: { text: 'Repeat the claim to the board', to: 't_weak', quality: 0, misconception_tag: 'restated_claim_not_evidence' } } },
    t_good: { terminal: true, principle: 'A before-and-after change is a candidate explanation, not proof.' },
    t_weak: { terminal: true, principle: 'A before-and-after change is a candidate explanation, not proof.' }
  }
};

test('AF-BRA-01: graph validation, good path and bad path events', () => {
  const f = fx['AF-BRA-01'];
  assert.deepEqual(BRA.validate(BRANCH), f.graph_problems);
  assert.deepEqual(plain(keep(BRA.walk(BRANCH, ['b', 'a'], 'shop-case'))), f.good_path_events);
  assert.deepEqual(plain(keep(BRA.walk(BRANCH, ['a', 'b'], 'shop-case'))), f.bad_path_events);
  const inv = { start: 'x', nodes: { x: { choices: { a: { text: 't', to: 'y', quality: 1 } } }, y: { terminal: true }, orphan: { terminal: true, principle: 'p' } } };
  assert.deepEqual(BRA.validate(inv), f.invalid_graph_example.problems);
});

test('branching: undeclared cycles and dead ends are rejected; all paths are listed for the PDF', () => {
  const cyc = JSON.parse(JSON.stringify(BRANCH));
  cyc.nodes.n2.choices.b.to = 'n1';
  assert.ok(BRA.validate(cyc).includes('undeclared_cycle'));
  assert.ok(!BRA.validate({ ...cyc, allow_cycles: true }).includes('undeclared_cycle'));
  const dead = JSON.parse(JSON.stringify(BRANCH));
  delete dead.nodes.t_weak.terminal;
  assert.ok(BRA.validate(dead).includes('dead_end:t_weak'));
  // A path with some but not all best choices (2 of 4) is debriefed, not advanced.
  const half = BRA.walk(BRANCH, ['b', 'b'], 'shop-case');
  assert.deepEqual(half[half.length - 2].score, { earned: 2, max: 4 });
  assert.equal(half[half.length - 1].route, 'worked_debrief_then_requeue_branch');
  assert.equal(BRA.allPaths(BRANCH).length, 6);
  assert.equal(BRA.allPaths(BRANCH).filter(p => p.score.earned === p.score.max).length, 1);
});

// ------------------------------------------------------------------------------------------- AF-SIM-01
test('AF-SIM-01: states, prediction check, events and the plot_spec hash reproduce the fixture', () => {
  const f = fx['AF-SIM-01'];
  for (const n of [16, 64, 256]) assert.deepEqual(SIM.simState(n), f.states[String(n)], `n=${n}`);
  const spec = SIM.afSimPlotSpec();
  assert.deepEqual(spec, f.plot_spec);
  assert.equal(SIM.specSha256(spec), f.plot_spec_sha256);
  assert.equal(SIM.expectedWidthChange(64, 256), f.prediction.expected);
  assert.deepEqual(plain(keep(SIM.predictionEvents('ci-width-lab', 'predict_width', 'halve', f.prediction.expected, 'n', [64, 256]))), f.prediction.expected_events);
  assert.equal(SIM.fillAlt(f.text_alternative_template, { ...SIM.simState(64), n: 64 }), 'Interval 70.04 to 73.96; width 3.92; n=64.');
});

test('specSha256 is canonical: key order does not matter, non-ASCII is escaped like Python json.dumps', () => {
  assert.equal(SIM.canonicalJson({ b: 1, a: [1.5, 'x̄'] }), '{"a":[1.5,"x\\u0304"],"b":1}');
  assert.equal(SIM.specSha256({ b: 1, a: 2 }), SIM.specSha256({ a: 2, b: 1 }));
});

// ------------------------------------------------------------------------------------------- AF-REV-01
test('AF-REV-01: gap fraction, dated plan, seeded queue and the four requeue cases reproduce the fixture', () => {
  const f = fx['AF-REV-01'];
  assert.equal(REV.daysBetween(f.today, f.exam), f.days_to_exam);
  assert.equal(Math.floor(REV.gapFraction(f.days_to_exam) * f.days_to_exam + 0.5), f.first_gap_days);
  assert.deepEqual(REV.reviewPlan(f.today, f.exam), f.plan);
  assert.equal(REV.reviewPlan(f.today, f.exam).filter(p => p.clamp !== 'none').length, f.plan_entries_clamped);
  const due = REV.dueToday(f.queue_input, f.today);
  assert.deepEqual(due.map(i => i.id), f.due_today);
  assert.deepEqual(REV.buildQueue(due, 20261119), f.queue_seed_20261119);
  for (const c of f.requeue_cases) {
    const after = REV.requeue(c.queue_before, c.failed_item, c.gap_items);
    assert.deepEqual(after, c.remaining_queue_after);
    assert.equal(after.indexOf(c.failed_item), c.items_presented_before_it_returns);
    keep(c.events);
  }
  assert.deepEqual([1, 3, 7, 21].map(k => REV.addDays(f.today, k)), f.convention_fixed_intervals_1_3_7_21);
});

test('review: the clamp holds below 7 and above 365 days', () => {
  assert.equal(REV.gapFraction(3), REV.gapFraction(7));
  assert.equal(REV.gapFraction(900), REV.gapFraction(365));
  assert.equal(REV.clampLabel(3), 'floor_below_7_days');
  assert.equal(REV.clampLabel(400), 'ceiling_above_365_days');
  assert.ok(REV.reviewPlan('2026-11-19', '2027-12-19').some(p => p.clamp === 'ceiling_above_365_days'));
});

// ------------------------------------------------------------------------------------------- AF-COM-02
test('AF-COM-02 (JS side): every event the format graders emitted in this file is inside the vocabulary', () => {
  assert.ok(EMITTED.length > 40, `${EMITTED.length}`);
  assert.deepEqual(events.checkEvents(EMITTED), []);
});
