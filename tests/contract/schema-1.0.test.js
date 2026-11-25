// Schema 1.0 on the JavaScript side: the Python normaliser (scripts/harness.py normalize) is the one migration;
// the engine and the package composers must give the same results on the migrated lesson as on the source file.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const E = require(path.join(ROOT, 'harness/procedure-engine.js'));
const { buildProva3Package } = require(path.join(ROOT, 'harness/packages/prova3.js'));
const { buildHumanitiesPackage } = require(path.join(ROOT, 'harness/packages/humanities.js'));

const normalize = f => {
  const r = spawnSync(process.env.PYTHON || 'python3', ['-I', path.join(ROOT, 'scripts/harness.py'), 'normalize', path.join(ROOT, f)], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
};

test('pilot 0.2.0 -> 1.0: the engine validates the migrated Prova 3 and every answer (original + 25 seeds) is unchanged', () => {
  const src = require(path.join(ROOT, 'lessons/prova3-statistics.lesson.json'));
  const { lesson } = normalize('lessons/prova3-statistics.lesson.json');
  assert.equal(lesson.schema_version, '1.0');
  assert.deepEqual(E.validateLesson(lesson, { seedCount: 25 }), []);
  for (const ex of src.exercises) {
    const ex1 = lesson.exercises.find(e => e.id === ex.id);
    const runs = [['original', E.originalVariables(ex), E.originalVariables(ex1)]];
    for (let seed = 1; seed <= 25; seed++) runs.push([seed, E.drawVariant(src, ex, seed).variables, E.drawVariant(lesson, ex1, seed).variables]);
    for (const [seed, a, b] of runs) {
      assert.deepEqual(b, a, `${ex.id} ${seed}: same variant`);
      assert.deepEqual(E.solve(lesson, ex1, b).values, E.solve(src, ex, a).values, `${ex.id} ${seed}: same answers`);
    }
  }
  assert.deepEqual(buildProva3Package(lesson), buildProva3Package(src), 'the composed package does not depend on the file version');
});

test('native 1.0 lessons: the humanities package is the same from the file and from the normaliser; the new procedure lesson passes the engine contract', () => {
  const hum = normalize('lessons/humanities-decisions.lesson.json');
  assert.equal(hum.migrated_from, null);
  assert.deepEqual(buildHumanitiesPackage(hum.lesson), buildHumanitiesPackage(require(path.join(ROOT, 'lessons/humanities-decisions.lesson.json'))));
  const z = normalize('lessons/teste-z-uma-media.lesson.json').lesson;
  assert.deepEqual(E.validateLesson(z, { seedCount: 200 }), []);
  const ex = z.exercises[0], solved = E.solve(z, ex, E.originalVariables(ex));
  // Author's hand calculation (source_answer_key): sqrt(36) = 6, EP = 1, Z = -3, reject H0, sample below.
  assert.deepEqual([solved.values.raiz, solved.values.ep, solved.values.z, solved.values.decisao, solved.values.interp], [6, 1, -3, 'rejeita', 'abaixo']);
});

test('an unknown lesson version is refused by the normaliser, never guessed', () => {
  const r = spawnSync(process.env.PYTHON || 'python3', ['-I', path.join(ROOT, 'scripts/harness.py'), 'normalize', path.join(ROOT, 'tests/fixtures/lesson-unknown-version.json')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unsupported lesson version '0\.3'; known: 0\.1, ordered-procedure 0\.2\.0, 1\.0/);
});
