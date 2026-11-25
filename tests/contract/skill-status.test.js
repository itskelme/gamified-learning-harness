'use strict';
// SKILL.md "Status" must match verified functionality (Sofia t_deb32a0c R4).
// Run: node --test tests/contract/skill-status.test.js
//
// Each format's Status has exactly three labelled lines, in order:
//   Works: ...                    (verified, each claim citing an existing evidence file)
//   Exists but unexercised: ...   (code that ships but no test drives it)
//   Pending: ...                  (not built)
// "none" is allowed for any line. Research ratings stay in "## Evidence", never in Status.
// Whether a format has a player view is read from harness/player/views.js; whether that view is exercised is read
// from the browser suites (the check label must exist in the test file), so the Status cannot drift from the code.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '../..');
const R = require(path.join(ROOT, 'harness/core/registry.js'));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Browser check that drives each format's player view: [test file, label prefix of a check in that file].
const DRIVEN_BY = {
  'fmt-retrieval-cloze': ['tests/package-browser.mjs', 'cloze:'],
  'fmt-match-classify': ['tests/package-browser.mjs', 'match:'],
  'fmt-sequence-order': ['tests/package-browser.mjs', 'sequence:'],
  'fmt-data-visual-lab': ['tests/package-browser.mjs', 'lab:'],
  'fmt-choice-feedback': ['tests/package-browser.mjs', 'choice:'],
  'fmt-review-mix': ['tests/package-browser.mjs', 'review:'],
  'fmt-step-ladder': ['tests/pilot-browser.mjs', 'walkthrough:']
};

function views() {
  const src = read('harness/player/views.js');
  const m = /const VIEWS = \{([\s\S]*?)\};/.exec(src);
  assert.ok(m, 'views.js declares a VIEWS map');
  const ids = [...m[1].matchAll(/'(fmt-[a-z-]+)'\s*:/g)].map(x => x[1]);
  if (/function review\(entry, items\)/.test(src)) ids.push('fmt-review-mix'); // lesson-level view
  return new Set(ids);
}

function exercised(format) {
  const d = DRIVEN_BY[format];
  if (!d) return null;
  const src = read(d[0]);
  const label = d[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:check\\(|passed\\.push\\()\\s*['"\`]${label}`).test(src) ? d[0] : null;
}

function status(format) {
  const md = read(`skills/${format}/SKILL.md`);
  const m = /^## Status\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(md);
  assert.ok(m, `${format}: has a "## Status" section`);
  const body = m[1].trim(), lines = {};
  const re = /^(Works|Exists but unexercised|Pending): ([\s\S]*?)(?=^(?:Works|Exists but unexercised|Pending): |(?![\s\S]))/gm;
  const order = [];
  for (const x of body.matchAll(re)) { lines[x[1]] = x[2].trim(); order.push(x[1]); }
  return { md, body, lines, order };
}

test('every SKILL.md Status has Works / Exists but unexercised / Pending, in that order, and no research rating', () => {
  for (const { format_id: f } of R.loadRegistry(ROOT)) {
    const s = status(f);
    assert.deepEqual(s.order, ['Works', 'Exists but unexercised', 'Pending'], `${f}: Status lines`);
    assert.ok(/^## Evidence/m.test(s.md), `${f}: keeps a separate Evidence section`);
    assert.ok(s.md.indexOf('## Evidence') < s.md.indexOf('## Status'), `${f}: Evidence comes before Status`);
    assert.doesNotMatch(s.body, /\brat(ed|ing)\b|evidence level|\bgrade [A-D]\b/i, `${f}: research rating inside Status`);
  }
});

test('every file a Status cites exists', () => {
  for (const { format_id: f } of R.loadRegistry(ROOT)) {
    for (const [, p] of status(f).body.matchAll(/`([^`\s]+\/[^`\s]+\.[a-z]+)`/g)) assert.ok(fs.existsSync(path.join(ROOT, p)), `${f}: cites missing ${p}`);
  }
});

test('a player view that a browser check drives is under Works with that test file; one no check drives is under "Exists but unexercised"', () => {
  const shipped = views();
  for (const { format_id: f } of R.loadRegistry(ROOT)) {
    const { lines } = status(f), by = exercised(f);
    assert.doesNotMatch(lines.Pending, /player view/i, `${f}: Pending still lists the player view, but views.js ships it`);
    if (!shipped.has(f)) continue;
    if (by) {
      assert.match(lines.Works, /player view/i, `${f}: Works names the player view`);
      assert.ok(lines.Works.includes(`\`${by}\``), `${f}: Works cites \`${by}\``);
    } else {
      assert.match(lines['Exists but unexercised'], /player view/i, `${f}: the view ships but no browser check drives it`);
      assert.doesNotMatch(lines.Works, /player view/i, `${f}: Works claims an unexercised player view`);
    }
  }
});

test('the views and checks this test relies on exist (guards against a silent pass)', () => {
  const shipped = views();
  assert.ok(shipped.size >= 7, `views.js VIEWS map has ${shipped.size} formats`);
  for (const f of Object.keys(DRIVEN_BY)) assert.ok(exercised(f), `${f}: no "${DRIVEN_BY[f][1]}" check in ${DRIVEN_BY[f][0]}`);
  assert.ok(shipped.has('fmt-branching-case') && !exercised('fmt-branching-case'), 'branching view ships and is not driven by a check');
});
