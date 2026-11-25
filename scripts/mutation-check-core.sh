#!/usr/bin/env bash
# Mutation check for the shared core (prng, events, rules, registry, router) and the ladder escalation.
# Each mutant reintroduces one defect; a named test must go RED. Restores every file after each mutant.
# Usage: bash scripts/mutation-check-core.sh   (exit 1 if any mutant survives or misfires)
set -u
cd "$(dirname "$0")/.."
FILES=(harness/core/prng.js harness/core/events.js harness/core/rules.js harness/core/registry.js harness/core/router.js harness/formats/fmt-step-ladder/escalation.js
  harness/formats/fmt-choice-feedback/grader.js harness/formats/fmt-retrieval-cloze/grader.js harness/formats/fmt-match-classify/grader.js
  harness/formats/fmt-sequence-order/grader.js harness/formats/fmt-branching-case/grader.js harness/formats/fmt-data-visual-lab/lab.js
  harness/formats/fmt-data-visual-lab/procedure-spec.js harness/formats/fmt-review-mix/scheduler.js harness/packages/prova3.js
  research/outputs/C-tools/variant_generator_demo.py examples/variant_generator_course_rules.py
  skills/fmt-match-classify/SKILL.md skills/fmt-branching-case/SKILL.md skills/fmt-step-ladder/SKILL.md
  harness/packages/caps.js scripts/build-package.mjs scripts/lib/package-page.mjs)
BACKUP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$BACKUP/$(dirname "$f")"; cp "$f" "$BACKUP/$f"; done
restore() { for f in "${FILES[@]}"; do cp "$BACKUP/$f" "$f"; done; }
trap restore EXIT
survivors=0

run() { # name, file that must change, test file, test-name pattern
  local name=$1 file=$2 tests=$3 pattern=$4
  if cmp -s "$file" "$BACKUP/$file"; then echo "MISFIRE   $name (sed changed nothing)"; survivors=$((survivors + 1)); restore; return; fi
  if node --test --test-name-pattern="$pattern" "$tests" > /tmp/mut-core.log 2>&1; then
    if grep -qvE '^✔ tests/|^[^✔]' /tmp/mut-core.log; then echo "SURVIVED  $name"; else echo "MISFIRE   $name (pattern matched no test)"; fi
    survivors=$((survivors + 1))
  else
    echo "KILLED    $name -> $(grep -m1 -E '^✖' /tmp/mut-core.log | sed 's/^ *//')"
  fi
  restore
}

F=harness/core/prng.js
sed -i 's/let h = 0x811C9DC5;/let h = 0x811C9DC4;/' $F
run "fnv1a32 offset basis" $F tests/core.test.js "AF-COM-01"
sed -i 's/const j = Math.floor(rnd() \* (i + 1));/const j = Math.floor(rnd() * i);/' $F
run "shuffle uses floor(rnd*i)" $F tests/core.test.js "presentation orders"
sed -i 's/const rnd = rngFor(text), a = items.slice();/const rnd = rngFor(text), a = items;/' $F
run "shuffle modifies the stored key" $F tests/core.test.js "never touch the stored key"
sed -i 's/for (const b of utf8Bytes(String(text)))/for (const b of Array.from(String(text), c => c.charCodeAt(0)))/' $F
run "fnv1a32 hashes code units" $F tests/core.test.js "UTF-8 bytes"

F=harness/core/events.js
sed -i "s/if (ev.result === 'invalid' \&\& own(ev, 'score'))/if (false)/" $F
run "scored invalid answer accepted" $F tests/core.test.js "negative controls"
sed -i "s/route_to_format: \['format_id', 'reason'\], mastered: \[\]/route_to_format: ['format_id', 'reason'], mastered: [], requeue_later_interleaved_with_confusable: []/" $F
run "r1 route name back in the closed list" $F tests/core.test.js "negative controls|closed lists"

F=harness/formats/fmt-step-ladder/escalation.js
sed -i 's/ || new Set(ctx.failed_blocks || \[\]).size >= 2//' $F
run "hybrid ignores two failed subgoals" $F tests/contract/fmt-step-ladder.test.js "different subgoal"
sed -i "s/return \[worked, outcome('step_twin_new_numbers', { cursor: step, twin: ctx.twin(ctx.seed, step, errsEx) })\];\n    }/X/; 0,/return \[worked, outcome('step_twin_new_numbers'/s//return [worked, checkpoint()]; return [worked, outcome('step_twin_new_numbers'/" $F
run "hybrid skips the step twin" $F tests/contract/fmt-step-ladder.test.js "sixth trace"
sed -i 's/:retry:\${errsEx}/:restart:${errsEx}/' $F
run "new variant seed text changed" $F tests/contract/fmt-step-ladder.test.js "five single-option traces"
sed -i "s/if (restart.option === 'last_checkpoint_plus_worked_step' \&\& fb.option === 'hint_then_show_step')/if (false)/" $F
run "default preset not mapped to the hybrid" $F tests/contract/rules.test.js "drives the ladder escalation"

F=harness/core/rules.js
sed -i 's/for (const k of o.rejected_kinds || \[\]) if (kinds.has(k))/for (const k of []) if (kinds.has(k))/' $F
run "free_order / explain_only not rejected by kind" $F tests/contract/rules.test.js "load-time validation"
sed -i "s/return option.rating === 'GAP' ? 'GAP: no rating' : option.rating;/return option.rating;/" $F
run "GAP shown as a bare rating" $F tests/contract/rules.test.js "GAP is displayed"
sed -i 's/update(canonical(cfg.overrides))/update(JSON.stringify(cfg.overrides))/' $F
run "override digest depends on key order" $F tests/contract/rules.test.js "rule_set_id"
sed -i "s/if (typeof o.rating !== 'string' || !o.rating.trim())/if (typeof o.rating !== 'string')/" $F
run "blank rating accepted" $F tests/contract/rules.test.js "empty rating"

F=harness/core/registry.js
sed -i 's/if (!Object.prototype.hasOwnProperty.call(events.ROUTE_PARAMS, r)) p.push/if (false) p.push/' $F
run "registry accepts routes outside 3.5" $F tests/contract/registry.test.js "invalid entries"

F=harness/core/router.js
sed -i "s/if (typeof it.source_ref !== 'string' || !it.source_ref.trim()) unsourced.push/if (false) unsourced.push/" $F
run "router plans unsourced items" $F tests/contract/router.test.js "source_ref"
sed -i 's/chosen.sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || order(a.format_id) - order(b.format_id));//' $F
run "router ignores the learning-phase order" $F tests/contract/router.test.js "learning-phase order"
sed -i "s/if (f.has('key_order') || f.has('sort_by')) f.add('order_key');//" $F
run "derived timeline key not recognised" $F tests/contract/router.test.js "shallow humanities"

# ------------------------------------------------------------------ format graders (wave 1 A)
F=harness/formats/fmt-choice-feedback/grader.js
sed -i 's/    if (!opt.correct) ans.misconception_tag = opt.misconception_tag;//' $F
run "choice: misconception tag dropped" $F tests/contract/formats.test.js "AF-MCQ-01: presentation"
sed -i 's/Math.min(2, wrong.length - 1)/Math.min(2, wrong.length)/' $F
run "choice: 50/50 can hide every wrong option" $F tests/contract/formats.test.js "lifeline"
F=harness/formats/fmt-retrieval-cloze/grader.js
sed -i 's/if (Array.from(t).length >= minLen \&\& levenshtein/if (levenshtein/' $F
run "cloze: near miss ignores the minimum length" $F tests/contract/formats.test.js "stricter number parsing"
sed -i "s/    if (result !== 'invalid') ev.score =/    ev.score =/" $F
run "cloze: invalid answers are scored" $F tests/contract/formats.test.js "AF-CLZ-01"
sed -i 's/!\/\^\[+-\]?(\\d+\\.?\\d\*|\\.\\d+)\$\/.test(s)/Number.isNaN(Number(s))/' $F
run "cloze: Python-float-like number parsing" $F tests/contract/formats.test.js "stricter number parsing"
F=harness/formats/fmt-match-classify/grader.js
sed -i 's/    for (const id of order) {/    for (const id of [...order].sort()) {/' $F
run "match: events not in presented order" $F tests/contract/formats.test.js "AF-MAT-01"
F=harness/formats/fmt-sequence-order/grader.js
sed -i "s/result: exact ? 'correct' : 'partial'/result: m.adjacent_pairs_correct > 0 ? 'correct' : 'partial'/" $F
run "sequence: partial order graded correct" $F tests/contract/formats.test.js "exact match"
sed -i 's/if (new Set(vals).size !== vals.length) throw/if (false) throw/' $F
run "sequence: timeline ties accepted" $F tests/contract/formats.test.js "AF-SEQ-01\/02"
F=harness/formats/fmt-branching-case/grader.js
sed -i 's/      if (visit(g.start)) problems.push/      if (false) problems.push/' $F
run "branching: cycles not detected" $F tests/contract/formats.test.js "undeclared cycles"
sed -i "s/route: total === max ? 'advance'/route: total > 0 ? 'advance'/" $F
run "branching: a weak path advances" $F tests/contract/formats.test.js "undeclared cycles"
F=harness/formats/fmt-data-visual-lab/lab.js
sed -i "s/if (typeof v === 'string') return JSON.stringify(v).replace(/if (typeof v === 'string') return JSON.stringify(v); void (0).replace(/" $F
run "lab: canonical JSON not ASCII-escaped" $F tests/contract/formats.test.js "specSha256 is canonical"
sed -i 's/tail_area_each_exact: halfUp(0.5 \* erfc(1.96 \/ Math.SQRT2), 6)/tail_area_each_exact: halfUp(0.025, 6)/' $F
run "lab: table tail stored as the exact tail" $F tests/contract/formats.test.js "AF-SIM-01"
F=harness/formats/fmt-review-mix/scheduler.js
sed -i 's/x = Math.min(Math.max(d, LO_D), HI_D)/x = d/' $F
run "review: no clamp" $F tests/contract/formats.test.js "clamp holds"
sed -i 's/: a.i - b.i));/: b.i - a.i));/' $F
run "review: due ties lose the seeded order" $F tests/contract/formats.test.js "AF-REV-01"
# ------------------------------------------------------------------ Prova 3 package
F=harness/packages/prova3.js
sed -i "s/z_mean_ci: 'sigma_known_vs_unknown', t_mean_ci: 'sigma_known_vs_unknown'/z_mean_ci: 'sigma_known_vs_unknown', t_mean_ci: 'mean_vs_proportion'/" $F
run "package: wrong confusion tag for the t interval" $F tests/contract/prova3-package.test.js "wrong method choice"
sed -i 's/return Number.isInteger(p) ? `PDF p.${p}` : null;/return `PDF p.${p}`;/' $F
run "package: unsourced items get a made-up page" $F tests/contract/prova3-package.test.js "without page numbers"
F=harness/formats/fmt-data-visual-lab/procedure-spec.js
sed -i "s/spec.decision = Math.abs(v(plot.stat)) > crit ? 'reject'/spec.decision = v(plot.stat) > crit ? 'reject'/" $F
run "plot_spec: one-sided decision" $F tests/contract/prova3-package.test.js "two-sided"
# ------------------------------------------------------------------ SKILL.md Status vs verified functionality (R4)
F=skills/fmt-match-classify/SKILL.md
sed -i 's/^Pending: none for Prova 3; a humanities classification fixture.$/Pending: player view./' $F
run "skill status: shipped view still listed as pending" $F tests/contract/skill-status.test.js "a player view that a browser check drives"
F=skills/fmt-branching-case/SKILL.md
sed -i 's/^Works: `harness\/formats\/fmt-branching-case\/grader.js`/Works: the player view and `harness\/formats\/fmt-branching-case\/grader.js`/' $F
run "skill status: unexercised view claimed as works" $F tests/contract/skill-status.test.js "a player view that a browser check drives"
F=skills/fmt-step-ladder/SKILL.md
sed -i 's/^Exists but unexercised: none.$/Exists but unexercised: none. Restart composite rated C./' $F
run "skill status: research rating inside Status" $F tests/contract/skill-status.test.js "no research rating"
# ------------------------------------------------------------------ per-unit format cap (R5)
F=harness/core/router.js
sed -i 's/^const DEFAULT_MAX_FORMATS_PER_UNIT = 4;$/const DEFAULT_MAX_FORMATS_PER_UNIT = 6;/' $F
run "cap: router default raised to 6" $F tests/contract/format-cap.test.js "router default cap is 4"
F=harness/packages/caps.js
sed -i 's/^    max_formats_per_unit: 6,$/    max_formats_per_unit: 5,/' $F
run "cap: Prova 3 override no longer what FORMATS.md documents" $F tests/contract/format-cap.test.js "FORMATS.md documents each override"
# The cap is routed in one place since wave 2 (scripts/lib/package-page.mjs, shared by build-package and build-lesson).
F=scripts/lib/package-page.mjs
sed -i "s/  const maxFormatsPerUnit = cap ? cap.max_formats_per_unit : DEFAULT_MAX_FORMATS_PER_UNIT;/  const maxFormatsPerUnit = cfg.key === 'prova3' ? 6 : DEFAULT_MAX_FORMATS_PER_UNIT; const literal = { maxFormatsPerUnit: 6 };/" $F
run "cap: undocumented literal cap back in the package builder" $F tests/contract/format-cap.test.js "take caps only from caps.js"
# ------------------------------------------------------------------ course rules and captured exports (python)
PY=${PYTHON:-python3}
run_py() { # name, file that must change, expected failing test method
  local name=$1 file=$2 expect=$3
  if cmp -s "$file" "$BACKUP/$file"; then echo "MISFIRE   $name (sed changed nothing)"; survivors=$((survivors + 1)); restore; return; fi
  if "$PY" -m unittest tests.test_course_rules > /tmp/mut-core-py.log 2>&1; then echo "SURVIVED  $name"; survivors=$((survivors + 1))
  elif grep -qE "^Ran 0 tests|Error: (No module|cannot import)|SyntaxError" /tmp/mut-core-py.log; then echo "MISFIRE   $name (suite did not load)"; survivors=$((survivors + 1))
  elif ! grep -qE "^(FAIL|ERROR): $expect " /tmp/mut-core-py.log; then echo "MISFIRE   $name (failed elsewhere: $(grep -m1 -E '^(FAIL|ERROR):' /tmp/mut-core-py.log))"; survivors=$((survivors + 1))
  else echo "KILLED    $name -> $expect"; fi
  restore
}
F=research/outputs/C-tools/variant_generator_demo.py
sed -i 's/Usage: python3 -I variant_generator_demo.py/Usage: python3 -I research\/outputs\/C-tools\/variant_generator_demo.py/' $F
run_py "captured export edited in place (65d37b7 class)" $F "test_captured_artifacts_match_their_recorded_digests"
F=examples/variant_generator_course_rules.py
sed -i 's/    "branch_rule": lambda v, statement: decision_map(statement),/    "branch_rule": lambda v, statement: "t" if v["n"] < 30 else "z",/' $F
run_py "course demo: n < 30 branch back" $F "test_generator_demo_has_no_n_below_30_branch_and_passes_its_self_check"

echo "survivors: $survivors"
exit $(( survivors > 0 ))
