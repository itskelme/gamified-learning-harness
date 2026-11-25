/*
 * Shallow-brief path (card t_fd19236f C): a short request plus at least one source -> a schema-1.0 draft lesson of
 * kind declarative-case, through an injectable provider. The provider writes the draft; this module does not trust
 * it on the three things the card asks for:
 * 1. No source, no draft: a brief without a usable source is refused before the provider is called (BriefError).
 * 2. Unverified claims are flagged: a claim the provider ties to no source, or to a source the brief did not give,
 *    becomes status "unverified" and is listed in lesson.brief.unverified_claims. Glossary entries carry claim ids
 *    (an entry without them gets an unsourced claim). The study guide, slides and LaTeX flag every printed
 *    occurrence: section paragraphs, glossary definitions and recall answers (tests/contract/unverified-flags.test.js).
 * 3. assumptions[]: the provider must state what it assumed (audience, length, scope...); an empty list is refused,
 *    because a short request always leaves something to assume.
 * The brief's sources are recorded as given, status "unverified": nobody has checked that they say what the
 * draft attributes to them. The draft banner asks the author to check both before use.
 *
 * brief = { request, topic, language?, domain?, audience?, sources: [{ id, citation | title, short? }],
 *           points: [{ title?, text, source_id? }], terms?: [{ term, definition, source_id? }] }
 * provider = { id, draft(brief) -> { lesson, assumptions: string[] } }
 */
'use strict';

class BriefError extends Error {
  constructor(message) { super(message); this.name = 'BriefError'; }
}

function usableSources(brief) {
  return (Array.isArray(brief.sources) ? brief.sources : []).filter(s => s && typeof s.id === 'string' && s.id && (s.citation || s.title));
}

/** Problems with the brief itself (empty = the provider may be called). */
function briefProblems(brief) {
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return ['O pedido precisa ser um objeto JSON.'];
  const p = [];
  if (!usableSources(brief).length) p.push('Pedido recusado: nenhuma fonte foi informada. Um pedido curto precisa de pelo menos uma fonte em "sources" (com "id" e "citation" ou "title"); nada foi gerado.');
  if (typeof brief.request !== 'string' || !brief.request.trim()) p.push('Pedido recusado: falta o texto do pedido em "request".');
  if (typeof brief.topic !== 'string' || !brief.topic.trim()) p.push('Pedido recusado: falta o tema em "topic".');
  return p;
}

/** brief + provider -> schema-1.0 draft lesson (not yet validated by the Python contract; build-lesson does that). */
function draftLesson(brief, provider) {
  const problems = briefProblems(brief);
  if (problems.length) throw new BriefError(problems.join(' '));
  if (!provider || typeof provider.draft !== 'function' || typeof provider.id !== 'string') throw new BriefError('Provider inválido: precisa de "id" e de uma função "draft(brief)".');
  const out = provider.draft(JSON.parse(JSON.stringify(brief)));
  if (!out || !out.lesson) throw new BriefError(`O provider ${provider.id} não devolveu uma lição.`);
  const assumptions = Array.isArray(out.assumptions) ? out.assumptions.filter(a => typeof a === 'string' && a.trim()) : [];
  if (!assumptions.length) throw new BriefError(`O provider ${provider.id} não listou nenhuma suposição; um pedido curto sempre deixa algo a supor.`);
  const lesson = out.lesson;
  const given = usableSources(brief);
  const known = new Set(given.map(s => s.id));
  // The brief's sources, as given (the provider cannot add or drop sources).
  lesson.sources = given.map(s => ({ id: s.id, status: 'unverified', ...(s.title ? { title: s.title } : {}), citation: s.citation || s.title, ...(s.short ? { short: s.short } : {}), ...(s.doi ? { doi: s.doi } : {}), ...(s.url ? { url: s.url } : {}),
    verification: 'Fonte indicada no pedido; ainda não conferida.' }));
  // A glossary definition is a claim too: an entry the provider left without claim ids gets its own claim, with no
  // source, so it is flagged as unverified wherever it is printed instead of passing as fact.
  lesson.claims = lesson.claims || [];
  ((lesson.study || {}).glossary || []).forEach((g, i) => {
    if (Array.isArray(g.claim_ids) && g.claim_ids.length) return;
    const id = `c-glossario-${i + 1}`;
    lesson.claims.push({ id, text: `${g.term}: ${g.definition}`, status: 'unverified', source_ids: [] });
    g.claim_ids = [id];
  });
  for (const c of lesson.claims) {
    const ids = Array.isArray(c.source_ids) ? c.source_ids : [];
    if (!ids.length || ids.some(id => !known.has(id))) {
      c.status = 'unverified';
      c.source_ids = ids.filter(id => known.has(id));
      c.note = 'Sem fonte do pedido que a apoie: confira antes de usar.';
    } else if (c.status !== 'unverified') c.status = 'sourced';
  }
  lesson.brief = { provider: provider.id, request: brief.request, assumptions, unverified_claims: (lesson.claims || []).filter(c => c.status === 'unverified').map(c => c.text) };
  return lesson;
}

module.exports = { draftLesson, briefProblems, BriefError };
