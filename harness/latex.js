/*
 * JSON -> LaTeX for any schema-1.0 lesson (the intended print path for the study PDF; card t_fd19236f C).
 * The source targets pdfLaTeX (local TeX Live or environment/Dockerfile.tex). Before optional compilation,
 * checkLatex() checks character mappings, balanced environments and braces, and the supported packages.
 * Figures: plots are TikZ drawn from plot_spec alone (same marks as ProcedurePlots.renderSpec); the case figure
 * uses the same layout as harness/case-diagram.js.
 */
'use strict';
const E = require('./procedure-engine.js');
const Plots = require('./plots.js');
const Spec = require('./formats/fmt-data-visual-lab/procedure-spec.js');
const Case = require('./case-diagram.js');
const { sourceLine, sourceLabel, hasUnverified } = require('./slides.js');

// Packages used below and the Debian package that ships each one in the container (environment/Dockerfile.tex).
const CONTAINER_PACKAGES = {
  inputenc: 'texlive-latex-base', fontenc: 'texlive-latex-base', lmodern: 'lmodern', babel: 'texlive-latex-base',
  geometry: 'texlive-latex-recommended', amsmath: 'texlive-latex-base', amssymb: 'texlive-fonts-recommended',
  xcolor: 'texlive-latex-recommended', booktabs: 'texlive-latex-recommended', array: 'texlive-latex-base',
  longtable: 'texlive-latex-base', enumitem: 'texlive-latex-extra', tcolorbox: 'texlive-latex-extra', tikz: 'texlive-pictures',
  microtype: 'texlive-latex-recommended', hyperref: 'texlive-latex-recommended', fancyhdr: 'texlive-latex-base'
};
// Characters outside Latin-1 that the lessons use, as LaTeX (math or text mode).
const UNICODE = {
  'σ': '$\\sigma$', 'μ': '$\\mu$', 'α': '$\\alpha$', 'Σ': '$\\Sigma$', 'π': '$\\pi$', '√': '$\\surd$', '≠': '$\\neq$', '≤': '$\\leq$', '≥': '$\\geq$',
  '→': '$\\rightarrow$', '⇒': '$\\Rightarrow$', '−': '$-$', '×': '$\\times$', '÷': '$\\div$', '±': '$\\pm$', '·': '$\\cdot$', '≈': '$\\approx$',
  '₀': '$_0$', '₁': '$_1$', '₂': '$_2$', '²': '$^2$', '³': '$^3$', 'x̄': '$\\bar{x}$', 'p̂': '$\\hat{p}$', '̄': '', '̂': '',
  '“': '``', '”': "''", '‘': '`', '’': "'", '–': '--', '—': '---', '…': '\\ldots{}', '•': '\\textbullet{}', ' ': '~', ' ': '\\,'
};
const SPECIAL = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', '$': '\\$', '&': '\\&', '#': '\\#', '^': '\\^{}', '_': '\\_', '%': '\\%', '~': '\\textasciitilde{}', '<': '\\textless{}', '>': '\\textgreater{}', '|': '\\textbar{}' };

/** Escape learner text for LaTeX: specials first, then the Unicode map (combining marks after their letter). */
function tex(s) {
  let out = '';
  const chars = Array.from(String(s).normalize('NFC'));
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], next = chars[i + 1];
    if ((c === 'x' || c === 'p') && (next === '̄' || next === '̂')) { out += UNICODE[c + next]; i++; continue; }
    const prev = chars[i - 1];
    // A straight double quote is a babel shorthand in Portuguese (it swallows what follows): print it as an
    // opening or closing quotation mark, by position.
    if (c === '"') { out += prev === undefined || /[\s(\[]/.test(prev) ? '``' : "''"; continue; }
    // A hyphen that starts a number is a minus sign ("-3,000"); inside a word or a page range it stays a hyphen.
    if (c === '-' && next !== undefined && /\d/.test(next) && (prev === undefined || /[\s(=\/]/.test(prev))) { out += '$-$'; continue; }
    if (SPECIAL[c]) out += SPECIAL[c];
    else if (UNICODE[c] !== undefined) out += UNICODE[c];
    else out += c;
  }
  return out;
}

const objText = o => (typeof o === 'string' ? o : o.text);
const f2 = n => Number(n).toFixed(2);

/** TikZ figure from a plot_spec (no lesson reads): curve, tails, critical lines, statistic or interval. */
function tikzFromSpec(spec) {
  const crit = spec.marks.find(m => m.role === 'critical'), stat = spec.marks.find(m => m.role === 'statistic');
  const ext = Math.max(4, Math.ceil((stat ? Math.abs(stat.value) : 0) + 0.6));
  const pdf = spec.dist === 't' ? x => Plots.tpdf(x, spec.df) : Plots.zpdf;
  const X = x => (x + ext) / (2 * ext) * 12, Y = y => y / 0.42 * 4;
  const pts = (a, b, density = pdf) => Array.from({ length: 61 }, (_, i) => { const x = a + (b - a) * i / 60; return `(${f2(X(x))},${f2(Y(density(x)))})`; }).join(' -- ');
  // One unbreakable block: a page break must not separate the curve from its caption and description.
  const out = ['\\par\\noindent\\begin{minipage}{\\linewidth}', '\\begin{center}\\begin{tikzpicture}[font=\\small]'];
  out.push(`\\fill[verde!20] (${f2(X(-crit.value))},0) -- ${pts(-crit.value, crit.value)} -- (${f2(X(crit.value))},0) -- cycle;`);
  out.push(`\\fill[vermelho!20] (${f2(X(-ext))},0) -- ${pts(-ext, -crit.value)} -- (${f2(X(-crit.value))},0) -- cycle;`);
  out.push(`\\fill[vermelho!20] (${f2(X(crit.value))},0) -- ${pts(crit.value, ext)} -- (${f2(X(ext))},0) -- cycle;`);
  if (spec.dist === 't' && spec.overlay_normal) {
    out.push(`\\draw[gray,dashed] ${pts(-ext, ext, Plots.zpdf)};`);
    out.push('\\node[anchor=south east,gray,font=\\footnotesize] at (12.3,4.95) {Tracejado: normal Z};');
  }
  out.push(`\\draw[azul,thick] ${pts(-ext, ext)};`);
  out.push('\\draw[->] (0,0) -- (12.3,0);');
  for (const s of [-1, 1]) out.push(`\\draw[vermelho,dashed] (${f2(X(s * crit.value))},0) -- (${f2(X(s * crit.value))},4.2) node[above] {${s < 0 ? '$-$' : '$+$'}${tex(crit.label)}};`);
  out.push(`\\node[anchor=south west] at (0,4.95) {\\textbf{${spec.dist === 't' ? `Curva t de Student, gl = ${Math.round(spec.df)}` : 'Curva normal padrão (Z)'}}};`);
  if (stat) {
    const x = X(Math.max(-ext, Math.min(ext, stat.value)));
    out.push(`\\draw[laranja,very thick] (${f2(x)},0) -- (${f2(x)},3.2) node[above] {${tex(spec.axis.x)} = ${tex(stat.label)}};`);
  }
  out.push('\\end{tikzpicture}\\end{center}');
  if (spec.kind === 'interval') {
    const m = r => spec.marks.find(k => k.role === r);
    out.push(`\\begin{center}Intervalo de 95\\%: de \\textbf{${tex(m('lower').label)}} a \\textbf{${tex(m('upper').label)}}${spec.axis.unit ? ` ${tex(spec.axis.unit)}` : ''}; centro ${tex(spec.axis.x)} = ${tex(m('center').label)}; margem E = ${tex(m('margin').label)}.\\end{center}`);
  }
  out.push(`\\par\\small\\textit{Descrição da figura: ${tex(spec.alt.summary)}}\\normalsize`, '\\end{minipage}\\par');
  return out.join('\n');
}

function tikzCase(graph) {
  const d = Case.render(graph), L = d.layout, sx = 15 / L.width, sy = 8 / L.height;
  const color = { best: 'verde', partial: 'laranja', weak: 'vermelho' }, style = { best: 'thick', partial: 'thick,dash pattern=on 5pt off 3pt', weak: 'thick,dotted' };
  const bw = L.box.w;
  const at = id => L.nodes.find(n => n.id === id);
  const out = ['\\begin{center}\\begin{tikzpicture}[font=\\small]'];
  // Same curves as the SVG: own exit/entry offsets per choice, bend away from the boxes between, arrow at the end.
  const P = (x, y) => `(${f2(x * sx)},${f2((L.height - y) * sy)})`;
  for (const e of L.edges) {
    const pts = e.points, segs = pts.slice(1).map((q, i) => { const p = pts[i], k = Math.max(30, (q.x - p.x) * 0.45); return ` .. controls ${P(p.x + k, p.y)} and ${P(q.x - k, q.y)} .. ${P(q.x, q.y)}`; });
    out.push(`\\draw[->,${color[e.kind]},${style[e.kind]}] ${P(pts[0].x, pts[0].y)}${segs.join('')};`);
  }
  for (const n of L.nodes) out.push(`\\node[draw=azul,fill=${n.terminal ? 'cinza' : 'white'},rounded corners,minimum width=${f2(bw * sx)}cm,minimum height=0.6cm,anchor=west] at (${f2(n.x * sx)},${f2((L.height - n.y) * sy)}) {\\textbf{${tex(n.label)}}};`);
  out.push('\\end{tikzpicture}\\end{center}');
  out.push(`\\par\\small\\textit{Descrição da figura: ${tex(d.alt)}}\\normalsize`);
  out.push('\\begin{description}' + d.legend.map(l => `\\item[${tex(l.label)}] ${tex(l.text)}`).join('\n') + '\\end{description}');
  out.push('\\begin{longtable}{p{7.2cm}p{1.1cm}p{1.3cm}p{5cm}}\\toprule Escolhas & Final & Pontos & Princípio \\\\ \\midrule\\endhead');
  for (const p of d.paths) out.push(`${tex(p.steps.join(' → '))} & ${tex(p.ending)} & ${p.score.earned} de ${p.score.max} & ${tex(p.principle)} \\\\\\addlinespace`);
  out.push('\\bottomrule\\end{longtable}');
  return out.join('\n');
}

function preamble(lesson) {
  const pt = (lesson.language || '').startsWith('pt');
  return [
    '\\documentclass[11pt,a4paper]{article}', '\\usepackage[utf8]{inputenc}', '\\usepackage[T1]{fontenc}', '\\usepackage{lmodern}',
    `\\usepackage[${pt ? 'brazil' : 'english'}]{babel}`, '\\usepackage{microtype}', '\\usepackage[margin=2.2cm]{geometry}', '\\usepackage{amsmath,amssymb}',
    '\\usepackage{xcolor}', '\\usepackage{booktabs,array,longtable}', '\\usepackage{enumitem}', '\\usepackage[most]{tcolorbox}', '\\usepackage{tikz}',
    '\\usepackage{fancyhdr}', '\\usepackage[hidelinks]{hyperref}',
    '\\setlength{\\parindent}{0pt}\\setlength{\\parskip}{6pt}',
    '\\definecolor{azul}{HTML}{1D4B6E}\\definecolor{verde}{HTML}{2F7A4F}\\definecolor{laranja}{HTML}{B35400}\\definecolor{vermelho}{HTML}{9A2B1B}\\definecolor{cinza}{HTML}{F1F5F8}',
    '\\pagestyle{fancy}\\fancyhf{}\\cfoot{\\thepage}',
    `\\newtcolorbox{enunciado}{colback=cinza,colframe=azul,fonttitle=\\bfseries,title=${pt ? 'Enunciado' : 'Problem'},breakable}`,
    `\\newtcolorbox{traducao}{colback=white,colframe=laranja!80,fonttitle=\\bfseries,title=${pt ? 'Traduzindo para o dia a dia' : 'In plain words'},breakable}`,
    '\\newtcolorbox{passo}[1]{colback=white,colframe=azul!70,fonttitle=\\bfseries,title={#1},breakable=false}',
    `\\newtcolorbox{interpreta}{colback=laranja!6,colframe=laranja,fonttitle=\\bfseries,title=${pt ? 'Interpretação em linguagem simples' : 'Interpretation'}}`,
    `\\newtcolorbox{cuidado}{colback=vermelho!5,colframe=vermelho,fonttitle=\\bfseries,title=${pt ? 'Cuidado! Erro comum' : 'Common mistake'}}`,
    `\\newtcolorbox{lembrar}{colback=verde!6,colframe=verde,fonttitle=\\bfseries,title={${pt ? 'Tente lembrar, sem olhar' : 'Recall without looking'}}}`,
    `\\newtcolorbox{rascunho}{colback=laranja!8,colframe=laranja,fonttitle=\\bfseries,title=${pt ? 'Rascunho feito a partir de um pedido curto' : 'Draft from a short brief'},breakable}`
  ].join('\n');
}

function procedureBody(lesson) {
  const out = [];
  if (lesson.decision_map && lesson.decision_map.rows.length) {
    out.push(`\\section*{Mapa de decisão: qual método eu uso?}`, '\\begin{longtable}{@{}p{2.6cm}p{2.4cm}p{4.6cm}p{5.6cm}@{}}\\toprule Pede & Sobre & Condição & Método \\\\ \\midrule\\endhead');
    for (const r of lesson.decision_map.rows) out.push(`${tex(r.asks)} & ${tex(r.of)} & ${tex(r.condition)} & ${tex((lesson.methods.find(m => m.id === r.method) || {}).label || r.method)} \\\\`);
    out.push('\\bottomrule\\end{longtable}');
  }
  for (const ex of lesson.exercises) {
    const solved = E.solve(lesson, ex, E.originalVariables(ex));
    out.push(`\\section{${tex(ex.title)}}`, `\\begin{enunciado}${tex(ex.original_statement)}\\end{enunciado}`, `\\begin{traducao}${tex(E.renderTemplate(lesson, ex, solved, ex.translation_template))}\\end{traducao}`);
    for (const s of ex.steps) out.push(`\\begin{passo}{${tex(s.title)}}${tex(E.renderTemplate(lesson, ex, solved, s.worked))}\\end{passo}`);
    if (ex.plot) out.push(tikzFromSpec(Spec.plotSpecFor(lesson, ex, solved)));
    out.push(`\\begin{interpreta}${tex(E.renderTemplate(lesson, ex, solved, ex.interpretation_template))}\\end{interpreta}`);
    if ((ex.common_mistakes || []).length) out.push(`\\begin{cuidado}\\begin{itemize}${ex.common_mistakes.map(m => `\\item ${tex(E.renderTemplate(lesson, ex, solved, m))}`).join('\n')}\\end{itemize}\\end{cuidado}`);
  }
  const c = lesson.conventions || {};
  out.push('\\section*{Convenções}', `\\begin{itemize}${[c.rounding_rule, c.decision_rule].filter(Boolean).map(t => `\\item ${tex(t)}`).join('\n')}\\end{itemize}`);
  return out.join('\n');
}

// Every printed occurrence of an unverified claim carries the flag (heading, paragraph, glossary definition,
// recall answer): tests/contract/unverified-flags.test.js checks each line and item.
const FLAG_TEX = ' \\textcolor{vermelho}{(afirmação não verificada)}';

function declarativeBody(lesson) {
  const st = lesson.study, out = [];
  if (st.intro) out.push(tex(st.intro));
  const answers = [];
  for (const sec of st.sections) {
    const flag = hasUnverified(lesson, sec.claim_ids) ? FLAG_TEX : '';
    out.push(`\\section{${tex(sec.title)}${flag}}`, ...sec.paragraphs.map(p => tex(p) + flag));
    const src = sourceLine(lesson, sec.claim_ids);
    if (src.length) out.push(`{\\small Fontes: ${tex(src.join('; '))}.}`);
    if (sec.retrieval) { out.push(`\\begin{lembrar}${tex(sec.retrieval.prompt)} \\emph{(resposta no fim)}\\end{lembrar}`); answers.push([sec.title, sec.retrieval.answer, flag]); }
  }
  const caseItem = ((lesson.practice || {}).units || []).flatMap(u => u.items).find(i => i.format === 'fmt-branching-case');
  if (caseItem) out.push('\\section{O caso em uma figura}', tikzCase(caseItem.payload.graph));
  if ((st.glossary || []).length) out.push('\\section*{Glossário}', '\\begin{description}' + st.glossary.map(g => `\\item[${tex(g.term)}] ${tex(g.definition)}${hasUnverified(lesson, g.claim_ids) ? FLAG_TEX : ''}`).join('\n') + '\\end{description}');
  if ((st.summary || []).length) out.push('\\section*{Para lembrar}', `\\begin{itemize}${st.summary.map(s => `\\item ${tex(s)}`).join('\n')}\\end{itemize}`);
  if (answers.length) out.push('\\section*{Respostas do ``Tente lembrar\'\'}', '\\begin{description}' + answers.map(([q, a, flag]) => `\\item[${tex(q)}] ${tex(a)}${flag}`).join('\n') + '\\end{description}');
  return out.join('\n\n');
}

function slidesPracticeBody(lesson) {
  const out = [];
  for (const s of lesson.slides) out.push(`\\section{${tex(s.title)}}`, tex(s.body), `\\begin{lembrar}${tex(s.retrieval_prompt)}\\end{lembrar}`);
  for (const ex of lesson.exercises) {
    out.push(`\\section{${tex(ex.statement)}}`, tex(ex.translation));
    for (const s of ex.steps) out.push(`\\begin{passo}{${tex(s.prompt)}}${tex(s.worked_solution)}\\end{passo}`);
    out.push(`\\begin{interpreta}${tex(ex.interpretation)}\\end{interpreta}`);
  }
  return out.join('\n\n');
}

function renderLatex(lesson) {
  if (lesson.schema_version !== '1.0') throw new Error('renderLatex needs a schema 1.0 lesson (run scripts/harness.py normalize first)');
  // The article title block reserves room for an author and a date this guide does not print; the negative
  // space returns it, which keeps short lessons from spilling one heading onto a last page.
  const head = [`\\title{\\vspace{-1.6cm}${tex(lesson.title)}}`, '\\author{}', '\\date{\\vspace{-1.6cm}}', '\\begin{document}', '\\maketitle', '\\thispagestyle{fancy}',
    `\\section*{${(lesson.language || '').startsWith('pt') ? 'Objetivos' : 'Objectives'}}`, `\\begin{itemize}${lesson.objectives.map(o => `\\item ${tex(objText(o))}`).join('\n')}\\end{itemize}`];
  if (lesson.brief) head.push(`\\begin{rascunho}Antes de usar, confira as suposições e as afirmações não verificadas.\\par\\textbf{Suposições}\\begin{itemize}${lesson.brief.assumptions.map(a => `\\item ${tex(a)}`).join('\n')}\\end{itemize}\\textbf{Afirmações não verificadas}\\begin{itemize}${(lesson.brief.unverified_claims.length ? lesson.brief.unverified_claims : ['Nenhuma.']).map(a => `\\item ${tex(a)}`).join('\n')}\\end{itemize}\\end{rascunho}`);
  const body = lesson.kind === 'ordered-procedure' ? procedureBody(lesson) : lesson.kind === 'declarative-case' ? declarativeBody(lesson) : slidesPracticeBody(lesson);
  const sources = [`\\section*{${(lesson.language || '').startsWith('pt') ? 'Fontes' : 'Sources'}}`, `\\begin{itemize}${(lesson.sources || []).map(s => `\\item ${tex(sourceLabel(s, lesson.language))}`).join('\n')}\\end{itemize}`];
  return [preamble(lesson), ...head, body, ...sources, '\\end{document}', ''].join('\n');
}

/** Dry-run checks for a .tex source (no TeX engine): problems[] (empty = ready for the container). */
function checkLatex(src) {
  const problems = [];
  const odd = [...new Set(Array.from(src).filter(c => c.codePointAt(0) > 0xff))];
  if (odd.length) problems.push(`characters outside Latin-1 with no LaTeX mapping: ${odd.map(c => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ${c}`).join(', ')}`);
  const stack = [];
  for (const m of src.matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
    if (m[1] === 'begin') stack.push(m[2]);
    else if (stack.pop() !== m[2]) { problems.push(`\\end{${m[2]}} does not close the open environment`); break; }
  }
  if (stack.length) problems.push(`unclosed environments: ${stack.join(', ')}`);
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === '{') depth++; else if (src[i] === '}') depth--;
    if (depth < 0) { problems.push(`unbalanced } at offset ${i}`); break; }
  }
  if (depth > 0) problems.push(`${depth} unclosed {`);
  for (const m of src.matchAll(/\\usepackage(?:\[[^\]]*\])?\{([^}]+)\}/g)) for (const p of m[1].split(',')) if (!CONTAINER_PACKAGES[p.trim()]) problems.push(`package ${p.trim()} is not installed by environment/Dockerfile.tex`);
  return problems;
}

module.exports = { renderLatex, checkLatex, tex, tikzFromSpec, CONTAINER_PACKAGES };
