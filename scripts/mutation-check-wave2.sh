#!/usr/bin/env bash
# Mutation check for card t_fd19236f (wave 2, plus the round-2 fixes from Sofia's review): each mutant reintroduces one defect this card fixed or one rule it
# added, and a named test must go RED. Covers the locale contract, the plot_spec-only renderer, schema 1.0 and its
# migrations, the generic entry and composers, the shallow brief, slides, the case figure, the study guide and LaTeX.
# Every file is restored after each mutant. Usage: bash scripts/mutation-check-wave2.sh (exit 1 on any survivor/misfire)
set -u
cd "$(dirname "$0")/.."
FILES=(harness/procedure-engine.js harness/formats/fmt-retrieval-cloze/grader.js harness/plots.js harness/case-diagram.js
  harness/slides.js harness/latex.js harness/study-guide.js harness/brief/brief.js harness/packages/compose.js
  scripts/lesson_contract.py scripts/build-lesson.mjs harness/app.js scripts/lib/empty-sections.mjs
  harness/formats/fmt-branching-case/grader.js harness/brief/stub-provider.js lessons/humanities-decisions.lesson.json
  templates/ordered-procedure.html)
BACKUP=$(mktemp -d)
for f in "${FILES[@]}"; do mkdir -p "$BACKUP/$(dirname "$f")"; cp "$f" "$BACKUP/$f"; done
restore() { for f in "${FILES[@]}"; do cp "$BACKUP/$f" "$f"; done; }
trap 'restore; rm -rf "$BACKUP" "$BUILD_OUT"' EXIT
LOG=$(mktemp)
survivors=0 killed=0

mut() { # file old new  (exactly one occurrence, else MISFIRE)
  python3 -I scripts/mutants/replace.py "$1" "$2" "$3" 2>>"$LOG.misfire"
}
run() { # name, file, test file, test-name pattern (node test) | "py:<module.Class.test>" for python
  local name=$1 file=$2 tests=$3 pattern=$4
  if cmp -s "$file" "$BACKUP/$file"; then echo "MISFIRE   $name (mutation changed nothing)"; survivors=$((survivors + 1)); restore; return; fi
  local ok
  if [[ $tests == py:* ]]; then python3 -m unittest "${tests#py:}" > "$LOG" 2>&1; ok=$?
  else node --test --test-name-pattern="$pattern" "$tests" > "$LOG" 2>&1; ok=$?; fi
  if [ $ok -eq 0 ]; then
    if [[ $tests != py:* ]] && ! grep -q '^ℹ pass [1-9]' "$LOG"; then echo "MISFIRE   $name (pattern matched no test)"; else echo "SURVIVED  $name"; fi
    survivors=$((survivors + 1))
  else
    killed=$((killed + 1))
    echo "KILLED    $name -> $(grep -m1 -E '^✖|^FAIL:|^ERROR:' "$LOG" | sed 's/^ *//' | cut -c1-150)"
  fi
  restore
}
# Full build of the teste-z lesson (PDF path included): the mutant must make it FAIL at the named check.
BUILD_OUT=$(mktemp -d)
build_teste_z() { node scripts/build-lesson.mjs lessons/teste-z-uma-media.lesson.json --out "$BUILD_OUT/out" > "$LOG" 2>&1; }
run_build() { # name, file, regex the build log must contain
  local name=$1 file=$2 expect=$3
  if cmp -s "$file" "$BACKUP/$file"; then echo "MISFIRE   $name (mutation changed nothing)"; survivors=$((survivors + 1)); restore; return; fi
  build_teste_z; local ok=$?
  if [ $ok -eq 0 ]; then echo "SURVIVED  $name"; survivors=$((survivors + 1))
  elif grep -qE "$expect" "$LOG"; then killed=$((killed + 1)); echo "KILLED    $name -> $(grep -m1 -E "$expect" "$LOG" | sed 's/^ *//' | cut -c1-150)"
  else echo "WRONG-RED $name (the build failed, but not at: $expect)"; sed 's/^/          /' "$LOG" | head -5; survivors=$((survivors + 1)); fi
  restore
}
# Control: the unmutated teste-z build passes, so a failing mutant build is the mutant's doing.
if ! build_teste_z; then echo "CONTROL FAILED: the unmutated teste-z build is red"; cat "$LOG"; exit 1; fi
echo "control   teste-z build green"

# ---- locale contract (ACCEPTANCE line 23)
F=harness/procedure-engine.js
mut $F "    if (typeof raw === 'string' && isAmbiguousGrouping(s, locale)) return NaN;" ""
run "engine reads '1.960' as 1,96 again" $F tests/contract/locale.test.js "pilot step"
F=harness/formats/fmt-retrieval-cloze/grader.js
mut $F "const COMMA_DECIMAL = /^(pt|es|fr|de|it)\\b/i;" "const COMMA_DECIMAL = /^(xx)\\b/i;"
run "cloze forgets pt-BR is comma-decimal" $F tests/contract/locale.test.js "package cloze"

# ---- plot_spec-only renderer
F=harness/plots.js
mut $F "      m.v[role] = mk.value; m.label[role] = mk.label; m.known.add(role);" "      m.v[role] = mk.value; m.label[role] = String(mk.value); m.known.add(role);"
run "renderSpec ignores the spec's printed labels" $F tests/contract/plot-spec-render.test.js "renderSpec follows the spec"
mut $F "    m.dfLabel = m.df === null ? null : String(Math.round(m.df));" "    m.dfLabel = m.df === null ? null : '30';"
run "renderSpec ignores the spec's df" $F tests/contract/plot-spec-render.test.js "renderSpec follows the spec"

# ---- schema 1.0 (ACCEPTANCE line 22)
F=scripts/lesson_contract.py
mut $F "    if lesson.get('schema_version') == '0.1':" "    if lesson.get('schema_version') in ('0.1', '0.3'):"
run "unknown version guessed as 0.1" $F tests/contract/build-lesson.test.js "unknown lesson version"
mut $F "        if unsourced and 'brief' not in lesson:" "        if False:"
run "unverified claims accepted outside a brief" $F tests/contract/brief.test.js "only inside a shallow brief"

# ---- generic entry and composers
F=harness/packages/compose.js
mut $F "  if (CURATED[lesson.id]) return" "  if (false) return"
run "curated composers bypassed" $F tests/contract/build-lesson.test.js "named lessons"
mut $F "    if (c && c.status === 'unverified' && !(c.source_ids || []).length) {" "    if (false) {"
run "unverified claim not named in source_ref" $F tests/contract/brief.test.js "names unverified claims"
F=scripts/build-lesson.mjs
mut $F "  if (lesson.id !== 'prova3-estatistica') a.push('--no-oracle');" "  a.push('--no-oracle');"
run "Prova 3 oracle skipped by the generic entry" $F tests/contract/build-lesson.test.js "named lessons"

# ---- shallow brief
F=harness/brief/brief.js
mut $F "  if (!usableSources(brief).length) p.push(" "  if (false) p.push("
run "brief without a source is drafted" $F tests/contract/brief.test.js "refused with a clear error"
mut $F "    if (!ids.length || ids.some(id => !known.has(id))) {" "    if (!ids.length) {"
run "provider's foreign source trusted" $F tests/contract/brief.test.js "unverified claims are flagged"
mut $F "  if (!assumptions.length) throw" "  if (false) throw"
run "provider may assume nothing" $F tests/contract/brief.test.js "lists the provider"

# ---- slides
F=harness/slides.js
mut $F "answer: rows.map(r => \`\${r.asks} (\${r.condition}): \${methodName(r.method)}\`).join('; ')" "answer: 'Se o desvio-padrão da população (σ) é conhecido: Z; se só temos o s da amostra: t.'"
run "decision-map answer hard-coded for Prova 3" $F tests/contract/artifacts.test.js "recall prompt has an answer"
mut $F "    if (ex.plot) { const spec = Spec.plotSpecFor(lesson, ex, solved), r = Plots.renderSpec(spec);" "    if (ex.plot) { const spec = Spec.plotSpecFor(lesson, ex, solved), r = Plots.render(lesson, ex, solved, {});"
run "slide figure drawn from the lesson, not plot_spec" $F tests/contract/artifacts.test.js "plot_spec SVG"
mut $F "const textFor = lesson => ((lesson.language || '').startsWith('pt') ? TEXT.pt : TEXT.en);" "const textFor = lesson => TEXT.pt;"
run "English lesson gets Portuguese slides" $F tests/contract/artifacts.test.js "language follows the lesson"
mut $F "  if (lesson.brief) slides.splice(1, 0, draftSlide(lesson, T));" ""
run "draft deck hides its assumptions" $F tests/contract/artifacts.test.js "drafts open with"

# ---- case figure
F=harness/case-diagram.js
mut $F "        if (hit) pts.push(" "        if (false) pts.push("
run "long edge drawn through a box" $F tests/contract/artifacts.test.js "no edge crosses a box"
mut $F "    spread(edges, 'to'); spread(edges, 'from');" "    edges.forEach(e => { e.dy_in = 0; e.dy_out = 0; });"
run "edges into one box share one point" $F tests/contract/artifacts.test.js "no edge crosses a box"
mut $F '<text x="${x + 56}" y="${keyY + 5}" font-size="15">${esc(st.label)}</text>' ''
run "drawn key without words" $F tests/contract/artifacts.test.js "drawn key"

# ---- LaTeX
F=harness/latex.js
mut $F "'%': '\\\\%', " ""
run "percent sign not escaped" $F tests/contract/artifacts.test.js "learner text is escaped"
mut $F "if (!CONTAINER_PACKAGES[p.trim()])" "if (false)"
run "dry run accepts a package the container lacks" $F tests/contract/artifacts.test.js "dry run"
mut $F "c.codePointAt(0) > 0xff" "c.codePointAt(0) > 0x10ffff"
run "dry run accepts unmapped Unicode" $F tests/contract/artifacts.test.js "dry run"
mut $F "    const flag = hasUnverified(lesson, sec.claim_ids) ? FLAG_TEX : '';" "    const flag = '';"
run "LaTeX hides unverified sections" $F tests/contract/artifacts.test.js "brief draft prints"
mut $F "  const crit = spec.marks.find(m => m.role === 'critical'), stat = spec.marks.find(m => m.role === 'statistic');" "  const crit = { value: 1.96, label: '1,96' }, stat = spec.marks.find(m => m.role === 'statistic');"
run "TikZ critical value not from plot_spec" $F tests/contract/artifacts.test.js "plot figures come from plot_spec"

# ---- study guide and source labels
F=harness/study-guide.js
mut $F "  return hasUnverified(lesson, ids) ? ' <span class=\"flag\">" "  return false ? ' <span class=\"flag\">"
run "study guide hides unverified sections" $F tests/contract/artifacts.test.js "study guide"
F=harness/slides.js
mut $F "  if (s.status === 'author-created-example') return pt ?" "  if (false) return pt ?"
run "internal source title printed" $F tests/contract/artifacts.test.js "sources are named"

# ======== round 2 (Sofia, t_fd19236f round 1 at 06ddaa8) ========
# ---- R4 locale: a 0 integer part is a decimal; spaces inside a number are malformed
F=harness/procedure-engine.js
mut $F '(?!0${g})' ''
run "engine refuses 0.950 as thousands again" $F tests/contract/locale.test.js "engine parseNumber"
mut $F "    let s = String(raw).trim().replace(/−/g, '-');" "    let s = String(raw).trim().replace(/−/g, '-').replace(/\\s+/g, '');"
run "engine reads '1 960' as 1960 again" $F tests/contract/locale.test.js "engine parseNumber"
F=harness/formats/fmt-retrieval-cloze/grader.js
mut $F '(?!0\.)' ''
run "cloze refuses 0.950 as thousands again" $F tests/contract/locale.test.js "cloze parseNumber"

# ---- R1 Fonte view: no empty table/heading/list for a lesson without that data (full build, PDF path)
F=harness/app.js
mut $F "      tTable.length ? h('div'" "      true ? h('div'"
run_build "empty t-table printed for teste-z" $F "table with no data cells"
mut $F "      (L.source_notes || []).length ? [h('h3'" "      true ? [h('h3'"
run_build "empty Divergências heading printed for teste-z" $F "heading with no content before the next section: h3 \"Divergências"
mut $F "      keyPaths.length ? h('ul'" "      true ? h('ul'"
run_build "empty key-path list printed for teste-z" $F "empty list: ul"
mut $F "    const figures = P.figuresCopy(L);" "    const figures = 'Os gráficos mostram a curva, as caudas, os valores críticos, o intervalo e a estatística do passo atual.';"
run "Fonte figure copy fixed again in app.js" $F tests/contract/source-view-copy.test.js "prints figuresCopy"
F=harness/plots.js
mut $F "    if (kinds.has('interval')) parts.push('o intervalo');" "    parts.push('o intervalo');"
run "figure copy names an interval teste-z lacks" $F tests/contract/source-view-copy.test.js "teste-z"
F=scripts/lib/empty-sections.mjs
mut $F "    if (!between.trim()) problems.push(" "    if (false) problems.push("
run "PDF check passes an empty heading" $F tests/contract/empty-sections.test.js "same level is empty"
mut $F "const norm = s => s.replace(/[\\s₀-₉⁰-⁹²³¹]+/g, '').toLowerCase();" "const norm = s => s.replace(/\\s+/g, '').toLowerCase();"
run "PDF check loses subscripted headings" $F tests/contract/empty-sections.test.js "subscripts"
mut $F "    if (hit) problems.push(" "    if (false) problems.push("
run "PDF check lets a page end on a heading or label" $F tests/contract/empty-sections.test.js "orphans"
F=templates/ordered-procedure.html
mut $F "  h2,h3,h4,dt{break-after:avoid}dd{break-before:avoid}" ""
run_build "print CSS lets a label end the page" $F "ends with \"Dados do enunciado\""
mut $F "  #view-source .card>p:last-child{break-before:avoid}" ""
run_build "print CSS turns a page for the version line" $F "widow page"
F=scripts/lib/empty-sections.mjs
mut $F "    if (lines.length === 1 && lines[0].length < 80) problems.push(" "    if (false) problems.push("
run "PDF check accepts a widow last page" $F tests/contract/empty-sections.test.js "widow page"

# ---- R2 brief drafts: every printed occurrence of an unverified claim is flagged
F=harness/study-guide.js
mut $F '<dd>${esc(g.definition)}${claimMark(lesson, g.claim_ids)}</dd>' '<dd>${esc(g.definition)}</dd>'
run "study guide glossary unflagged" $F tests/contract/unverified-flags.test.js "study guide"
mut $F '<dd>${esc(a)}${mark}</dd>' '<dd>${esc(a)}</dd>'
run "study guide recall answer unflagged" $F tests/contract/unverified-flags.test.js "study guide"
mut $F '`<p>${esc(p)}${mark}</p>`' '`<p>${esc(p)}</p>`'
run "study guide paragraph unflagged" $F tests/contract/unverified-flags.test.js "study guide"
F=harness/latex.js
mut $F "\${tex(g.definition)}\${hasUnverified(lesson, g.claim_ids) ? FLAG_TEX : ''}" '${tex(g.definition)}'
run "LaTeX glossary unflagged" $F tests/contract/unverified-flags.test.js "LaTeX: every line"
mut $F '${tex(a)}${flag}`' '${tex(a)}`'
run "LaTeX recall answer unflagged" $F tests/contract/unverified-flags.test.js "LaTeX: every line"
F=harness/slides.js
mut $F 'hasUnverified(lesson, g.claim_ids) ? `${g.definition} ${T.unverifiedInline}` : g.definition' 'g.definition'
run "slides glossary row unflagged" $F tests/contract/unverified-flags.test.js "slides: an occurrence"
F=harness/brief/brief.js
mut $F "    if (Array.isArray(g.claim_ids) && g.claim_ids.length) return;" "    return;"
run "provider glossary without claim ids printed as fact" $F tests/contract/unverified-flags.test.js "leaves glossary entries"
F=harness/brief/stub-provider.js
mut $F ", claim_ids: [termClaims[i]] }))" " }))"
run "stub glossary loses its claim ids" $F tests/contract/unverified-flags.test.js "precondition"

# ---- R3 humanities case: endings true for every incoming path
F=harness/formats/fmt-branching-case/grader.js
mut $F "c.principle_tag !== t.principle_tag" "false"
run "validator accepts a mismatched ending" $F tests/contract/branching-principles.test.js "validator"
F=lessons/humanities-decisions.lesson.json
mut $F '"to": "t_tarde", "principle_tag": "comparacao_tardia"' '"to": "t_sem_grupo", "principle_tag": "comparacao_tardia"'
run "late comparison routed to the no-comparison ending" $F tests/contract/branching-principles.test.js "every path enters"
mut $F '"principle": "Chamar um resultado contrário de ano atípico' '"principle": "Um grupo escolhido pelo pior ano tende a melhorar sozinho (regressão à média). Chamar um resultado contrário de ano atípico'
run "excuse ending teaches regression to the mean" $F tests/contract/branching-principles.test.js "Sofia reproduced"
F=harness/case-diagram.js
mut $F "      (cols[d] || []).sort((a, b) => bary[a] - bary[b]);" ""
run "case figure keeps insertion order (6 crossings)" $F tests/contract/artifacts.test.js "no two choices"

if [ -s "$LOG.misfire" ]; then echo "replace misfires:"; cat "$LOG.misfire"; fi
rm -f "$LOG" "$LOG.misfire"
echo "wave2 mutants: $killed killed, $survivors survived or misfired"
[ $survivors -eq 0 ]
