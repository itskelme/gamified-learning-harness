/*
 * fmt-step-ladder: routing of ONE wrong step under hint_then_show_step plus a restart_on_error option.
 * Reference for AF-LAD-03 (catalog r3 section 4.1) and the research-hybrid composite
 * (design-proposal rev 2 section 8.4). Pure data in, closed-vocabulary events out (catalog 3.4/3.5).
 *
 * rule: { option, n? (full_restart_after_n_errors), after_errors? (research_hybrid), hint_levels? (default 1) }
 * ctx:  { item_id, seed, step_id, step_ids[], blocks[][] (checkpoint blocks in step order),
 *         errors_on_step, errors_in_exercise, failed_blocks?[] (block starts with an error so far,
 *         current one included), twin(seed, step_id, errors_in_exercise) -> { inputs, expected_* } }
 * New variant seeds: fnv1a32("{seed}:retry:{errors_in_exercise}") (fixture convention).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../core/prng.js'));
  else root.StepLadderEscalation = factory(root.HarnessPrng);
})(typeof self !== 'undefined' ? self : this, function (prng) {
  'use strict';

  // restart_on_error.procedural option -> pilot engine retry() arguments (harness/procedure-engine.js).
  const PILOT_POLICY = Object.freeze({
    full_restart: { policy: 'full', newVariant: true },
    restart_at_failed_step_new_numbers: { policy: 'failed-step', newVariant: true },
    last_checkpoint_plus_worked_step: { policy: 'checkpoint', newVariant: true },
    full_restart_after_n_errors: { policy: 'after-n-errors', newVariant: true },
    none: { policy: 'failed-step', newVariant: false }
  });
  const OPTIONS = new Set([...Object.keys(PILOT_POLICY), 'research_hybrid']);

  function routeError(rule, ctx) {
    if (!OPTIONS.has(rule.option)) throw new Error(`Unknown restart option: ${rule.option}`);
    const hintLevels = rule.hint_levels === undefined ? 1 : rule.hint_levels;
    const { item_id, step_id: step, errors_on_step: errsStep, errors_in_exercise: errsEx } = ctx;
    const outcome = (route, parameters = {}) => ({ type: 'outcome', item_id, route, parameters });
    const newSeed = () => prng.fnv1a32(`${ctx.seed}:retry:${errsEx}`);
    const block = ctx.blocks.find(b => b.includes(step));
    if (!block) throw new Error(`Step ${step} is in no checkpoint block`);
    const checkpoint = () => outcome('checkpoint_return_prefilled', {
      cursor: block[0], new_variant_seed: newSeed(), prefilled_read_only: ctx.step_ids.slice(0, ctx.step_ids.indexOf(block[0]))
    });
    const worked = { type: 'worked_step_shown', item_id, step_id: step };

    if (rule.option === 'research_hybrid') {
      const afterErrors = rule.after_errors === undefined ? 3 : rule.after_errors;
      if (errsEx >= afterErrors || new Set(ctx.failed_blocks || []).size >= 2) return [worked, checkpoint()];
      if (errsStep <= hintLevels) return [{ type: 'hint_shown', item_id, step_id: step, level: errsStep }, outcome('retry_same_step', { cursor: step })];
      return [worked, outcome('step_twin_new_numbers', { cursor: step, twin: ctx.twin(ctx.seed, step, errsEx) })];
    }
    if (errsStep <= hintLevels) return [{ type: 'hint_shown', item_id, step_id: step, level: errsStep }, outcome('retry_same_step', { cursor: step })];
    switch (rule.option) {
      case 'none': return [worked, outcome('retry_same_step', { cursor: step })];
      case 'full_restart': return [worked, outcome('full_restart', { cursor: ctx.step_ids[0], new_variant_seed: newSeed() })];
      case 'restart_at_failed_step_new_numbers': return [worked, outcome('step_twin_new_numbers', { cursor: step, twin: ctx.twin(ctx.seed, step, errsEx) })];
      case 'last_checkpoint_plus_worked_step': return [worked, checkpoint()];
      default: { // full_restart_after_n_errors
        const n = rule.n === undefined ? 3 : rule.n;
        return [worked, errsEx >= n ? outcome('full_restart', { cursor: ctx.step_ids[0], new_variant_seed: newSeed() }) : outcome('retry_same_step', { cursor: step })];
      }
    }
  }

  /**
   * Resolved rule set (harness/core/rules.js) -> escalation rule. The default pair
   * last_checkpoint_plus_worked_step + hint_then_show_step IS the research-hybrid composite.
   */
  function fromRuleSet(resolved) {
    const restart = resolved.slots['restart_on_error.procedural'], fb = resolved.slots.feedback_ladder;
    const hint_levels = fb.option === 'hint_then_show_step' ? fb.params.hint_levels : 0;
    if (restart.option === 'last_checkpoint_plus_worked_step' && fb.option === 'hint_then_show_step') return { option: 'research_hybrid', after_errors: restart.params.after_errors, hint_levels };
    if (restart.option === 'full_restart_after_n_errors') return { option: restart.option, n: restart.params.n, hint_levels };
    return { option: restart.option, hint_levels };
  }

  return { routeError, fromRuleSet, PILOT_POLICY };
});
