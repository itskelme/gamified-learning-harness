'use strict';
// The two domain skills may say only what the repository can back: research verified, design approved,
// release checks still open. They share one rule file so they cannot drift, and the founder's full-restart
// mode stays in it. Run: node --test tests/contract/domain-skill-status.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SKILLS = ['skills/gamified-stem-learning/SKILL.md', 'skills/gamified-humanities-learning/SKILL.md'];

test('domain skills: status names the open release checks and every cited file exists', () => {
  for (const f of SKILLS) {
    const md = read(f);
    assert.match(md, /^ {2}status: draft-research-verified-pending-release-checks$/m, `${f}: status`);
    assert.doesNotMatch(md, /status: stable/, `${f}: not stable while docs/ACCEPTANCE.md has open people-dependent checks`);
    assert.match(md, /no learning effect has been measured/, `${f}: says nothing was measured`);
    assert.ok(md.includes('`references/design-rules.md`'), `${f}: follows the shared rules`);
    for (const [, p] of md.matchAll(/`((?:docs|research|references|lessons|scripts|tests|harness)\/[^`\s]+\.[a-z]+)`/g)) assert.ok(fs.existsSync(path.join(ROOT, p)), `${f}: cites missing ${p}`);
  }
});

test('shared design rules: every rule is rated, the four restart policies and the full-restart preset stay, nothing is promised', () => {
  const md = read('references/design-rules.md');
  const rows = [...md.matchAll(/^\| (R\d+) \| (.+?) \| (.+?) \|$/gm)];
  assert.deepEqual(rows.map(r => r[1]), Array.from({ length: 12 }, (_, i) => `R${i + 1}`));
  for (const [, id, , rating] of rows) assert.match(rating, /^[ABC]\b/, `${id}: rating`);
  for (const policy of ['full restart', 'failed step with new numbers', 'last checkpoint plus the worked step', 'full restart after N errors']) assert.ok(md.includes(policy), policy);
  assert.match(md, /`strict-kelme` \(full restart with new numbers\) is offered on the start screen and must never be removed or hidden/);
  for (const preset of ['research-hybrid', 'strict-kelme']) assert.ok(fs.existsSync(path.join(ROOT, `rules/presets/${preset}.json`)), preset);
  assert.match(md, /## Never promise/);
  for (const [, p] of md.matchAll(/`((?:docs|research|references)\/[^`\s]+?)`/g)) assert.ok(fs.existsSync(path.join(ROOT, p)), `cites missing ${p}`);
});
