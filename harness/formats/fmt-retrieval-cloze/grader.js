/*
 * fmt-retrieval-cloze grader (catalog r3 section 4.3, fixture AF-CLZ-01).
 * Port of norm_text / parse_number / grade_blank in catalog-tools/format_fixtures.py.
 *
 * Deliberate differences from the Python reference, both stricter and both outside the fixture inputs:
 * - text case folding is toLowerCase plus the German sharp s, not full Unicode casefold;
 * - numbers accept only plain decimals (digits, one comma or point, optional sign and trailing %),
 *   so "1e3", "inf", "nan" and "1_000" (accepted by Python float()) are `invalid`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RetrievalCloze = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normText(s) {
    return String(s).normalize('NFC').trim().toLowerCase().replace(/ß/g, 'ss').split(/\s+/).filter(Boolean).join(' ');
  }

  // Locale contract (docs/FORMATS.md "Locale contract for typed numbers", tests/fixtures/locale-numbers.json).
  // Without a locale the parse is the catalog's (AF-CLZ-01): any comma reads as a decimal point. With a locale,
  // thousands-shaped text in that locale ("1.960" in pt-BR, "1,960" in en-US) is refused as ambiguous, and
  // grouping followed by a decimal separator ("1.960,5") reads as grouping.
  const COMMA_DECIMAL = /^(pt|es|fr|de|it)\b/i;
  function stripped(raw) {
    let s = normText(raw);
    while (s.endsWith('%')) s = s.slice(0, -1);
    return s.trim();
  }
  function ambiguous(s, locale) {
    if (!locale) return false;
    // An integer part of 0 ("0.950", "-0.975") cannot be a thousands group: it is read as a decimal.
    return COMMA_DECIMAL.test(locale) ? /^[+-]?(?!0\.)\d{1,3}\.\d{3}$/.test(s) : /^[+-]?(?!0,)\d{1,3},\d{3}$/.test(s);
  }
  function parseNumber(raw, locale) {
    let s = stripped(raw);
    if (ambiguous(s, locale)) return null;
    if (locale && COMMA_DECIMAL.test(locale) && /^[+-]?\d{1,3}(\.\d{3})+,\d+$/.test(s)) s = s.replace(/\./g, '');
    else if (locale && !COMMA_DECIMAL.test(locale) && /^[+-]?\d{1,3}(,\d{3})+\.\d+$/.test(s)) s = s.replace(/,/g, '');
    s = s.replace(/,/g, '.');
    if (!s || !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    return Number(s);
  }
  /** null when the text is a number; otherwise 'ambiguous_grouping' or 'malformed'. */
  function numberIssue(raw, locale) {
    if (parseNumber(raw, locale) !== null) return null;
    return ambiguous(stripped(raw), locale) ? 'ambiguous_grouping' : 'malformed';
  }
  /** Learner message for a refused number (same wording as the procedure engine). */
  function issueMessage(issue, raw, locale) {
    const s = String(raw).trim(), comma = COMMA_DECIMAL.test(locale || '');
    if (issue === 'ambiguous_grouping') {
      return comma
        ? `“${s}” tem ponto de milhar. Para um número decimal, use vírgula: ${s.replace('.', ',')}. Para milhar, escreva sem o ponto: ${s.replace('.', '')}.`
        : `"${s}" has a thousands comma. For a decimal number, use a point: ${s.replace(',', '.')}. For thousands, write it without the comma: ${s.replace(',', '')}.`;
    }
    return comma ? 'Preencha cada lacuna com um número ou uma palavra.' : 'Fill each blank with a number or a word.';
  }

  function levenshtein(a, b) {
    const A = Array.from(a), B = Array.from(b);
    let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
    for (let i = 1; i <= A.length; i++) {
      const cur = [i];
      for (let j = 1; j <= B.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] !== B[j - 1] ? 1 : 0)));
      prev = cur;
    }
    return prev[B.length];
  }

  function gradeBlankResult(spec, raw, locale) {
    if (!String(raw).trim()) return 'invalid';
    if (spec.type === 'number') {
      const v = parseNumber(raw, locale);
      if (v === null) return 'invalid';
      return Math.abs(v - spec.value) <= (spec.tolerance || 0) + 1e-12 ? 'correct' : 'incorrect';
    }
    const got = normText(raw);
    for (const acc of spec.accepted) if (got === normText(acc)) return 'correct';
    const minLen = spec.near_miss_min_len === undefined ? 6 : spec.near_miss_min_len;
    for (const acc of spec.accepted) {
      const t = normText(acc);
      if (Array.from(t).length >= minLen && levenshtein(got, t) <= 1) return 'near_miss';
    }
    return 'incorrect';
  }

  /** One catalog 3.4 answer_submitted event. `invalid` carries no score; near_miss scores 0 of 1. */
  function gradeBlank(spec, raw, itemId = 'cloze-shop', blankId = 'b1', opts = {}) {
    const result = gradeBlankResult(spec, raw, opts.locale);
    const ev = { type: 'answer_submitted', item_id: itemId, step_id: blankId, response: raw, result, assisted: !!opts.assisted };
    if (result !== 'invalid') ev.score = { earned: result === 'correct' ? 1 : 0, max: 1 };
    return ev;
  }

  /** Route after a graded blank: near_miss and invalid get a free retry; incorrect a cue, then requeue. */
  function routeFor(ev, cuesShown, cueCount) {
    const out = route => ({ type: 'outcome', item_id: ev.item_id, route, parameters: {} });
    if (ev.result === 'correct') return out('advance');
    if (ev.result === 'near_miss' || ev.result === 'invalid') return out('retry_same');
    if (cuesShown < cueCount) return out('hint_next_level');
    return { type: 'outcome', item_id: ev.item_id, route: 'requeue_later', parameters: { gap_items: 3 } };
  }

  /** Split "a {{b1}} c" into text and blank parts. */
  function parseTemplate(template) {
    const parts = [], re = /\{\{([a-z0-9_]+)\}\}/gi;
    let last = 0, m;
    while ((m = re.exec(template))) { if (m.index > last) parts.push({ text: template.slice(last, m.index) }); parts.push({ blank: m[1] }); last = re.lastIndex; }
    if (last < template.length) parts.push({ text: template.slice(last) });
    return parts;
  }

  return { normText, parseNumber, numberIssue, issueMessage, levenshtein, gradeBlankResult, gradeBlank, routeFor, parseTemplate };
});
