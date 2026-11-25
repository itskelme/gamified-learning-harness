/*
 * Offline package player: one accessible view per format, wired to that format's grader.
 * Input: the JSON in #package-data (embedded by scripts/build-package.mjs or scripts/build-lesson.mjs):
 *   { title, package, plan, rules, rule_options, links, lesson, content: { digest, lesson_id, revision } }.
 * Every event goes through HarnessEvents.checkEvents before it is logged; a violation is shown and thrown.
 * DOM only through textContent and attributes (no innerHTML with data), keyboard paths, no timers.
 *
 * Progress: every learner action is an entry { i: item id, a: action, v: arguments } in a journal. The page
 * keeps it in localStorage under the content digest and replays it on reload through the same handlers, so the
 * answers, the requeue gates and the event log come back exactly. Export writes the journal with the digest;
 * import refuses a file for another package or another content digest (docs/FORMATS.md "Package progress").
 */
(function () {
  'use strict';
  const P = window.HarnessPrng, EV = window.HarnessEvents;
  const DATA = JSON.parse(document.getElementById('package-data').textContent);
  const MATH = DATA.package.units.some(unit => unit.kind === 'ordered_procedure');
  const appendMath = (el, text) => {
    if (window.LessonMath) window.LessonMath.append(el, text, MATH);
    else el.append(document.createTextNode(text));
  };
  const LOCALE = DATA.package.locale || DATA.package.language || 'pt-BR';
  const CONTENT = DATA.content || { digest: 'none', lesson_id: DATA.package.id, revision: 0 };
  const STORE = `harness-package:${DATA.package.id}`;
  const SEED = 20261119;
  let log = [];
  let state = { attempts: {}, cues: {} };
  let handlers = {}, journal = [], replaying = false;
  let settings = defaultSettings();
  let rules = DATA.rules;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'math') appendMath(el, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }

  // ------------------------------------------------------------------ rules chosen on screen
  // The build resolves every preset x procedural-restart pair with harness/core/rules.js and embeds the results
  // (rule_options.matrix), so the page never re-implements rule resolution or the override digest.
  function defaultSettings() {
    const ro = DATA.rule_options;
    return { preset: DATA.rules.preset, restart: ro ? ro.default_restart[DATA.rules.preset] : null };
  }
  function resolved(s) {
    const ro = DATA.rule_options;
    if (!ro) return DATA.rules;
    const row = ro.matrix[s.preset];
    return row && row[s.restart] ? row[s.restart] : null;
  }
  const slot = (id, dflt) => (rules.slots && rules.slots[id]) || dflt;
  const declarativeReshuffle = () => slot('restart_on_error.declarative', {}).option === 'full_restart_reshuffle';
  const hintLevels = () => { const s = slot('feedback_ladder', null); return s && s.params && typeof s.params.hint_levels === 'number' ? s.params.hint_levels : 1; };
  const lifelines = () => slot('gamification.lifelines', {}).option === 'fifty_fifty_assisted';

  // ------------------------------------------------------------------ journal, events and gates
  // requeue_later inside one session: the item reopens after `gap` answers on OTHER items.
  let gates = [];
  function requeueGate(own, gap, onReady, status) {
    const g = { own: new Set(own), left: gap, onReady, status };
    gates.push(g);
    status.textContent = `Este item volta depois de ${gap} resposta(s) em outros itens.`;
  }
  function emit(evs) {
    const bad = EV.checkEvents(evs);
    if (bad.length) { document.getElementById('event-errors').textContent = bad.join('\n'); throw new Error(`event contract: ${bad.join('; ')}`); }
    log.push(...evs);
    document.body.dataset.events = String(log.length);
    for (const ev of evs) if (ev.type === 'answer_submitted' && ev.result !== 'invalid') {
      for (const g of gates.slice()) if (!g.own.has(ev.item_id) && --g.left <= 0) { gates.splice(gates.indexOf(g), 1); g.status.textContent = 'Este item voltou: tente de novo.'; g.onReady(); }
    }
    return evs;
  }
  /** Declarative restart from the chosen rules: requeue_later (default) or an immediate reshuffled retry. */
  function declarativeRoute(evs) {
    if (!declarativeReshuffle()) return evs;
    return evs.map(e => (e.type === 'outcome' && e.route === 'requeue_later' ? { type: 'outcome', item_id: e.item_id, route: 'retry_same', parameters: {} } : e));
  }
  /** Register an item's actions; the DOM calls act(), replay calls the same handler with the stored arguments. */
  function actions(itemId, map) { handlers[itemId] = map; }
  function act(itemId, name, args) {
    const fn = handlers[itemId] && handlers[itemId][name];
    if (!fn) throw new Error(`no action ${itemId}.${name}`);
    const entry = { i: itemId, a: name, v: args || {} };
    fn(entry.v);
    journal.push(entry);
    save();
  }
  const focus = el => { if (!replaying && el) el.focus(); };
  const attempt = id => (state.attempts[id] = (state.attempts[id] || 0) + 1);
  const say = (el, text, ok) => {
    el.replaceChildren();
    appendMath(el, text);
    el.className = 'feedback' + (ok === false ? ' wrong' : '');
  };
  const presented = (id, format, order) => emit([{ type: 'item_presented', item_id: id, format, presented_order: order, attempt_no: (state.attempts[id] || 0) + 1 }]);

  // ------------------------------------------------------------------ fmt-retrieval-cloze
  function cloze(item) {
    const C = window.RetrievalCloze, p = item.payload, fb = h('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
    const inputs = {};
    // Each blank stays on one line with the (up to) four words before it, e.g. "gl = n − [ ]".
    const parts = C.parseTemplate(p.template), nodes = [];
    parts.forEach((part, i) => {
      if (part.text) {
        const next = parts[i + 1];
        const m = next && next.blank ? /^([\s\S]*?)((?:\S+\s+){0,4})$/.exec(part.text) : null;
        nodes.push(m ? m[1] : part.text);
        if (m && m[2]) part.lead = m[2];
        return;
      }
      const b = p.blanks.find(x => x.id === part.blank), prev = parts[i - 1];
      const inp = h('input', { type: 'text', inputmode: b.spec.type === 'number' ? 'decimal' : 'text', 'aria-label': `Lacuna ${b.label || b.id}`, class: 'blank', 'data-blank': b.id, size: 6, autocomplete: 'off' });
      inputs[b.id] = inp;
      nodes.push(h('span', { class: 'nowrap' }, prev && prev.lead ? prev.lead : '', inp));
    });
    const line = h('p', { class: 'prompt' }, nodes);
    presented(item.id, item.format, p.blanks.map(b => b.id));
    const cue = h('p', { class: 'box', hidden: true });
    const ladder = (p.cue_ladder || []).slice(0, hintLevels());
    actions(item.id, {
      check: ({ values }) => {
        for (const b of p.blanks) inputs[b.id].value = values[b.id] === undefined ? '' : values[b.id];
        attempt(item.id);
        const evs = p.blanks.map(b => C.gradeBlank(b.spec, inputs[b.id].value, item.id, b.id, { assisted: !!state.cues[item.id], locale: LOCALE }));
        const worst = evs.find(e => e.result === 'incorrect') || evs.find(e => e.result === 'invalid') || evs.find(e => e.result === 'near_miss') || evs[0];
        emit([...evs, C.routeFor(worst, state.cues[item.id] || 0, ladder.length)]);
        // Thousands-shaped text ("1.960" in pt-BR) is refused with the comma form (locale contract, docs/FORMATS.md).
        const amb = p.blanks.find(b => b.spec.type === 'number' && C.numberIssue(inputs[b.id].value, LOCALE) === 'ambiguous_grouping');
        const text = { correct: 'Certo.', near_miss: 'Quase: confira a grafia e tente de novo (não conta como erro).', invalid: amb ? C.issueMessage('ambiguous_grouping', inputs[amb.id].value, LOCALE) : 'Preencha cada lacuna com um número ou uma palavra.', incorrect: ladder.length ? 'Ainda não. Use a dica ou revise o resumo.' : 'Ainda não. Revise o resumo e tente de novo.' }[worst.result];
        say(fb, text, worst.result === 'correct' ? true : worst.result === 'incorrect' ? false : undefined);
      },
      hint: () => {
        const n = (state.cues[item.id] || 0);
        if (n >= ladder.length) return;
        state.cues[item.id] = n + 1;
        emit([{ type: 'hint_shown', item_id: item.id, level: n + 1 }]);
        cue.hidden = false; cue.textContent = `Dica: ${ladder[n]}`;
      }
    });
    const check = () => act(item.id, 'check', { values: Object.fromEntries(p.blanks.map(b => [b.id, inputs[b.id].value])) });
    return [line, h('div', { class: 'row' }, h('button', { type: 'button', class: 'primary', onclick: check, text: 'Conferir' }), ladder.length ? h('button', { type: 'button', onclick: () => act(item.id, 'hint'), text: 'Dica' }) : null), cue, fb];
  }

  // ------------------------------------------------------------------ fmt-match-classify
  function match(item) {
    const M = window.MatchClassify, p = item.payload, byId = Object.fromEntries(p.cases.map(c => [c.id, c]));
    const list = h('ol', { class: 'cases' }), fb = h('div', { class: 'feedback', role: 'status', 'aria-live': 'polite' }), gate = h('p', { class: 'muted', role: 'status' });
    const btn = h('button', { type: 'button', class: 'primary', text: 'Conferir' });
    const pick = p.pick_label || 'Escolha o método…', caseLabel = p.case_label || 'Método para o caso';
    let order = [], selects = {};
    const present = (ids, n) => {
      order = M.presentedOrder(ids.map(id => byId[id]), SEED, item.id, n);
      selects = {};
      list.textContent = '';
      order.forEach((id, i) => {
        const equation = h('p', { class: 'muted', hidden: true });
        const sel = h('select', { id: `${item.id}-${id}`, 'data-case': id }, h('option', { value: '', text: pick }), p.categories.map(c => h('option', { value: c.id, text: c.label })));
        if (MATH) sel.addEventListener('change', () => {
          const selected = p.categories.find(c => c.id === sel.value);
          equation.replaceChildren();
          if (selected) appendMath(equation, selected.label);
          equation.hidden = !equation.querySelector('math');
        });
        selects[id] = sel;
        list.append(h('li', { class: 'card' }, h('p', { math: byId[id].text }), h('label', { for: sel.id, text: `${caseLabel} ${i + 1}` }), sel, equation));
      });
      presented(item.id, item.format, order);
      btn.disabled = false;
    };
    actions(item.id, {
      check: ({ assignment }) => {
        for (const id of order) {
          selects[id].value = assignment[id] || '';
          if (MATH) selects[id].dispatchEvent(new Event('change'));
        }
        if (order.some(id => !assignment[id])) { say(fb, 'Escolha uma opção para cada caso.'); return; }
        const n = attempt(item.id), evs = emit(declarativeRoute(M.grade(p.cases, assignment, order)));
        const d = M.derive(p.cases, evs), label = id => p.categories.find(c => c.id === id).label;
        fb.textContent = '';
        fb.append(h('p', { text: `Acertos: ${d.score.earned} de ${d.score.max}.` }));
        fb.className = 'feedback' + (d.confusion_view.length ? ' wrong' : '');
        if (!d.confusion_view.length) return;
        fb.append(h('ul', {}, d.confusion_view.map(c => h('li', { math: `Caso ${order.indexOf(c.item_id) + 1}: ${p.key_phrase || 'o mapa de decisão leva a'} “${label(c.expected_category)}”.` }))));
        const missed = d.confusion_view.map(c => c.item_id);
        if (declarativeReshuffle()) { present(p.cases.map(c => c.id), n + 1); gate.textContent = 'Os casos foram embaralhados de novo; classifique todos outra vez.'; return; }
        btn.disabled = true;
        requeueGate(p.cases.map(c => c.id), 3, () => present(missed, n + 1), gate);
      }
    });
    btn.addEventListener('click', () => act(item.id, 'check', { assignment: Object.fromEntries(order.map(id => [id, selects[id].value])) }));
    present(p.cases.map(c => c.id), 1);
    return [list, btn, gate, fb];
  }

  // ------------------------------------------------------------------ fmt-sequence-order
  function sequence(item) {
    const S = window.SequenceOrder, p = item.payload, byId = Object.fromEntries(p.entries.map(e => [e.id, e]));
    let cur = S.presentedOrder(p.key_order, SEED, item.id, 1);
    const list = h('ol', { class: 'seq', 'aria-label': 'Ordem atual' }), live = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
    const fb = h('div', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
    presented(item.id, item.format, cur);
    function draw(focusIdx, dir) {
      list.textContent = '';
      cur.forEach((id, i) => list.append(h('li', { class: 'seq-card', 'data-id': id },
        h('span', { class: 'step-name', text: byId[id].label }),
        h('span', { class: 'row' },
          h('button', { type: 'button', 'aria-label': `Subir “${byId[id].label}”`, disabled: i === 0, onclick: () => act(item.id, 'move', { i, d: -1 }), text: '↑ Subir' }),
          h('button', { type: 'button', 'aria-label': `Descer “${byId[id].label}”`, disabled: i === cur.length - 1, onclick: () => act(item.id, 'move', { i, d: 1 }), text: '↓ Descer' })))));
      if (focusIdx !== undefined && !replaying) {
        const btns = list.children[focusIdx].querySelectorAll('button');
        (dir < 0 && !btns[0].disabled ? btns[0] : !btns[1].disabled ? btns[1] : btns[0]).focus();
      }
    }
    draw();
    actions(item.id, {
      move: ({ i, d }) => {
        const j = i + d;
        if (!Number.isInteger(i) || j < 0 || j >= cur.length) return;
        [cur[i], cur[j]] = [cur[j], cur[i]];
        draw(j, d);
        live.textContent = `“${byId[cur[j]].label}” agora está na posição ${j + 1}.`;
      },
      check: () => {
        const n = attempt(item.id), evs = emit(S.grade(item.id, p.key_order, cur, n)), r = evs[0], route = evs[1].route;
        fb.textContent = '';
        if (r.result === 'correct') { fb.append(h('p', { text: 'Ordem certa.' })); fb.className = 'feedback'; return; }
        fb.className = 'feedback wrong';
        fb.append(h('p', { text: `Pares vizinhos certos: ${r.score.earned} de ${r.score.max}.` }));
        if (route === 'worked_debrief') fb.append(h('ol', {}, p.key_order.map(id => h('li', {}, h('strong', { text: byId[id].label }), ` — ${byId[id].rationale}`))));
        else { cur = S.presentedOrder(p.key_order, SEED, item.id, n + 1); draw(); presented(item.id, item.format, cur); fb.append(h('p', { text: 'Os cartões foram embaralhados de novo; tente outra vez.' })); }
      }
    });
    return [list, live, h('button', { type: 'button', class: 'primary', onclick: () => act(item.id, 'check'), text: 'Conferir ordem' }), fb];
  }

  // ------------------------------------------------------------------ fmt-choice-feedback
  function choice(item) {
    const C = window.ChoiceFeedback, p = item.payload, name = `${item.id}-opt`;
    const fb = h('div', { class: 'feedback', role: 'status', 'aria-live': 'polite' }), gate = h('p', { class: 'muted', role: 'status' });
    const fs = h('fieldset', {}), btn = h('button', { type: 'button', class: 'primary', text: 'Conferir' });
    const fifty = lifelines() ? h('button', { type: 'button', text: 'Ajuda 50/50' }) : null;
    let n = 1, assisted = false;
    const present = k => {
      n = k; assisted = false;
      const order = C.presentedOrder(p, SEED, n);
      fs.textContent = '';
      fs.append(h('legend', { text: p.stem }), ...order.map((id, i) => h('div', { class: 'opt' },
        h('input', { type: 'radio', name, id: `${name}-${i}`, value: id }), h('label', { for: `${name}-${i}`, text: p.options.find(x => x.id === id).text }))));
      presented(item.id, item.format, order);
      btn.disabled = false;
      if (fifty) fifty.disabled = false;
    };
    actions(item.id, {
      check: ({ pick }) => {
        const radio = pick ? fs.querySelector(`input[value="${CSS.escape(pick)}"]`) : null;
        if (!radio || radio.disabled) { say(fb, 'Escolha uma alternativa.'); return; }
        radio.checked = true;
        attempt(item.id);
        const r = C.grade(p, pick, { assisted });
        const evs = emit(declarativeRoute(r.events));
        const ok = evs[0].result === 'correct';
        say(fb, ok ? `Certo. ${p.explanation}` : r.feedback, ok);
        if (ok) return;
        if (declarativeReshuffle()) { present(n + 1); gate.textContent = 'As alternativas foram embaralhadas; tente de novo.'; return; }
        btn.disabled = true; if (fifty) fifty.disabled = true;
        requeueGate([item.id], evs[1].parameters.gap_items, () => present(n + 1), gate);
      },
      // fifty_fifty_assisted lifeline (fgv-style-quiz preset): hides up to two wrong options; the answer is assisted.
      fifty: () => {
        if (!fifty || assisted) return;
        const keep = new Set(C.fiftyFifty(p, SEED, n));
        for (const r of fs.querySelectorAll('input[type=radio]')) if (!keep.has(r.value)) { r.disabled = true; r.closest('.opt').hidden = true; }
        assisted = true; fifty.disabled = true;
      }
    });
    btn.addEventListener('click', () => { const picked = fs.querySelector('input:checked'); act(item.id, 'check', { pick: picked ? picked.value : '' }); });
    if (fifty) fifty.addEventListener('click', () => act(item.id, 'fifty'));
    present(1);
    return [fs, h('div', { class: 'row' }, btn, fifty), gate, fb];
  }

  // ------------------------------------------------------------------ fmt-data-visual-lab
  // The plot is drawn from plot_spec alone (ProcedurePlots.renderSpec): for each control value the engine solves
  // the data, ProcedurePlotSpec.plotSpecFor turns the solution into a spec, and only the spec reaches the renderer.
  const TABLE_ROLES = ['margin', 'lower', 'upper', 'statistic'];
  const ROLE_LABEL = { margin: 'Margem de erro', lower: 'Limite inferior', upper: 'Limite superior', statistic: 'Estatística' };
  function lab(item) {
    const p = item.payload, E = window.ProcedureEngine, Plots = window.ProcedurePlots, Spec = window.ProcedurePlotSpec, L = DATA.lesson;
    const ex = L.exercises.find(e => e.id === p.data_model.exercise_id), ctl = p.data_model.control, pr = p.prompts[0];
    const words = { aumenta: 'aumenta', diminui: 'diminui', igual: 'fica igual' };
    const verdict = h('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' }), moved = [];
    const fig = h('figure', { class: 'plot' }), cap = h('figcaption', { class: 'alt' }), table = h('table', {});
    const base = E.createRun(L, ex.id, 'original').variables;
    // Narrow screens (< 600 px) get the 360-unit compact layout so SVG labels stay legible; a resize across the
    // breakpoint redraws the current value (the layout used to be chosen once, at the first draw).
    let current = ctl.original;
    const narrow = window.matchMedia('(max-width: 599px)');
    narrow.addEventListener('change', () => draw(current));
    const draw = v => {
      current = v;
      const vars = { ...base, [ctl.var]: v }, solved = E.solve(L, ex, vars), spec = v === ctl.original ? p.plot_spec : Spec.plotSpecFor(L, ex, solved), r = Plots.renderSpec(spec, { compact: narrow.matches });
      fig.textContent = '';
      fig.append(new DOMParser().parseFromString(r.svg, 'image/svg+xml').documentElement, cap);
      cap.textContent = r.alt;
      table.textContent = '';
      // One row per quantity (row header + value): four columns of headers did not fit a 360 px screen.
      // Rows come from the plot_spec marks (margin, limits, statistic), with the step title as the row header.
      const valueRow = mk => { const s = ex.steps.find(x => x.id === mk.id); return h('tr', {}, h('th', { scope: 'row', text: s ? s.title.replace(/^Passo \S+ — /, '') : ROLE_LABEL[mk.role] }), h('td', { class: 'val', text: mk.label })); };
      table.append(h('caption', { text: 'Valores do gráfico' }), h('tr', {}, h('th', { scope: 'row', text: ctl.label }), h('td', { class: 'val', text: String(v) })),
        ...TABLE_ROLES.flatMap(role => spec.marks.filter(mk => mk.role === role)).map(valueRow));
    };
    const range = h('input', { type: 'range', id: `${item.id}-range`, min: ctl.min, max: ctl.max, step: ctl.step, value: ctl.original, disabled: true });
    const num = h('input', { type: 'number', id: `${item.id}-num`, min: ctl.min, max: ctl.max, step: ctl.step, value: ctl.original, disabled: true, 'aria-label': `${ctl.label} (número)` });
    presented(item.id, item.format, [pr.kind]);
    const fs = h('fieldset', {}, h('legend', { text: pr.question }), pr.options.map((o, i) => h('div', { class: 'opt' }, h('input', { type: 'radio', name: `${item.id}-pred`, id: `${item.id}-pred-${i}`, value: o }), h('label', { for: `${item.id}-pred-${i}`, text: words[o] }))));
    let predicted = null;
    actions(item.id, {
      predict: ({ pick }) => {
        const c = pick ? fs.querySelector(`input[value="${CSS.escape(pick)}"]`) : null;
        if (!c) { say(verdict, 'Escolha uma previsão antes de mexer.'); return; }
        if (predicted) return;
        c.checked = true;
        predicted = c.value;
        const ok = predicted === pr.expected;
        emit([{ type: 'answer_submitted', item_id: item.id, step_id: 'predict', response: predicted, result: ok ? 'correct' : 'incorrect', score: { earned: ok ? 1 : 0, max: 1 }, assisted: false }]);
        say(verdict, `${ok ? 'Previsão certa' : `Você previu “${words[predicted]}”`}: com ${ctl.label.toLowerCase()} maior, ${pr.quantity} ${words[pr.expected]}. Agora mova o controle e confira no gráfico.`, ok);
        range.disabled = false; num.disabled = false;
      },
      set: ({ value }) => {
        if (!predicted) return;
        const v = Math.min(ctl.max, Math.max(ctl.min, Math.round(Number(value) / ctl.step) * ctl.step));
        if (!Number.isFinite(v)) return;
        range.value = v; num.value = v; draw(v);
        moved.push(v);
        emit([{ type: 'control_changed', item_id: item.id, control_id: ctl.var, value: v }]);
      },
      finish: () => {
        if (!predicted) { say(verdict, 'Faça a previsão primeiro.'); return; }
        const ok = predicted === pr.expected;
        emit([{ type: 'item_completed', item_id: item.id, score: { earned: ok ? 1 : 0, max: 1 }, unaided: true }, { type: 'outcome', item_id: item.id, route: ok ? 'advance' : 'worked_debrief', parameters: {} }]);
        say(verdict, `Concluído. Você moveu o controle ${moved.length} vez(es); mover não vale ponto.`, ok);
      }
    });
    range.addEventListener('change', () => act(item.id, 'set', { value: range.value }));
    num.addEventListener('change', () => act(item.id, 'set', { value: num.value }));
    const check = () => { const c = fs.querySelector('input:checked'); act(item.id, 'predict', { pick: c ? c.value : '' }); };
    draw(ctl.original);
    return [fs, h('button', { type: 'button', class: 'primary', onclick: check, text: 'Conferir previsão' }), verdict,
      h('div', { class: 'explore' }, h('label', { for: range.id, text: ctl.label }), h('div', { class: 'range-row' }, range, num), fig, h('div', { class: 'table-wrap' }, table),
        h('button', { type: 'button', onclick: () => act(item.id, 'finish'), text: 'Concluir o laboratório' }))];
  }

  // ------------------------------------------------------------------ fmt-branching-case
  // Each node is a fieldset (legend = the situation) with one radio per action; the path so far is a live list.
  // A weak ending gives a worked debrief (each weaker pick next to the best one and why), then a retrieval item on
  // the principle; only after it is answered correctly can the case be replayed (SKILL.md, catalog 4.6).
  function branching(item) {
    const B = window.BranchingCase, g = item.payload.graph, pc = item.payload.principle_check;
    const fb = h('div', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
    // The path list is never an empty list: a placeholder item stands in until the first choice (and after a replay).
    const trail = h('ol', { class: 'done', 'aria-label': 'Caminho até aqui', 'aria-live': 'polite' }), stage = h('div', {});
    const resetTrail = () => trail.replaceChildren(h('li', { class: 'none', text: 'Nenhuma escolha ainda.' }));
    resetTrail();
    let picks = [], at = g.start, run = 1, ended = false, principleOk = false;
    const best = n => Math.max(...Object.values(n.choices).map(c => c.quality));
    const show = id => {
      at = id;
      const n = g.nodes[id];
      stage.textContent = '';
      if (n.terminal) { finish(n); return; }
      const name = `${item.id}-${run}-${id}`;
      const fs = h('fieldset', { 'data-node': id }, h('legend', { tabindex: '-1', text: n.text }), Object.entries(n.choices).map(([k, c], i) => h('div', { class: 'opt' }, h('input', { type: 'radio', name, id: `${name}-${i}`, value: k }), h('label', { for: `${name}-${i}`, text: c.text }))));
      stage.append(fs, h('button', { type: 'button', class: 'primary', text: 'Escolher', onclick: () => { const c = fs.querySelector('input:checked'); act(item.id, 'choose', { node: id, key: c ? c.value : '' }); } }));
      if (picks.length) focus(fs.querySelector('legend'));
    };
    function finish(n) {
      ended = true;
      const evs = emit(B.walk(g, picks, item.id)), done = evs[evs.length - 2], route = evs[evs.length - 1].route;
      const head = h('h3', { tabindex: '-1', text: 'Fim do caso' });
      stage.append(head, h('p', { class: 'box', text: `Princípio: ${n.principle}` }), h('p', { text: `Pontos: ${done.score.earned} de ${done.score.max}.` }));
      if (n.ending) stage.append(h('p', { text: n.ending }));
      if (route === 'advance') { stage.append(h('p', { text: 'Você escolheu a melhor ação em cada decisão.' })); focus(head); return; }
      // Worked debrief: walk the path again and explain every decision that was not the best one.
      let id = g.start;
      const rows = [];
      for (const k of picks) {
        const node = g.nodes[id], c = node.choices[k], top = best(node);
        if (c.quality < top) {
          const bc = Object.values(node.choices).find(x => x.quality === top);
          rows.push(h('li', {}, h('p', {}, h('strong', { text: 'Você escolheu: ' }), c.text), c.feedback ? h('p', { text: c.feedback }) : null,
            h('p', {}, h('strong', { text: 'Melhor ação: ' }), bc.text), bc.feedback ? h('p', { text: bc.feedback }) : null));
        }
        id = c.to;
      }
      stage.append(h('h4', { text: 'Revisão do caminho' }), h('ol', { class: 'debrief' }, rows));
      if (pc) stage.append(principleCheck());
      else stage.append(replayButton());
      focus(head);
    }
    function principleCheck() {
      const name = `${item.id}-${run}-principle`, out = h('div', { class: 'principle' }), msg = h('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' });
      const fs = h('fieldset', {}, h('legend', { text: pc.stem }), pc.options.map((o, i) => h('div', { class: 'opt' }, h('input', { type: 'radio', name, id: `${name}-${i}`, value: o.id }), h('label', { for: `${name}-${i}`, text: o.text }))));
      out.append(fs, h('button', { type: 'button', class: 'primary', text: 'Conferir o princípio', onclick: () => { const c = fs.querySelector('input:checked'); act(item.id, 'principle', { pick: c ? c.value : '' }); } }), msg);
      out.dataset.role = 'principle-check';
      return out;
    }
    function replayButton() { return h('button', { type: 'button', id: `${item.id}-replay`, text: 'Refazer o caso', onclick: () => act(item.id, 'replay') }); }
    actions(item.id, {
      choose: ({ node, key }) => {
        if (ended || node !== at) return;
        const n = g.nodes[at];
        if (!key || !Object.prototype.hasOwnProperty.call(n.choices, key)) { say(fb, 'Escolha uma ação.'); return; }
        const radio = stage.querySelector(`input[value="${CSS.escape(key)}"]`);
        if (radio) radio.checked = true;
        picks.push(key);
        const ch = n.choices[key];
        const none = trail.querySelector('li.none');
        if (none) none.remove();
        trail.append(h('li', { text: ch.text }));
        say(fb, ch.consequence || '');
        show(ch.to);
      },
      principle: ({ pick }) => {
        const box = stage.querySelector('[data-role="principle-check"]');
        if (!box || principleOk) return;
        const o = pc.options.find(x => x.id === pick), msg = box.querySelector('.feedback');
        if (!o) { say(msg, 'Escolha uma alternativa.'); return; }
        const radio = box.querySelector(`input[value="${CSS.escape(pick)}"]`);
        if (radio) radio.checked = true;
        const ev = { type: 'answer_submitted', item_id: item.id, step_id: 'principle', response: pick, result: o.correct ? 'correct' : 'incorrect', score: { earned: o.correct ? 1 : 0, max: 1 }, assisted: false };
        if (!o.correct && o.misconception_tag) ev.misconception_tag = o.misconception_tag;
        emit([ev]);
        say(msg, o.correct ? `Certo. ${pc.explanation || ''}`.trim() : (o.feedback || 'Ainda não. Releia o princípio acima.'), o.correct);
        if (o.correct) { principleOk = true; box.append(replayButton()); focus(box.querySelector('button:last-of-type')); }
      },
      replay: () => {
        if (!ended || (pc && !principleOk && !isBestPath())) return;
        run++; picks = []; ended = false; principleOk = false; resetTrail(); say(fb, '');
        state.attempts[item.id] = run - 1;
        presented(item.id, item.format, [g.start]);
        show(g.start);
        focus(stage.querySelector('legend'));
      }
    });
    const isBestPath = () => { let id = g.start; for (const k of picks) { const n = g.nodes[id]; if (n.choices[k].quality < best(n)) return false; id = n.choices[k].to; } return true; };
    presented(item.id, item.format, [g.start]);
    show(g.start);
    return [h('h3', { class: 'sr-path', text: 'Seu caminho' }), trail, stage, fb];
  }

  // ------------------------------------------------------------------ fmt-review-mix (lesson level)
  // The learner's local calendar date as YYYY-MM-DD. toISOString() is the UTC date: at 22:30 in São Paulo it is
  // already tomorrow, so "today" (and every review date) would be one day late.
  const localIsoDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function review(entry, items) {
    const R = window.ReviewMix, today = localIsoDate();
    const pool = items.map(i => ({ id: i.id, category: i.format, due: today }));
    const queue = R.buildQueue(pool, SEED), byId = Object.fromEntries(items.map(i => [i.id, i]));
    const plan = h('div', { 'aria-live': 'polite' });
    // Explicit dd/mm/aaaa field: a native date input shows the browser's locale format (e.g. mm/dd/yyyy).
    const exam = h('input', { type: 'text', id: 'exam-date', inputmode: 'numeric', autocomplete: 'off', placeholder: 'dd/mm/aaaa', 'aria-describedby': 'exam-date-help', size: 10 });
    const toIso = s => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim()); if (!m) return null; const iso = `${m[3]}-${m[2]}-${m[1]}`; try { return R.addDays(iso, 0) === iso ? iso : null; } catch (e) { return null; } };
    const br = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const drawPlan = () => {
      plan.textContent = '';
      if (!exam.value.trim()) { plan.append(h('p', { text: `Sem data de prova: a próxima revisão é amanhã, ${br(R.addDays(today, 1))}.` })); return; }
      const iso = toIso(exam.value);
      if (!iso || iso <= today) { plan.append(h('p', { class: 'feedback wrong', role: 'alert', text: 'Use o formato dd/mm/aaaa, com uma data depois de hoje.' })); return; }
      const rows = R.reviewPlan(today, iso);
      if (!rows.length) { plan.append(h('p', { text: 'A prova é amanhã: revise hoje os itens acima.' })); return; }
      plan.append(h('div', { class: 'table-wrap' }, h('table', {}, h('caption', { text: 'Dias de revisão até a prova' }), h('tr', {}, h('th', { text: 'Data' }), h('th', { text: 'Dias depois da revisão anterior' }), h('th', { text: 'Dias até a prova' })),
        rows.map(r => h('tr', { 'data-date': r.date }, h('td', { text: br(r.date) }), h('td', { class: 'val', text: String(r.gap_days) }), h('td', { class: 'val', text: String(r.days_to_exam_before) }))))));
    };
    actions('revisao', { exam: ({ text }) => { exam.value = text || ''; drawPlan(); } });
    exam.addEventListener('change', () => act('revisao', 'exam', { text: exam.value }));
    drawPlan();
    emit([{ type: 'item_presented', item_id: 'revisao', format: 'fmt-review-mix', presented_order: queue, attempt_no: 1 }]);
    return [h('p', { text: 'Ordem da revisão de hoje (as atividades se alternam):' }), h('ol', { class: 'done', id: 'review-queue' }, queue.map(id => h('li', { text: byId[id].title }))),
      h('label', { for: 'exam-date', text: 'Data da prova (opcional)' }), h('p', { class: 'muted', id: 'exam-date-help', text: 'Digite no formato dd/mm/aaaa.' }), exam, plan,
      h('p', { class: 'muted', text: 'Acertar hoje ainda não mostra que você vai lembrar na prova. O teste de verdade é refazer itens parecidos daqui a 7 e a 30 dias.' })];
  }

  // ------------------------------------------------------------------ fmt-step-ladder (link to the pilot player)
  // The procedural restart chosen on screen travels to the step player in the link (#modo=<policy>).
  const PILOT_POLICY = { full_restart: 'full', restart_at_failed_step_new_numbers: 'failed-step', last_checkpoint_plus_worked_step: 'checkpoint', full_restart_after_n_errors: 'after-n-errors' };
  function ladder(item) {
    const link = DATA.links && DATA.links['fmt-step-ladder'];
    const policy = PILOT_POLICY[slot('restart_on_error.procedural', {}).option];
    const href = link && policy ? `${link}#modo=${policy}` : link;
    return [h('p', { text: `${item.payload.exercises.length} ${item.payload.exercises.length === 1 ? 'exercício' : 'exercícios'} passo a passo, com novos números a cada tentativa e a ordem dos passos sempre igual.` }),
      link ? h('p', {}, h('a', { class: 'go', id: `${item.id}-link`, href, 'data-policy': policy || '', text: 'Abrir os exercícios passo a passo' })) : h('p', { class: 'muted', text: 'Os exercícios passo a passo estão no player do formato.' })];
  }

  // What the learner is asked to do, shown instead of internal format ids (kept in data-format).
  const ACTIVITY = { 'fmt-retrieval-cloze': 'Lembrar', 'fmt-match-classify': 'Distinguir', 'fmt-step-ladder': 'Fazer passo a passo',
    'fmt-sequence-order': 'Reconstruir a ordem', 'fmt-data-visual-lab': 'Explorar o gráfico', 'fmt-choice-feedback': 'Aplicar e interpretar',
    'fmt-branching-case': 'Decidir no caso', 'fmt-review-mix': 'Revisar' };

  // What each rule preset means for the learner, in plain pt-BR (no preset ids, no ratings).
  const PRESET_COPY = {
    'research-hybrid': 'Como funciona: ao errar, primeiro vem uma dica; depois, o passo resolvido e um passo parecido com números novos; se o erro continuar, você volta ao último ponto de controle com números novos.',
    'strict-kelme': 'Como funciona: ao errar, o exercício recomeça do primeiro passo, com números novos e os mesmos passos.',
    'exam-prep': 'Como funciona: treino de prova, sem dicas; ao errar, o exercício recomeça com números novos.',
    'fgv-style-quiz': 'Como funciona: ao errar, as perguntas são embaralhadas e o quiz recomeça.'
  };
  const PRESET_NAME = { 'research-hybrid': 'Equilibrado (padrão)', 'strict-kelme': 'Recomeçar do início', 'exam-prep': 'Treino de prova', 'fgv-style-quiz': 'Quiz com embaralhamento' };
  const RESTART_NAME = {
    full_restart: 'Recomeçar o exercício do passo 1',
    restart_at_failed_step_new_numbers: 'Repetir só o passo errado, com números novos',
    last_checkpoint_plus_worked_step: 'Voltar ao último ponto de controle, com o passo resolvido',
    full_restart_after_n_errors: 'Dica e passo resolvido; recomeçar do passo 1 depois de 3 erros'
  };

  const VIEWS = { 'fmt-retrieval-cloze': cloze, 'fmt-match-classify': match, 'fmt-step-ladder': ladder, 'fmt-sequence-order': sequence,
    'fmt-data-visual-lab': lab, 'fmt-choice-feedback': choice, 'fmt-branching-case': branching };

  // ------------------------------------------------------------------ progress (localStorage, export, import)
  const status = () => document.getElementById('progress-status');
  function readStore() { try { return JSON.parse(localStorage.getItem(STORE) || 'null') || { by_digest: {}, last_digest: null }; } catch (e) { return { by_digest: {}, last_digest: null }; } }
  function progress() {
    return { format: 'harness-package-progress', version: 1, package_id: DATA.package.id, lesson_id: CONTENT.lesson_id, revision: CONTENT.revision,
      content_digest: CONTENT.digest, preset: settings.preset, restart: settings.restart, journal: journal.slice() };
  }
  function save() {
    if (replaying) return;
    try { const s = readStore(); s.by_digest[CONTENT.digest] = progress(); s.last_digest = CONTENT.digest; localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) { /* storage blocked: progress lives only in this tab */ }
  }
  /** Problems with a progress object for THIS page (empty list = it can be replayed). */
  function progressProblems(pr) {
    if (!pr || typeof pr !== 'object' || pr.format !== 'harness-package-progress' || pr.version !== 1) return ['O arquivo não é um progresso desta prática.'];
    if (pr.package_id !== DATA.package.id) return ['Este progresso é de outra prática e não foi importado.'];
    if (pr.content_digest !== CONTENT.digest) {
      return [pr.lesson_id === CONTENT.lesson_id && pr.revision !== CONTENT.revision
        ? `Este progresso é da revisão ${pr.revision} do conteúdo; esta página é a revisão ${CONTENT.revision}. Ele não foi importado.`
        : 'Este progresso é de outra versão do conteúdo e não foi importado.'];
    }
    if (!resolved({ preset: pr.preset, restart: pr.restart })) return ['Modo de prática desconhecido no arquivo.'];
    if (!Array.isArray(pr.journal) || pr.journal.some(e => !e || typeof e.i !== 'string' || typeof e.a !== 'string' || typeof e.v !== 'object' || e.v === null)) return ['Registro de respostas inválido.'];
    return [];
  }
  function exportProgress(pr, name) {
    const blob = new Blob([JSON.stringify(pr, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = h('a', { href: url, download: name || `${DATA.package.id}-progresso.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importProgress(ev) {
    const file = ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    let pr;
    try { if (file.size > 2000000) throw new Error(); pr = JSON.parse(await file.text()); } catch (e) { status().textContent = 'Não foi possível ler o arquivo de progresso.'; return; }
    const bad = progressProblems(pr);
    if (bad.length) { status().textContent = bad[0]; status().dataset.result = 'refused'; return; }
    const before = { settings: { ...settings }, journal: journal.slice() };
    try { apply(pr); render(); status().textContent = `Progresso importado: ${journal.length} resposta(s) restaurada(s).`; status().dataset.result = 'imported'; save(); }
    catch (e) { settings = before.settings; journal = before.journal; render(); status().textContent = 'O arquivo de progresso não corresponde a esta prática e não foi importado.'; status().dataset.result = 'refused'; }
  }
  function apply(pr) { settings = { preset: pr.preset, restart: pr.restart }; journal = pr.journal.slice(); }

  // ------------------------------------------------------------------ settings panel
  function settingsPanel() {
    const ro = DATA.rule_options;
    const box = h('section', { class: 'card settings', id: 'settings', 'aria-labelledby': 'h-settings' }, h('h2', { id: 'h-settings', text: 'Como a prática funciona' }));
    if (ro) {
      const fs = h('fieldset', { id: 'preset-control' }, h('legend', { text: 'Modo de prática' }),
        ro.presets.map((id, i) => h('div', { class: 'opt' }, h('input', { type: 'radio', name: 'preset', id: `preset-${i}`, value: id, checked: id === settings.preset }), h('label', { for: `preset-${i}`, text: PRESET_NAME[id] || id }))));
      fs.addEventListener('change', e => { if (e.target.name === 'preset') choose({ preset: e.target.value, restart: ro.default_restart[e.target.value] }); });
      const restart = h('select', { id: 'restart-control' }, ro.restart_options.map(o => h('option', { value: o, text: RESTART_NAME[o] || o, selected: o === settings.restart })));
      restart.addEventListener('change', () => choose({ preset: settings.preset, restart: restart.value }));
      box.append(fs, h('label', { for: 'restart-control', text: 'Nos exercícios passo a passo, quando eu errar' }), restart,
        h('p', { class: 'muted', text: 'Mudar o modo recomeça as atividades desta página. Exporte o progresso antes, se quiser guardá-lo.' }));
    }
    const file = h('input', { type: 'file', id: 'import-progress', accept: 'application/json' });
    file.addEventListener('change', importProgress);
    box.append(h('div', { class: 'row' },
      h('button', { type: 'button', id: 'export-progress', text: 'Exportar progresso', onclick: () => exportProgress(progress()) }),
      h('button', { type: 'button', id: 'reset-progress', text: 'Recomeçar tudo', onclick: () => { journal = []; render(); save(); status().textContent = 'Atividades recomeçadas.'; } })),
    h('label', { for: 'import-progress', text: 'Importar progresso (arquivo .json exportado desta página)' }), file,
    h('p', { class: 'muted', id: 'progress-status', role: 'status', 'aria-live': 'polite' }));
    return box;
  }
  function choose(next) {
    if (!resolved(next)) return;
    settings = next; journal = [];
    render(); save();
    status().textContent = 'Modo alterado: as atividades desta página recomeçaram.';
  }

  // ------------------------------------------------------------------ render + replay
  function render() {
    rules = resolved(settings) || DATA.rules;
    log = []; state = { attempts: {}, cues: {} }; handlers = {}; gates = [];
    const { package: pkg, plan } = DATA;
    document.getElementById('title').textContent = DATA.title;
    // Learner copy only; rule_set_id and evidence ratings stay in the manifest and this data attribute.
    const rulesEl = document.getElementById('rules');
    rulesEl.dataset.ruleSet = rules.rule_set_id;
    rulesEl.textContent = PRESET_COPY[rules.preset] || 'Modo de prática personalizado.';
    const root = document.getElementById('units');
    const keepStatus = document.getElementById('progress-status') ? document.getElementById('progress-status').textContent : '';
    root.textContent = '';
    root.append(settingsPanel());
    status().textContent = keepStatus;
    if (plan.errors.length) { root.append(h('p', { class: 'feedback wrong', role: 'alert', text: plan.errors.join(' ') })); return; }
    const items = [], multi = plan.units.length > 1;
    for (const u of plan.units) {
      const unit = pkg.units.find(x => x.id === u.unit_id);
      // With more than one unit, a labelled band names the unit before its items (the items keep their h2 cards).
      if (multi) root.append(h('p', { class: 'unit-title eyebrow', id: `unit-${unit.id}`, text: unit.title || unit.id }));
      for (const f of u.formats) {
        const it = unit.items.find(i => i.format === f.format_id);
        if (!it || !VIEWS[f.format_id]) continue;
        const title = it.title || it.id;
        items.push({ ...it, title });
        root.append(h('section', { class: 'card item', id: `item-${it.id}`, 'data-format': f.format_id, 'aria-labelledby': `h-${it.id}` },
          h('p', { class: 'eyebrow', text: ACTIVITY[f.format_id] }), h('h2', { id: `h-${it.id}`, text: title }), h('p', { class: 'muted', text: `Fonte: ${it.source_ref}` }), VIEWS[f.format_id](it)));
      }
    }
    // fmt-review-mix is lesson level: one review across every unit's items, after the last unit.
    for (const l of plan.lesson_level.filter(x => x.format_id === 'fmt-review-mix')) {
      root.append(h('section', { class: 'card item', id: 'item-revisao', 'data-format': 'fmt-review-mix', 'aria-labelledby': 'h-revisao' },
        h('p', { class: 'eyebrow', text: ACTIVITY[l.format_id] }), h('h2', { id: 'h-revisao', text: 'Revisão espaçada' }), review(l, items)));
    }
    replay();
  }
  function replay() {
    const entries = journal;
    journal = [];
    replaying = true;
    try { for (const e of entries) { const fn = handlers[e.i] && handlers[e.i][e.a]; if (!fn) throw new Error(`unknown action ${e.i}.${e.a}`); fn(e.v); journal.push(e); } }
    finally { replaying = false; }
  }

  function boot() {
    const s = readStore(), mine = s.by_digest[CONTENT.digest];
    let note = '';
    if (mine && !progressProblems(mine).length) apply(mine);
    else if (s.last_digest && s.last_digest !== CONTENT.digest && s.by_digest[s.last_digest]) {
      const old = s.by_digest[s.last_digest];
      // Content version change, handled explicitly: the old progress is never replayed onto new content.
      note = old.revision !== CONTENT.revision
        ? `O conteúdo desta página mudou (revisão ${old.revision} → ${CONTENT.revision}). O progresso anterior não foi aplicado; ele continua guardado e pode ser exportado.`
        : 'O conteúdo desta página mudou desde a sua última visita. O progresso anterior não foi aplicado; ele continua guardado e pode ser exportado.';
    }
    try { render(); }
    catch (e) { journal = []; render(); note = 'O progresso salvo não pôde ser restaurado. Começando do início.'; }
    if (note) {
      status().textContent = note; status().dataset.result = 'content-changed';
      const old = s.by_digest[s.last_digest];
      if (old) status().after(h('button', { type: 'button', id: 'export-old-progress', text: 'Exportar o progresso anterior', onclick: () => exportProgress(old, `${DATA.package.id}-progresso-revisao-${old.revision}.json`) }));
    }
  }

  window.__harness = { get events() { return log; }, get journal() { return journal.slice(); }, get rules() { return rules; }, data: DATA, progress };
  boot();
})();
