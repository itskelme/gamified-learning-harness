'use strict';
// Core contract tests against Minerva's catalog fixtures r3 (approved by Sofia, t_8a15e9e2 r3).
// Run: node --test tests/core.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests/fixtures/catalog-r3/game-format-catalog.fixtures.json');
const FIXTURES_SHA256 = '1af7b5c88a99dc26f9a93060c8f9002a2169bf58c618243ab57ecdcacdd43e83';
const raw = fs.readFileSync(FIXTURES);
const fx = JSON.parse(raw.toString('utf8'));
const prng = require(path.join(ROOT, 'harness/core/prng.js'));
const events = require(path.join(ROOT, 'harness/core/events.js'));

test('fixtures are the approved r3 file', () => {
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), FIXTURES_SHA256);
});

test('AF-COM-01: PRNG anchor matches the catalog in value and in the first three outputs', () => {
  assert.equal(prng.fnv1a32('anchor'), 1122880180);
  assert.equal(prng.fnv1a32('anchor'), fx.meta.anchor["fnv1a32('anchor')"]);
  const r = prng.mulberry32(prng.fnv1a32('anchor'));
  assert.deepEqual([r(), r(), r()], fx.meta.anchor.first3);
});

test('fnv1a32 hashes UTF-8 bytes, not UTF-16 code units', () => {
  // "é" is 2 UTF-8 bytes; a code-unit hash would differ.
  const bytes = Buffer.from('é', 'utf8');
  let h = 0x811C9DC5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  assert.equal(prng.fnv1a32('é'), h);
});

test('seeded shuffles reproduce the catalog presentation orders (MCQ, MAT, SEQ)', () => {
  const opts = fx['AF-MCQ-01'].item.options.map(o => o.id);
  assert.deepEqual(prng.shuffled(opts, '20261119:shop-fact:options:1'), fx['AF-MCQ-01'].presented_attempt1);
  assert.deepEqual(prng.shuffled(opts, '20261119:shop-fact:options:2'), fx['AF-MCQ-01'].presented_attempt2);
  const items = fx['AF-MAT-01'].items.map(i => i.id);
  assert.deepEqual(prng.shuffled(items, '20261119:match-sigma:items:1'), fx['AF-MAT-01'].presented_item_order);
  const key = fx['AF-SEQ-01'].key_order;
  assert.deepEqual(prng.shuffled(key, '20261119:recipe:order:1'), fx['AF-SEQ-01'].presented_attempt1);
  assert.deepEqual(prng.shuffled(key, '20261119:recipe:order:2'), fx['AF-SEQ-01'].presented_attempt2);
});

test('AF-SEQ-01: 200 presentation shuffles reproduce the order hash and never touch the stored key', () => {
  const key = fx['AF-SEQ-01'].key_order, before = JSON.stringify(key);
  const orders = [];
  for (let n = 1; n <= 200; n++) orders.push(prng.shuffled(key, `20261119:recipe:order:${n}`));
  assert.equal(JSON.stringify(key), before, 'stored key unchanged');
  const check = fx['AF-SEQ-01'].presentation_check;
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(orders)).digest('hex'), check.presented_orders_sha256);
  assert.equal(new Set(orders.map(o => o.join(','))).size, check.distinct_presented_orders);
});

test('seedText builds the catalog seed string "{seed}:{item_id}:{purpose}:{n}"', () => {
  assert.equal(prng.seedText(20261119, 'shop-fact', 'options', 1), '20261119:shop-fact:options:1');
  assert.deepEqual(prng.shuffled(['o1', 'o2', 'o3'], prng.seedText(20261119, 'shop-fact', 'options', 1)), fx['AF-MCQ-01'].presented_attempt1);
});

test('halfUp is floor(x * 10^d + 0.5) / 10^d', () => {
  assert.equal(prng.halfUp(2.5572, 3), 2.557);
  assert.equal(prng.halfUp(0.24995, 4), 0.25);
  assert.equal(prng.halfUp(-1.25, 1), -1.2);
});

test('PRNG migration: the pilot engine generator is the same mulberry32 (integer seeds keep their variants)', () => {
  const E = require(path.join(ROOT, 'harness/procedure-engine.js'));
  for (const seed of [0, 1, 20261119, 4294967295, prng.fnv1a32('anchor')]) {
    const a = E.mulberry32(seed), b = prng.mulberry32(seed);
    for (let i = 0; i < 500; i++) assert.equal(a(), b(), `seed ${seed} output ${i}`);
  }
});

// ------------------------------------------------------------------------- events (catalog 3.4 / 3.5)
function collectEvents(node, out = []) {
  if (Array.isArray(node)) node.forEach(n => collectEvents(n, out));
  else if (node && typeof node === 'object') {
    if (typeof node.type === 'string' && Object.hasOwn(events.EVENT_FIELDS, node.type)) out.push(node);
    else Object.values(node).forEach(v => collectEvents(v, out));
  }
  return out;
}

test('AF-COM-02: every event in the r3 fixtures is inside the closed vocabulary', () => {
  const all = collectEvents(fx);
  assert.ok(all.length >= 60, `collected ${all.length}`);
  assert.deepEqual(events.checkEvents(all), []);
  const routes = new Set(all.filter(e => e.type === 'outcome').map(e => e.route));
  for (const r of fx['AF-COM-02'].routes_seen) assert.ok(routes.has(r), r);
});

test('AF-COM-02 negative controls: r1 route name, r1 field names, a scored invalid answer, extra route params', () => {
  const bad = events.checkEvents([
    { type: 'outcome', item_id: 'x', route: 'requeue_later_interleaved_with_confusable', parameters: {} },
    { type: 'answer_submitted', item_id: 'x', result: 'incorrect', misconception: 't', counts_as_error: true },
    { type: 'answer_submitted', item_id: 'x', result: 'invalid', score: { earned: 0, max: 1 } },
    { type: 'outcome', item_id: 'x', route: 'advance', parameters: { cursor: 'a' } },
    { type: 'answer_submitted', item_id: 'x', result: 'wrong' },
    { type: 'made_up_event', item_id: 'x' }
  ]);
  assert.equal(bad.length, 6, bad.join('\n'));
  assert.match(bad[0], /route_not_in_3\.5/);
  assert.match(bad[1], /fields_not_in_3\.4/);
  assert.match(bad[2], /invalid_must_not_be_scored/);
  assert.match(bad[3], /parameters_not_in_3\.5/);
  assert.match(bad[4], /bad_result/);
  assert.match(bad[5], /unknown_event/);
});

test('only "incorrect" is an error; near_miss, invalid, partial and correct never are', () => {
  assert.equal(events.isError('incorrect'), true);
  for (const r of ['correct', 'near_miss', 'invalid', 'partial']) assert.equal(events.isError(r), false, r);
});

test('the closed lists equal catalog r3 sections 3.4 and 3.5', () => {
  assert.deepEqual(Object.keys(events.EVENT_FIELDS).sort(), ['answer_submitted', 'control_changed', 'hint_shown', 'item_completed', 'item_presented', 'outcome', 'run_finished', 'skill_progress', 'worked_step_shown']);
  assert.deepEqual(Object.keys(events.ROUTE_PARAMS).sort(), ['advance', 'checkpoint_return_prefilled', 'due_on', 'full_restart', 'hint_next_level', 'mastered', 'requeue_later', 'retry_same', 'retry_same_step', 'route_to_format', 'show_worked_step', 'step_twin_new_numbers', 'worked_debrief', 'worked_debrief_then_requeue_branch']);
  assert.deepEqual([...events.RESULTS].sort(), ['correct', 'incorrect', 'invalid', 'near_miss', 'partial']);
});
