'use strict';
// Format registry contract (catalog r3 section 3.2) and skill discoverability.
// Run: node --test tests/contract/registry.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '../..');
const R = require(path.join(ROOT, 'harness/core/registry.js'));

const CATALOG_ORDER = ['fmt-step-ladder', 'fmt-choice-feedback', 'fmt-retrieval-cloze', 'fmt-match-classify',
  'fmt-sequence-order', 'fmt-branching-case', 'fmt-data-visual-lab', 'fmt-review-mix'];

test('the registry holds the eight catalog formats in fixed catalog order', () => {
  const reg = R.loadRegistry(ROOT);
  assert.deepEqual(reg.map(e => e.format_id), CATALOG_ORDER);
});

test('every registry entry is valid and has a discoverable SKILL.md whose name matches', () => {
  for (const entry of R.loadRegistry(ROOT)) {
    assert.deepEqual(R.validateEntry(entry), [], entry.format_id);
    const skill = fs.readFileSync(path.join(ROOT, 'skills', entry.format_id, 'SKILL.md'), 'utf8');
    const front = /^---\n([\s\S]*?)\n---\n/.exec(skill);
    assert.ok(front, `${entry.format_id}: SKILL.md has YAML frontmatter`);
    assert.match(front[1], new RegExp(`^name: ${entry.format_id}$`, 'm'));
    assert.match(front[1], /^description: Use when /m);
    assert.match(front[1], /^status: draft$/m, 'draft until Sofia release QA');
  }
});

test('objective verbs map to exactly one format each (catalog 6.1 closed list)', () => {
  const owners = {};
  for (const e of R.loadRegistry(ROOT)) for (const v of e.selects_when.objective_verbs) (owners[v] = owners[v] || []).push(e.format_id);
  assert.deepEqual(Object.keys(owners).sort(), [...R.OBJECTIVE_VERBS].sort());
  for (const [v, fs_] of Object.entries(owners)) assert.equal(fs_.length, 1, `${v}: ${fs_}`);
});

test('invalid entries are rejected with a reason for each defect', () => {
  const good = R.loadRegistry(ROOT)[0];
  const bad = JSON.parse(JSON.stringify(good));
  bad.outcomes.push('requeue_later_interleaved_with_confusable');
  bad.emits.push('made_up_event');
  bad.retry_class = 'sometimes';
  bad.accepts.content_kinds.push('essay');
  bad.selects_when.objective_verbs.push('enjoy');
  bad.a11y.non_drag = false;
  bad.fixtures = [];
  const problems = R.validateEntry(bad);
  for (const re of [/outcome.*requeue_later_interleaved_with_confusable/, /event.*made_up_event/, /retry_class/, /content kind.*essay/, /verb.*enjoy/, /a11y.non_drag/, /fixtures/]) {
    assert.ok(problems.some(p => re.test(p)), `${re} in ${problems.join(' | ')}`);
  }
});

test('the PRNG and events modules the registry depends on are the shared core ones', () => {
  assert.equal(R.events, require(path.join(ROOT, 'harness/core/events.js')));
});
