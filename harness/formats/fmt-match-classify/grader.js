/*
 * fmt-match-classify grader (catalog r3 section 4.4, fixture AF-MAT-01).
 * Answer events in presented order, then one requeue_later outcome per missed case.
 * The confusion view is derived from answer_submitted, never stored as a separate event.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../core/prng.js'));
  else root.MatchClassify = factory(root.HarnessPrng);
})(typeof self !== 'undefined' ? self : this, function (prng) {
  'use strict';

  function validate(categories, cases) {
    const p = [], ids = new Set(categories.map(c => (typeof c === 'string' ? c : c.id)));
    if (ids.size < 2) p.push('needs at least 2 categories');
    for (const c of cases) {
      if (!ids.has(c.category)) p.push(`case ${c.id}: unknown category ${c.category}`);
      if (!c.misconception_tag) p.push(`case ${c.id}: missing misconception_tag`);
    }
    return p;
  }

  function presentedOrder(cases, seed, itemId, attempt) {
    return prng.shuffled(cases.map(c => c.id), prng.seedText(seed, itemId, 'items', attempt));
  }

  function grade(cases, assignment, order, opts = {}) {
    const byId = Object.fromEntries(cases.map(c => [c.id, c])), events = [];
    for (const id of order) {
      const c = byId[id], resp = assignment[id];
      if (resp === undefined || resp === '') { events.push({ type: 'answer_submitted', item_id: id, result: 'invalid', assisted: !!opts.assisted }); continue; }
      const ok = resp === c.category;
      const ev = { type: 'answer_submitted', item_id: id, response: resp, result: ok ? 'correct' : 'incorrect', score: { earned: ok ? 1 : 0, max: 1 }, assisted: !!opts.assisted };
      if (!ok) ev.misconception_tag = c.misconception_tag;
      events.push(ev);
    }
    for (const ev of events.filter(e => e.result === 'incorrect')) {
      events.push({ type: 'outcome', item_id: ev.item_id, route: 'requeue_later', parameters: { gap_items: 3, interleave_with: 'confusable' } });
    }
    return events;
  }

  function derive(cases, events) {
    const cat = Object.fromEntries(cases.map(c => [c.id, c.category]));
    const answers = events.filter(e => e.type === 'answer_submitted' && e.score);
    return {
      score: { earned: answers.reduce((s, e) => s + e.score.earned, 0), max: answers.reduce((s, e) => s + e.score.max, 0) },
      confusion_view: answers.filter(e => e.result === 'incorrect').map(e => ({ item_id: e.item_id, response: e.response, expected_category: cat[e.item_id], misconception_tag: e.misconception_tag }))
    };
  }

  return { validate, presentedOrder, grade, derive };
});
