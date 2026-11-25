/*
 * Linked statistical plots for the ordered-procedure format.
 *
 * Two entry points share one drawing model:
 * - render(lesson, exercise, solved, opts) -> { svg, alt } for the step player. Every mark, label and the text
 *   alternative are computed from `solved` (the engine's answer key for the current data). opts.revealAll shows
 *   every value (study material); opts.revealed (Set of step ids) limits the plot to values the learner has
 *   already produced.
 * - renderSpec(plot_spec, opts) -> { svg, alt } from a plot_spec alone (catalog r3 section 7; built by
 *   harness/formats/fmt-data-visual-lab/procedure-spec.js). It reads no lesson, exercise or engine state:
 *   kind, dist, df, overlay_normal, axis and the labelled marks are all it needs. The package lab and the
 *   study diagrams draw through it; tests/contract/plot-spec-render.test.js checks it equals render(revealAll).
 * Nothing is a raster image.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./procedure-engine.js'));
  else root.ProcedurePlots = factory(root.ProcedureEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  // Layout width: 640 units on wide screens; opts.compact uses 360 units so labels stay legible at 360 px.
  // Set synchronously at the start of each draw; every helper below reads it within that call.
  let W = 640, PAD = 44, COMPACT = false;
  const CURVE_TOP = 34, CURVE_BASE = 196;
  const COLORS = { curve: '#1d4b6e', center: '#cfe3d6', tail: '#f3c6bd', tailText: '#9a2b1b', mark: '#b35400', normal: '#6b7280', axis: '#26302c', bar: '#2f7a4f' };

  function lgamma(x) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  const zpdf = x => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
  const tpdf = (x, df) => Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2)) / Math.sqrt(df * Math.PI) * Math.pow(1 + x * x / df, -(df + 1) / 2);

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f1 = n => n.toFixed(1);

  /*
   * Drawing model: { kind, dist, df, dfLabel, overlay_normal, methodKnown, unit, centerSymbol, statSymbol,
   *   v: { crit, stat, center, margin, lower, upper } raw values used for layout,
   *   label: { ...same ids } display text, known: Set of roles the learner may see }.
   */
  function modelFromLesson(lesson, ex, solved, opts) {
    const plot = ex.plot;
    const revealed = opts.revealAll ? new Set(ex.steps.map(s => s.id)) : (opts.revealed || new Set());
    const fmt = id => {
      const step = ex.steps.find(s => s.id === id);
      const d = step ? step.display_decimals : E.decimalsOf(lesson, ex.id, id);
      return E.formatNumber(solved.values[id], d, lesson.locale);
    };
    const known = id => Object.prototype.hasOwnProperty.call(ex.variables, id) || revealed.has(id);
    const roles = plot.kind === 'interval' ? { crit: plot.crit, center: plot.center, margin: plot.margin, lower: plot.lower, upper: plot.upper } : { crit: plot.crit, stat: plot.stat };
    const m = { kind: plot.kind, dist: plot.dist, overlay_normal: !!plot.overlay_normal, unit: plot.unit || '', centerSymbol: plot.center_symbol, statSymbol: plot.stat_symbol,
      methodKnown: ex.steps.filter(s => s.role === 'method').every(s => revealed.has(s.id)), v: {}, label: {}, known: new Set() };
    m.df = plot.dist === 't' ? solved.values[plot.df] : null;
    m.dfLabel = m.df === null ? null : E.formatNumber(m.df, 0, lesson.locale);
    for (const [role, id] of Object.entries(roles)) {
      m.v[role] = solved.values[id];
      if (known(id)) { m.known.add(role); m.label[role] = fmt(id); }
    }
    return m;
  }
  /** Model from a plot_spec alone (everything revealed: a spec is the full solved view). */
  function modelFromSpec(spec) {
    if (!spec || !Array.isArray(spec.marks)) throw new Error('plot_spec without marks');
    const ROLE = { critical: 'crit', statistic: 'stat', center: 'center', margin: 'margin', lower: 'lower', upper: 'upper' };
    const m = { kind: spec.kind, dist: spec.dist, overlay_normal: !!spec.overlay_normal, unit: (spec.axis && spec.axis.unit) || '',
      centerSymbol: spec.axis && spec.axis.x, statSymbol: spec.axis && spec.axis.x, methodKnown: true, v: {}, label: {}, known: new Set() };
    m.df = spec.dist === 't' ? spec.df : null;
    if (m.dist === 't' && !(typeof m.df === 'number' && Number.isFinite(m.df))) throw new Error('plot_spec: t distribution without df');
    m.dfLabel = m.df === null ? null : String(Math.round(m.df));
    for (const mk of spec.marks) {
      const role = ROLE[mk.role];
      if (!role) continue;
      if (typeof mk.value !== 'number' || !Number.isFinite(mk.value) || typeof mk.label !== 'string') throw new Error(`plot_spec: mark ${mk.id} needs a numeric value and a label`);
      m.v[role] = mk.value; m.label[role] = mk.label; m.known.add(role);
    }
    const need = m.kind === 'interval' ? ['crit', 'center', 'margin', 'lower', 'upper'] : ['crit', 'stat'];
    const missing = need.filter(r => !m.known.has(r));
    if (missing.length) throw new Error(`plot_spec: missing marks ${missing.join(', ')}`);
    return m;
  }

  function curveSvg(m, extent) {
    const df = m.dist === 't' ? m.df : null;
    const pdf = df ? x => tpdf(x, df) : zpdf;
    const yMax = 0.42, sx = x => PAD + (x + extent) / (2 * extent) * (W - 2 * PAD);
    const sy = y => CURVE_BASE - y / yMax * (CURVE_BASE - CURVE_TOP);
    const path = (from, to, fn, closed) => {
      const n = 120, pts = [];
      for (let i = 0; i <= n; i++) { const x = from + (to - from) * i / n; pts.push(`${f1(sx(x))},${f1(sy(fn(x)))}`); }
      return closed ? `M${f1(sx(from))},${CURVE_BASE} L${pts.join(' L')} L${f1(sx(to))},${CURVE_BASE} Z` : `M${pts.join(' L')}`;
    };
    const parts = [];
    const crit = m.known.has('crit') ? m.v.crit : null;
    if (crit !== null) {
      parts.push(`<path d="${path(-crit, crit, pdf, true)}" fill="${COLORS.center}"/>`);
      parts.push(`<path d="${path(-extent, -crit, pdf, true)}" fill="${COLORS.tail}"/>`);
      parts.push(`<path d="${path(crit, extent, pdf, true)}" fill="${COLORS.tail}"/>`);
    }
    if (m.overlay_normal && df) parts.push(`<path d="${path(-extent, extent, zpdf, false)}" fill="none" stroke="${COLORS.normal}" stroke-width="1.5" stroke-dasharray="5 4"/>`);
    parts.push(`<path d="${path(-extent, extent, pdf, false)}" fill="none" stroke="${COLORS.curve}" stroke-width="2.5"/>`);
    parts.push(`<line x1="${PAD}" y1="${CURVE_BASE}" x2="${W - PAD}" y2="${CURVE_BASE}" stroke="${COLORS.axis}"/>`);
    parts.push(`<text x="${f1(sx(0))}" y="${CURVE_BASE + 18}" text-anchor="middle" font-size="13">0</text>`);
    const label = df ? `Curva t de Student, gl = ${m.dfLabel}` : 'Curva normal padrão (Z)';
    parts.push(`<text x="${PAD}" y="20" font-size="14" font-weight="700" fill="${COLORS.curve}">${esc(label)}</text>`);
    if (m.overlay_normal && df && !COMPACT) parts.push(`<text x="${W - PAD}" y="20" text-anchor="end" font-size="12" fill="${COLORS.normal}">tracejado: normal Z, para comparar as caudas</text>`);
    if (crit !== null) {
      const c = m.label.crit;
      for (const sgn of [-1, 1]) {
        parts.push(`<line x1="${f1(sx(sgn * crit))}" y1="${CURVE_TOP}" x2="${f1(sx(sgn * crit))}" y2="${CURVE_BASE + 4}" stroke="${COLORS.tailText}" stroke-width="1.5" stroke-dasharray="3 3"/>`);
        parts.push(`<text x="${f1(sx(sgn * crit))}" y="${CURVE_BASE + 18}" text-anchor="middle" font-size="13" fill="${COLORS.tailText}">${sgn < 0 ? '−' : '+'}${esc(c)}</text>`);
      }
      const mid = m.kind === 'test' ? 'NÃO rejeito H0' : '95% no meio';
      parts.push(`<text x="${f1(sx(0))}" y="${f1(sy(0.16))}" text-anchor="middle" font-size="13" font-weight="700">${esc(mid)}</text>`);
      if (m.kind !== 'test') {
        for (const sgn of [-1, 1]) parts.push(`<text x="${f1(sx(sgn * (crit + extent) / 2))}" y="${f1(sy(0.1))}" text-anchor="middle" font-size="12" fill="${COLORS.tailText}">2,5%</text>`);
      }
    }
    const statKnown = m.kind === 'test' && m.known.has('stat');
    const statV = statKnown ? Math.max(-extent, Math.min(extent, m.v.stat)) : null;
    if (statKnown) {
      const x = sx(statV);
      parts.push(`<line x1="${f1(x)}" y1="${CURVE_TOP + 22}" x2="${f1(x)}" y2="${CURVE_BASE}" stroke="${COLORS.mark}" stroke-width="3"/>`);
      parts.push(`<polygon points="${f1(x - 6)},${CURVE_BASE - 10} ${f1(x + 6)},${CURVE_BASE - 10} ${f1(x)},${CURVE_BASE}" fill="${COLORS.mark}"/>`);
      parts.push(`<text x="${f1(x)}" y="${CURVE_TOP + 16}" text-anchor="middle" font-size="14" font-weight="700" fill="${COLORS.mark}">${esc(m.statSymbol)} = ${esc(m.label.stat)}</text>`);
    }
    if (m.kind === 'test' && crit !== null) {
      // "Rejeito H0" sits in each tail, at the middle of the widest stretch of that tail not crossed by the
      // statistic, and is painted after the statistic line with a white halo so it stays readable.
      for (const sgn of [-1, 1]) {
        let a = crit, b = extent;
        if (statV !== null && Math.sign(statV) === sgn && Math.abs(statV) > crit) {
          const s = Math.abs(statV);
          [a, b] = (s - crit) > (extent - s) ? [crit, s] : [s, extent];
        }
        parts.push(`<text x="${f1(sx(sgn * (a + b) / 2))}" y="${f1(sy(0.1))}" text-anchor="middle" font-size="12" fill="${COLORS.tailText}" paint-order="stroke" stroke="#fff" stroke-width="4" stroke-linejoin="round">Rejeito H0</text>`);
      }
    }
    return parts.join('');
  }

  function intervalSvg(m) {
    const y = 262, parts = [];
    const c = m.v.center, mg = m.v.margin;
    const span = 1.7 * Math.abs(mg || 1), sx = v => PAD + (v - (c - span)) / (2 * span) * (W - 2 * PAD);
    const unit = m.unit ? ' ' + m.unit : '';
    parts.push(`<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="${COLORS.axis}" stroke-width="1.5"/>`);
    parts.push(`<text x="${PAD}" y="${y - 34}" font-size="13" font-weight="700" fill="${COLORS.bar}">Intervalo de confiança de 95%</text>`);
    const haveBounds = m.known.has('lower') && m.known.has('upper');
    if (haveBounds) {
      const lo = sx(m.v.lower), hi = sx(m.v.upper);
      parts.push(`<rect x="${f1(lo)}" y="${y - 9}" width="${f1(hi - lo)}" height="18" fill="${COLORS.center}" stroke="${COLORS.bar}"/>`);
      for (const [xx, role, word] of [[lo, 'lower', 'inferior'], [hi, 'upper', 'superior']]) {
        parts.push(`<line x1="${f1(xx)}" y1="${y - 16}" x2="${f1(xx)}" y2="${y + 16}" stroke="${COLORS.bar}" stroke-width="3"/>`);
        parts.push(`<text x="${f1(xx)}" y="${y + 34}" text-anchor="middle" font-size="14" font-weight="700">${esc(m.label[role])}</text>`);
        parts.push(`<text x="${f1(xx)}" y="${y + 50}" text-anchor="middle" font-size="12">limite ${word}</text>`);
      }
      if (m.known.has('margin')) {
        const e = m.label.margin, cx = sx(c);
        parts.push(`<text x="${f1((lo + cx) / 2)}" y="${y - 16}" text-anchor="middle" font-size="12">−E = −${esc(e)}</text>`);
        parts.push(`<text x="${f1((hi + cx) / 2)}" y="${y - 16}" text-anchor="middle" font-size="12">+E = +${esc(e)}</text>`);
      }
    }
    if (m.known.has('center')) {
      const cx = sx(c);
      parts.push(`<circle cx="${f1(cx)}" cy="${y}" r="6" fill="${COLORS.curve}"/>`);
      parts.push(`<text x="${f1(cx)}" y="${y + 34}" text-anchor="middle" font-size="14">${esc(m.centerSymbol)} = ${esc(m.label.center)}${esc(unit)}</text>`);
    }
    return parts.join('');
  }

  function altText(m) {
    if (!m.methodKnown) return 'Gráfico ainda vazio: ele aparece quando você escolher a fórmula no mapa de decisão.';
    const df = m.dist === 't' ? m.df : null;
    const parts = [df ? `Curva t de Student com ${m.dfLabel} graus de liberdade${m.overlay_normal ? ', com a curva normal Z tracejada para comparar: a t tem caudas mais grossas' : ''}.` : 'Curva normal padrão Z.'];
    if (m.known.has('crit')) {
      const c = m.label.crit;
      parts.push(m.kind === 'test'
        ? `Regiões de rejeição de H0 abaixo de −${c} e acima de +${c} (2,5% em cada cauda); entre elas, não rejeito H0.`
        : `95% da área fica entre −${c} e +${c}; sobram 2,5% em cada cauda.`);
    }
    if (m.kind === 'interval') {
      const unit = m.unit ? ' ' + m.unit : '';
      if (m.known.has('center')) parts.push(`Centro do intervalo: ${m.centerSymbol} = ${m.label.center}${unit}.`);
      if (m.known.has('lower') && m.known.has('upper')) parts.push(`Intervalo de confiança de 95%: de ${m.label.lower} a ${m.label.upper}${unit}${m.known.has('margin') ? `, margem de erro E = ${m.label.margin}` : ''}.`);
    } else if (m.known.has('stat')) {
      const v = m.v.stat, cr = m.v.crit;
      const where = Math.abs(v) > cr ? 'na região de rejeição' : 'na região de não rejeição';
      parts.push(`Estatística calculada ${m.statSymbol} = ${m.label.stat}, ${where}${m.known.has('crit') ? ` (|${m.statSymbol}| ${Math.abs(v) > cr ? '>' : '≤'} ${m.label.crit})` : ''}.`);
    }
    return parts.join(' ');
  }

  function draw(m, opts) {
    COMPACT = !!opts.compact; W = COMPACT ? 360 : 640; PAD = COMPACT ? 22 : 44;
    const H = m.kind === 'interval' ? 330 : 230;
    const alt = altText(m);
    let body;
    if (!m.methodKnown) {
      body = `<rect x="${PAD}" y="${CURVE_TOP}" width="${W - 2 * PAD}" height="${CURVE_BASE - CURVE_TOP}" fill="#f2f4f1" stroke="#c6cfc9" stroke-dasharray="6 4"/>` +
        `<text x="${W / 2}" y="${(CURVE_TOP + CURVE_BASE) / 2}" text-anchor="middle" font-size="15">${COMPACT ? 'Escolha a fórmula para ver o gráfico.' : 'O gráfico aparece quando você escolher a fórmula.'}</text>`;
    } else {
      const stat = m.kind === 'test' && m.known.has('stat') ? Math.abs(m.v.stat) : 0;
      const extent = Math.max(4, Math.ceil(stat + 0.6));
      body = curveSvg(m, extent) + (m.kind === 'interval' ? intervalSvg(m) : '');
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}" font-family="system-ui, sans-serif" fill="#1f2a26"><title>${esc(alt)}</title>${body}</svg>`;
    return { svg, alt };
  }

  function render(lesson, ex, solved, opts = {}) { return draw(modelFromLesson(lesson, ex, solved, opts), opts); }
  function renderSpec(spec, opts = {}) { return draw(modelFromSpec(spec), opts); }

  /**
   * Learner copy for "Imagens e gráficos" in the Fonte view: names only what this lesson's plots draw (an interval
   * plot draws the interval; a test plot draws the test statistic). null when no exercise has a plot.
   */
  function figuresCopy(lesson) {
    const kinds = new Set((lesson.exercises || []).filter(e => e.plot).map(e => e.plot.kind));
    if (!kinds.size) return null;
    const parts = ['a curva', 'as caudas', 'os valores críticos'];
    if (kinds.has('interval')) parts.push('o intervalo');
    if (kinds.has('test')) parts.push('a estatística do teste');
    const list = parts.slice(0, -1).join(', ') + ' e ' + parts[parts.length - 1];
    return `Os gráficos mostram ${list}; só revelam o que você já calculou; e o controle do modo Estudar só abre depois de uma previsão. Não há animação decorativa. Ninguém mediu ainda se os gráficos melhoram o resultado na prova: são uma forma de mostrar a conta, não um resultado comprovado.`;
  }

  return { render, renderSpec, figuresCopy, tpdf, zpdf, lgamma };
});
