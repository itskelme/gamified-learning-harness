'use strict';
// Per-unit format cap (catalog r3 6.1 step 4: "cap the plan at what the time budget allows, default 4 formats per
// unit"). A package may raise it only through harness/packages/caps.js, with a reason, and docs/FORMATS.md must
// document every override and the formats the default cap would drop (Sofia t_deb32a0c R5).
// Run: node --test tests/contract/format-cap.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '../..');
const { route, DEFAULT_MAX_FORMATS_PER_UNIT } = require(path.join(ROOT, 'harness/core/router.js'));
const { loadRegistry } = require(path.join(ROOT, 'harness/core/registry.js'));
const CAPS = require(path.join(ROOT, 'harness/packages/caps.js'));
const REG = loadRegistry(ROOT);
const lesson = JSON.parse(fs.readFileSync(path.join(ROOT, 'lessons/prova3-statistics.lesson.json'), 'utf8'));
const prova3 = require(path.join(ROOT, 'harness/packages/prova3.js')).buildProva3Package(lesson);
const doc = fs.readFileSync(path.join(ROOT, 'docs/FORMATS.md'), 'utf8');
const section = (/^### Cap overrides\n([\s\S]*?)(?=^#{2,3} |(?![\s\S]))/m.exec(doc) || [])[1] || '';

test('the router default cap is 4 formats per unit (catalog 6.1 step 4)', () => {
  assert.equal(DEFAULT_MAX_FORMATS_PER_UNIT, 4);
  const plan = route(prova3, REG);
  assert.equal(plan.units[0].formats.length, 4);
});

test('every cap override has a positive integer cap above the default and a written reason', () => {
  assert.ok(Object.keys(CAPS).length >= 1);
  for (const [pkg, c] of Object.entries(CAPS)) {
    assert.ok(Number.isInteger(c.max_formats_per_unit) && c.max_formats_per_unit > DEFAULT_MAX_FORMATS_PER_UNIT, `${pkg}: cap`);
    assert.ok(typeof c.reason === 'string' && c.reason.length >= 40, `${pkg}: reason`);
  }
});

test('Prova 3 at its override routes the catalog 6.2 plan with nothing dropped', () => {
  const plan = route(prova3, REG, { maxFormatsPerUnit: CAPS.prova3.max_formats_per_unit });
  assert.deepEqual(plan.units[0].formats.map(f => f.format_id), ['fmt-retrieval-cloze', 'fmt-match-classify', 'fmt-step-ladder',
    'fmt-sequence-order', 'fmt-data-visual-lab', 'fmt-choice-feedback']);
  assert.deepEqual(plan.units[0].dropped, []);
});

test('FORMATS.md documents each override: package, cap, reason and the formats the default cap would drop', () => {
  assert.ok(section, 'FORMATS.md has a "### Cap overrides" section');
  assert.match(section, new RegExp(`default (cap )?(is |of )?${DEFAULT_MAX_FORMATS_PER_UNIT}\\b`), 'states the default');
  const pkgs = { prova3 };
  for (const [name, c] of Object.entries(CAPS)) {
    const row = section.split('\n').find(l => l.startsWith(`| \`${name}\` |`));
    assert.ok(row, `${name}: table row`);
    assert.match(row, new RegExp(`\\| ${c.max_formats_per_unit} \\|`), `${name}: cap in the row`);
    const dropped = route(pkgs[name], REG).units.flatMap(u => u.dropped.map(d => d.format_id));
    assert.ok(dropped.length > 0, `${name}: the override changes the plan`);
    for (const f of dropped) assert.ok(row.includes(`\`${f}\``), `${name}: row lists ${f}, dropped at the default cap`);
    assert.ok(section.includes(c.reason), `${name}: the reason in caps.js is quoted in FORMATS.md`);
  }
});

test('the package builders take caps only from caps.js (no literal per-package cap)', () => {
  // scripts/lib/package-page.mjs is the one place that routes a package (build-package.mjs and build-lesson.mjs call it).
  const lib = fs.readFileSync(path.join(ROOT, 'scripts/lib/package-page.mjs'), 'utf8');
  assert.match(lib, /harness\/packages\/caps\.js/);
  for (const f of ['scripts/lib/package-page.mjs', 'scripts/build-package.mjs', 'scripts/build-lesson.mjs']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, f), 'utf8'), /maxFormatsPerUnit:\s*\d/, f);
  }
  for (const f of ['scripts/build-package.mjs', 'scripts/build-lesson.mjs']) assert.match(fs.readFileSync(path.join(ROOT, f), 'utf8'), /buildPackagePage/, `${f} routes through the shared builder`);
});
