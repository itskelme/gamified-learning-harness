/*
 * Decision-tree figure for a fmt-branching-case graph (format.json pdf.renders_as: "decision-tree figure plus a
 * table of all paths with endings, scores and principles"). Pure function: graph -> { svg, alt, legend, paths }.
 * Boxes carry short labels (S1, S2... for situations, F1... for endings); the legend and the all-paths table carry
 * the text, so the figure stays readable at any width and the meaning never lives only in the picture.
 * Edge colour and dash mark the quality of a choice (best, partial, weak), and the legend says so in words.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./formats/fmt-branching-case/grader.js'));
  else root.CaseDiagram = factory(root.BranchingCase);
})(typeof self !== 'undefined' ? self : this, function (B) {
  'use strict';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  // Line colours have >= 3:1 contrast on white (WCAG 1.4.11); the dash pattern, not the colour alone, carries the kind.
  const STYLE = { best: { stroke: '#2f7a4f', dash: '', label: 'melhor escolha' }, partial: { stroke: '#b35400', dash: '10 6', label: 'escolha parcial' }, weak: { stroke: '#9a2b1b', dash: '1 7', label: 'escolha fraca' } };

  function layout(g) {
    // Longest-path depth from the start (acyclic graphs), so every edge points to a deeper column.
    const depth = { [g.start]: 0 }, order = [g.start];
    let changed = true;
    while (changed) {
      changed = false;
      for (const [id, n] of Object.entries(g.nodes)) for (const c of Object.values(n.choices || {})) {
        if (depth[id] === undefined) continue;
        if (depth[c.to] === undefined || depth[c.to] < depth[id] + 1) { depth[c.to] = depth[id] + 1; changed = true; if (!order.includes(c.to)) order.push(c.to); }
      }
    }
    const ids = Object.keys(g.nodes).filter(id => depth[id] !== undefined);
    // Endings go in the last column.
    const maxD = Math.max(...ids.filter(id => !g.nodes[id].terminal).map(id => depth[id])) + 1;
    for (const id of ids) if (g.nodes[id].terminal) depth[id] = maxD;
    const cols = {};
    for (const id of ids) (cols[depth[id]] = cols[depth[id]] || []).push(id);
    // Barycenter order: each column, left to right, is sorted by the mean height of its boxes' parents (stable), so
    // an ending sits next to the situations that lead to it and fewer edges cross (tests/contract/artifacts.test.js).
    const parents = {};
    for (const [id, n] of Object.entries(g.nodes)) for (const c of Object.values(n.choices || {})) if (depth[id] !== undefined) (parents[c.to] = parents[c.to] || []).push(id);
    const at = id => (cols[depth[id]].indexOf(id) + 0.5) / cols[depth[id]].length;
    for (let d = 1; d <= maxD; d++) {
      const bary = Object.fromEntries((cols[d] || []).map(id => [id, (parents[id] || []).reduce((s, p) => s + at(p), 0) / Math.max(1, (parents[id] || []).length)]));
      (cols[d] || []).sort((a, b) => bary[a] - bary[b]);
    }
    return { depth, cols, maxD };
  }

  function render(g) {
    const { depth, cols, maxD } = layout(g);
    const label = {};
    let s = 0, f = 0;
    for (let d = 0; d <= maxD; d++) for (const id of cols[d] || []) label[id] = g.nodes[id].terminal ? `F${++f}` : `S${++s}`;
    const BOX_W = 80, BOX_H = 56, COL = 180, KEY_H = 46, CLEAR = 14;
    const rows = Math.max(...Object.values(cols).map(c => c.length));
    const W = 40 + BOX_W + maxD * COL, GH = 40 + rows * 104, H = GH + KEY_H;
    const pos = {};
    for (const [d, ids] of Object.entries(cols)) ids.forEach((id, i) => { pos[id] = { x: 20 + Number(d) * COL, y: 20 + (i + 0.5) * (GH - 40) / ids.length }; });
    // One edge per choice (two choices to the same place stay two lines). Each edge leaves its box and enters the
    // next one at its own height, so edges that meet at a box stay apart; curves bend away from the boxes between.
    const edges = [];
    for (const [id, n] of Object.entries(g.nodes)) {
      if (!n.choices || !pos[id]) continue;
      const best = Math.max(...Object.values(n.choices).map(c => c.quality));
      for (const [key, c] of Object.entries(n.choices)) edges.push({ from: id, to: c.to, choice: key, kind: c.quality === best ? 'best' : c.quality > 0 ? 'partial' : 'weak' });
    }
    const spread = (list, end) => {
      const groups = {};
      for (const e of list) (groups[e[end]] = groups[e[end]] || []).push(e);
      for (const g2 of Object.values(groups)) {
        g2.sort((a, b) => pos[end === 'to' ? a.from : a.to].y - pos[end === 'to' ? b.from : b.to].y);
        g2.forEach((e, k) => { e[end === 'to' ? 'dy_in' : 'dy_out'] = (k - (g2.length - 1) / 2) * Math.min(16, (BOX_H - 10) / Math.max(1, g2.length - 1)); });
      }
    };
    spread(edges, 'to'); spread(edges, 'from');
    const parts = [`<defs>${Object.entries(STYLE).map(([k, st]) => `<marker id="arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="${st.stroke}"/></marker>`).join('')}</defs>`];
    // An edge that skips columns detours above or below any box in between that its straight course would touch.
    for (const e of edges) {
      const a = pos[e.from], b = pos[e.to];
      const pts = [{ x: a.x + BOX_W, y: a.y + e.dy_out }];
      for (let d = depth[e.from] + 1; d < depth[e.to]; d++) {
        // Test the straight course at the box's left edge, centre and right edge (a corner counts as a hit).
        const xm = 20 + d * COL + BOX_W / 2, last = pts[pts.length - 1];
        const yAt = x => last.y + (b.y + e.dy_in - last.y) * (x - last.x) / (b.x - last.x);
        const xs = [xm - BOX_W / 2 - CLEAR, xm, xm + BOX_W / 2 + CLEAR];
        const hit = (cols[d] || []).map(id => pos[id]).find(p => xs.some(x => Math.abs(yAt(x) - p.y) < BOX_H / 2 + CLEAR));
        if (hit) pts.push({ x: xm, y: yAt(xm) <= hit.y ? hit.y - BOX_H / 2 - CLEAR - 6 : hit.y + BOX_H / 2 + CLEAR + 6 });
      }
      pts.push({ x: b.x - 2, y: b.y + e.dy_in });
      e.points = pts;
    }
    const curve = pts => pts.slice(1).map((q, i) => { const p = pts[i], k = Math.max(30, (q.x - p.x) * 0.45); return `C${(p.x + k).toFixed(1)} ${p.y.toFixed(1)} ${(q.x - k).toFixed(1)} ${q.y.toFixed(1)} ${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join(' ');
    for (const e of edges) {
      const st = STYLE[e.kind], p0 = e.points[0];
      parts.push(`<path d="M${p0.x.toFixed(1)} ${p0.y.toFixed(1)} ${curve(e.points)}" fill="none" stroke="${st.stroke}" stroke-width="3" stroke-linecap="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''} marker-end="url(#arrow-${e.kind})"/>`);
    }
    for (const [id, p] of Object.entries(pos)) {
      const n = g.nodes[id];
      parts.push(`<rect x="${p.x}" y="${(p.y - BOX_H / 2).toFixed(1)}" width="${BOX_W}" height="${BOX_H}" rx="6" fill="${n.terminal ? '#e8eef3' : '#ffffff'}" stroke="#1d4b6e" stroke-width="2"/>`);
      parts.push(`<text x="${p.x + BOX_W / 2}" y="${(p.y + 6).toFixed(1)}" text-anchor="middle" font-size="18" font-weight="700">${esc(label[id])}</text>`);
    }
    // Drawn key: a sample of each line style with its meaning (the alt text says the same in words).
    const keyY = GH + 22, keyW = (W - 40) / 3;
    Object.entries(STYLE).forEach(([k, st], i) => {
      const x = 20 + i * keyW;
      parts.push(`<path d="M${x} ${keyY} L${x + 46} ${keyY}" stroke="${st.stroke}" stroke-width="3" stroke-linecap="round"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''} marker-end="url(#arrow-${k})"/>`);
      parts.push(`<text x="${x + 56}" y="${keyY + 5}" font-size="15">${esc(st.label)}</text>`);
    });
    const paths = B.allPaths(g);
    const legend = Object.keys(pos).sort((a, b) => depth[a] - depth[b] || label[a].localeCompare(label[b], 'pt-BR', { numeric: true }))
      .map(id => ({ label: label[id], text: g.nodes[id].terminal ? g.nodes[id].ending || g.nodes[id].principle : g.nodes[id].text, terminal: !!g.nodes[id].terminal }));
    const alt = `Árvore de decisão com ${Object.keys(pos).filter(id => !g.nodes[id].terminal).length} situações (S) e ${f} finais (F); ${paths.length} caminhos possíveis. Cada seta é uma escolha. Linha cheia verde: a melhor escolha naquele ponto; tracejada laranja: escolha parcial; pontilhada vermelha: escolha fraca. A legenda diz o que é cada caixa e a tabela de caminhos mostra cada caminho, o final e os pontos.`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}" font-family="system-ui, sans-serif" fill="#1f2a26"><title>${esc(alt)}</title>${parts.join('')}</svg>`;
    const choiceText = step => { const [nid, k] = step.split(':'); return g.nodes[nid].choices[k].text; };
    // Plain layout data for other renderers (the LaTeX/TikZ figure uses the same positions, offsets and edge kinds).
    const layoutData = { width: W, height: GH, box: { w: BOX_W, h: BOX_H }, nodes: Object.entries(pos).map(([id, p]) => ({ id, label: label[id], x: p.x, y: p.y, terminal: !!g.nodes[id].terminal })),
      edges: edges.map(e => ({ from: e.from, to: e.to, choice: e.choice, kind: e.kind, points: e.points })) };
    return { svg, alt, legend, labels: label, layout: layoutData, paths: paths.map(p => ({ steps: p.path.map(choiceText), ending: label[p.terminal_id], principle: p.principle, score: p.score })) };
  }

  return { render };
});
