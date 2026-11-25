// Shallow-brief path (card t_fd19236f C): through the generic entry with an injectable provider.
// The three acceptance conditions, each tested at the module and through scripts/build-lesson.mjs:
//   1. the output lists assumptions[];
//   2. unverified claims are flagged (and a provider cannot pass a claim off as sourced by a source the brief lacks);
//   3. a brief with no source is refused with a clear error, before any provider runs, and nothing is written.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const Brief = require('../../harness/brief/brief.js');
const stub = require('../../harness/brief/stub-provider.js');
const { composeDeclarative, UNVERIFIED_LABEL } = require('../../harness/packages/compose.js');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const BRIEF = read('examples/briefs/vies-de-sobrevivencia.brief.json');
const NO_SOURCE = read('tests/fixtures/brief-no-source.json');
const spy = () => { const p = { id: 'spy', calls: 0, draft(b) { p.calls++; return stub.draft(b); } }; return p; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'brief-test-'));
const cli = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/build-lesson.mjs'), ...a], { encoding: 'utf8', cwd: ROOT });

test('brief refused with a clear error when no source is given; the provider is never called', () => {
  for (const b of [NO_SOURCE, { ...BRIEF, sources: undefined }, { ...BRIEF, sources: [{ id: 's1' }] }]) {
    const p = spy();
    assert.throws(() => Brief.draftLesson(b, p), e => e instanceof Brief.BriefError && /nenhuma fonte foi informada/.test(e.message) && /nada foi gerado/.test(e.message));
    assert.equal(p.calls, 0);
  }
});

test('brief refused through the generic entry: exit 2, the message on stderr, no output directory', () => {
  const out = path.join(tmp(), 'out');
  const r = cli('--brief', 'tests/fixtures/brief-no-source.json', '--out', out, '--no-pdf');
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /Pedido recusado: nenhuma fonte foi informada/);
  assert.equal(fs.existsSync(out), false);
});

test('the draft lists the provider\'s assumptions[]; a provider that assumes nothing is refused', () => {
  const L = Brief.draftLesson(BRIEF, stub);
  assert.equal(L.brief.provider, 'stub');
  assert.equal(L.brief.request, BRIEF.request);
  assert.ok(L.brief.assumptions.length >= 3);
  assert.ok(L.brief.assumptions.some(a => /^Público não informado/.test(a)), 'the brief gives no audience: that is assumed and said');
  const silent = { id: 'silent', draft: b => ({ ...stub.draft(b), assumptions: [] }) };
  assert.throws(() => Brief.draftLesson(BRIEF, silent), /não listou nenhuma suposição/);
});

test('unverified claims are flagged: unsourced points and terms, and a source the brief never gave', () => {
  const L = Brief.draftLesson(BRIEF, stub), st = Object.fromEntries(L.claims.map(c => [c.id, c.status]));
  assert.deepEqual(st, { 'c-ponto-1': 'sourced', 'c-ponto-2': 'unverified', 'c-termo-1': 'unverified', 'c-termo-2': 'sourced', 'c-termo-3': 'unverified' });
  assert.deepEqual(L.brief.unverified_claims, L.claims.filter(c => c.status === 'unverified').map(c => c.text));
  for (const s of L.sources) assert.equal(s.status, 'unverified', 'the brief\'s sources are recorded as given, not as checked');
  // Injected provider: claims the first point rests on a source that is not in the brief.
  const foreign = require('../fixtures/brief-provider-foreign-source.cjs');
  const F = Brief.draftLesson(BRIEF, foreign), c1 = F.claims.find(c => c.id === 'c-ponto-1');
  assert.equal(c1.status, 'unverified');
  assert.deepEqual(c1.source_ids, []);
  assert.ok(F.brief.unverified_claims.includes(c1.text));
  assert.equal(F.brief.provider, 'test-foreign-source');
});

test('the package names unverified claims as such (never as sourced) and keeps the real source where there is one', () => {
  const pkg = composeDeclarative(Brief.draftLesson(BRIEF, stub));
  const it = pkg.units[0].items[0];
  assert.equal(it.source_ref, `${UNVERIFIED_LABEL}; Mangel e Samaniego (1984)`);
});

test('the lesson contract accepts unverified claims only inside a shallow brief', () => {
  const dir = tmp(), L = Brief.draftLesson(BRIEF, stub);
  const norm = f => spawnSync(process.env.PYTHON || 'python3', ['-I', path.join(ROOT, 'scripts/harness.py'), 'normalize', f], { encoding: 'utf8' });
  fs.writeFileSync(path.join(dir, 'draft.json'), JSON.stringify(L));
  assert.equal(norm(path.join(dir, 'draft.json')).status, 0);
  const { brief, ...noBrief } = L;
  fs.writeFileSync(path.join(dir, 'nobrief.json'), JSON.stringify(noBrief));
  const r = norm(path.join(dir, 'nobrief.json'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr + r.stdout, /unverified claims outside a shallow brief: c-ponto-2, c-termo-1, c-termo-3/);
  void brief;
});

test('the same brief through the generic entry with an injected provider module: assumptions and flags in the build manifest', () => {
  const out = path.join(tmp(), 'out');
  const r = cli('--brief', 'examples/briefs/vies-de-sobrevivencia.brief.json', '--provider', 'tests/fixtures/brief-provider-foreign-source.cjs', '--out', out, '--no-pdf');
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(fs.readFileSync(path.join(out, 'lesson-build.json'), 'utf8'));
  assert.equal(m.brief.provider, 'test-foreign-source');
  assert.deepEqual(m.brief.assumptions, ['Provider de teste: atribui o primeiro ponto a uma fonte que o pedido não deu.']);
  assert.equal(m.brief.unverified_claims.length, 4);
  for (const f of [m.outputs.package.file, m.outputs.slides.file, m.outputs.latex.file, m.outputs.study_html.file]) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.match(fs.readFileSync(path.join(out, m.outputs.study_html.file), 'utf8'), /Afirmações ainda não verificadas/);
});
