// Shallow-brief drafts: an unverified claim is flagged EVERY place its text is printed (Sofia, t_fd19236f round 1:
// the glossary definitions of "Viés de sobrevivência" and "População" and the "Respostas" entry of the unverified
// section printed with no flag in the study guide and in the LaTeX; only section headings were flagged).
//
// The check is per occurrence, not per section. For each artifact the text is cut into the blocks a reader sees
// as one unit (an HTML block element, a LaTeX line/item, a slide string), the draft banner (which IS the list of
// unverified claims) is set aside, and every block that prints an unverified form must carry the flag. The
// sourced glossary entry must not.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const Brief = require('../../harness/brief/brief.js');
const stub = require('../../harness/brief/stub-provider.js');
const { renderStudyGuide } = require('../../harness/study-guide.js');
const { renderLatex, tex } = require('../../harness/latex.js');
const { buildDeck } = require('../../harness/slides.js');

const BRIEF = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/briefs/vies-de-sobrevivencia.brief.json'), 'utf8'));
const FLAG = 'afirmação não verificada';
const draft = (provider = stub) => Brief.draftLesson(BRIEF, provider);

/** Every printed form of unverified content: claim texts, the definitions and section texts that rest on them. */
function unverifiedForms(L) {
  const bad = new Set(L.claims.filter(c => c.status === 'unverified').map(c => c.id));
  const isBad = ids => (ids || []).some(id => bad.has(id));
  const forms = new Set(L.claims.filter(c => bad.has(c.id)).map(c => c.text));
  for (const g of L.study.glossary || []) if (isBad(g.claim_ids)) forms.add(g.definition);
  for (const s of L.study.sections) if (isBad(s.claim_ids)) { s.paragraphs.forEach(p => forms.add(p)); if (s.retrieval) forms.add(s.retrieval.answer); }
  return [...forms];
}
const sourcedDefinitions = L => (L.study.glossary || []).filter(g => (g.claim_ids || []).every(id => L.claims.find(c => c.id === id).status !== 'unverified')).map(g => g.definition);

const unescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
function htmlBlocks(html) {
  const body = html.replace(/<div class="box draft" id="brief">[^]*?<\/div>/, '');
  return body.split(/<\/(?:p|dd|dt|li|td|th|h[1-6]|div|figcaption|caption)>/).map(b => unescape(b.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()).filter(Boolean);
}
function latexBlocks(src) {
  return src.replace(/\\begin\{rascunho\}[^]*?\\end\{rascunho\}/, '').split(/\n|\\item\b/).map(s => s.trim()).filter(Boolean);
}

function assertEveryOccurrenceFlagged(blocks, forms, flag, what) {
  const bare = [], seen = new Set();
  for (const f of forms) for (const b of blocks) if (b.includes(f)) { seen.add(f); if (!b.includes(flag)) bare.push(`"${f.slice(0, 50)}" in "${b.slice(0, 120)}"`); }
  assert.deepEqual(bare, [], `${what}: unverified text printed without "${flag}"`);
  return seen;
}

test('precondition: the example draft has unverified glossary entries and an unverified section with a recall answer', () => {
  const L = draft();
  for (const g of L.study.glossary) assert.ok(Array.isArray(g.claim_ids) && g.claim_ids.length, `glossary "${g.term}" carries its claim ids`);
  const bad = new Set(L.claims.filter(c => c.status === 'unverified').map(c => c.id));
  assert.deepEqual(L.study.glossary.filter(g => g.claim_ids.some(id => bad.has(id))).map(g => g.term), ['Viés de sobrevivência', 'População']);
  assert.ok(L.study.sections.some(s => s.retrieval && s.claim_ids.some(id => bad.has(id))));
});

test('study guide (and so its PDF): every block that prints unverified text carries the flag; sourced entries do not', () => {
  const L = draft(), blocks = htmlBlocks(renderStudyGuide(L)), forms = unverifiedForms(L);
  const seen = assertEveryOccurrenceFlagged(blocks, forms, FLAG, 'study guide');
  for (const g of L.study.glossary.filter(g => forms.includes(g.definition))) assert.ok(seen.has(g.definition), `glossary "${g.term}" is printed`);
  for (const d of sourcedDefinitions(L)) for (const b of blocks.filter(b => b.includes(d))) assert.ok(!b.includes(FLAG), `sourced "${d.slice(0, 40)}" is not flagged`);
});

test('LaTeX: every line or item that prints unverified text carries the flag; sourced entries do not', () => {
  const L = draft(), blocks = latexBlocks(renderLatex(L)), forms = unverifiedForms(L).map(tex);
  const seen = assertEveryOccurrenceFlagged(blocks, forms, FLAG, 'LaTeX');
  const bad = new Set(L.claims.filter(c => c.status === 'unverified').map(c => c.id));
  const printed = [...L.study.glossary.filter(g => g.claim_ids.some(id => bad.has(id))).map(g => g.definition),
    ...L.study.sections.filter(s => s.claim_ids.some(id => bad.has(id))).flatMap(s => s.paragraphs)].map(tex);
  for (const f of printed) assert.ok(seen.has(f), `printed: "${f.slice(0, 50)}"`);
  for (const d of sourcedDefinitions(L).map(tex)) for (const b of blocks.filter(b => b.includes(d))) assert.ok(!b.includes(FLAG), `sourced "${d.slice(0, 40)}" is not flagged`);
});

test('slides: an occurrence is flagged by its own marker or by the slide flag the player shows on that screen', () => {
  const L = draft(), deck = buildDeck(L), forms = unverifiedForms(L), bare = [];
  for (const s of deck.slides.filter(s => s.id !== 'rascunho')) {
    const strings = [s.title, s.kicker, ...(s.paragraphs || []), ...(s.list || []), ...((s.table || {}).rows || []).map(r => r.join(' | ')),
      ...(s.steps || []).map(x => `${x.title} ${x.text}`), ...(s.retrieval ? [s.retrieval.prompt, s.retrieval.answer] : [])].filter(Boolean);
    for (const str of strings) for (const f of forms) if (str.includes(f) && !s.unverified && !str.includes(FLAG)) bare.push(`slide ${s.id}: "${str.slice(0, 100)}"`);
  }
  assert.deepEqual(bare, []);
  const gl = deck.slides.find(s => s.id === 'glossario');
  for (const d of sourcedDefinitions(L)) assert.ok(gl.table.rows.some(r => r.join(' ').includes(d) && !r.join(' ').includes(FLAG)), 'sourced glossary row unflagged');
});

test('a provider that leaves glossary entries without claim ids gets them marked unverified, not printed as fact', () => {
  const bare = { id: 'no-glossary-claims', draft: b => { const o = stub.draft(b); o.lesson.study.glossary = o.lesson.study.glossary.map(({ term, definition }) => ({ term, definition })); return o; } };
  const L = draft(bare);
  for (const g of L.study.glossary) {
    assert.ok(g.claim_ids && g.claim_ids.length, g.term);
    assert.equal(L.claims.find(c => c.id === g.claim_ids[0]).status, 'unverified', g.term);
  }
  const blocks = htmlBlocks(renderStudyGuide(L));
  for (const g of L.study.glossary) assert.ok(blocks.some(b => b.includes(g.definition) && b.includes(FLAG)), g.term);
});
