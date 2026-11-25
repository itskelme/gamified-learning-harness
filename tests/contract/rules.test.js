'use strict';
// Business rules (ADDENDUM-4; design-proposal rev 2 sections 8.1-8.4; Hermes correction comment item 6).
// Run: node --test tests/contract/rules.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const Rules = require(path.join(ROOT, 'harness/core/rules.js'));
const BOTH = { unitKinds: ['ordered_procedure', 'declarative'] };

test('catalogue: every option carries a rating; GAP is displayed only as "GAP: no rating"', () => {
  const cat = Rules.loadCatalogue(ROOT);
  assert.deepEqual(Rules.validateCatalogue(cat), []);
  for (const [slot, s] of Object.entries(cat.slots)) for (const [id, o] of Object.entries(s.options)) {
    assert.ok(typeof o.rating === 'string' && o.rating.trim(), `${slot}.${id}`);
    if (o.rating === 'GAP') assert.equal(Rules.displayRating(o), 'GAP: no rating');
  }
  assert.equal(Rules.displayRating(cat.slots['restart_on_error.procedural'].options.none), 'GAP: no rating');
});

test('catalogue: names and closed options follow the binding decisions', () => {
  const cat = Rules.loadCatalogue(ROOT);
  assert.deepEqual(Object.keys(cat.slots['gamification.leaderboard'].options), ['off']);
  assert.deepEqual(Object.keys(cat.slots['gamification.lifelines'].options).sort(), ['fifty_fifty_assisted', 'off']);
  assert.ok(cat.slots.review_schedule.options.adaptive_response_based);
  assert.equal(cat.slots.review_schedule.options.adaptive_fsrs_like, undefined);
  assert.match(cat.slots.review_schedule.options.fixed_intervals.rating, /convention, no evidence/);
  assert.equal(cat.slots['gamification.error_reset_combo'], undefined, 'error-reset combo is not offered');
});

test('product defaults equal the bold options of proposal 8.2', () => {
  const r = Rules.resolveRules(ROOT, {}, BOTH);
  assert.deepEqual(r.problems, []);
  const opt = s => r.slots[s].option;
  assert.equal(opt('restart_on_error.procedural'), 'last_checkpoint_plus_worked_step');
  assert.equal(r.slots['restart_on_error.procedural'].params.after_errors, 3);
  assert.equal(opt('restart_on_error.declarative'), 'requeue_failed_item');
  assert.equal(opt('variant_scope'), 'numbers_only');
  assert.equal(opt('feedback_ladder'), 'hint_then_show_step');
  assert.equal(r.slots.feedback_ladder.params.hint_levels, 1);
  assert.equal(opt('step_lock'), 'fade_from_last_step');
  assert.equal(opt('review_schedule'), 'proportional_gap');
  assert.equal(opt('gamification.points_ladder'), 'on');
  for (const s of ['gamification.return_streak', 'gamification.lifelines', 'gamification.timer', 'gamification.badges', 'gamification.leaderboard']) assert.equal(opt(s), 'off', s);
});

test('the four presets resolve and match proposal 8.4', () => {
  assert.deepEqual(Rules.listPresets(ROOT), ['exam-prep', 'fgv-style-quiz', 'research-hybrid', 'strict-kelme']);
  const get = p => Rules.resolveRules(ROOT, { preset: p }, BOTH);
  for (const p of Rules.listPresets(ROOT)) assert.deepEqual(get(p).problems, [], p);
  const strict = get('strict-kelme'), exam = get('exam-prep'), fgv = get('fgv-style-quiz'), hybrid = get('research-hybrid');
  assert.equal(strict.slots['restart_on_error.procedural'].option, 'full_restart');
  assert.equal(strict.slots['restart_on_error.declarative'].option, 'full_restart_reshuffle');
  assert.equal(strict.slots.feedback_ladder.params.hint_levels, 0);
  assert.equal(strict.slots.step_lock.option, 'locked_sequential');
  assert.match(strict.label, /founder preference, no comparative evidence/);
  assert.equal(exam.slots['restart_on_error.procedural'].option, 'full_restart');
  assert.equal(exam.slots.feedback_ladder.params.hint_levels, 0);
  assert.equal(fgv.slots['gamification.lifelines'].option, 'fifty_fifty_assisted');
  assert.equal(fgv.slots['restart_on_error.declarative'].option, 'full_restart_reshuffle');
  assert.match(hybrid.label, /research hybrid, C overall/);
  assert.equal(Rules.DEFAULT_PRESET, 'research-hybrid');
});

test('rule_set_id is "<preset>@<version>+ovr:<digest>" and changes with the overrides only', () => {
  const a = Rules.resolveRules(ROOT, { preset: 'research-hybrid' }, BOTH);
  assert.match(a.rule_set_id, /^research-hybrid@1\.0\.0\+ovr:none$/);
  const ovr = { 'restart_on_error.procedural': { option: 'full_restart_after_n_errors', n: 3 }, 'gamification.timer': { option: 'off' } };
  const b = Rules.resolveRules(ROOT, { preset: 'research-hybrid', overrides: ovr }, BOTH);
  const reordered = { 'gamification.timer': { option: 'off' }, 'restart_on_error.procedural': { n: 3, option: 'full_restart_after_n_errors' } };
  const c = Rules.resolveRules(ROOT, { preset: 'research-hybrid', overrides: reordered }, BOTH);
  assert.match(b.rule_set_id, /^research-hybrid@1\.0\.0\+ovr:[0-9a-f]{12}$/);
  assert.equal(b.rule_set_id, c.rule_set_id, 'key order does not change the digest');
  assert.equal(b.slots['restart_on_error.procedural'].option, 'full_restart_after_n_errors');
  assert.equal(b.slots['restart_on_error.procedural'].params.n, 3);
});

test('load-time validation rejects each invalid configuration with a clear message', () => {
  const bad = (cfg, ctx, re) => {
    const p = Rules.resolveRules(ROOT, cfg, ctx).problems;
    assert.ok(p.some(x => re.test(x)), `${re} in ${JSON.stringify(p)}`);
  };
  bad({ overrides: { 'restart_on_error.procedural': { option: 'free_restart' } } }, BOTH, /free_restart.*not an option/);
  bad({ overrides: { 'gamification.combo': { option: 'on' } } }, BOTH, /unknown slot gamification\.combo/);
  bad({ overrides: { 'restart_on_error.procedural': { option: 'full_restart', n: 2 } } }, BOTH, /parameter n/);
  bad({ overrides: { step_lock: { option: 'free_order' } } }, BOTH, /free_order.*ordered_procedure/);
  bad({ overrides: { feedback_ladder: { option: 'explain_only_no_answer' } } }, BOTH, /explain_only_no_answer.*declarative/);
  bad({ overrides: { variant_scope: { option: 'numbers_then_context_after_k_variants', k: 2 } } }, { unitKinds: ['ordered_procedure'], contextVariants: false }, /context_variants/);
  bad({ preset: 'no-such-preset' }, BOTH, /unknown preset/);
  bad({ overrides: { 'gamification.leaderboard': { option: 'on' } } }, BOTH, /not an option/);
  // Allowed where the content permits it:
  assert.deepEqual(Rules.resolveRules(ROOT, { overrides: { step_lock: { option: 'free_order' } } }, { unitKinds: ['reorderable'] }).problems, []);
  assert.deepEqual(Rules.resolveRules(ROOT, { overrides: { feedback_ladder: { option: 'explain_only_no_answer' } } }, { unitKinds: ['ordered_procedure'] }).problems, []);
});

test('a catalogue option with an empty rating fails catalogue validation', () => {
  const cat = JSON.parse(JSON.stringify(Rules.loadCatalogue(ROOT)));
  cat.slots.variant_scope.options.numbers_only.rating = ' ';
  assert.ok(Rules.validateCatalogue(cat).some(p => /variant_scope\.numbers_only.*rating/.test(p)));
});

test('the resolved rule set drives the ladder escalation (preset -> AF-LAD-03 rule)', () => {
  const L = require(path.join(ROOT, 'harness/formats/fmt-step-ladder/escalation.js'));
  const of = p => L.fromRuleSet(Rules.resolveRules(ROOT, { preset: p }, BOTH));
  assert.deepEqual(of('research-hybrid'), { option: 'research_hybrid', after_errors: 3, hint_levels: 1 });
  assert.deepEqual(of('strict-kelme'), { option: 'full_restart', hint_levels: 0 });
  const n3 = Rules.resolveRules(ROOT, { overrides: { 'restart_on_error.procedural': { option: 'full_restart_after_n_errors', n: 3 } } }, BOTH);
  assert.deepEqual(L.fromRuleSet(n3), { option: 'full_restart_after_n_errors', n: 3, hint_levels: 1 });
});
