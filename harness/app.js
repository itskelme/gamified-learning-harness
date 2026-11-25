/* Browser shell for the ordered-procedure format. All math lives in ProcedureEngine; all plots in ProcedurePlots. */
(function () {
  'use strict';
  const E = window.ProcedureEngine, P = window.ProcedurePlots, M = window.LessonMath;
  const L = JSON.parse(document.getElementById('lesson-data').textContent);
  const DIGEST = window.LESSON_DIGEST;
  const KEY = `ordered-procedure:${L.id}:${DIGEST}`;
  const POLICIES = {
    'full': 'Reinício completo: volta ao passo 1',
    'failed-step': 'Repetir só o passo errado',
    'checkpoint': 'Voltar ao último ponto de controle',
    'after-n-errors': 'Dica e passo resolvido; reinício completo após N erros'
  };
  const HOW = { learner: 'você', hinted: 'com dica', recomputed: 'recalculado' };
  // pt-BR labels for the lesson's source-note kinds (the ids stay English in the lesson file).
  const NOTE_KINDS = { 'minor-disagreement': 'pequena divergência de arredondamento', 'internal-inconsistency': 'inconsistência interna do material', 'convention': 'convenção da professora' };
  const STEP_RULE_LABELS = { data: 'Dados do enunciado', critical: 'Valor crítico', compute: 'Contas', statistic: 'Estatística do teste', decision: 'Decisão', interpretation: 'Interpretação' };
  const $ = id => document.getElementById(id);
  // Narrow screens get the 360-unit plot layout so chart labels stay legible.
  const narrowQuery = window.matchMedia('(max-width: 599px)');
  const compact = () => narrowQuery.matches;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'math') M.append(el, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  // SVG strings come only from ProcedurePlots, which escapes every text node.
  function svgBox(svg, cls) { const d = h('div', { class: cls || 'plot' }); d.innerHTML = svg; return d; }
  const ex = id => E.exerciseById(L, id);
  const exerciseTopic = e => e.title.replace(/^Exercício \d+ [—–-] /, '');
  // Lessons built from a supplied PDF cite its pages; a lesson written from scratch has none to cite.
  const hasPages = e => !!(e.source && Array.isArray(e.source.pdf_pages) && e.source.pdf_pages.length);
  const pages = e => (hasPages(e) ? `PDF p. ${e.source.pdf_pages.join('–')}` : 'exercício desta lição');

  // ------------------------------------------------------------------ state
  const fresh = () => ({ version: 1, digest: DIGEST, current: L.exercises[0].id, policy: L.restart.default_policy, newVariant: !!L.restart.new_variant_on_retry, afterN: L.restart.after_n_errors, runs: {}, done: {} });
  let state = fresh(), last = null, storageOk = true, loadNote = '', settingsOpen = false;

  function applySaved(saved) {
    if (!saved || typeof saved !== 'object' || saved.version !== 1) throw new Error('Arquivo de progresso inválido.');
    if (saved.digest !== DIGEST) throw new Error('Este progresso é de outra versão da lição e não pode ser importado.');
    if (!Object.prototype.hasOwnProperty.call(POLICIES, saved.policy)) throw new Error('Modo de reinício inválido.');
    if (!Number.isInteger(saved.afterN) || saved.afterN < 2 || saved.afterN > 5 || typeof saved.newVariant !== 'boolean') throw new Error('Configuração inválida.');
    ex(saved.current);
    const runs = {};
    for (const [id, r] of Object.entries(saved.runs || {})) { if (r.exercise !== id) throw new Error('Exercício inconsistente.'); runs[id] = E.restoreRun(L, r); }
    const done = {};
    for (const [id, d] of Object.entries(saved.done || {})) {
      ex(id);
      if (!d || typeof d.independent !== 'boolean' || !Number.isInteger(d.wrong) || !Number.isInteger(d.hints)) throw new Error('Registro de conclusão inválido.');
      done[id] = { seed: d.seed, independent: d.independent, wrong: d.wrong, hints: d.hints };
    }
    state = { version: 1, digest: DIGEST, current: saved.current, policy: saved.policy, newVariant: saved.newVariant, afterN: saved.afterN, runs, done };
  }
  function snapshot() {
    const out = { ...state, runs: {} };
    for (const [k, r] of Object.entries(state.runs)) out.runs[k] = E.serializeRun(r);
    return out;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(snapshot())); storageOk = true; } catch (e) { storageOk = false; }
  }
  try { const raw = localStorage.getItem(KEY); if (raw) applySaved(JSON.parse(raw)); }
  catch (e) { loadNote = 'O progresso salvo não pôde ser restaurado (' + e.message + '). Começando do início.'; state = fresh(); }
  // The package page passes the restart mode chosen on its screen in the link (#modo=<policy>); it wins over the
  // saved choice once, on arrival, and stays editable in "Modo de repetição e dados".
  const linked = /(?:^#|&)modo=([a-z-]+)/.exec(location.hash || '');
  if (linked && Object.prototype.hasOwnProperty.call(POLICIES, linked[1]) && state.policy !== linked[1]) { state.policy = linked[1]; save(); }

  function currentRun() {
    if (!state.runs[state.current]) state.runs[state.current] = E.createRun(L, state.current, 'original');
    return state.runs[state.current];
  }
  function randomSeed() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; }

  // ------------------------------------------------------------------- views
  function show(view) {
    document.body.dataset.view = view;
    for (const v of ['study', 'practice', 'source']) {
      $('view-' + v).hidden = v !== view;
      $('tab-' + v).setAttribute('aria-pressed', String(v === view));
    }
    if (view === 'practice') renderPractice('heading');
    M.refresh();
  }

  // ------------------------------------------------------------------- study
  function interpretation(e, solved) {
    try { return E.renderTemplate(L, e, solved, e.interpretation_template); } catch (err) { return ''; }
  }
  function summaryLine(e, solved) {
    const p = e.plot, f = id => { const s = e.steps.find(x => x.id === id); return E.formatNumber(solved.values[id], s.display_decimals, L.locale); };
    if (p.kind === 'interval') return `IC 95% = (${f(p.lower)}; ${f(p.upper)})${p.unit ? ' ' + p.unit : ''}; margem E = ${f(p.margin)}.`;
    const rej = Math.abs(solved.values[p.stat]) > solved.values[p.crit];
    return `${p.stat_symbol} = ${f(p.stat)}; |${p.stat_symbol}| ${rej ? '>' : '≤'} ${f(p.crit)} ⇒ ${rej ? 'rejeito H0' : 'não rejeito H0'}.`;
  }

  function explorePanel(e) {
    const cfg = e.explore, orig = E.originalVariables(e), spec = e.variables[cfg.var];
    const id = `explore-${e.id}`;
    const out = h('output', { for: id, id: id + '-value' });
    const result = h('p', { class: 'explore-result', 'aria-live': 'polite' });
    const plot = h('div', { class: 'plot' }), alt = h('p', { class: 'alt' });
    const input = h('input', { type: 'range', id, min: cfg.min, max: cfg.max, step: cfg.step, value: orig[cfg.var] });
    function update() {
      const vars = { ...orig, [cfg.var]: Number(input.value) };
      const solved = E.solve(L, e, vars);
      const decimals = spec.type === 'decimal' ? spec.decimals : 0;
      out.textContent = `${spec.symbol} = ${E.formatNumber(vars[cfg.var], decimals, L.locale)}`;
      input.setAttribute('aria-valuetext', out.textContent);
      const finite = e.steps.every(s => s.type !== 'numeric' || Number.isFinite(solved.values[s.id]));
      if (!finite) { result.textContent = 'Com este valor o cálculo não é possível: ' + solved.problems.join(' '); return; }
      const r = P.render(L, e, solved, { revealAll: true, compact: compact() });
      plot.innerHTML = r.svg; alt.textContent = 'Descrição do gráfico: ' + r.alt;
      result.textContent = summaryLine(e, solved) + (solved.problems.length ? ' Atenção: fora das condições do exercício original — ' + solved.problems.join(' ') : '');
    }
    input.addEventListener('input', update);
    update();
    // Prediction first (learner action), then the control unlocks. The answer is computed by the engine.
    let predict = null;
    if (cfg.predict) {
      const answer = E.predictionAnswer(L, e), words = { aumenta: 'aumenta', diminui: 'diminui', igual: 'fica igual' };
      const verdict = h('p', { class: 'predict-result', 'aria-live': 'polite' });
      input.disabled = true;
      const fs = h('fieldset', { class: 'predict' }, h('legend', { text: cfg.predict.question }),
        Object.entries(words).map(([k, w]) => h('div', { class: 'opt' }, h('input', { type: 'radio', name: id + '-pred', id: `${id}-pred-${k}`, value: k }), h('label', { for: `${id}-pred-${k}`, text: w }))),
        h('button', { type: 'button', class: 'predict-check', onclick: () => {
          const c = fs.querySelector('input:checked');
          if (!c) { verdict.textContent = 'Escolha uma previsão primeiro.'; return; }
          verdict.textContent = (c.value === answer ? 'Previsão certa: ' : `Você previu “${words[c.value]}”; o modelo mostra que `) + `${cfg.predict.label || cfg.predict.quantity} ${words[answer]}. Agora mova o controle e confira no gráfico.`;
          input.disabled = false; input.focus();
        }, text: 'Conferir minha previsão' }), verdict);
      predict = fs;
    }
    return h('section', { class: 'explore', 'aria-labelledby': id + '-h' },
      h('h4', { id: id + '-h', text: 'Explore: preveja, depois mude um dado e veja o gráfico e o resultado mudarem' }),
      predict,
      h('label', { for: id, text: cfg.label }), h('div', { class: 'range-row' }, input, out),
      result, plot, alt,
      h('p', { class: 'muted', text: 'Os outros dados ficam como no enunciado. O gráfico e os números são recalculados da mesma forma que no modo Praticar.' }));
  }

  function renderStudy() {
    const root = $('view-study');
    root.replaceChildren();
    root.append(h('section', { class: 'card intro' },
      h('div', { class: 'study-overview' }, h('div', {},
        h('h2', { text: 'Como usar este material' }),
        h('ol', {},
        h('li', { text: 'Leia cada exercício resolvido abaixo, um passo por vez.' }),
        h('li', { text: 'Use o mapa de decisão para saber qual fórmula usar.' }),
        h('li', { text: 'Depois pratique no modo Praticar, sem olhar: você mesmo separa os dados, escolhe a fórmula, faz as contas e escreve a conclusão.' }),
        h('li', { text: L.conventions.rounding_rule }))),
        h('nav', { class: 'study-index screen-only', 'aria-label': 'Ir para um exercício resolvido' },
          h('h3', { text: 'Exercícios resolvidos' }),
          h('ol', {}, L.exercises.map(e => h('li', {},
            h('a', { href: '#study-' + e.id },
              h('span', { text: exerciseTopic(e) }),
              h('span', { class: 'index-arrow', 'aria-hidden': 'true', text: '↘' }))))))),
      h('h3', { text: 'Mapa de decisão: qual fórmula eu uso? (' + L.decision_map.source.replace('pdf', 'PDF') + ')' }),
      // A table that scrolls sideways on a small screen is a named region the keyboard can reach (axe scrollable-region-focusable).
      h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Mapa de decisão (role para os lados se precisar)' }, h('table', {},
        h('thead', {}, h('tr', {}, ['Pede', 'Sobre', 'Condição', 'Palavras-chave', 'Fórmula'].map(t => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, L.decision_map.rows.map(r => h('tr', {},
          h('td', { text: r.asks }), h('td', { text: r.of }), h('td', { math: r.condition }), h('td', { text: r.keywords }),
          h('td', { math: L.methods.find(m => m.id === r.method).label + (r.exercise ? ` (Ex. ${r.exercise})` : '') }))))))));
    for (const e of L.exercises) {
      const solved = E.solve(L, e, E.originalVariables(e));
      const plot = P.render(L, e, solved, { revealAll: true, compact: compact() });
      const steps = e.steps.map(s => h('li', {}, h('h4', { text: s.title }), h('p', { math: E.renderTemplate(L, e, solved, s.worked) })));
      root.append(h('article', { class: 'card exercise', id: 'study-' + e.id, 'aria-labelledby': 'study-h-' + e.id },
        h('h2', { id: 'study-h-' + e.id, text: e.title }),
        h('p', { class: 'muted', text: pages(e) }),
        h('div', { class: 'box statement' }, h('strong', { text: 'Enunciado' }), h('p', { text: e.original_statement })),
        h('div', { class: 'box translation' }, h('strong', { text: 'Traduzindo para o dia a dia' }), h('p', { text: E.renderTemplate(L, e, solved, e.translation_template) })),
        h('ol', { class: 'worked' }, steps),
        h('figure', {}, svgBox(plot.svg), h('figcaption', { text: 'Descrição do gráfico: ' + plot.alt })),
        h('div', { class: 'box result' }, h('strong', { text: 'Resposta final' }), h('p', { math: summaryLine(e, solved) })),
        h('div', { class: 'box interp' }, h('strong', { text: 'Interpretação em linguagem simples' }), h('p', { text: interpretation(e, solved) })),
        h('div', { class: 'box mistake' }, h('strong', { text: 'Cuidado! Erro comum' }), h('ul', {}, e.common_mistakes.map(m => h('li', { math: E.renderTemplate(L, e, solved, m) })))),
        explorePanel(e),
        h('details', { class: 'recall' }, h('summary', { text: 'Agora refaça sem olhar' }),
          h('p', { text: 'Feche a explicação e resolva o mesmo exercício no modo Praticar. Na repetição, os números mudam e o método fica igual.' }),
          h('button', { type: 'button', onclick: () => { state.current = e.id; last = null; save(); show('practice'); }, text: `Praticar o exercício ${e.number}` }))));
    }
  }

  // ---------------------------------------------------------------- practice
  function renderPractice(focus) {
    const root = $('view-practice'), r = currentRun(), e = ex(r.exercise), total = e.steps.length;
    root.replaceChildren();
    const nav = h('nav', { 'aria-label': 'Exercícios' }, h('ol', { class: 'ex-list' }, L.exercises.map(x => {
      const d = state.done[x.id];
      return h('li', {}, h('button', {
        type: 'button', 'aria-current': x.id === r.exercise ? 'step' : false,
        onclick: () => { state.current = x.id; last = null; save(); renderPractice('heading'); }
      }, `Ex. ${x.number}`, d ? h('span', { class: 'badge', text: d.independent ? ' ✓ sozinho' : ' ✓ com ajuda' }) : null));
    })));

    const policy = h('select', { id: 'policy', onchange: ev => { state.policy = ev.target.value; save(); renderPractice('none'); } },
      Object.entries(POLICIES).map(([k, v]) => h('option', { value: k, selected: k === state.policy, text: v })));
    const afterN = h('select', { id: 'after-n', disabled: state.policy !== 'after-n-errors', onchange: ev => { state.afterN = Number(ev.target.value); save(); renderPractice('none'); } },
      [2, 3, 4, 5].map(n => h('option', { value: n, selected: n === state.afterN, text: String(n) })));
    const variant = h('input', { type: 'checkbox', id: 'new-variant', checked: state.newVariant, onchange: ev => { state.newVariant = ev.target.checked; save(); renderPractice('none'); } });
    const seedInput = h('input', { type: 'text', id: 'seed', inputmode: 'numeric', autocomplete: 'off', value: typeof r.seed === 'number' ? r.seed : '' });
    const startRun = seed => { state.runs[r.exercise] = E.createRun(L, r.exercise, seed); last = { status: 'new-run', seed }; save(); renderPractice('heading'); };
    const settings = h('details', { class: 'card settings', open: settingsOpen, ontoggle: ev => { settingsOpen = ev.target.open; } }, h('summary', { text: 'Modo de repetição e dados' }),
      h('label', { for: 'policy', text: 'Quando eu errar' }), policy,
      h('label', { for: 'after-n', text: 'N (erros antes do reinício completo)' }), afterN,
      h('div', { class: 'check' }, variant, h('label', { for: 'new-variant', text: 'Ao repetir, usar números novos (mesmo enunciado, mesmo método, mesma ordem de passos)' })),
      h('p', { class: 'muted', id: 'restart-help', text: L.restart.learner_help }),
      h('form', { class: 'seed-form', onsubmit: ev => {
        ev.preventDefault();
        const v = seedInput.value.trim();
        if (!/^\d{1,10}$/.test(v) || Number(v) > 4294967295) { last = { status: 'invalid', message: 'A semente é um número inteiro entre 0 e 4294967295.' }; renderPractice('feedback'); return; }
        startRun(Number(v));
      } }, h('label', { for: 'seed', text: 'Semente (para repetir exatamente a mesma variante)' }), seedInput,
        h('div', { class: 'row' }, h('button', { type: 'submit', text: 'Usar esta semente' }),
          h('button', { type: 'button', onclick: () => startRun(randomSeed()), text: 'Números novos' }),
          h('button', { type: 'button', onclick: () => startRun('original'), text: hasPages(e) ? 'Números originais do PDF' : 'Números originais do enunciado' }))));

    const dataLine = r.seed === 'original' ? (hasPages(e) ? `Dados originais do PDF (${pages(e)}).` : 'Dados originais do enunciado.') : `Variante com a semente ${r.seed}: números novos, mesmo enunciado e mesmo método.`;
    const done = r.completed.map((c, i) => h('li', {}, h('span', { class: 'step-name', text: e.steps[i].title }), ' ', h('span', { class: 'val', text: c.display }), ' ', h('span', { class: 'badge ' + c.how, text: HOW[c.how] })));
    const card = h('section', { class: 'card play', 'aria-labelledby': 'play-title' },
      h('p', { class: 'eyebrow', text: `Exercício ${e.number} de ${L.exercises.length} · Passo ${Math.min(r.step + 1, total)} de ${total}` }),
      h('h2', { id: 'play-title', text: exerciseTopic(e) }),
      h('p', { class: 'muted', id: 'data-line', text: dataLine }),
      h('div', { class: 'box statement' }, h('strong', { text: 'Enunciado' }), h('p', { id: 'statement', text: E.statement(L, r) })),
      h('p', { class: 'translation', text: E.text(L, r, e.translation_template) }),
      h('progress', { max: total, value: r.step, 'aria-label': `Progresso: ${r.step} de ${total} passos` }));
    const stepLog = done.length ? h('section', { class: 'card step-log', 'aria-labelledby': 'step-log-title' },
      h('h3', { id: 'step-log-title', text: 'Passos concluídos' }),
      h('ol', { class: 'done', 'aria-label': 'Passos concluídos' }, done)) : null;

    if (r.finished) {
      card.append(h('div', { class: 'box interp' }, h('h3', { id: 'step-title', tabindex: '-1', text: 'Exercício concluído' }),
        h('p', { text: E.text(L, r, e.interpretation_template) }),
        h('p', { class: 'muted', text: `${r.attempts} respostas, ${r.wrong} erros, ${r.hints} dicas. Sem cronômetro: o tempo não conta.` })),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'primary', onclick: () => startRun(E.nextSeed(r)), text: 'Praticar de novo com números novos' }),
          e.number < L.exercises.length ? h('button', { type: 'button', onclick: () => { state.current = L.exercises[e.number].id; last = null; save(); renderPractice('heading'); }, text: 'Próximo exercício' }) : null));
    } else {
      const step = e.steps[r.step];
      const form = h('form', { id: 'answer-form', novalidate: true });
      const locked = r.awaitingRetry;
      if (step.type === 'givens') {
        form.append(h('div', { class: 'givens-fields' }, step.fields.map(f => h('div', {},
          h('label', { for: 'g-' + f.var, math: f.label }),
          h('input', { id: 'g-' + f.var, name: f.var, type: 'text', inputmode: 'decimal', autocomplete: 'off', disabled: locked })))));
      } else if (step.type === 'choice') {
        form.append(h('fieldset', {}, h('legend', { text: 'Escolha uma opção' }), E.optionsFor(L, r, r.step, true).map(o => h('div', { class: 'opt' },
          h('input', { type: 'radio', name: 'choice', id: 'opt-' + o.id, value: o.id, disabled: locked }), h('label', { for: 'opt-' + o.id, math: o.label })))));
      } else if (step.type === 'expression') {
        // A formula in the step's symbols; the engine compares it with the key at sample points.
        form.append(h('label', { for: 'answer', text: 'Sua fórmula' }),
          h('input', { id: 'answer', name: 'answer', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', disabled: locked, 'aria-describedby': 'answer-help' }),
          h('p', { id: 'answer-help', class: 'muted', text: `Símbolos deste passo: ${step.symbols.map(s => s.name).join(', ')}. Operadores: + - * / ^ ( ) e sqrt( ). Qualquer forma equivalente é aceita.` }));
      } else if (step.unit_input) {
        form.append(h('label', { for: 'answer', text: 'Sua resposta, com a unidade' }),
          h('input', { id: 'answer', name: 'answer', type: 'text', inputmode: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', disabled: locked, 'aria-describedby': 'answer-help' }),
          h('p', { id: 'answer-help', class: 'muted', text: `Digite o número e a unidade (este passo pede ${step.unit}). Outra unidade da mesma grandeza é convertida.` }));
      } else {
        form.append(h('label', { for: 'answer', text: 'Sua resposta' + (step.unit ? ` (${step.unit})` : '') }),
          h('input', { id: 'answer', name: 'answer', type: 'text', inputmode: 'decimal', autocomplete: 'off', disabled: locked, 'aria-describedby': 'answer-help' }),
          h('p', { id: 'answer-help', class: 'muted', text: 'Use vírgula ou ponto decimal. Mais casas decimais também são aceitas.' + (step.percent ? ' Pode digitar em % (ex.: 59%).' : '') }));
      }
      form.append(h('div', { class: 'row' },
        h('button', { type: 'submit', class: 'primary', disabled: locked, text: 'Verificar' }),
        h('button', { type: 'button', id: 'hint', disabled: locked, onclick: () => { last = { status: 'hint', ...E.hint(L, r) }; save(); renderPractice('feedback'); }, text: 'Pedir dica' })));
      form.addEventListener('submit', ev => {
        ev.preventDefault();
        let input;
        if (step.type === 'givens') { input = {}; for (const f of step.fields) input[f.var] = form.elements[f.var].value; }
        else if (step.type === 'choice') { const c = form.querySelector('input[name=choice]:checked'); input = c ? c.value : null; }
        else input = form.elements.answer.value;
        last = E.submit(L, r, input);
        if (r.finished) state.done[r.exercise] = { seed: r.seed, independent: r.wrong === 0 && r.completed.every(c => c.how === 'learner'), wrong: r.wrong, hints: r.hints };
        save();
        renderPractice(last.status === 'correct' ? 'heading' : 'feedback');
      });
      card.append(h('h3', { id: 'step-title', tabindex: '-1', text: step.title }), h('p', { class: 'prompt', id: 'prompt', math: E.text(L, r, step.prompt) }), form);
      if (locked) {
        const back = E.returnStepFor(L, r, state.policy, state.afterN);
        card.append(h('div', { class: 'row' }, h('button', {
          type: 'button', id: 'retry', class: 'primary',
          onclick: () => { const res = E.retry(L, r, { policy: state.policy, newVariant: state.newVariant, afterN: state.afterN }); last = { status: 'retried', ...res }; save(); renderPractice('heading'); }
        }, `Tentar de novo: voltar ao passo ${back + 1}` + (state.newVariant ? ' com números novos' : ''))));
      }
    }
    card.append(feedbackBox(r, e));

    const plot = P.render(L, e, r.key, { revealed: new Set(r.completed.map(c => c.id)), compact: compact() });
    const fig = h('figure', { class: 'card linked' }, h('h3', { text: 'Gráfico ligado aos seus passos' }), svgBox(plot.svg),
      h('figcaption', { id: 'plot-alt', text: 'Descrição do gráfico: ' + plot.alt }),
      h('p', { class: 'muted', text: 'Cada valor aparece no gráfico quando você o calcula. Com números novos, o gráfico é recalculado.' }));

    const io = h('section', { class: 'card io', 'aria-label': 'Progresso salvo' },
      h('p', { class: 'muted', id: 'storage-note', text: (loadNote ? loadNote + ' ' : '') + (storageOk ? 'O progresso fica salvo neste navegador. Exporte o arquivo para levar a outro computador.' : 'Este navegador não permite salvar. Exporte o progresso antes de fechar a página.') }),
      h('div', { class: 'row' },
        h('button', { type: 'button', id: 'export', onclick: exportProgress, text: 'Exportar progresso' }),
        h('label', { class: 'file' }, 'Importar progresso ', h('input', { type: 'file', id: 'import', accept: 'application/json', onchange: importProgress })),
        h('button', { type: 'button', id: 'reset', onclick: () => { if (confirm('Apagar o progresso desta lição neste navegador?')) { state = fresh(); last = null; save(); renderPractice('heading'); } }, text: 'Apagar progresso' })));

    // Keep the graph close to the current answer even after many completed steps.
    // From 1024 px the grid puts the sticky plot in its own column beside the card (template CSS).
    root.append(nav, h('div', { class: 'practice-grid' }, card, fig, stepLog, settings, io));
    if (focus === 'heading' && $('step-title')) $('step-title').focus();
    if (focus === 'feedback' && $('feedback')) $('feedback').focus();
  }

  function feedbackBox(r, e) {
    const box = h('div', { id: 'feedback', class: 'feedback', role: 'status', 'aria-live': 'polite', tabindex: '-1' });
    const l = last;
    if (!l) {
      if (r.awaitingRetry) box.append(h('p', { text: 'Você errou este passo antes de recarregar a página. Clique em “Tentar de novo”.' }));
      return box;
    }
    if (l.status === 'invalid') box.append(h('p', { text: l.message }));
    else if (l.status === 'correct' && l.note) box.append(h('p', {}, h('strong', { text: 'Certo! (passo anterior) ' }), h('span', { math: l.note })), h('p', {}, h('strong', { text: 'Resolução do gabarito: ' }), h('span', { math: l.worked })));
    else if (l.status === 'correct') box.append(h('p', {}, h('strong', { text: 'Certo! (passo anterior) ' }), h('span', { math: l.worked })));
    else if (l.status === 'hint') box.append(h('p', {}, h('strong', { text: l.worked ? 'Passo resolvido: ' : `Dica ${l.level}: ` }), h('span', { math: l.text })));
    else if (l.status === 'wrong') {
      box.classList.add('wrong');
      box.append(h('p', {}, h('strong', { text: 'Ainda não. ' }), h('span', { math: l.feedback })));
      if (l.fields) box.append(h('p', { text: 'Confira: ' + l.fields.map(v => e.variables[v].symbol).join(', ') + '.' }));
      if (l.hint) box.append(h('p', {}, h('strong', { text: 'Dica: ' }), h('span', { math: l.hint })));
      if (l.worked) box.append(h('p', {}, h('strong', { text: 'Passo resolvido: ' }), h('span', { math: l.worked })));
    } else if (l.status === 'retried') {
      box.append(h('p', { text: `Você voltou ao passo ${l.returnStep + 1}.` + (state.newVariant ? ` Números novos (semente ${l.seed}); os passos anteriores foram recalculados para os novos dados.` : ' Os números continuam os mesmos.') }));
    } else if (l.status === 'new-run') box.append(h('p', { text: l.seed === 'original' ? 'Exercício reiniciado com os números originais.' : `Nova variante com a semente ${l.seed}.` }));
    return box;
  }

  function exportProgress() {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = h('a', { href: url, download: `${L.id}-progresso.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importProgress(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2000000) throw new Error('Arquivo grande demais.');
      applySaved(JSON.parse(await file.text()));
      last = { status: 'invalid', message: 'Progresso importado.' };
      save();
    } catch (e) { last = { status: 'invalid', message: 'Não foi possível importar: ' + e.message }; }
    renderPractice('feedback');
  }

  // ------------------------------------------------------------------ source
  // Each block of the Fonte view is printed only when the lesson has its data: a lesson without a t table, source
  // notes or alternative key paths gets no empty table, heading or list (checked by scripts/lib/empty-sections.mjs
  // on every build and in tests/a11y-browser.mjs).
  function renderSource() {
    const c = L.conventions, root = $('view-source');
    const tTable = Object.entries(c.t_table || {});
    const learnerSources = (L.sources || []).filter(s => s.learner_label);
    const keyPaths = L.exercises.filter(x => x.key_path);
    const figures = P.figuresCopy(L);
    const conventions = [
      typeof c.z95 === 'number' ? `Valor crítico z (95%): ${E.formatNumber(c.z95, 2, L.locale)}${c.z95_source ? ` — ${c.z95_source}` : ''}.` : null,
      c.rounding_rule, c.decision_rule
    ].filter(Boolean);
    const stepRules = Object.entries(c.step_rules || {});
    root.replaceChildren(h('section', { class: 'card' },
      h('h2', { text: (L.source_notes || []).length ? 'Fonte, convenções e divergências' : 'Fonte e convenções' }),
      c.first_attempt ? h('p', { text: c.first_attempt }) : null,
      conventions.length ? [h('h3', { text: 'Convenções da professora' }), h('ul', {}, conventions.map(t => h('li', { math: t })))] : null,
      tTable.length ? h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Excerto da tabela t' }, h('table', {}, h('caption', { text: 'Excerto da tabela t: ' + c.t_table_source }),
        h('thead', {}, h('tr', {}, h('th', { scope: 'row', text: 'gl' }), tTable.map(([k]) => h('th', { scope: 'col', text: k })))),
        h('tbody', {}, h('tr', {}, h('th', { scope: 'row', text: 't' }), tTable.map(([, v]) => h('td', { text: E.formatNumber(v, 3, L.locale) })))))) : null,
      stepRules.length ? [h('h3', { text: 'Regra por tipo de passo' }),
        h('dl', {}, stepRules.flatMap(([k, v]) => [h('dt', { text: STEP_RULE_LABELS[k] || 'Outros passos' }), h('dd', { math: v })]))] : null,
      (L.source_notes || []).length ? [h('h3', { text: 'Divergências encontradas no material (com página)' }),
        h('ul', {}, L.source_notes.map(n => h('li', {}, h('strong', { text: `p. ${n.pages.join(', ')} (${NOTE_KINDS[n.kind] || 'observação'}): ` }), n.text)))] : null,
      // File paths and SHA-256 digests stay in the build manifest (inputs[]), not in learner copy.
      learnerSources.length ? [h('h3', { text: 'Material de origem' }), h('ul', {}, learnerSources.map(s => h('li', { text: s.learner_label })))] : null,
      figures ? [h('h3', { text: 'Imagens e gráficos' }),
        h('p', { text: 'Todos os gráficos são desenhados a partir dos mesmos números da resolução. Não há imagens geradas por inteligência artificial nem arquivos externos; a página funciona sem internet.' }),
        h('p', { text: figures })] : null,
      L.restart && L.restart.source_rationale ? [h('h3', { text: 'Modos de repetição' }), h('p', { text: L.restart.source_rationale })] : null,
      keyPaths.length || L.carry_paths ? h('h3', { text: 'Caminhos de cálculo aceitos' }) : null,
      keyPaths.length ? h('ul', {}, keyPaths.map(x => h('li', {}, h('strong', { text: `Ex. ${x.number}: ` }), `gabarito = ${x.key_path} Também aceito: ` + (x.accepted_paths || []).map(p => p.label).join('; ') + '.'))) : null,
      L.carry_paths ? h('p', { id: 'carry-paths', text: `${keyPaths.length ? 'Em todos os exercícios, cada' : 'Cada'} passo também aceita a conta feita com ${L.carry_paths.display.label} ou com ${L.carry_paths.learner.label}, sempre com a mesma tolerância do passo e um aviso. Um valor recusado nunca entra na conta seguinte.` }) : null,
      // Lesson id, format id/version and the content digest are build data (manifest.json), not learner copy.
      h('p', { class: 'muted', text: `Versão deste material: revisão ${L.revision}.` })));
  }

  // -------------------------------------------------------------------- boot
  document.documentElement.lang = L.language;
  document.title = L.title;
  const [title, ...topic] = L.title.split(' — ');
  // replaceChildren prints a null argument as the text "null", so the topic is spread in only when there is one.
  $('title').replaceChildren(title, ...(topic.length ? [h('span', { class: 'hero-topic' },
    h('span', { class: 'hero-divider', text: ' — ' }), topic.join(' — '))] : []));
  $('objectives').replaceChildren(...L.objectives.map(o => h('li', { text: typeof o === 'string' ? o : o.text })));
  for (const v of ['study', 'practice', 'source']) $('tab-' + v).addEventListener('click', () => show(v));
  renderStudy();
  renderSource();
  renderPractice('none');
  show('study');
  narrowQuery.addEventListener('change', () => { renderStudy(); renderPractice('none'); });
  window.__pilot = { state: () => snapshot(), lesson: L };
})();
