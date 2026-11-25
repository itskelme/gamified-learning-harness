#!/usr/bin/env bash
# Mutation check for the Prova 3 pilot: reintroduce each fixed defect, prove a test goes RED, restore.
# Usage: bash scripts/mutation-check-prova3.sh   (exit 1 if any mutation survives)
set -u
cd "$(dirname "$0")/.."
LESSON=lessons/prova3-statistics.lesson.json
BACKUP=$(mktemp)
cp "$LESSON" "$BACKUP"
cp harness/plots.js "$BACKUP.plots"
cp harness/procedure-engine.js "$BACKUP.engine"
restore() { cp "$BACKUP" "$LESSON"; cp "$BACKUP.plots" harness/plots.js; cp "$BACKUP.engine" harness/procedure-engine.js; }
trap restore EXIT
survivors=0

run() { # name, test-name pattern
  local name=$1 pattern=$2
  if node --test --test-name-pattern="$pattern" tests/pilot-engine.test.js > /tmp/mut.log 2>&1; then
    # A pattern that matches no test name also exits 0 (node reports the file as 1 passing test): label it.
    if grep -qvE '^✔ tests/|^[^✔]' /tmp/mut.log; then echo "SURVIVED  $name"; else echo "MISFIRE   $name (pattern matched no test)"; fi
    survivors=$((survivors + 1))
  else
    echo "KILLED    $name -> $(grep -m1 -E '^not ok|✖' /tmp/mut.log | sed 's/^ *//')"
  fi
  restore
}

# D1: drop n = 31 (gl = 30) from the one-sample t domain.
sed -i 's/"values": \[11, 13, 16, 17, 20, 21, 31\]/"values": [11, 13, 16, 17, 20, 21]/' "$LESSON"
run "D1 n=31 removed from Ex2 domain" "D1"
# D2: remove the declared Ex5 rounded-printed carry path.
sed -i 's/"id": "rounded-printed"/"id": "rounded-printed-x", "overrides_disabled": true/; s/"ep": "round(round(sp, 3) \* round(raiz, 4), 3)"/"ep_disabled": "0"/' "$LESSON"
run "D2 Ex5 2,725 path removed" "D2"
# D4: remove the Ex2 exact-t path.
sed -i 's/"tc": "tquant(gl)"/"tc_disabled": "0"/' "$LESSON"
run "D4 Ex2 exact-t path removed" "D4"
# Tolerance: loosen Ex3 bound tolerance back to 0.0015 (absorbs 0,541).
sed -i 's/"percent": true, "tolerance": { "abs": 0.0005 }/"percent": true, "tolerance": { "abs": 0.0015 }/g' "$LESSON"
run "Ex3 bound tolerance 0.0015" "rounded EP 0,025"
# Tolerance: loosen the Ex4 Z statistic back to 0.004.
sed -i '0,/"expr": "(x1 - x2) \/ ep", "display_decimals": 3, "tolerance": { "abs": 0.001 }/s//"expr": "(x1 - x2) \/ ep", "display_decimals": 3, "tolerance": { "abs": 0.004 }/' "$LESSON"
run "Ex4 Z tolerance 0.004" "never absorbs"
# Printed key: change the Ex3 printed lower bound by 0,001.
sed -i 's/"lower": "0,542"/"lower": "0,541"/' "$LESSON"
run "Ex3 printed lower 0,541" "PDF answer key"
# Compact plot: disable the narrow layout.
sed -i 's/W = COMPACT ? 360 : 640/W = 640/' harness/plots.js
run "compact plot layout disabled" "compact plot"
# Tail label: back at the plain tail midpoint, so the statistic line crosses "Rejeito H0" (PDF p.11 nit).
sed -i 's/\[a, b\] = (s - crit) > (extent - s) ? \[crit, s\] : \[s, extent\];/[a, b] = [crit, extent];/' harness/plots.js
run "tail label crosses the statistic" "Rejeito"
# Contract: learner-facing restart help no longer required.
sed -i "s/for (const k of \['learner_help', 'source_rationale'\]) if/for (const k of []) if/" harness/procedure-engine.js
run "restart learner_help not validated" "learner-facing restart"
# Round 3. Carry: drop the display-carry path (a learner using the shown values is rejected again).
sed -i "s/const carry = \[{ value: solve(lesson, ex, run.variables, { carry: 'display' }).values\[step.id\], path: { id: 'display-carry', ...lesson.carry_paths.display } }\];/const carry = [];/" harness/procedure-engine.js
run "display-carry path removed" "carries the displayed values"
# Carry: drop the learner-carry path (no follow-through of the learner's accepted values).
sed -i 's/      if (mine) carry.push(/      if (false) carry.push(/' harness/procedure-engine.js
run "learner-carry path removed" "carries honestly is followed through|accepted learner values persist"
# Round 4: tier 2 re-applies the full step tolerance around carry paths (tolerances stack again).
sed -i 's/d <= halfUnit(step, c.value) \&\&/d <= toleranceFor(step, c.value) \&\&/' harness/procedure-engine.js
run "follow-through tolerance stacks again" "tier 2 adds no tolerance|stacked tolerance edges"
# Round 4: the early-rounding EP bug is dropped, so EP 0,025 gets a root diagnosis again.
sed -i '/"id": "ep-arredondado-cedo", "expr": "round(ep, 3)"/d' "$LESSON"
run "Ex3 EP early-rounding diagnosis removed" "diagnosed as early rounding"
# Carry: accepted values are not stored, so neither the next step nor a reload can follow them.
sed -i 's/      if (step.type === .numeric.) run.completed\[run.step\].value = r.value;//' harness/procedure-engine.js
run "accepted value not stored" "persist"
# Carry: a new variant keeps the old learner numbers (stale values would feed the grading).
sed -i "s/? { id: c.id, display: displayFor(lesson, run, i), how: 'recomputed' }/? { id: c.id, display: displayFor(lesson, run, i), how: 'recomputed', value: c.value }/" harness/procedure-engine.js
run "stale carried values kept on a new variant" "drops the old carried values"
# Carry: restore trusts saved values without re-grading them (forged value accepted).
sed -i 's/            !gradeNumeric(lesson, { ...run, step: i }, c.value).correct) throw/            false) throw/' harness/procedure-engine.js
run "restore does not re-grade carried values" "persist"
# Worked lines: operands printed at a fixed 4 decimals (no adaptive precision).
sed -i 's/        const p = name === carry.step ? carry.self : carry.operand;/        const p = 4;/' harness/procedure-engine.js
run "worked-line precision fixed at 4" "reproduces its printed result"
# Worked lines: the round-2 Ex5 t line (1,3/0,477 ≈ 2,724, PDF p.16 chain).
sed -i 's#{ep:carry} = {diff:1}/{ep:carry} ≈ {t}#{ep} = {diff:1}/{ep} ≈ {t}#' "$LESSON"
run "Ex5 t line divides by the 3-decimal EP" "reproduces its printed result"
# Contract: carry-path notes no longer required.
sed -i "s/    for (const k of \['display', 'learner'\]) {/    for (const k of []) {/" harness/procedure-engine.js
run "carry_paths not validated" "carry-path notes"

echo "survivors: $survivors"
[ "$survivors" -eq 0 ]
