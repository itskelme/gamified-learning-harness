/*
 * fmt-choice-feedback grader (catalog r3 section 4.2, fixture AF-MCQ-01).
 * Port of grade_choice / refers_to_position in catalog-tools/format_fixtures.py.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../core/prng.js'));
  else root.ChoiceFeedback = factory(root.HarnessPrng);
})(typeof self !== 'undefined' ? self : this, function (prng) {
  'use strict';

  const POSITION_RE = /\b(all|none|both)\s+of\s+the\s+above\b|\bboth\s+[a-d]\s+and\s+[a-d]\b|\boption\s+[a-d]\b|\b(above|below)\b/i;
  // pt-BR equivalents, so the same rule holds for learner-language items.
  const POSITION_RE_PT = /\b(todas|nenhuma|ambas)\s+(as\s+)?(alternativas\s+)?(acima|anteriores)\b|\balternativa\s+[a-e]\b|\b(acima|abaixo)\b/i;

  function refersToPosition(text) { return POSITION_RE.test(text) || POSITION_RE_PT.test(text); }

  /** Problems with an item; empty list = valid. */
  function validateItem(item) {
    const p = [];
    if (!item || typeof item.stem !== 'string' || !item.stem.trim()) p.push('missing stem');
    const opts = (item && item.options) || [];
    if (opts.length < 2) p.push('needs at least 2 options');
    if (opts.filter(o => o.correct === true).length !== 1) p.push('exactly one option must be correct');
    if (new Set(opts.map(o => o.id)).size !== opts.length) p.push('option ids must be unique');
    for (const o of opts) {
      if (refersToPosition(o.text || '')) p.push(`option ${o.id} refers to position`);
      if (!o.correct && (!o.misconception_tag || !o.feedback)) p.push(`distractor ${o.id} needs misconception_tag and feedback`);
    }
    return p;
  }

  /** Option ids in the order shown on attempt n (declarative retry class: only presentation changes). */
  function presentedOrder(item, seed, attempt) {
    return prng.shuffled(item.options.map(o => o.id), prng.seedText(seed, item.id, 'options', attempt));
  }

  /** fifty_fifty_assisted lifeline: hide up to two wrong options, chosen by seed; the attempt is assisted. */
  function fiftyFifty(item, seed, attempt) {
    const wrong = item.options.filter(o => !o.correct).map(o => o.id);
    const hide = prng.shuffled(wrong, prng.seedText(seed, item.id, 'fifty_fifty', attempt)).slice(0, Math.min(2, wrong.length - 1));
    return item.options.map(o => o.id).filter(id => !hide.includes(id));
  }

  /** Grade one pick -> { events, feedback }. */
  function grade(item, pick, opts = {}) {
    const gap = opts.requeueGap === undefined ? 3 : opts.requeueGap;
    const opt = item.options.find(o => o.id === pick);
    if (!opt) return { events: [{ type: 'answer_submitted', item_id: item.id, response: pick, result: 'invalid', assisted: !!opts.assisted }], feedback: null };
    const ans = { type: 'answer_submitted', item_id: item.id, response: pick, result: opt.correct ? 'correct' : 'incorrect',
      score: { earned: opt.correct ? 1 : 0, max: 1 }, assisted: !!opts.assisted };
    if (!opt.correct) ans.misconception_tag = opt.misconception_tag;
    const route = opt.correct
      ? { type: 'outcome', item_id: item.id, route: 'advance', parameters: {} }
      : { type: 'outcome', item_id: item.id, route: 'requeue_later', parameters: { gap_items: gap } };
    return { events: [ans, route], feedback: opt.feedback === undefined ? null : opt.feedback };
  }

  return { refersToPosition, validateItem, presentedOrder, fiftyFifty, grade };
});
