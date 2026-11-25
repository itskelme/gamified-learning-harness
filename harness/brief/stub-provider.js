/*
 * Deterministic stub provider for the shallow-brief path (no model call, no network). It only rearranges what the
 * brief says: each point becomes a study section and a claim tied to the point's source_id (if any), each term
 * becomes a glossary entry and a case in one "term -> definition" classification item. It adds no facts.
 * A real provider (a model behind an API) plugs in with the same shape: { id, draft(brief) -> { lesson, assumptions } }.
 */
'use strict';

const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

function draft(brief) {
  const points = Array.isArray(brief.points) ? brief.points.filter(p => p && p.text) : [];
  const terms = Array.isArray(brief.terms) ? brief.terms.filter(t => t && t.term && t.definition) : [];
  if (!points.length) throw new Error('O provider stub precisa de pelo menos um ponto em "points".');
  if (terms.length < 2) throw new Error('O provider stub precisa de pelo menos dois termos em "terms" para montar a prática.');
  const language = brief.language || 'pt-BR';
  const assumptions = [
    brief.audience ? `Público informado: ${brief.audience}.` : 'Público não informado: o rascunho supõe adultos iniciantes, sem pré-requisitos.',
    `Duração suposta: uma sessão de cerca de ${10 + 5 * points.length} minutos (leitura, lembrar sem olhar e uma prática).`,
    brief.language ? `Idioma informado: ${language}.` : `Idioma não informado: o rascunho usa ${language}.`,
    'O texto das seções repete os pontos do pedido; nenhum fato novo foi acrescentado.'
  ];
  const claims = [], sections = [];
  points.forEach((p, i) => {
    const cid = `c-ponto-${i + 1}`, title = p.title || `Ponto ${i + 1}`;
    claims.push({ id: cid, text: p.text, status: p.source_id ? 'sourced' : 'unverified', source_ids: p.source_id ? [p.source_id] : [] });
    sections.push({ id: `ponto-${i + 1}`, title, paragraphs: [p.text], claim_ids: [cid],
      // The box label already says "Tente lembrar, sem olhar:", so the prompt does not repeat it.
      retrieval: { prompt: `O que diz o ponto “${title}”?`, answer: p.text } });
  });
  const termClaims = terms.map((t, i) => {
    const cid = `c-termo-${i + 1}`;
    claims.push({ id: cid, text: `${t.term}: ${t.definition}`, status: t.source_id ? 'sourced' : 'unverified', source_ids: t.source_id ? [t.source_id] : [] });
    return cid;
  });
  const lesson = {
    schema_version: '1.0', kind: 'declarative-case', id: `rascunho-${slug(brief.topic)}`, revision: 1,
    title: brief.topic, language, locale: language, domain: brief.domain || 'general',
    objectives: [
      { id: 'o-recall', verb: 'recall', text: `Lembrar os pontos principais sobre ${brief.topic}.` },
      { id: 'o-classify', verb: 'classify', text: 'Associar cada termo à sua definição.' },
      { id: 'o-review', verb: 'review', text: 'Revisar os termos em dias diferentes, sem consultar o material.' }
    ],
    sources: [], claims,
    study: { intro: brief.request, sections, glossary: terms.map((t, i) => ({ term: t.term, definition: t.definition, claim_ids: [termClaims[i]] })), summary: sections.map(s => s.title) },
    practice: { units: [{ id: 'termos', kind: 'declarative', title: 'Termos', objectives: ['o-classify', 'o-review'], items: [
      { id: 'termos-definicoes', format: 'fmt-match-classify', title: 'Qual termo corresponde a cada definição?', claim_ids: termClaims,
        payload: { categories: terms.map((t, i) => ({ id: `t${i + 1}`, label: t.term })),
          cases: terms.map((t, i) => ({ id: `d${i + 1}`, text: t.definition, category: `t${i + 1}`, misconception_tag: 'term_confusion' })) } }
    ] }] },
    restart: { default_policy: 'failed-step', policies: ['full', 'failed-step', 'checkpoint', 'after-n-errors'], after_n_errors: 2 }
  };
  return { lesson, assumptions };
}

module.exports = { id: 'stub', draft };
