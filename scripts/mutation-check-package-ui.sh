#!/usr/bin/env bash
# UI mutation check for the package player: reintroduce one learner-facing defect, rebuild, the browser suite
# must fail at the named check. Restores the files after each mutant.
# Usage: CHROMIUM_EXECUTABLE=... bash scripts/mutation-check-package-ui.sh   (exit 1 on any survivor or misfire)
set -u
cd "$(dirname "$0")/.."
FILES=(harness/player/views.js templates/package.html)
BACKUP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$BACKUP/$(dirname "$f")"; cp "$f" "$BACKUP/$f"; done
restore() { for f in "${FILES[@]}"; do cp "$BACKUP/$f" "$f"; done; }
trap 'restore; node scripts/build-package.mjs prova3 > /dev/null' EXIT
bad=0

run() { # name, file, expected failing check (substring of its PASS label)
  local name=$1 file=$2 expect=$3
  if cmp -s "$file" "$BACKUP/$file"; then echo "MISFIRE   $name (sed changed nothing)"; bad=$((bad + 1)); restore; return; fi
  node scripts/build-package.mjs prova3 > /dev/null 2>&1
  if node tests/package-browser.mjs prova3 > /tmp/mut-pkg-ui.log 2>&1; then echo "SURVIVED  $name"; bad=$((bad + 1))
  elif grep -qF "PASS $expect" /tmp/mut-pkg-ui.log; then echo "MISFIRE   $name (failed elsewhere: '$expect' still passed)"; bad=$((bad + 1))
  else echo "KILLED    $name -> at '$expect'"; fi
  restore
}

F=harness/player/views.js
sed -i "s/fs.append(h('legend', { text: p.stem }), ...order.map(/fs.append(h('legend', { text: p.stem }), order.map(/" $F
run "choice options appended as one array ([object HTMLDivElement])" $F "copy and integrity"
sed -i 's/if (!g.own.has(ev.item_id) \&\& --g.left <= 0)/if (false)/' $F
run "requeue gate never reopens" $F "match: a wrong method"
sed -i "s/disabled: true, 'aria-label': \`\${ctl.label} (número)\`/'aria-label': \`\${ctl.label} (número)\`/; s/step: ctl.step, value: ctl.original, disabled: true });/step: ctl.step, value: ctl.original });/" $F
run "lab control usable before the prediction" $F "lab: controls stay locked"
sed -i 's/        (dir < 0 \&\& !btns\[0\].disabled ? btns\[0\] : !btns\[1\].disabled ? btns\[1\] : btns\[0\]).focus();//' $F
run "focus lost after a move" $F "sequence: keyboard move buttons"
sed -i "s/h('p', { class: 'eyebrow', text: ACTIVITY\[f.format_id\] })/h('p', { class: 'eyebrow', text: \`\${f.format_id} · \${f.phase}\` })/" $F
run "internal format id shown to learners" $F "copy and integrity"
sed -i "s/rulesEl.textContent = PRESET_COPY\[rules.preset\] || 'Modo de prática personalizado.';/rulesEl.textContent = \`Regras: \${rules.rule_set_id} — \${rules.label}\`;/" $F
run "rule_set_id and rating shown as learner copy" $F "copy and integrity"
sed -i "s/text: 'Acertar hoje ainda não mostra que você vai lembrar na prova. O teste de verdade é refazer itens parecidos daqui a 7 e a 30 dias.'/text: 'Calendário 1\/3\/7\/21: convenção, sem evidência.'/" $F
run "calendar rating back in the review footer" $F "copy and integrity"
sed -i "s/const exam = h('input', { type: 'text', id: 'exam-date'/const exam = h('input', { type: 'date', id: 'exam-date'/" $F
run "locale-dependent native date input" $F "review: queue alternates"
sed -i "s/{ assisted: !!state.cues\[item.id\], locale: LOCALE }/{ locale: LOCALE }/" $F
run "answers after a cue not marked assisted" $F "cloze: key answers"
sed -i 's/const R = window.ReviewMix, today = localIsoDate();/const R = window.ReviewMix, today = new Date().toISOString().slice(0, 10);/' $F
run "review counts from the UTC date, not the local one" $F 'review: "today" is the local calendar date'
# R6: the round-d843957 four-column lab table (313 px in a 302 px .table-wrap at 360 px, "Limite superior" cut).
# (Since wave 2 the rows come from the plot_spec marks; the mutant rebuilds the old four-column header row from them.)
python3 -I scripts/mutants/replace.py $F "      table.append(h('caption', { text: 'Valores do gráfico' }), h('tr', {}, h('th', { scope: 'row', text: ctl.label }), h('td', { class: 'val', text: String(v) })),
        ...TABLE_ROLES.flatMap(role => spec.marks.filter(mk => mk.role === role)).map(valueRow));" "      const mks = TABLE_ROLES.flatMap(role => spec.marks.filter(mk => mk.role === role)); void valueRow;
      table.append(h('caption', { text: 'Valores do gráfico' }), h('tr', {}, h('th', { text: ctl.label }), mks.map(mk => h('th', { text: (ex.steps.find(x => x.id === mk.id) || { title: ROLE_LABEL[mk.role] }).title }))),
        h('tr', {}, h('td', { text: String(v) }), mks.map(mk => h('td', { class: 'val', text: mk.label }))));"
run "four-column lab table clipped inside its .table-wrap" $F "360 px: no sideways overflow (document and every .table-wrap)"
F=templates/package.html
sed -i 's/.opt input{width:24px;height:24px;flex:none;margin:0}/.opt input{width:20px;height:20px;flex:none;margin:0}/' $F
run "20 px radios" $F "360 px: no sideways overflow"
sed -i '/^a\.go{/d' $F
run "ladder link as a 17 px target" $F "360 px: no sideways overflow"

echo "survivors or misfires: $bad"
exit $(( bad > 0 ))
