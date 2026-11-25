'use strict';
// Router contract (catalog r3 section 6): plain function, plain data, deterministic, never fabricates content.
// Run: node --test tests/contract/router.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const { route } = require(path.join(ROOT, 'harness/core/router.js'));
const { loadRegistry } = require(path.join(ROOT, 'harness/core/registry.js'));
const REG = loadRegistry(ROOT);

const ref = { source_ref: 'pdf p.8' };
// Catalog 6.2: Prova 3 Exercise 2 unit (structured input).
const prova3Unit = {
  id: 'ci-mean-t', kind: 'ordered_procedure', objectives: ['o-recall', 'o-disc', 'o-perform', 'o-seq', 'o-why', 'o-interp', 'o-review'],
  items: [
    { id: 'symbols', format: 'fmt-retrieval-cloze', ...ref, payload: { blanks: [] } },
    { id: 'method', format: 'fmt-match-classify', ...ref, payload: { categories: [], cases: [] } },
    { id: 'ex2', format: 'fmt-step-ladder', ...ref, payload: { steps: [], variables: {}, constraints: [] } },
    { id: 'recipe', format: 'fmt-sequence-order', ...ref, payload: { key_order: [] } },
    { id: 'lab', format: 'fmt-data-visual-lab', ...ref, payload: { data_model: {}, plot_spec: {} } },
    { id: 'interp', format: 'fmt-choice-feedback', ...ref, payload: { stem: '', options: [] } }
  ]
};
const objectives = [
  { id: 'o-recall', verb: 'recall' }, { id: 'o-disc', verb: 'discriminate' }, { id: 'o-perform', verb: 'perform' },
  { id: 'o-seq', verb: 'sequence' }, { id: 'o-why', verb: 'explain_relationship' }, { id: 'o-interp', verb: 'interpret' },
  { id: 'o-review', verb: 'review' }, { id: 'o-decide', verb: 'decide' }
];
const lessonOf = (units, extra = {}) => ({ id: 'l', objectives, units, ...extra });

test('catalog 6.2: Prova 3 unit is routed in learning-phase order; branching skipped (no graph is invented)', () => {
  const plan = route(lessonOf([prova3Unit]), REG, { maxFormatsPerUnit: 8 });
  assert.deepEqual(plan.errors, []);
  const u = plan.units[0];
  assert.deepEqual(u.formats.map(f => f.format_id), ['fmt-retrieval-cloze', 'fmt-match-classify', 'fmt-step-ladder', 'fmt-sequence-order', 'fmt-data-visual-lab', 'fmt-choice-feedback']);
  assert.match(u.skipped.find(s => s.format_id === 'fmt-branching-case').reason, /missing fields: graph/);
  assert.deepEqual(plan.lesson_level.map(f => f.format_id), ['fmt-review-mix']);
});

test('the default cap keeps 4 formats per unit and lists every dropped one with its reason', () => {
  const u = route(lessonOf([prova3Unit]), REG).units[0];
  assert.equal(u.formats.length, 4);
  assert.deepEqual(u.dropped, [
    { format_id: 'fmt-data-visual-lab', reason: 'over the per-unit cap of 4' },
    { format_id: 'fmt-choice-feedback', reason: 'over the per-unit cap of 4' }]);
});

test('catalog 6.3: shallow humanities unit skips the ladder, the lab and match with reasons', () => {
  const unit = { id: 'phases', kind: 'declarative', objectives: ['o-seq', 'o-recall', 'o-interp', 'o-decide', 'o-review'], items: [
    { id: 'timeline', ...ref, payload: { items: [], sort_by: 'date' } },
    { id: 'terms', ...ref, payload: { blanks: [] } },
    { id: 'causes', ...ref, payload: { stem: '', options: [] } }] };
  const u = route(lessonOf([unit]), REG).units[0];
  assert.deepEqual(u.formats.map(f => f.format_id), ['fmt-retrieval-cloze', 'fmt-sequence-order', 'fmt-choice-feedback']);
  const why = Object.fromEntries(u.skipped.map(s => [s.format_id, s.reason]));
  // Every failing condition is reported, in the fixed order kind; fields; verb.
  assert.equal(why['fmt-step-ladder'], 'content kind declarative not accepted; missing fields: steps, variables, constraints; no matching objective verb (needs perform or compute)');
  assert.equal(why['fmt-data-visual-lab'], 'missing fields: data_model, plot_spec; no matching objective verb (needs explain_relationship or predict)');
  assert.equal(why['fmt-branching-case'], 'missing fields: graph');
  assert.equal(why['fmt-match-classify'], 'missing fields: categories, cases; no matching objective verb (needs discriminate or classify)');
});

test('items without source_ref give an actionable error listing them, and no plan', () => {
  const unit = { id: 'u', kind: 'declarative', objectives: ['o-recall'], items: [{ id: 'a', payload: { blanks: [] } }, { id: 'b', ...ref, payload: { blanks: [] } }, { id: 'c', source_ref: ' ', payload: { blanks: [] } }] };
  const plan = route(lessonOf([unit]), REG);
  assert.deepEqual(plan.errors, ['items without source_ref: u/a, u/c']);
  assert.deepEqual(plan.units, []);
});

test('unknown content kinds and unknown objective ids are errors, not silent skips', () => {
  const plan = route(lessonOf([{ id: 'u', kind: 'essay', objectives: ['nope'], items: [] }]), REG);
  assert.ok(plan.errors.includes('unit u: unknown content kind essay'));
  assert.ok(plan.errors.includes('unit u: unknown objective nope'));
});

test('routing is deterministic and does not modify the lesson', () => {
  const lesson = lessonOf([prova3Unit]), before = JSON.stringify(lesson);
  assert.deepEqual(route(lesson, REG), route(lesson, REG));
  assert.equal(JSON.stringify(lesson), before);
});
