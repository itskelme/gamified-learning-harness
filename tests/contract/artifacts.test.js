// One lesson model, every artifact (ACCEPTANCE line 19; card t_fd19236f B and C): slides, the study guide, the
// LaTeX source and the case figure are derived from the same 1.0 lesson as the package and the step player.
// - slides: every exercise gets problem/steps/conclusion slides; figures are the SAME SVG the plot_spec renderer
//   and the case renderer give; recall answers come from the lesson (no text written for one lesson only);
// - case figure: one edge per choice, no edge crosses a box it does not join, edges meeting at a box enter apart;
// - LaTeX: escaping, the dry-run checker (which must catch each defect it exists for), every lesson passes;
// - study guide: drafts carry the assumptions banner and the unverified flags exactly where the claims are used.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const E = require('../../harness/procedure-engine.js');
const Plots = require('../../harness/plots.js');
const Spec = require('../../harness/formats/fmt-data-visual-lab/procedure-spec.js');
const Case = require('../../harness/case-diagram.js');
const BRA = require('../../harness/formats/fmt-branching-case/grader.js');
const { buildDeck, TEXT } = require('../../harness/slides.js');
const { renderStudyGuide } = require('../../harness/study-guide.js');
const { renderLatex, checkLatex, tex, tikzFromSpec } = require('../../harness/latex.js');
const Brief = require('../../harness/brief/brief.js');
const stub = require('../../harness/brief/stub-provider.js');

function normalize(rel) {
  const r = spawnSync(process.env.PYTHON || 'python3', ['-I', path.join(ROOT, 'scripts/harness.py'), 'normalize', path.join(ROOT, rel)], { encoding: 'utf8', maxBuffer: 64 << 20 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout).lesson;
}
const LESSONS = {
  prova3: normalize('lessons/prova3-statistics.lesson.json'),
  teste: normalize('lessons/teste-z-uma-media.lesson.json'),
  humanities: normalize('lessons/humanities-decisions.lesson.json'),
  stem: normalize('examples/stem.lesson.json'),
  draft: Brief.draftLesson(JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/briefs/vies-de-sobrevivencia.brief.json'), 'utf8')), stub)
};
const caseGraph = l => l.practice.units.flatMap(u => u.items).find(i => i.format === 'fmt-branching-case').payload.graph;

// ------------------------------------------------------------------ slides
test('slides: every procedure exercise gets problem, steps and conclusion slides; plot figures are the plot_spec SVG', () => {
  for (const key of ['prova3', 'teste']) {
    const L = LESSONS[key], deck = buildDeck(L);
    for (const ex of L.exercises) {
      for (const part of ['problema', 'passos', 'conclusao']) assert.ok(deck.slides.some(s => s.id === `${ex.id}-${part}`), `${key} ${ex.id}-${part}`);
      const fig = deck.slides.find(s => s.id === `${ex.id}-passos`).figure;
      if (ex.plot) assert.equal(fig.svg, Plots.renderSpec(Spec.plotSpecFor(L, ex, E.solve(L, ex, E.originalVariables(ex)))).svg, `${key} ${ex.id}: same SVG as renderSpec(plot_spec)`);
      else assert.equal(fig, null);
    }
  }
});

test('slides: every recall prompt has an answer drawn from the lesson; nothing written for Prova 3 leaks into another lesson', () => {
  for (const [key, L] of Object.entries(LESSONS)) {
    const deck = buildDeck(L);
    for (const s of deck.slides) if (s.retrieval) { assert.ok(s.retrieval.prompt.trim(), `${key}/${s.id} prompt`); assert.ok(s.retrieval.answer.trim(), `${key}/${s.id} answer`); }
    if (key !== 'prova3') assert.doesNotMatch(JSON.stringify(deck), /Prova 3|PDF p\.|entre Z e t/, key);
  }
  // The decision-map answer names each row's method (derived), for Prova 3's five rows.
  const mapa = buildDeck(LESSONS.prova3).slides.find(s => s.id === 'mapa');
  for (const r of LESSONS.prova3.decision_map.rows) assert.ok(mapa.retrieval.answer.includes(LESSONS.prova3.methods.find(m => m.id === r.method).label), r.method);
});

test('slides: the case figure is the case renderer\'s SVG and the paths table lists every allPaths path', () => {
  const L = LESSONS.humanities, deck = buildDeck(L), g = caseGraph(L);
  assert.equal(deck.slides.find(s => s.id === 'caso-arvore').figure.svg, Case.render(g).svg);
  assert.equal(deck.slides.find(s => s.id === 'caso-caminhos').table.rows.length, BRA.allPaths(g).length);
});

test('slides: language follows the lesson (English chrome for an English lesson), drafts open with assumptions and unverified claims', () => {
  assert.deepEqual(buildDeck(LESSONS.stem).ui, TEXT.en.ui);
  assert.deepEqual(buildDeck(LESSONS.humanities).ui, TEXT.pt.ui);
  const deck = buildDeck(LESSONS.draft), d = deck.slides[1];
  assert.equal(d.id, 'rascunho');
  for (const a of LESSONS.draft.brief.assumptions) assert.ok(d.list.includes(`Suposição: ${a}`), a);
  for (const u of LESSONS.draft.brief.unverified_claims) assert.ok(d.list.includes(`Não verificada: ${u}`), u);
  // Flags sit exactly on the sections whose claims are unverified.
  const claims = Object.fromEntries(LESSONS.draft.claims.map(c => [c.id, c]));
  for (const sec of LESSONS.draft.study.sections) {
    const want = sec.claim_ids.some(id => claims[id].status === 'unverified');
    assert.equal(deck.slides.find(s => s.id === sec.id).unverified, want, sec.id);
  }
  assert.ok(deck.slides.some(s => s.unverified) && deck.slides.some(s => s.unverified === false), 'the example draft has both kinds of section');
});

// ------------------------------------------------------------------ case figure
function samples(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1], q = points[i], k = Math.max(30, (q.x - p.x) * 0.45);
    const c1 = { x: p.x + k, y: p.y }, c2 = { x: q.x - k, y: q.y };
    for (let t = 0; t <= 1.0001; t += 0.02) {
      const u = 1 - t;
      out.push({ x: u * u * u * p.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * q.x, y: u * u * u * p.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * q.y });
    }
  }
  return out;
}
function figureProblems(g) {
  const d = Case.render(g), L = d.layout, problems = [];
  const choices = Object.values(g.nodes).reduce((n, x) => n + Object.keys(x.choices || {}).length, 0);
  if (L.edges.length !== choices) problems.push(`${L.edges.length} edges for ${choices} choices`);
  for (const e of L.edges) {
    for (const n of L.nodes) {
      if (n.id === e.from || n.id === e.to) continue;
      const hit = samples(e.points).find(p => p.x > n.x - 4 && p.x < n.x + L.box.w + 4 && Math.abs(p.y - n.y) < L.box.h / 2 + 4);
      if (hit) problems.push(`${e.from}->${e.to} (${e.choice}) crosses ${n.label}`);
    }
  }
  const ends = {};
  for (const e of L.edges) { const p = e.points[e.points.length - 1]; (ends[e.to] = ends[e.to] || []).push(p.y); }
  for (const [id, ys] of Object.entries(ends)) { const s = [...ys].sort((a, b) => a - b); for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] < 8) problems.push(`edges into ${id} enter less than 8 px apart`); }
  return problems;
}

test('case figure: one edge per choice, no edge crosses a box it does not join, edges into one box enter apart', () => {
  assert.deepEqual(figureProblems(caseGraph(LESSONS.humanities)), []);
  // AF-BRA-01 reference graph (tests/contract/formats.test.js): three parallel choices n1 -> n2 must stay three lines.
  const AF_BRA_01 = { start: 'n1', nodes: {
    n1: { text: 'n1', choices: { a: { text: 'a', to: 'n2', quality: 0 }, b: { text: 'b', to: 'n2', quality: 2 }, c: { text: 'c', to: 'n2', quality: 0 } } },
    n2: { text: 'n2', choices: { a: { text: 'a', to: 't_good', quality: 2 }, b: { text: 'b', to: 't_weak', quality: 0 } } },
    t_good: { terminal: true, principle: 'p' }, t_weak: { terminal: true, principle: 'p' } } };
  assert.deepEqual(figureProblems(AF_BRA_01), [], 'AF-BRA-01 graph');
});

// Edge crossings between choices that share no box (straight segments through the layout points). With seven
// endings the insertion order crossed 6 pairs (t_fd19236f round 2 visual pass); the barycenter order crosses none.
function edgeCrossings(L) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const segX = (a, b, c, d) => o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  const segs = e => e.points.slice(1).map((q, i) => [e.points[i], q]);
  const out = [];
  L.edges.forEach((e, i) => L.edges.slice(i + 1).forEach(f => {
    if ([e.from, e.to].some(x => x === f.from || x === f.to)) return;
    if (segs(e).some(([a, b]) => segs(f).some(([c, d]) => segX(a, b, c, d)))) out.push(`${e.from}.${e.choice} x ${f.from}.${f.choice}`);
  }));
  return out;
}

test('case figure: no two choices that share no box cross each other; each ending sits next to its situations', () => {
  const d = Case.render(caseGraph(LESSONS.humanities));
  assert.deepEqual(edgeCrossings(d.layout), []);
  const yOf = id => d.layout.nodes.find(n => n.id === id).y;
  // F labels follow the drawn order from the top, so the legend and the path table read in the figure's order.
  const ends = d.layout.nodes.filter(n => n.terminal).sort((a, b) => a.y - b.y).map(n => n.label);
  assert.deepEqual(ends, ends.map((_, i) => `F${i + 1}`));
  assert.ok(yOf('t_confirmacao') > yOf('t_tarde'), 'the confirmation-bias ending is below the late-comparison ending, like their situations');
});

test('case figure: the SVG says what the line styles mean, in a drawn key and in the text alternative', () => {
  const d = Case.render(caseGraph(LESSONS.humanities));
  for (const word of ['melhor escolha', 'escolha parcial', 'escolha fraca']) assert.ok(d.svg.includes(`>${word}</text>`), word);
  assert.match(d.alt, /11 caminhos possíveis/);
  assert.match(d.svg, /role="img" aria-label="/);
  // WCAG 1.4.11: each line colour has 3:1 or more against the white figure background; the dash pattern differs too.
  const lum = hex => { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const strokes = [...new Set([...d.svg.matchAll(/<path d="M[^"]*" fill="none" stroke="(#[0-9a-f]{6})"/g)].map(m => m[1]))];
  assert.equal(strokes.length, 3);
  for (const s of strokes) assert.ok(1.05 / (lum(s) + 0.05) >= 3, `${s}: ${(1.05 / (lum(s) + 0.05)).toFixed(2)}:1`);
  assert.equal(new Set([...d.svg.matchAll(/stroke-dasharray="([^"]+)"/g)].map(m => m[1])).size, 2, 'partial and weak have different dash patterns (best is solid)');
});

// ------------------------------------------------------------------ LaTeX
test('LaTeX: learner text is escaped (specials, Greek, combining bars, subscripts)', () => {
  assert.equal(tex('50% de $10 & #1_x{a}'), '50\\% de \\$10 \\& \\#1\\_x\\{a\\}');
  assert.equal(tex('x̄ ≠ μ₀'), '$\\bar{x}$ $\\neq$ $\\mu$$_0$');
  // Found on the compiled pages (2026-11-19): straight quotes are a babel shorthand in Portuguese and printed
  // glued to the next word; a hyphen in front of a number printed as a hyphen, not a minus sign.
  assert.equal(tex('"A média caiu" é um fato ("medido").'), "``A média caiu'' é um fato (``medido'').");
  assert.equal(tex('Z = -3/1,000 = -3,000 (-1,96)'), 'Z = $-$3/1,000 = $-$3,000 ($-$1,96)');
  assert.equal(tex('p. 259-267, pré-requisito, 2024-01 e x - 3'), 'p. 259-267, pré-requisito, 2024-01 e x - 3');
  assert.equal(tex('a < b > c | d ~ e ^ f \\ g'), 'a \\textless{} b \\textgreater{} c \\textbar{} d \\textasciitilde{} e \\^{} f \\textbackslash{} g');
});

test('LaTeX dry run: every lesson\'s source passes, and the checker catches each defect it exists for', () => {
  for (const [key, L] of Object.entries(LESSONS)) assert.deepEqual(checkLatex(renderLatex(L)), [], key);
  const ok = renderLatex(LESSONS.teste);
  assert.match(checkLatex(ok.replace('\\section', 'ψ\\section')).join(), /outside Latin-1/);
  assert.match(checkLatex(ok.replace(/\\end\{itemize\}/, '')).join(), /does not close|unclosed environments/);
  assert.match(checkLatex(ok.replace('\\usepackage{microtype}', '\\usepackage{minted}')).join(), /package minted is not installed/);
  assert.match(checkLatex(ok.replace('\\begin{document}', '\\begin{document}{')).join(), /unclosed \{/);
});

test('LaTeX: plot figures come from plot_spec (the TikZ figure prints the same mark labels as renderSpec)', () => {
  const L = LESSONS.prova3;
  for (const ex of L.exercises.filter(e => e.plot)) {
    const spec = Spec.plotSpecFor(L, ex, E.solve(L, ex, E.originalVariables(ex))), t = tikzFromSpec(spec);
    for (const m of spec.marks.filter(k => ['critical', 'statistic', 'lower', 'upper'].includes(k.role))) assert.ok(t.includes(tex(m.label)), `${ex.id} ${m.role} ${m.label}`);
    assert.ok(t.includes(tex(spec.alt.summary)), `${ex.id} figure description`);
    assert.equal(t.includes('\\draw[gray,dashed]'), spec.dist === 't' && spec.overlay_normal, ex.id);
    assert.equal(t.includes('Tracejado: normal Z'), spec.dist === 't' && spec.overlay_normal, ex.id);
  }
  // An edited spec is drawn as edited (the TikZ figure reads nothing but the spec): critical value, labels and df.
  const ex = L.exercises.find(e => e.plot);
  const spec = JSON.parse(JSON.stringify(Spec.plotSpecFor(L, ex, E.solve(L, ex, E.originalVariables(ex)))));
  const crit = spec.marks.find(m => m.role === 'critical');
  crit.value = 2.5; crit.label = '2,500';
  spec.dist = 't'; spec.df = 17;
  const t = tikzFromSpec(spec);
  assert.ok(t.includes('$+$2,500') && t.includes('$-$2,500'), 'edited critical label drawn on both sides');
  assert.ok(t.includes('gl = 17'), 'edited df drawn');
  const X = x => ((x + 4) / 8 * 12).toFixed(2);
  assert.ok(t.includes(`(${X(2.5)},0) -- (${X(2.5)},4.2)`), 'critical line at the edited value');
});

test('LaTeX: a brief draft prints the assumptions box and flags each unverified section', () => {
  const src = renderLatex(LESSONS.draft);
  assert.match(src, /\\begin\{rascunho\}/);
  for (const a of LESSONS.draft.brief.assumptions) assert.ok(src.includes(tex(a)), a);
  // Section headings only; every other printed occurrence is checked in tests/contract/unverified-flags.test.js.
  const flagged = (src.match(/\\section\{[^\n]*\\textcolor\{vermelho\}\{\(afirmação não verificada\)\}\}/g) || []).length;
  const claims = Object.fromEntries(LESSONS.draft.claims.map(c => [c.id, c]));
  assert.equal(flagged, LESSONS.draft.study.sections.filter(s => s.claim_ids.some(id => claims[id].status === 'unverified')).length);
});

// ------------------------------------------------------------------ study guide
test('study guide: script-free, CSP-locked; a draft carries the banner and flags only the unverified sections', () => {
  const html = renderStudyGuide(LESSONS.draft);
  assert.doesNotMatch(html, /<script/i);
  assert.match(html, /Content-Security-Policy" content="default-src 'none'/);
  for (const a of LESSONS.draft.brief.assumptions) assert.ok(html.includes(a.replace(/&/g, '&amp;')), a);
  const claims = Object.fromEntries(LESSONS.draft.claims.map(c => [c.id, c]));
  for (const sec of LESSONS.draft.study.sections) {
    const h2 = html.match(new RegExp(`<section id="${sec.id}"><h2>([^]*?)</h2>`))[1];
    assert.equal(h2.includes('afirmação não verificada'), sec.claim_ids.some(id => claims[id].status === 'unverified'), sec.id);
  }
  assert.doesNotMatch(renderStudyGuide(LESSONS.humanities), /afirmação não verificada|id="brief"/, 'a verified lesson has no draft marks');
});

test('sources are named for a learner: an author-created example never prints its internal title', () => {
  const html = renderStudyGuide(LESSONS.stem);
  assert.doesNotMatch(html, /recomputed in the harness tests/);
  assert.match(html, /Worked example written for this lesson\./);
});
