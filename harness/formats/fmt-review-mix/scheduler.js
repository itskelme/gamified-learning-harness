/*
 * fmt-review-mix scheduler (catalog r3 section 4.8, fixture AF-REV-01).
 * Port of gap_fraction / review_plan / build_queue / requeue in catalog-tools/format_fixtures.py.
 * Dates are ISO strings (YYYY-MM-DD) handled in UTC, so the plan does not depend on the time zone.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../core/prng.js'));
  else root.ReviewMix = factory(root.HarnessPrng);
})(typeof self !== 'undefined' ? self : this, function (prng) {
  'use strict';
  const LO_D = 7, HI_D = 365, DAY = 86400000;
  const parse = iso => { if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`date ${iso} must be YYYY-MM-DD`); return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); };
  const fmt = ms => new Date(ms).toISOString().slice(0, 10);
  const days = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
  const addDays = (iso, k) => fmt(parse(iso) + k * DAY);

  /** Log-linear between 30% at 7 days and 7.5% at 365 days, clamped to [7, 365] (catalog choice, C). */
  function gapFraction(d) {
    const fLo = 0.30, fHi = 0.075, x = Math.min(Math.max(d, LO_D), HI_D);
    return fLo + (fHi - fLo) * Math.log(x / LO_D) / Math.log(HI_D / LO_D);
  }
  function clampLabel(d) { return d < LO_D ? 'floor_below_7_days' : d > HI_D ? 'ceiling_above_365_days' : 'none'; }

  function reviewPlan(today, exam) {
    const out = [];
    let cur = today;
    for (;;) {
      const d = days(cur, exam);
      if (d <= 1) break;
      const gap = Math.max(1, Math.floor(gapFraction(d) * d + 0.5));
      cur = addDays(cur, gap);
      if (days(cur, exam) < 1) break;
      out.push({ date: cur, gap_days: gap, days_to_exam_before: d, fraction_used: prng.halfUp(gapFraction(d), 4), clamp: clampLabel(d) });
    }
    return out;
  }

  /** Due items first (stable over the seeded order); avoid two adjacent items of one category when possible. */
  function buildQueue(items, seed) {
    const pool = prng.shuffled(items, `${seed}:queue`).map((it, i) => ({ it, i }));
    pool.sort((a, b) => (a.it.due < b.it.due ? -1 : a.it.due > b.it.due ? 1 : a.i - b.i));
    const rest = pool.map(p => p.it), out = [];
    while (rest.length) {
      let k = rest.findIndex(i => !out.length || i.category !== out[out.length - 1].category);
      if (k < 0) k = 0;
      out.push(rest.splice(k, 1)[0]);
    }
    return out.map(i => i.id);
  }

  function requeuePosition(behind, gap) { return Math.min(gap, behind); }

  /** requeue_later: the queue still to present, with the failed item after min(gap, items behind it). */
  function requeue(queue, failedId, gap) {
    const i = queue.indexOf(failedId), rest = queue.slice(i + 1), pos = requeuePosition(rest.length, gap);
    return [...rest.slice(0, pos), failedId, ...rest.slice(pos)];
  }

  function dueToday(items, today) { return items.filter(i => i.due <= today); }

  return { gapFraction, clampLabel, reviewPlan, buildQueue, requeuePosition, requeue, dueToday, addDays, daysBetween: days };
});
