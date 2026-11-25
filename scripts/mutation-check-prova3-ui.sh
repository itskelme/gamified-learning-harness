#!/usr/bin/env bash
# UI mutation check for the Prova 3 pilot (review round 1 fixes): reintroduce each learner-facing
# defect, rebuild into a scratch dir, and prove the browser suite fails at the matching check.
# Usage: bash scripts/mutation-check-prova3-ui.sh   (exit 1 if any mutation survives or fails elsewhere)
set -u
cd "$(dirname "$0")/.."
FILES=(lessons/prova3-statistics.lesson.json harness/app.js templates/ordered-procedure.html)
BACKUP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$BACKUP/$(dirname "$f")"; cp "$f" "$BACKUP/$f"; done
OUT=$(mktemp -d)
restore() { for f in "${FILES[@]}"; do cp "$BACKUP/$f" "$f"; done; }
trap restore EXIT
bad=0

unchanged() { for f in "${FILES[@]}"; do cmp -s "$f" "$BACKUP/$f" || return 1; done; return 0; }
run() { # name, regex the failing assertion must match
  local name=$1 expect=$2
  if unchanged; then echo "MISFIRE   $name (sed changed nothing)"; bad=$((bad + 1)); restore; return; fi
  if ! node scripts/build-pilot.mjs --out "$OUT" --no-pdf --no-oracle --variants 3 > /tmp/mut-ui-build.log 2>&1; then
    echo "BUILD-FAIL $name (mutant must build; see /tmp/mut-ui-build.log)"; bad=$((bad + 1)); restore; return
  fi
  if node tests/pilot-browser.mjs "$OUT" > /tmp/mut-ui.log 2>&1; then
    echo "SURVIVED  $name"; bad=$((bad + 1))
  elif grep -qE "$expect" /tmp/mut-ui.log; then
    echo "KILLED    $name -> $(grep -m1 -E "$expect" /tmp/mut-ui.log | sed 's/^ *//' | cut -c1-160)"
  else
    echo "WRONG-RED $name (failed, but not at the expected check): $(grep -m1 -E 'AssertionError|Error' /tmp/mut-ui.log | cut -c1-160)"; bad=$((bad + 1))
  fi
  restore
}
run_pdf() { # name, regex the build's study-PDF text check must print (build with the PDF; must FAIL)
  local name=$1 expect=$2
  if cmp -s harness/app.js "$BACKUP/harness/app.js" && cmp -s templates/ordered-procedure.html "$BACKUP/templates/ordered-procedure.html" \
     && cmp -s lessons/prova3-statistics.lesson.json "$BACKUP/lessons/prova3-statistics.lesson.json"; then
    echo "MISFIRE   $name (sed changed nothing)"; bad=$((bad + 1)); restore; return
  fi
  if node scripts/build-pilot.mjs --out "$OUT" --no-oracle --variants 3 > /tmp/mut-ui-pdf.log 2>&1; then
    echo "SURVIVED  $name (study PDF built)"; bad=$((bad + 1))
  elif grep -qE "$expect" /tmp/mut-ui-pdf.log; then
    echo "KILLED    $name -> $(grep -m1 -E "$expect" /tmp/mut-ui-pdf.log | sed 's/^ *//' | cut -c1-160)"
  else
    echo "WRONG-RED $name (build failed, but not at the expected check): $(grep -m1 -E 'BUILD FAILED|Error' /tmp/mut-ui-pdf.log | cut -c1-160)"; bad=$((bad + 1))
  fi
  restore
}

# 0. Control: the unmutated sources build the study PDF and pass the browser suite.
if ! node scripts/build-pilot.mjs --out "$OUT" --no-oracle --variants 3 > /tmp/mut-ui-control.log 2>&1 || ! node tests/pilot-browser.mjs "$OUT" > /tmp/mut-ui-control-b.log 2>&1; then
  echo "CONTROL FAILED (unmutated build or browser suite is red; see /tmp/mut-ui-control*.log)"; exit 1
fi

# R2. Step rules mapped to [dt, dd] pairs: h() flattens one level, so the page prints "[object HTMLElement]".
sed -i 's/h(.dl., {}, stepRules.flatMap(/h('"'"'dl'"'"', {}, stepRules.map(/' harness/app.js
run "step rules as nested [dt, dd] arrays (browser)" "broken render"
sed -i 's/h(.dl., {}, stepRules.flatMap(/h('"'"'dl'"'"', {}, stepRules.map(/' harness/app.js
# Round 2: the print-DOM empty-section check (a dl with no dt/dd) now stops this build before pdftotext runs.
run_pdf "step rules as nested [dt, dd] arrays (study PDF)" "broken render \"\[object|empty list: dl"
sed -i "s/h('dt', { text: STEP_RULE_LABELS\[k\] || 'Outros passos' })/h('dt', { text: k })/" harness/app.js
run "English step-rule ids as dt text" "English step-rule id"
# R7. Print rules that keep a worked step together (and its heading with its body) removed.
# Round 2 added a generic keep-with-next rule (h2,h3,h4,dt) that also holds step headings: remove both.
sed -i '/^  ol.worked>li{break-inside:avoid}ol.worked h4{break-after:avoid}$/d; /^  h2,h3,h4,dt{break-after:avoid}dd{break-before:avoid}$/d' templates/ordered-procedure.html
run_pdf "worked steps may split across PDF pages" "ends with the step heading"
# R8. Build/tool material back in learner copy (page header, PDF, Fonte view).
sed -i 's/<p class="eyebrow">Revisão de estatística · estudar e praticar<\/p>/<p class="eyebrow">Harness de aprendizagem · formato ordered-procedure · protótipo local<\/p>/' templates/ordered-procedure.html
run "tool and format name in the page header (browser)" "header exposes internal provenance"
sed -i 's/<p class="eyebrow">Revisão de estatística · estudar e praticar<\/p>/<p class="eyebrow">Harness de aprendizagem · formato ordered-procedure · protótipo local<\/p>/' templates/ordered-procedure.html
run_pdf "tool and format name in the letter-spaced PDF header" "p\.1: internal material \"HARNESS \(letter-spaced\)\""
sed -i 's/Esta revisão mostra 0,4282 e aceita 0,4281./O piloto mostra 0,4282 e aceita 0,4281./' lessons/prova3-statistics.lesson.json
run_pdf "\"o piloto\" back in a discrepancy note" "internal material \"piloto\""
sed -i 's/h(.li., { text: s.learner_label })/h('"'"'li'"'"', { text: `${s.path} — SHA-256 ${s.sha256}. ${s.description}` })/' harness/app.js
run "source paths and SHA-256 in the Fonte view" "#view-source exposes internal provenance"
sed -i 's/text: `Versão deste material: revisão ${L.revision}.`/text: `Lição ${L.id}, revisão ${L.revision}, formato ${L.format} ${L.format_version}, impressão digital ${DIGEST.slice(0, 16)}.`/' harness/app.js
run_pdf "format id and fingerprint footer in the PDF" "internal material \"(ordered-procedure|impressão digital)"

# 1. Internal provenance back in the learner-facing restart help.
sed -i 's/"learner_help": "Modo padrão:/"learner_help": "Pacote C recomenda (preferência do Kelme). Modo padrão:/' lessons/prova3-statistics.lesson.json
run "provenance in practice restart help" "exposes internal provenance"
# 1b. Fonte view prints the English note-kind id again.
sed -i "s/(\${NOTE_KINDS\[n.kind\] || 'observação'})/(\${n.kind})/" harness/app.js
run "English note kind in Fonte view" "prints the English kind id"
# 2. Step-list padding back to 1.2em (two-digit markers clipped).
sed -i 's/ol.worked{padding-left:2.2em}/ol.worked{padding-left:1.2em}/; s/ol.done{font-size:.92rem;padding-left:2.2em}/ol.done{font-size:.92rem;padding-left:1.2em}/' templates/ordered-procedure.html
run "step-list padding 1.2em" "clipped list markers"
# 3. Settings panel back between the step card and the linked plot.
sed -i "s/h('div', { class: 'practice-grid' }, card, fig, settings, io)/h('div', { class: 'practice-grid' }, h('div', {}, card, settings), h('div', {}, fig, io))/" harness/app.js
run "settings between card and plot" "360 px: (plot top is|the plot comes before)"
# 4. Round-1 desktop structure: plot and progress panel share one column and only the plot is sticky,
#    so on scroll the plot slides over the progress panel.
sed -i "s/h('div', { class: 'practice-grid' }, card, fig, settings, io)/h('div', { class: 'practice-grid' }, card, h('div', { class: 'side' }, fig, io), settings)/" harness/app.js
sed -i 's/\.practice-grid>\.linked{grid-column:2;grid-row:1\/-1;align-self:start;position:sticky;top:72px}/.practice-grid>.side{grid-column:2;grid-row:1\/-1}.linked{position:sticky;top:72px}/' templates/ordered-procedure.html
run "progress panel under the sticky plot" "sticky plot overlaps the progress panel"

trap - EXIT; restore
rm -rf "$OUT" "$BACKUP"
echo "survivors or misfires: $bad"
[ "$bad" -eq 0 ]
