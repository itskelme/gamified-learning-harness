/*
 * fmt-sequence-order grader (catalog r3 section 4.5, fixtures AF-SEQ-01, AF-SEQ-02).
 * The key is stored once and never shuffled; only the presented list changes.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../core/prng.js'));
  else root.SequenceOrder = factory(root.HarnessPrng);
})(typeof self !== 'undefined' ? self : this, function (prng) {
  'use strict';

  function metrics(key, answer) {
    const n = key.length, pos = Object.fromEntries(key.map((k, i) => [k, i]));
    let exact = 0, adj = 0, inv = 0, firstWrong = null;
    for (let i = 0; i < n; i++) if (key[i] === answer[i]) exact++;
    for (let i = 0; i + 1 < answer.length; i++) if (pos[answer[i + 1]] === pos[answer[i]] + 1) adj++;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (pos[answer[i]] > pos[answer[j]]) inv++;
    for (let i = 0; i < n && firstWrong === null; i++) if (answer[i] !== key[i]) firstWrong = i;
    return { positions_correct: exact, adjacent_pairs_correct: adj, adjacent_pairs_total: n - 1,
      kendall_tau_distance: inv, kendall_tau_max: (n * (n - 1)) / 2, first_wrong_position: firstWrong };
  }

  /** Derived key (timeline mode): sorted by the field; ties are rejected. */
  function deriveKey(items, sortBy) {
    const vals = items.map(i => i[sortBy]);
    if (new Set(vals).size !== vals.length) throw new Error(`sort_by ${sortBy}: ties are rejected`);
    return items.slice().sort((a, b) => (a[sortBy] < b[sortBy] ? -1 : a[sortBy] > b[sortBy] ? 1 : 0)).map(i => i.id);
  }

  function validate(entries) {
    const p = [];
    for (const e of entries) {
      if (!e.label) p.push(`${e.id}: missing label`);
      if (!e.rationale) p.push(`${e.id}: missing rationale`);
    }
    return p;
  }

  function presentedOrder(key, seed, itemId, attempt) {
    return prng.shuffled(key, prng.seedText(seed, itemId, 'order', attempt));
  }

  /** Grade a full answer -> events. Score = adjacent pairs correct of n-1; correct only on an exact match. */
  function grade(itemId, key, answer, attempt = 1, opts = {}) {
    if (!Array.isArray(answer) || answer.length !== key.length || [...answer].sort().join('\u0000') !== [...key].sort().join('\u0000')) {
      return [{ type: 'answer_submitted', item_id: itemId, response: answer, result: 'invalid', assisted: !!opts.assisted }];
    }
    const m = metrics(key, answer), exact = m.positions_correct === key.length;
    const ans = { type: 'answer_submitted', item_id: itemId, response: answer, result: exact ? 'correct' : 'partial',
      score: { earned: m.adjacent_pairs_correct, max: m.adjacent_pairs_total }, assisted: !!opts.assisted };
    const route = exact ? 'advance' : attempt < 2 ? 'retry_same' : 'worked_debrief';
    return [ans, { type: 'outcome', item_id: itemId, route, parameters: {} }];
  }

  return { metrics, deriveKey, validate, presentedOrder, grade };
});
