// Empty-section check for learner pages and their printed PDFs (Sofia, t_fd19236f round 1: the generic entry
// printed an empty t-table excerpt and an empty "Divergências" heading for a lesson without that data, and the
// pdftotext rules were fail-open on empty sections).
//
// Two halves:
// - emptySectionsInDom runs INSIDE the page (pass it to page.evaluate) under the media actually shown (print
//   before page.pdf, screen for an open view). It is the load-bearing check: the PDF is printed from this DOM.
// - pdfEmptySections corroborates on the pdftotext of the printed PDF, using the heading list the DOM half returns.

/**
 * In-page check. `selector` limits it to one view (e.g. '#view-source'); default is the whole body.
 * Returns { problems: string[], headings: { level, text }[] } for the visible content, in document order.
 * Self-contained: it is serialised into the page, so it must not reference anything outside its body.
 */
export function emptySectionsInDom(selector) {
  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) return { problems: [`no element matches ${selector}`], headings: [] };
  // Rendered, not attributes: the step player's print CSS shows #view-source although it carries [hidden].
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const squash = s => s.replace(/\s+/g, ' ').trim();
  const levelOf = el => (/^H[1-6]$/.test(el.tagName) ? Number(el.tagName[1]) : 0);
  const label = el => `${el.tagName.toLowerCase()} "${squash(el.textContent).slice(0, 80)}"`;
  const MEDIA = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'svg']);

  const nodes = [];
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) nodes.push(n);
  const problems = [], headings = [];

  nodes.forEach((h, i) => {
    if (h.nodeType !== 1 || !levelOf(h) || !visible(h)) return;
    const level = levelOf(h), text = squash(h.textContent);
    headings.push({ level, text });
    if (!text) { problems.push(`empty heading text: ${label(h)}`); return; }
    let content = false;
    for (let j = i + 1; j < nodes.length && !content; j++) {
      const n = nodes[j];
      if (h.contains(n)) continue;
      if (n.nodeType === 3) { if (n.textContent.trim() && visible(n.parentElement)) content = true; continue; }
      if (levelOf(n) && visible(n)) { if (levelOf(n) <= level) break; content = true; continue; }
      if (MEDIA.has(n.tagName) && visible(n)) content = true;
    }
    if (!content) problems.push(`heading with no content before the next section: ${label(h)}`);
  });

  for (const t of root.querySelectorAll('table')) {
    if (!visible(t)) continue;
    const cells = [...t.querySelectorAll('td')].filter(td => td.textContent.trim());
    if (!cells.length) problems.push(`table with no data cells: ${t.caption ? `caption "${squash(t.caption.textContent).slice(0, 80)}"` : label(t)}`);
  }
  for (const l of root.querySelectorAll('ul, ol, dl')) {
    if (!visible(l)) continue;
    const items = [...l.children].filter(c => /^(LI|DD|DT|DIV)$/.test(c.tagName) && c.textContent.trim());
    if (!items.length) problems.push(`empty list: ${l.tagName.toLowerCase()}${l.id ? '#' + l.id : ''} after "${squash((l.previousElementSibling || l.parentElement).textContent).slice(0, 60)}"`);
  }
  // Texts that must stay with what follows them on the printed page (pdfOrphans): headings and <dt> labels.
  const keepWithNext = [...headings.map(h => h.text), ...[...root.querySelectorAll('dt')].filter(visible).map(d => squash(d.textContent))].filter(Boolean);
  return { problems, headings, keepWithNext };
}

const PAGE_FOOTER = /^\d+\s*\/\s*\d+$/;
// pdftotext -layout puts sub/superscript glyphs on their own baseline ("σ₁²/n₁" comes out as "σ ²/n   ₁"), so
// both sides are compared without whitespace and without sub/superscript digits.
const norm = s => s.replace(/[\s₀-₉⁰-⁹²³¹]+/g, '').toLowerCase();

/**
 * Orphans on the printed pages (generalises the step-heading check of t_886bb611 R7, Sofia's note 3): no page but
 * the last may end with a heading or a <dt> label, also when the heading wrapped onto two lines (the page ends with
 * its tail) or is printed with a list number ("9. Passo 9 — ..."). `keepWithNext` comes from emptySectionsInDom.
 */
export function pdfOrphans(pages, keepWithNext) {
  const keep = keepWithNext.map(norm).filter(Boolean), problems = [];
  pages.slice(0, -1).forEach((text, i) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !PAGE_FOOTER.test(l));
    if (!lines.length) return;
    const raw = lines[lines.length - 1], last = norm(raw);
    const hit = keep.some(k => k === last || (last.length >= 6 && k.endsWith(last)) || (k.length >= 6 && last.endsWith(k)));
    if (hit) problems.push(`p.${i + 1}: ends with "${raw}" (its content is on the next page)`);
  });
  // Widow page: a last page that carries a single short line (a page turned for one sentence).
  if (pages.length > 1) {
    const lines = pages[pages.length - 1].split('\n').map(l => l.trim()).filter(l => l && !PAGE_FOOTER.test(l));
    if (lines.length === 1 && lines[0].length < 80) problems.push(`p.${pages.length}: the last page holds only "${lines[0]}" (a widow page)`);
  }
  return problems;
}

/**
 * Corroboration on the printed text: each visible heading must appear (in order) in the PDF text, and some text
 * must follow it before the next heading of the same or a higher level. `pages` are pdftotext pages.
 */
export function pdfEmptySections(pages, headings) {
  const doc = norm(pages.map(p => p.split('\n').filter(l => !PAGE_FOOTER.test(l.trim())).join('\n')).join('\n'));
  const problems = [], at = [];
  let pos = 0;
  for (const h of headings) {
    const t = norm(h.text);
    const k = doc.indexOf(t, pos);
    if (k < 0) { problems.push(`heading "${h.text.slice(0, 80)}" not found in the PDF text after the previous heading`); at.push(null); continue; }
    at.push({ start: k, end: k + t.length, level: h.level, text: h.text });
    pos = k + t.length;
  }
  const found = at.filter(Boolean);
  found.forEach((h, i) => {
    const next = found[i + 1];
    if (next && next.level > h.level) return; // a subsection follows: it carries the content
    const between = doc.slice(h.end, next ? next.start : doc.length);
    if (!between.trim()) problems.push(`heading "${h.text.slice(0, 80)}" has no text before ${next ? `"${next.text.slice(0, 60)}"` : 'the end of the PDF'}`);
  });
  return problems;
}
