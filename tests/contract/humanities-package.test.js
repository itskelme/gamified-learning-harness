// Humanities package (card t_fd19236f, format-suite row b): the branching contract runs standalone on the
// AF-BRA-01 reference graph AND on the composed humanities package built from the same lesson model
// (lessons/humanities-decisions.lesson.json -> harness/packages/humanities.js -> router).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const BRA = require(path.join(ROOT, 'harness/formats/fmt-branching-case/grader.js'));
const events = require(path.join(ROOT, 'harness/core/events.js'));
const { route } = require(path.join(ROOT, 'harness/core/router.js'));
const { loadRegistry } = require(path.join(ROOT, 'harness/core/registry.js'));
const { buildHumanitiesPackage } = require(path.join(ROOT, 'harness/packages/humanities.js'));
const { composeDeclarative } = require(path.join(ROOT, 'harness/packages/compose.js'));
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/catalog-r3/game-format-catalog.fixtures.json'), 'utf8'));
const lesson = JSON.parse(fs.readFileSync(path.join(ROOT, 'lessons/humanities-decisions.lesson.json'), 'utf8'));
const clone = x => JSON.parse(JSON.stringify(x));
const REG = loadRegistry(ROOT);

/**
 * The fmt-branching-case contract (catalog 4.6), independent of the grader's own arithmetic:
 * valid graph; for every path, the walk ends at the path's terminal; score = sum of picked qualities and
 * max = sum of the best quality at each visited node; one answer per decision with result correct/partial/
 * incorrect by quality; route advance only on a full score; every event inside the closed vocabulary.
 */
function branchingContract(g, itemId) {
  assert.deepEqual(BRA.validate(g), [], 'graph is valid');
  const paths = BRA.allPaths(g);
  assert.ok(paths.length >= 2);
  for (const p of paths) {
    const picks = p.path.map(s => s.split(':')[1]);
    const evs = BRA.walk(g, picks, itemId);
    assert.deepEqual(events.checkEvents(evs), [], p.path.join(' > '));
    let id = g.start, earned = 0, max = 0;
    const answers = evs.filter(e => e.type === 'answer_submitted');
    assert.equal(answers.length, picks.length, 'one answer per decision');
    picks.forEach((k, i) => {
      const n = g.nodes[id], c = n.choices[k], best = Math.max(...Object.values(n.choices).map(x => x.quality));
      earned += c.quality; max += best;
      assert.equal(answers[i].step_id, id);
      assert.equal(answers[i].result, c.quality === best ? 'correct' : c.quality > 0 ? 'partial' : 'incorrect');
      if (c.misconception_tag) assert.equal(answers[i].misconception_tag, c.misconception_tag);
      id = c.to;
    });
    const done = evs[evs.length - 2], out = evs[evs.length - 1];
    assert.deepEqual([done.type, done.terminal_id, done.path, done.score], ['item_completed', id, p.path, { earned, max }]);
    assert.equal(p.terminal_id, id); assert.deepEqual(p.score, { earned, max });
    assert.ok(g.nodes[id].principle, 'every ending states its principle');
    assert.equal(out.route, earned === max ? 'advance' : 'worked_debrief_then_requeue_branch');
  }
  return paths;
}

// The AF-BRA-01 reference graph (same as tests/contract/formats.test.js; the fixture stores only results).
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

test('AF-BRA-01 standalone: the contract holds on the reference graph and reproduces the fixture events', () => {
  const f = fx['AF-BRA-01'];
  branchingContract(BRANCH, 'shop-case');
  assert.deepEqual(clone(BRA.walk(BRANCH, ['b', 'a'], 'shop-case')), f.good_path_events);
  assert.deepEqual(clone(BRA.walk(BRANCH, ['a', 'b'], 'shop-case')), f.bad_path_events);
});

test('composed humanities package: the router selects the branching case and the same contract holds on its graph', () => {
  const pkg = buildHumanitiesPackage(lesson);
  const plan = route(pkg, REG);
  assert.deepEqual(plan.errors, []);
  const unit = plan.units.find(u => u.formats.some(f => f.format_id === 'fmt-branching-case'));
  assert.ok(unit, 'branching is in the plan');
  assert.deepEqual(plan.units.map(u => u.formats.map(f => f.format_id)), [
    ['fmt-retrieval-cloze', 'fmt-match-classify', 'fmt-choice-feedback'], ['fmt-sequence-order', 'fmt-branching-case']]);
  assert.deepEqual(plan.lesson_level.map(f => f.format_id), ['fmt-review-mix']);
  for (const u of plan.units) assert.deepEqual(u.dropped, [], `${u.unit_id}: nothing dropped at the default cap`);
  const item = pkg.units.flatMap(u => u.items).find(i => i.format === 'fmt-branching-case');
  // Same lesson model: the package graph IS the lesson's graph (no copy edits).
  const authored = lesson.practice.units.flatMap(u => u.items).find(i => i.id === item.id);
  assert.deepEqual(item.payload.graph, authored.payload.graph);
  const paths = branchingContract(item.payload.graph, item.id);
  assert.equal(paths.length, 11);
  assert.equal(paths.filter(p => p.score.earned === p.score.max).length, 1, 'one best path');
});

test('composed humanities package: every item has a source_ref built from its claims; the composer refuses bad items', () => {
  const pkg = buildHumanitiesPackage(lesson);
  for (const it of pkg.units.flatMap(u => u.items)) assert.match(it.source_ref, /\(\d{4}\)|caso fictício/, it.id);
  assert.match(pkg.units[1].items.find(i => i.id === 'caso-cameras').source_ref, /Barnett, van der Pols e Dobson \(2005\)/);
  const unsourced = clone(lesson); unsourced.practice.units[0].items[0].claim_ids = [];
  assert.deepEqual(route(composeDeclarative(unsourced), REG).errors, ['items without source_ref: conceitos/lembrar']);
  const dead = clone(lesson); delete dead.practice.units[1].items[1].payload.graph.nodes.t_bom.terminal;
  assert.throws(() => buildHumanitiesPackage(dead), /dead_end:t_bom/);
  const noFeedback = clone(lesson); delete noFeedback.practice.units[1].items[1].payload.graph.nodes.n2.choices.efeito6.feedback;
  assert.throws(() => buildHumanitiesPackage(noFeedback), /n2\.efeito6 needs feedback/);
  const twoRight = clone(lesson); twoRight.practice.units[0].items[2].payload.options[1].correct = true;
  assert.throws(() => buildHumanitiesPackage(twoRight), /exactly one option must be correct/);
  const badOrder = clone(lesson); badOrder.practice.units[1].items[0].payload.key_order.pop();
  assert.throws(() => buildHumanitiesPackage(badOrder), /key_order must list every entry once/);
});
