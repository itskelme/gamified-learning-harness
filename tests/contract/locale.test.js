// Locale contract for typed numbers (ACCEPTANCE line 23, docs/FORMATS.md "Locale contract for typed numbers").
// One table (tests/fixtures/locale-numbers.json) drives both parsers: the procedure engine (pilot steps) and the
// retrieval-cloze grader (package blanks).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const E = require(path.join(ROOT, 'harness/procedure-engine.js'));
const CLZ = require(path.join(ROOT, 'harness/formats/fmt-retrieval-cloze/grader.js'));
const table = require(path.join(ROOT, 'tests/fixtures/locale-numbers.json'));
const lesson = require(path.join(ROOT, 'lessons/prova3-statistics.lesson.json'));

for (const [locale, cases] of Object.entries(table.cases)) {
  test(`engine parseNumber/numberIssue follow the locale table (${locale})`, () => {
    for (const c of cases) {
      if ('value' in c) {
        assert.equal(E.parseNumber(c.input, locale), c.value, `${locale} ${JSON.stringify(c.input)}`);
        assert.equal(E.numberIssue(c.input, locale), null, `${locale} ${JSON.stringify(c.input)}`);
      } else {
        assert.ok(Number.isNaN(E.parseNumber(c.input, locale)), `${locale} ${JSON.stringify(c.input)} must be refused`);
        assert.equal(E.numberIssue(c.input, locale), c.issue, `${locale} ${JSON.stringify(c.input)}`);
      }
    }
  });
  test(`cloze parseNumber/numberIssue follow the same locale table (${locale})`, () => {
    for (const c of cases) {
      if ('value' in c) {
        assert.equal(CLZ.parseNumber(c.input, locale), c.value, `${locale} ${JSON.stringify(c.input)}`);
        assert.equal(CLZ.numberIssue(c.input, locale), null, `${locale} ${JSON.stringify(c.input)}`);
      } else {
        assert.equal(CLZ.parseNumber(c.input, locale), null, `${locale} ${JSON.stringify(c.input)} must be refused`);
        assert.equal(CLZ.numberIssue(c.input, locale), c.issue, `${locale} ${JSON.stringify(c.input)}`);
      }
    }
  });
}

test('pt-BR pilot step: "1.960" is a no-op with a message that shows the comma form; "1,960" is graded', () => {
  const run = E.createRun(lesson, 'ex1-ic-media-z', 'original');
  // Walk to the first numeric step with the key answers.
  const ex = lesson.exercises.find(e => e.id === 'ex1-ic-media-z');
  while (ex.steps[run.step].type !== 'numeric') {
    const s = ex.steps[run.step], k = run.key.steps[run.step];
    const input = s.type === 'givens' ? Object.fromEntries(s.fields.map(f => [f.var, String(k.answer[f.var])])) : k.answer;
    assert.equal(E.submit(lesson, run, input).status, 'correct');
  }
  const before = { attempts: run.attempts, errors: run.errors, step: run.step };
  const r = E.submit(lesson, run, '1.960');
  assert.equal(r.status, 'invalid');
  assert.match(r.message, /1,960/, 'the message shows the comma form');
  assert.match(r.message, /vírgula/);
  assert.deepEqual({ attempts: run.attempts, errors: run.errors, step: run.step }, before, 'ambiguous input is not counted');
  assert.notEqual(E.submit(lesson, run, '1,960').status, 'invalid');
});

test('package cloze: "1.960" in a pt-BR blank is invalid (no score); "1,96" is correct; no-locale keeps the catalog parse', () => {
  const spec = { type: 'number', value: 1.96, tolerance: 0 };
  const amb = CLZ.gradeBlank(spec, '1.960', 'simbolos', 'z95', { locale: 'pt-BR' });
  assert.equal(amb.result, 'invalid');
  assert.equal('score' in amb, false);
  assert.equal(CLZ.gradeBlank(spec, '1,96', 'simbolos', 'z95', { locale: 'pt-BR' }).result, 'correct');
  // Catalog fixture behaviour (no locale): unchanged.
  assert.equal(CLZ.gradeBlank(spec, '1.960', 'simbolos', 'z95').result, 'correct');
  assert.match(CLZ.issueMessage('ambiguous_grouping', '1.960', 'pt-BR'), /1,960/);
});
