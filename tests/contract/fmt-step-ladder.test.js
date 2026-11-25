'use strict';
// fmt-step-ladder contract: AF-LAD-03 restart traces (catalog r3) plus the research-hybrid composite
// (design-proposal rev 2 section 8.4, owned by t_85775a5a wave 1).
// Run: node --test tests/contract/fmt-step-ladder.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '../..');
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/catalog-r3/game-format-catalog.fixtures.json'), 'utf8'));
const prng = require(path.join(ROOT, 'harness/core/prng.js'));
const events = require(path.join(ROOT, 'harness/core/events.js'));
const L = require(path.join(ROOT, 'harness/formats/fmt-step-ladder/escalation.js'));

const STEP_IDS = fx['AF-LAD-01'].step_ids;
const BLOCKS = [['separate_data', 'choose_distribution'], ['df', 't_critical', 'std_error'], ['margin', 'lower', 'upper'], ['interpret']];
// The fixture's twin generator for step `upper` (format_fixtures.py route_error); a lesson supplies its own.
const fixtureTwin = (seed, stepId, errsEx) => {
  const r = prng.rngFor(`${seed}:twin:${stepId}:${errsEx}`);
  const xbar = (200 + Math.floor(r() * 601)) / 10, margin = (5 + Math.floor(r() * 46)) / 10;
  return { inputs: { xbar, margin }, expected_upper: prng.halfUp(xbar + margin, 3) };
};
const ctxFor = (rule, n, extra = {}) => ({
  item_id: 'ci-t-ex2', seed: 20261119, step_id: 'upper', step_ids: STEP_IDS, blocks: BLOCKS,
  errors_on_step: n, errors_in_exercise: n, twin: fixtureTwin, ...extra
});
// Compare events as plain data, order-sensitive within one error (hint/worked before the outcome).
const norm = evs => JSON.parse(JSON.stringify(evs));

test('AF-LAD-03: the five single-option traces reproduce the catalog fixture exactly', () => {
  for (const row of fx['AF-LAD-03'].trace) {
    for (const n of [1, 2, 3]) {
      const got = L.routeError({ option: row.rule, n: 3 }, ctxFor(row.rule, n));
      assert.deepEqual(norm(got), row[`error${n}`], `${row.rule} error ${n}`);
    }
  }
});

test('AF-LAD-03 hybrid composite (sixth trace): hint, then worked step + twin, then checkpoint return at after_errors', () => {
  const rule = { option: 'research_hybrid', after_errors: 3, hint_levels: 1 };
  const e1 = L.routeError(rule, ctxFor('hybrid', 1));
  assert.deepEqual(norm(e1), [
    { type: 'hint_shown', item_id: 'ci-t-ex2', step_id: 'upper', level: 1 },
    { type: 'outcome', item_id: 'ci-t-ex2', route: 'retry_same_step', parameters: { cursor: 'upper' } }]);
  const e2 = L.routeError(rule, ctxFor('hybrid', 2));
  assert.deepEqual(norm(e2), [
    { type: 'worked_step_shown', item_id: 'ci-t-ex2', step_id: 'upper' },
    { type: 'outcome', item_id: 'ci-t-ex2', route: 'step_twin_new_numbers',
      parameters: { cursor: 'upper', twin: { inputs: { xbar: 21.5, margin: 0.7 }, expected_upper: 22.2 } } }]);
  const e3 = L.routeError(rule, ctxFor('hybrid', 3));
  assert.deepEqual(norm(e3), [
    { type: 'worked_step_shown', item_id: 'ci-t-ex2', step_id: 'upper' },
    { type: 'outcome', item_id: 'ci-t-ex2', route: 'checkpoint_return_prefilled',
      parameters: { cursor: 'margin', new_variant_seed: 1790125844, prefilled_read_only: ['separate_data', 'choose_distribution', 'df', 't_critical', 'std_error'] } }]);
  assert.equal(prng.fnv1a32('20261119:retry:3'), 1790125844);
  assert.deepEqual(events.checkEvents([...e1, ...e2, ...e3]), []);
});

test('hybrid with after_errors 2 reproduces the catalog last_checkpoint_plus_worked_step trace (proposal 8.4)', () => {
  const row = fx['AF-LAD-03'].trace.find(r => r.rule === 'last_checkpoint_plus_worked_step');
  for (const n of [1, 2, 3]) {
    assert.deepEqual(norm(L.routeError({ option: 'research_hybrid', after_errors: 2, hint_levels: 1 }, ctxFor('hybrid', n))), row[`error${n}`], `error ${n}`);
  }
});

test('hybrid: a first error on a second, different subgoal returns to that block\'s checkpoint', () => {
  const rule = { option: 'research_hybrid', after_errors: 3, hint_levels: 1 };
  // Earlier error on std_error (block 2), now the first error on upper (block 3): two subgoals failed.
  const got = L.routeError(rule, ctxFor('hybrid', 1, { errors_in_exercise: 2, failed_blocks: ['df', 'margin'] }));
  assert.equal(got[got.length - 1].route, 'checkpoint_return_prefilled');
  assert.equal(got[got.length - 1].parameters.cursor, 'margin');
  assert.equal(got[got.length - 1].parameters.new_variant_seed, prng.fnv1a32('20261119:retry:2'));
});

test('hint_levels 0 (exam-prep, strict-kelme) skips the hint; full_restart then returns to the first step', () => {
  const got = L.routeError({ option: 'full_restart', hint_levels: 0 }, ctxFor('full_restart', 1));
  assert.deepEqual(norm(got), [
    { type: 'worked_step_shown', item_id: 'ci-t-ex2', step_id: 'upper' },
    { type: 'outcome', item_id: 'ci-t-ex2', route: 'full_restart', parameters: { cursor: 'separate_data', new_variant_seed: prng.fnv1a32('20261119:retry:1') } }]);
});

test('every route the escalation can emit is in the fmt-step-ladder registry entry', () => {
  const entry = JSON.parse(fs.readFileSync(path.join(ROOT, 'skills/fmt-step-ladder/format.json'), 'utf8'));
  const seen = new Set();
  for (const option of ['none', 'full_restart', 'restart_at_failed_step_new_numbers', 'last_checkpoint_plus_worked_step', 'full_restart_after_n_errors', 'research_hybrid']) {
    for (const n of [1, 2, 3]) for (const e of L.routeError({ option, n: 3, after_errors: 3, hint_levels: 1 }, ctxFor(option, n))) if (e.type === 'outcome') seen.add(e.route);
  }
  for (const r of seen) assert.ok(entry.outcomes.includes(r), r);
});

test('unknown restart options are rejected, never silently mapped', () => {
  assert.throws(() => L.routeError({ option: 'free_restart' }, ctxFor('x', 2)), /unknown restart option/i);
});

test('the restart options map onto the pilot engine policies one to one', () => {
  assert.deepEqual(L.PILOT_POLICY, {
    full_restart: { policy: 'full', newVariant: true },
    restart_at_failed_step_new_numbers: { policy: 'failed-step', newVariant: true },
    last_checkpoint_plus_worked_step: { policy: 'checkpoint', newVariant: true },
    full_restart_after_n_errors: { policy: 'after-n-errors', newVariant: true },
    none: { policy: 'failed-step', newVariant: false }
  });
});
