// Generic entry point (card t_fd19236f C): scripts/build-lesson.mjs builds ANY known lesson file, by kind, into the
// offline package, slides, a study PDF path and the LaTeX source, with no package name hard-coded. Shown on the new
// lesson teste-z-uma-media (neither Prova 3 nor humanities), a migrated schema-0.1 file, and both named lessons.
// The browser gates print the fallback PDFs. The opt-in TeX test runs when latexmk is installed.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-lesson.mjs'), ...a], { encoding: 'utf8', cwd: ROOT, maxBuffer: 64 << 20 });
function build(file) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'build-lesson-'));
  const r = run(file, '--out', out, '--no-pdf');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'lesson-build.json'), 'utf8'));
  for (const o of Object.values(m.outputs)) if (o && o.file) assert.ok(fs.existsSync(path.join(out, o.file)), o.file);
  return { out, m };
}

test('new structured lesson (teste-z-uma-media): generic procedure composer, step player, package, slides, LaTeX', () => {
  const { out, m } = build('lessons/teste-z-uma-media.lesson.json');
  assert.equal(m.kind, 'ordered-procedure');
  assert.equal(m.outputs.package.composer, 'generic:ordered-procedure');
  assert.deepEqual(m.outputs.package.plan[0].formats, ['fmt-step-ladder', 'fmt-sequence-order', 'fmt-data-visual-lab', 'fmt-choice-feedback']);
  assert.equal(m.outputs.step_player.file, 'teste-z-uma-media.html');
  assert.equal(m.outputs.step_player.oracle, 'skipped', 'the Prova 3 oracle transcribes the Prova 3 PDF; this lesson relies on the engine\'s 200-seed contract');
  assert.ok(m.outputs.slides.slides >= 5 && m.outputs.slides.figures === 1);
  assert.deepEqual([m.outputs.latex.dry_run, m.outputs.latex.compiled], ['pass', false]);
  assert.match(m.outputs.latex.compile_with, /--latex-pdf/);
  // The package's step-ladder item links to the step player built next to it.
  assert.match(fs.readFileSync(path.join(out, m.outputs.package.file), 'utf8'), /"fmt-step-ladder":"teste-z-uma-media\.html"/);
});

test('LaTeX PDF: generic build compiles the source without a browser', {
  skip: spawnSync('latexmk', ['-v']).status !== 0
}, () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'build-lesson-tex-'));
  try {
    const r = run('lessons/teste-z-uma-media.lesson.json', '--out', out, '--latex-pdf');
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const { outputs } = JSON.parse(fs.readFileSync(path.join(out, 'lesson-build.json'), 'utf8'));
    assert.ok(outputs.latex.compiled);
    assert.equal(outputs.pdf.renderer, 'pdflatex');
    assert.ok(outputs.pdf.pages > 0);
    assert.match(fs.readFileSync(path.join(out, outputs.pdf.file), { encoding: 'ascii', flag: 'r' }), /^%PDF-/);
    assert.ok(!fs.readdirSync(out).some(name => name.startsWith('.tex-build-')));
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('schema 0.1 file: migrated, composed by kind (slides-practice), English slides', () => {
  const { out, m } = build('examples/stem.lesson.json');
  assert.deepEqual(m.migrated_from, { schema: 'lesson', version: '0.1' });
  assert.equal(m.outputs.package.composer, 'generic:slides-practice');
  assert.deepEqual(m.outputs.package.plan.map(p => p.formats), [['fmt-sequence-order']]);
  assert.match(fs.readFileSync(path.join(out, m.outputs.slides.file), 'utf8'), /<html lang="en-US">[^]*Use the arrow keys/);
  assert.ok(m.outputs.study_html);
});

test('named lessons go through the same entry with their curated composers; Prova 3 keeps its cap and its oracle', () => {
  const p3 = build('lessons/prova3-statistics.lesson.json').m;
  assert.equal(p3.outputs.package.composer, 'curated:prova3-estatistica');
  assert.equal(p3.outputs.package.plan[0].formats.length, 6, 'caps.js prova3 cap (6) applies through the generic entry');
  assert.equal(p3.outputs.step_player.oracle, 'pass');
  const hu = build('lessons/humanities-decisions.lesson.json').m;
  assert.equal(hu.outputs.package.composer, 'curated:humanidades-decisoes');
  assert.ok(hu.outputs.package.plan.some(u => u.formats.includes('fmt-branching-case')));
  // Same package plan as the named builder (built here: the test must not depend on an earlier build in build/).
  const nb = spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-package.mjs'), 'humanities'], { encoding: 'utf8', cwd: ROOT });
  assert.equal(nb.status, 0, nb.stderr);
  const named = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/humanities/humanidades-pacote.manifest.json'), 'utf8'));
  assert.deepEqual(hu.outputs.package.plan, named.plan);
});

test('an unknown lesson version is refused with the known list (no guessing), exit 1', () => {
  const r = run('tests/fixtures/lesson-unknown-version.json', '--out', fs.mkdtempSync(path.join(os.tmpdir(), 'bl-')), '--no-pdf');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Unsupported lesson version '0\.3'; known: 0\.1, ordered-procedure 0\.2\.0, 1\.0/);
});
