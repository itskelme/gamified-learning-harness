/*
 * Slide deck model from one schema-1.0 lesson (ACCEPTANCE line 19: the same lesson yields study guide, slides,
 * retrieval practice and the game). Node only: scripts/build-lesson.mjs embeds the deck in templates/slides.html
 * and harness/player/slides-player.js renders it. Every slide is derived from lesson content; figures are SVG
 * drawn from the same solved data (plot_spec) or the same case graph as the other artifacts.
 *
 * deck = { title, language, slides: [{ id, title, kicker?, paragraphs?, list?, table?, steps?, figure?: { svg, alt },
 *          retrieval?: { prompt, answer }, sources? }] }
 */
'use strict';
const E = require('./procedure-engine.js');
const Plots = require('./plots.js');
const Spec = require('./formats/fmt-data-visual-lab/procedure-spec.js');
const Case = require('./case-diagram.js');

const objText = o => (typeof o === 'string' ? o : o.text);

/**
 * How one source is named to a learner (slides, study guide, LaTeX): the learner label or the citation. A source
 * with neither is named by what it is, never by an internal note (a title such as "...recomputed in the tests").
 */
function sourceLabel(s, language) {
  if (s.learner_label || s.citation) return s.learner_label || s.citation;
  const pt = (language || '').startsWith('pt');
  if (s.status === 'author-created-example') return pt ? 'Exemplo criado para esta lição.' : 'Worked example written for this lesson.';
  if (s.status === 'supplied-material') return pt ? 'Material fornecido para esta lição.' : 'Material supplied for this lesson.';
  return s.title || s.id;
}

/** True when any of these claims is unverified (shallow-brief drafts). Used by slides, study guide and LaTeX. */
function hasUnverified(lesson, claimIds) {
  return (claimIds || []).some(id => ((lesson.claims || []).find(c => c.id === id) || {}).status === 'unverified');
}

function sourceLine(lesson, claimIds) {
  const claims = lesson.claims || [], sources = lesson.sources || [], out = [];
  for (const cid of claimIds || []) {
    const c = claims.find(x => x.id === cid);
    for (const sid of (c && c.source_ids) || []) { const s = sources.find(x => x.id === sid); if (s && !out.includes(s.short || s.title)) out.push(s.short || s.title); }
  }
  return out;
}

// Deck text by language (learner-facing). `ui` is the player chrome; the rest labels slides.
const TEXT = {
  pt: {
    objectives: 'Objetivos', mapTitle: 'Qual método eu uso?', mapKicker: 'Mapa de decisão', mapHead: ['Pede', 'Sobre', 'Condição', 'Método'],
    mapPrompt: 'Sem olhar a tabela: que método cada situação pede?', problem: 'O problema', methodPrompt: 'Antes de calcular: qual método e por quê?',
    steps: 'Passo a passo', conclusion: 'Conclusão', careful: 'Cuidado: ', conclPrompt: 'Sem olhar: qual é a conclusão em linguagem simples?',
    remember: 'Para lembrar', summary: 'Resumo', practiceNote: 'Agora pratique sem olhar: os números mudam, os passos ficam iguais.',
    caseTitle: 'O caso em uma figura', caseKicker: 'Árvore de decisão', pathsTitle: 'Todos os caminhos do caso', pathsKicker: 'Caminhos, pontos e princípios',
    pathsHead: ['Escolhas', 'Final', 'Pontos'], pathsPrompt: 'Nos caminhos que não fizeram a pontuação máxima, que princípio ficou de lado?',
    glossary: 'Glossário', glossaryHead: ['Termo', 'Em linguagem simples'], exercise: 'Exercício', interpPrompt: 'Qual é a interpretação?', sources: 'Fontes',
    draftTitle: 'Rascunho: confira antes de usar', draftKicker: 'Feito a partir de um pedido curto', draftIntro: 'Este material foi montado a partir de um pedido curto. Confira as suposições e as afirmações não verificadas antes de usar.',
    assumption: 'Suposição: ', unverified: 'Não verificada: ', unverifiedInline: '(afirmação não verificada)',
    ui: { hint: 'Use as setas do teclado ou os botões para passar os slides.', prev: '← Anterior', next: 'Próximo →', show: 'Mostrar resposta', hide: 'Esconder resposta',
      counter: 'Slide {n} de {N}', recall: 'Tente lembrar: ', flag: 'Afirmação ainda não verificada: confira a fonte antes de usar.', figure: 'Descrição da figura: ',
      sourcesPrefix: 'Fontes: ', nav: 'Navegação dos slides', deck: 'apresentação', slide: 'slide', scrollHint: 'Deslize a figura para os lados para ver tudo.' }
  },
  en: {
    objectives: 'Objectives', mapTitle: 'Which method do I use?', mapKicker: 'Decision map', mapHead: ['Asks for', 'About', 'Condition', 'Method'],
    mapPrompt: 'Without looking at the table: which method does each situation need?', problem: 'The problem', methodPrompt: 'Before computing: which method, and why?',
    steps: 'Step by step', conclusion: 'Conclusion', careful: 'Watch out: ', conclPrompt: 'Without looking: what is the conclusion in plain words?',
    remember: 'To remember', summary: 'Summary', practiceNote: 'Now practise without looking: the numbers change, the steps stay the same.',
    caseTitle: 'The case in one figure', caseKicker: 'Decision tree', pathsTitle: 'Every path through the case', pathsKicker: 'Paths, points and principles',
    pathsHead: ['Choices', 'Ending', 'Points'], pathsPrompt: 'On the paths below full marks, which principle was left out?',
    glossary: 'Glossary', glossaryHead: ['Term', 'In plain words'], exercise: 'Exercise', interpPrompt: 'What is the interpretation?', sources: 'Sources',
    draftTitle: 'Draft: check before use', draftKicker: 'Made from a short brief', draftIntro: 'This material was drafted from a short brief. Check the assumptions and the unverified claims before use.',
    assumption: 'Assumption: ', unverified: 'Unverified: ', unverifiedInline: '(unverified claim)',
    ui: { hint: 'Use the arrow keys or the buttons to move between slides.', prev: '← Previous', next: 'Next →', show: 'Show answer', hide: 'Hide answer',
      counter: 'Slide {n} of {N}', recall: 'Try to recall: ', flag: 'Claim not verified yet: check the source before use.', figure: 'Figure description: ',
      sourcesPrefix: 'Sources: ', nav: 'Slide navigation', deck: 'presentation', slide: 'slide', scrollHint: 'Scroll the figure sideways to see all of it.' }
  }
};
const textFor = lesson => ((lesson.language || '').startsWith('pt') ? TEXT.pt : TEXT.en);

function procedureDeck(lesson, T) {
  const slides = [{ id: 'capa', title: lesson.title, kicker: T.objectives, list: lesson.objectives.map(objText) }];
  const methodName = id => (lesson.methods.find(m => m.id === id) || {}).label || id;
  if (lesson.decision_map && lesson.decision_map.rows && lesson.decision_map.rows.length) {
    const rows = lesson.decision_map.rows;
    slides.push({ id: 'mapa', title: T.mapTitle, kicker: T.mapKicker,
      table: { head: T.mapHead, rows: rows.map(r => [r.asks, r.of, r.condition, methodName(r.method)]) },
      retrieval: { prompt: T.mapPrompt, answer: rows.map(r => `${r.asks} (${r.condition}): ${methodName(r.method)}`).join('; ') } });
  }
  for (const ex of lesson.exercises) {
    const solved = E.solve(lesson, ex, E.originalVariables(ex));
    const method = ex.steps.find(s => s.role === 'method');
    slides.push({ id: `${ex.id}-problema`, title: ex.title, kicker: T.problem,
      paragraphs: [ex.original_statement, E.renderTemplate(lesson, ex, solved, ex.translation_template)],
      retrieval: method ? { prompt: T.methodPrompt, answer: `${methodName(solved.values[method.id])}. ${E.renderTemplate(lesson, ex, solved, method.worked)}` } : null });
    let figure = null;
    // Two drawings of the same spec: the compact one keeps labels legible on narrow screens (the player picks).
    if (ex.plot) { const spec = Spec.plotSpecFor(lesson, ex, solved), r = Plots.renderSpec(spec); figure = { svg: r.svg, svg_compact: Plots.renderSpec(spec, { compact: true }).svg, alt: r.alt }; }
    slides.push({ id: `${ex.id}-passos`, title: ex.title, kicker: T.steps,
      steps: ex.steps.map(s => ({ title: s.title, text: E.renderTemplate(lesson, ex, solved, s.worked) })), figure });
    slides.push({ id: `${ex.id}-conclusao`, title: ex.title, kicker: T.conclusion,
      paragraphs: [E.renderTemplate(lesson, ex, solved, ex.interpretation_template)],
      list: (ex.common_mistakes || []).map(m => `${T.careful}${E.renderTemplate(lesson, ex, solved, m)}`),
      retrieval: { prompt: T.conclPrompt, answer: E.renderTemplate(lesson, ex, solved, ex.interpretation_template) } });
  }
  const c = lesson.conventions || {};
  slides.push({ id: 'fechamento', title: T.remember, kicker: T.summary, list: [c.rounding_rule, c.decision_rule].filter(Boolean).concat([T.practiceNote]) });
  return slides;
}

function declarativeDeck(lesson, T) {
  const st = lesson.study;
  const slides = [{ id: 'capa', title: lesson.title, kicker: T.objectives, list: lesson.objectives.map(objText), paragraphs: st.intro ? [st.intro] : [] }];
  for (const sec of st.sections) {
    const unverified = hasUnverified(lesson, sec.claim_ids);
    slides.push({ id: sec.id, title: sec.title, paragraphs: sec.paragraphs, sources: sourceLine(lesson, sec.claim_ids), retrieval: sec.retrieval || null, unverified });
  }
  const caseItem = ((lesson.practice || {}).units || []).flatMap(u => u.items).find(i => i.format === 'fmt-branching-case');
  if (caseItem) {
    const d = Case.render(caseItem.payload.graph);
    slides.push({ id: 'caso-arvore', title: T.caseTitle, kicker: T.caseKicker, figure: { svg: d.svg, alt: d.alt, wide: true }, list: d.legend.map(l => `${l.label}: ${l.text}`) });
    const weak = [...new Set(d.paths.filter(p => p.score.earned < p.score.max).map(p => p.principle))];
    slides.push({ id: 'caso-caminhos', title: T.pathsTitle, kicker: T.pathsKicker,
      table: { head: T.pathsHead, rows: d.paths.map(p => [p.steps.join(' → '), p.ending, `${p.score.earned}/${p.score.max}`]) },
      retrieval: weak.length ? { prompt: T.pathsPrompt, answer: weak.join(' ') } : null });
  }
  // The glossary mixes sourced and unverified entries, so each unverified definition carries its own marker.
  if ((st.glossary || []).length) slides.push({ id: 'glossario', title: T.glossary, table: { head: T.glossaryHead,
    rows: st.glossary.map(g => [g.term, hasUnverified(lesson, g.claim_ids) ? `${g.definition} ${T.unverifiedInline}` : g.definition]) } });
  if ((st.summary || []).length) slides.push({ id: 'resumo', title: T.remember, kicker: T.summary, list: st.summary });
  return slides;
}

function slidesPracticeDeck(lesson, T) {
  const slides = [{ id: 'capa', title: lesson.title, kicker: T.objectives, list: lesson.objectives.map(objText) }];
  // Schema 0.1 slides carry a recall prompt and no separate answer: the slide body is the answer.
  for (const s of lesson.slides) slides.push({ id: s.id, title: s.title, paragraphs: [s.body], retrieval: { prompt: s.retrieval_prompt, answer: s.retrieval_answer || s.body } });
  for (const ex of lesson.exercises) {
    slides.push({ id: ex.id, title: ex.statement, kicker: T.exercise, paragraphs: [ex.translation], steps: ex.steps.map(s => ({ title: s.prompt, text: s.worked_solution })), retrieval: { prompt: T.interpPrompt, answer: ex.interpretation } });
  }
  return slides;
}

/** Shallow-brief drafts open with what was assumed and what is not verified yet. */
function draftSlide(lesson, T) {
  return { id: 'rascunho', title: T.draftTitle, kicker: T.draftKicker, paragraphs: [T.draftIntro],
    list: [...lesson.brief.assumptions.map(a => `${T.assumption}${a}`), ...lesson.brief.unverified_claims.map(u => `${T.unverified}${u}`)] };
}

function sourcesSlide(lesson, T) {
  return { id: 'fontes', title: T.sources, list: (lesson.sources || []).map(s => sourceLabel(s, lesson.language)) };
}

function buildDeck(lesson) {
  if (lesson.schema_version !== '1.0') throw new Error('buildDeck needs a schema 1.0 lesson (run scripts/harness.py normalize first)');
  const T = textFor(lesson);
  const slides = lesson.kind === 'ordered-procedure' ? procedureDeck(lesson, T) : lesson.kind === 'declarative-case' ? declarativeDeck(lesson, T) : slidesPracticeDeck(lesson, T);
  if (lesson.brief) slides.splice(1, 0, draftSlide(lesson, T));
  slides.push(sourcesSlide(lesson, T));
  return { title: lesson.title, language: lesson.language, lesson_id: lesson.id, revision: lesson.revision, ui: T.ui, slides };
}

module.exports = { buildDeck, sourceLine, sourceLabel, hasUnverified, TEXT };
