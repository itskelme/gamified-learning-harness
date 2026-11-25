// pdftotext half of the empty-section check (scripts/lib/empty-sections.mjs). The DOM half runs in Chromium, in
// the builds (print DOM) and in tests/a11y-browser.mjs (screen); its RED runs are in
// docs/evidence/wave2-t_fd19236f/r2/red/empty-sections-before-fix.txt and a11y-empty-sections-before-fix.txt.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let pdfEmptySections, pdfOrphans;
test.before(async () => { ({ pdfEmptySections, pdfOrphans } = await import('../../scripts/lib/empty-sections.mjs')); });

// Orphans (Sofia's t_886bb611 note 3, generalised): a page must not end with a heading or a <dt> label whose
// content starts on the next page, including a heading wrapped onto two lines and a numbered step heading.
test('orphans: a page that ends with a heading, a wrapped heading tail, a numbered heading or a dt label', () => {
  const keep = ['Regra por tipo de passo', 'Dados do enunciado', 'Divergências encontradas no material (com página)', 'Passo 9 — Margem de erro'];
  const NEXT = 'Conteúdo da página seguinte.\nMais uma linha.\n';
  const page = last => `Texto do corpo.\n${last}\n\n   3 / 5\n`;
  assert.deepEqual(pdfOrphans([page('Regra por tipo de passo'), NEXT], keep), ['p.1: ends with "Regra por tipo de passo" (its content is on the next page)']);
  assert.deepEqual(pdfOrphans([page('Dados do enunciado'), NEXT], keep).length, 1, 'dt label');
  assert.deepEqual(pdfOrphans([page('(com página)'), NEXT], keep).length, 1, 'wrapped heading tail');
  assert.deepEqual(pdfOrphans([page('9. Passo 9 — Margem de erro'), NEXT], keep).length, 1, 'numbered step heading');
  assert.deepEqual(pdfOrphans([page('Valores copiados do enunciado, sem arredondamento.'), NEXT], keep), [], 'body text');
  assert.deepEqual(pdfOrphans([NEXT, page('Regra por tipo de passo')], keep), [], 'the last page may end anywhere');
});

test('widow page: a last page that holds only one short line is a problem; a single-page PDF is not', () => {
  const body = 'Texto do corpo.\nMais texto.\n   1 / 2\n';
  assert.deepEqual(pdfOrphans([body, 'Versão deste material: revisão 2.\n\n   2 / 2\n'], []), ['p.2: the last page holds only "Versão deste material: revisão 2." (a widow page)']);
  assert.deepEqual(pdfOrphans([body, 'Uma linha.\nOutra linha com conteúdo.\n   2 / 2\n'], []), []);
  assert.deepEqual(pdfOrphans(['Só uma linha.\n   1 / 1\n'], []), []);
});

const H = (level, text) => ({ level, text });

test('a heading followed directly by a heading of the same level is empty in the PDF text', () => {
  const pages = ['Fonte\n\nRegra por tipo de passo\nContas: precisão total.\nDivergências encontradas no material (com página)\n\n   3 / 5\n', 'Material de origem\nProva 3\n'];
  const p = pdfEmptySections(pages, [H(2, 'Fonte'), H(3, 'Regra por tipo de passo'), H(3, 'Divergências encontradas no material (com página)'), H(3, 'Material de origem')]);
  assert.deepEqual(p, ['heading "Divergências encontradas no material (com página)" has no text before "Material de origem"']);
});

test('a heading followed by a subsection is not empty; a last heading with nothing after it is', () => {
  assert.deepEqual(pdfEmptySections(['Fonte\nConvenções\nZ = 1,96\n'], [H(2, 'Fonte'), H(3, 'Convenções')]), []);
  assert.deepEqual(pdfEmptySections(['Fonte\nTexto\nFim\n  2 / 2\n'], [H(2, 'Fonte'), H(3, 'Fim')]), ['heading "Fim" has no text before the end of the PDF']);
});

test('subscripts moved to their own baseline by pdftotext -layout still match; a missing heading is a problem', () => {
  const pages = ['5. Passo 3a — σ ²/n   ₁\nσ₁² / n₁ = 0,5\n'];
  assert.deepEqual(pdfEmptySections(pages, [H(4, '5. Passo 3a — σ₁²/n₁')]), []);
  assert.match(pdfEmptySections(pages, [H(4, 'Passo 9')])[0], /not found in the PDF text/);
});
