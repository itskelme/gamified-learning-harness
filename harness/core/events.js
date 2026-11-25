/*
 * Closed event vocabulary and routable outcomes (catalog r3 sections 3.4 and 3.5).
 * Every format emits only these events; checkEvents is the AF-COM-02 contract check.
 * Keep identical to EVENT_FIELDS / RESULTS / ROUTE_PARAMS in catalog-tools/format_fixtures.py.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HarnessEvents = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EVENT_FIELDS = Object.freeze({
    item_presented: ['item_id', 'format', 'presented_order', 'variant_seed', 'attempt_no'],
    answer_submitted: ['item_id', 'step_id', 'result', 'score', 'assisted', 'misconception_tag', 'response', 'response_ms', 'confidence'],
    hint_shown: ['item_id', 'step_id', 'level'],
    worked_step_shown: ['item_id', 'step_id'],
    control_changed: ['item_id', 'control_id', 'value'],
    item_completed: ['item_id', 'score', 'unaided', 'terminal_id', 'path'],
    outcome: ['item_id', 'route', 'parameters'],
    skill_progress: ['skill_id', 'basis', 'delta'],
    run_finished: ['rule_set_id', 'skills', 'twin_scores']
  });
  const RESULTS = Object.freeze(['correct', 'incorrect', 'near_miss', 'partial', 'invalid']);
  const ROUTE_PARAMS = Object.freeze({
    advance: [], retry_same: [], retry_same_step: ['cursor'], hint_next_level: [], show_worked_step: [],
    step_twin_new_numbers: ['cursor', 'twin'],
    checkpoint_return_prefilled: ['cursor', 'new_variant_seed', 'prefilled_read_only'],
    full_restart: ['cursor', 'new_variant_seed'], requeue_later: ['gap_items', 'interleave_with'],
    due_on: ['date'], worked_debrief: [], worked_debrief_then_requeue_branch: [],
    route_to_format: ['format_id', 'reason'], mastered: []
  });
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /** Contract violations for a list of events (empty list = every event is inside 3.4 / 3.5). */
  function checkEvents(list) {
    const bad = [];
    list.forEach((ev, n) => {
      const t = ev && ev.type;
      if (!own(EVENT_FIELDS, t)) { bad.push(`${n}:unknown_event:${t}`); return; }
      const extra = Object.keys(ev).filter(k => k !== 'type' && !EVENT_FIELDS[t].includes(k)).sort();
      if (extra.length) bad.push(`${n}:${t}:fields_not_in_3.4:${extra.join(',')}`);
      if (t === 'answer_submitted') {
        if (!RESULTS.includes(ev.result)) bad.push(`${n}:answer_submitted:bad_result:${ev.result}`);
        if (ev.result === 'invalid' && own(ev, 'score')) bad.push(`${n}:answer_submitted:invalid_must_not_be_scored`);
      }
      if (t === 'outcome') {
        if (!own(ROUTE_PARAMS, ev.route)) bad.push(`${n}:outcome:route_not_in_3.5:${ev.route}`);
        else {
          const ex = Object.keys(ev.parameters || {}).filter(k => !ROUTE_PARAMS[ev.route].includes(k)).sort();
          if (ex.length) bad.push(`${n}:outcome:${ev.route}:parameters_not_in_3.5:${ex.join(',')}`);
        }
      }
    });
    return bad;
  }

  /** 3.4 rule: only `incorrect` is an error (derived, never a stored field). */
  function isError(result) { return result === 'incorrect'; }

  return { EVENT_FIELDS, RESULTS, ROUTE_PARAMS, checkEvents, isError };
});
