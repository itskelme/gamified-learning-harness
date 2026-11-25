// Learner-facing text rules for the pilot page and its study PDF. One module, used by the build
// (pdftotext of every PDF page) and by the browser suite (rendered page text), so both check the same rules.
import { spawnSync } from 'node:child_process';

// A node or a missing value stringified into the page: "[object HTMLElement]", "undefined", "NaN".
export const BROKEN_RENDER = /\[object |\bundefined\b|\bNaN\b/;

export function brokenRender(text) {
  const m = text.match(/.{0,40}(?:\[object [^\]]*\]?|\bundefined\b|\bNaN\b)/);
  return m ? m[0].trim() : null;
}

// Internal and build material that must not reach a learner: people and card ids, the tool and format
// names, build provenance (paths, hashes, fingerprint, versions, code ids) and the project's research
// jargon. Same rule as the package page (d843957). "Há evidência de que..." (a test conclusion) stays allowed.
export const BANNED_PROVENANCE = new RegExp([
  'Pacote', 'Kelme', 'Sofia', 'Hermes', 'Minerva', '\\bt_[0-9a-f]{8}\\b',
  'harness', 'ordered[- ]procedure', 'prot[óo]tipo', '\\bpiloto\\b', '\\bmotor\\b', 'or[áa]culo',
  'n[íi]vel de evid[êe]ncia', 'evid[êe]ncia C\\b', 'pesquisa do projeto', 'respons[áa]vel pelo projeto',
  'requisito de engenharia', 'decis[ãa]o de projeto', '\\bFase \\d', '\\bLaTeX\\b',
  'SHA-256', 'impress[ãa]o digital', '\\binputs/', '\\.tex\\b', '\\b[0-9a-f]{16,}\\b', '\\b\\d+\\.\\d+\\.\\d+\\b',
  '\\b[a-z]+_[a-z_]+\\b', 'display-carry', 'learner-carry', 'rounded-printed', '\\bexact-t\\b', '\\bfmt-'
].join('|'), 'i');
// pdftotext splits letter-spaced (eyebrow) text into single letters: check a whitespace-free copy too.
const BANNED_SQUASHED = /harness|ordered-?procedure|prot[óo]tipo|impress[ãa]odigital|sha-?256|n[íi]veldeevid[êe]ncia|or[áa]culo/i;

export function bannedProvenance(text) {
  const m = text.match(BANNED_PROVENANCE);
  if (m) return m[0];
  const s = text.replace(/\s+/g, '').match(BANNED_SQUASHED);
  return s ? `${s[0]} (letter-spaced)` : null;
}

// Text of each PDF page (pdftotext -layout, split on form feeds). Throws when pdftotext is missing.
export function pdfPages(pdfPath) {
  const r = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error(`pdftotext failed on ${pdfPath}: ${r.error ? r.error.message : r.stderr}`);
  const pages = r.stdout.split('\f');
  if (pages.length && !pages[pages.length - 1].trim()) pages.pop();
  return pages;
}

// A worked-solution step heading as printed: "9. Passo 9 — Margem de erro".
export const STEP_HEADING = /^\d+\.\s+Passo \d+\s+—/;
const PAGE_FOOTER = /^\d+\s*\/\s*\d+$/;

// Last line of body text on a page (the "N / M" page-number footer is not body text).
export function lastTextLine(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !PAGE_FOOTER.test(l));
  return lines.length ? lines[lines.length - 1] : null;
}

// Problems on the printed pages, each prefixed with its 1-based page number.
export function pdfProblems(pages) {
  const problems = [];
  pages.forEach((text, i) => {
    const p = `p.${i + 1}`;
    const broken = brokenRender(text);
    if (broken) problems.push(`${p}: broken render "${broken}"`);
    for (const line of text.split('\n')) {
      const banned = bannedProvenance(line);
      if (banned) problems.push(`${p}: internal material "${banned}" in "${line.trim().slice(0, 90)}"`);
    }
    // A phrase wrapped across two lines ("nível de" / "evidência") only shows up in the joined text.
    const joined = text.replace(/\s+/g, ' ').match(BANNED_PROVENANCE);
    if (joined && !problems.some(x => x.startsWith(`${p}: internal material`))) problems.push(`${p}: internal material "${joined[0]}" (wrapped across lines)`);
    const last = lastTextLine(text);
    if (last && STEP_HEADING.test(last)) problems.push(`${p}: ends with the step heading "${last}" (its body is on the next page)`);
  });
  return problems;
}
