/*
 * fmt-branching-case validator and walker (catalog r3 section 4.6, fixture AF-BRA-01).
 * Port of validate_branch / walk_branch in catalog-tools/format_fixtures.py, plus a cycle check
 * (catalog: "no undeclared cycles"; a graph may set allow_cycles: true), and the principle_tag rule below.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BranchingCase = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function validate(g) {
    const problems = [], nodes = g.nodes || {};
    if (!own(nodes, g.start)) return [`missing_start:${g.start}`];
    const seen = new Set(), stack = [g.start];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const c of Object.values(nodes[id].choices || {})) {
        if (!own(nodes, c.to)) problems.push(`missing_target:${c.to}`);
        else stack.push(c.to);
      }
    }
    for (const k of Object.keys(nodes)) if (!seen.has(k)) problems.push(`unreachable:${k}`);
    for (const [k, v] of Object.entries(nodes)) {
      if (!v.terminal && !(v.choices && Object.keys(v.choices).length)) problems.push(`dead_end:${k}`);
      if (v.terminal && !v.principle) problems.push(`terminal_without_principle:${k}`);
    }
    // Extension (card t_fd19236f): once terminals declare a principle_tag, an ending must be true for every path that
    // reaches it, so every terminal needs a tag and every choice entering a terminal must carry the terminal's tag.
    // Untagged graphs (catalog fixture AF-BRA-01) keep the catalog rules only.
    const terms = Object.entries(nodes).filter(([, v]) => v.terminal);
    if (terms.some(([, v]) => v.principle_tag !== undefined)) {
      for (const [k, v] of terms) if (typeof v.principle_tag !== 'string' || !v.principle_tag) problems.push(`terminal_without_principle_tag:${k}`);
      for (const [k, v] of Object.entries(nodes)) {
        for (const [ck, c] of Object.entries(v.choices || {})) {
          const t = own(nodes, c.to) ? nodes[c.to] : null;
          if (t && t.terminal && t.principle_tag && c.principle_tag !== t.principle_tag) problems.push(`principle_mismatch:${k}.${ck}->${c.to}`);
        }
      }
    }
    if (!g.allow_cycles) {
      const state = {};
      const visit = id => {
        if (state[id] === 1) return true;
        if (state[id] === 2 || !own(nodes, id)) return false;
        state[id] = 1;
        const cyc = Object.values(nodes[id].choices || {}).some(c => visit(c.to));
        state[id] = 2;
        return cyc;
      };
      if (visit(g.start)) problems.push('undeclared_cycle');
    }
    return problems;
  }

  /** Walk with the learner's picks -> catalog 3.4 events (one answer per decision, then completion and route). */
  function walk(g, picks, itemId) {
    let id = g.start, total = 0, max = 0;
    const trail = [], events = [];
    for (const p of picks) {
      const node = g.nodes[id];
      if (!node.choices || !own(node.choices, p)) throw new Error(`no choice ${p} at ${id}`);
      const best = Math.max(...Object.values(node.choices).map(c => c.quality)), c = node.choices[p];
      total += c.quality; max += best; trail.push(`${id}:${p}`);
      const result = c.quality === best ? 'correct' : c.quality > 0 ? 'partial' : 'incorrect';
      const ev = { type: 'answer_submitted', item_id: itemId, step_id: id, response: p, result, score: { earned: c.quality, max: best }, assisted: false };
      if (c.misconception_tag) ev.misconception_tag = c.misconception_tag;
      events.push(ev);
      id = c.to;
    }
    if (!g.nodes[id].terminal) throw new Error('walk must end at a terminal node');
    events.push({ type: 'item_completed', item_id: itemId, score: { earned: total, max }, unaided: true, terminal_id: id, path: trail });
    events.push({ type: 'outcome', item_id: itemId, route: total === max ? 'advance' : 'worked_debrief_then_requeue_branch', parameters: {} });
    return events;
  }

  /** Every start-to-terminal path (for the PDF table and the debrief). */
  function allPaths(g) {
    const out = [];
    const go = (id, trail, earned, max) => {
      const n = g.nodes[id];
      if (n.terminal) { out.push({ path: trail, terminal_id: id, principle: n.principle, score: { earned, max } }); return; }
      const best = Math.max(...Object.values(n.choices).map(c => c.quality));
      for (const [k, c] of Object.entries(n.choices)) if (!trail.includes(`${id}:${k}`)) go(c.to, [...trail, `${id}:${k}`], earned + c.quality, max + best);
    };
    go(g.start, [], 0, 0);
    return out;
  }

  return { validate, walk, allPaths };
});
