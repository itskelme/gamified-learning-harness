/*
 * Generic package composer for schema-1.0 declarative lessons (kind "declarative-case").
 * The lesson authors its practice items in each format's payload contract (catalog r3 section 4); this module
 * only copies them into package units, resolves each item's source_ref from its claim ids, and refuses the
 * package when any item fails its format's own validator. It invents no text.
 * Used by harness/packages/humanities.js and scripts/build-lesson.mjs (any declarative lesson file).
 */
'use strict';
const MCQ = require('../formats/fmt-choice-feedback/grader.js');
const CLZ = require('../formats/fmt-retrieval-cloze/grader.js');
const MAT = require('../formats/fmt-match-classify/grader.js');
const SEQ = require('../formats/fmt-sequence-order/grader.js');
const BRA = require('../formats/fmt-branching-case/grader.js');

/** Learner label for a claim with no source yet (shallow-brief drafts only; the lesson contract refuses it elsewhere). */
const UNVERIFIED_LABEL = 'afirmação não verificada';

/**
 * "Barnett, van der Pols e Dobson (2005); Galton (1886)" for the claims an item rests on; null when unsourced.
 * An unverified claim with no source is named as such ("afirmação não verificada"), never passed off as sourced.
 */
function sourceRef(lesson, claimIds) {
  const claims = lesson.claims || [], sources = lesson.sources || [];
  if (!Array.isArray(claimIds) || !claimIds.length) return null;
  const labels = [];
  for (const cid of claimIds) {
    const c = claims.find(x => x.id === cid);
    if (c && c.status === 'unverified' && !(c.source_ids || []).length) { if (!labels.includes(UNVERIFIED_LABEL)) labels.push(UNVERIFIED_LABEL); continue; }
    if (!c || !Array.isArray(c.source_ids) || !c.source_ids.length) return null;
    for (const sid of c.source_ids) {
      const s = sources.find(x => x.id === sid);
      if (!s) return null;
      const label = s.short || s.title;
      if (!labels.includes(label)) labels.push(label);
    }
  }
  return labels.join('; ');
}

/** Problems with one authored item (empty list = valid for its format). */
function itemProblems(it) {
  const p = it.payload || {}, at = `${it.id} (${it.format})`;
  const out = [];
  switch (it.format) {
    case 'fmt-choice-feedback': out.push(...MCQ.validateItem(p)); break;
    case 'fmt-retrieval-cloze': {
      const named = new Set(CLZ.parseTemplate(p.template || '').filter(x => x.blank).map(x => x.blank));
      for (const b of p.blanks || []) if (!named.has(b.id)) out.push(`blank ${b.id} is not in the template`);
      if (!(p.blanks || []).length) out.push('needs blanks');
      for (const b of p.blanks || []) if (!b.spec || !['number', 'text'].includes(b.spec.type) || (b.spec.type === 'text' && !(b.spec.accepted || []).length)) out.push(`blank ${b.id}: bad spec`);
      break;
    }
    case 'fmt-match-classify': out.push(...MAT.validate(p.categories || [], p.cases || [])); break;
    case 'fmt-sequence-order': {
      out.push(...SEQ.validate(p.entries || []));
      const ids = (p.entries || []).map(e => e.id);
      if (!Array.isArray(p.key_order) || p.key_order.length !== ids.length || [...p.key_order].sort().join() !== [...ids].sort().join()) out.push('key_order must list every entry once');
      break;
    }
    case 'fmt-branching-case': {
      out.push(...BRA.validate(p.graph || {}));
      for (const [id, n] of Object.entries((p.graph || {}).nodes || {})) for (const [k, c] of Object.entries(n.choices || {})) {
        if (!c.feedback) out.push(`choice ${id}.${k} needs feedback for the debrief`);
        const best = Math.max(...Object.values(n.choices).map(x => x.quality));
        if (c.quality < best && !c.misconception_tag) out.push(`choice ${id}.${k} below the best needs misconception_tag`);
      }
      const pc = p.principle_check;
      if (pc) {
        if ((pc.options || []).filter(o => o.correct === true).length !== 1) out.push('principle_check needs exactly one correct option');
        for (const o of pc.options || []) if (!o.correct && !o.feedback) out.push(`principle_check option ${o.id} needs feedback`);
      }
      break;
    }
    default: out.push('format not supported by the declarative composer');
  }
  return out.map(x => `${at}: ${x}`);
}

function composeDeclarative(lesson) {
  if (lesson.schema_version !== '1.0' || lesson.kind !== 'declarative-case') throw new Error(`${lesson.id}: the declarative composer needs a schema 1.0 lesson of kind declarative-case`);
  const problems = [];
  const units = ((lesson.practice || {}).units || []).map(u => ({
    id: u.id, kind: u.kind, title: u.title, objectives: u.objectives,
    items: u.items.map(it => {
      problems.push(...itemProblems(it));
      const payload = it.format === 'fmt-choice-feedback' ? { ...it.payload, id: it.id } : it.payload;
      return { id: it.id, format: it.format, title: it.title, source_ref: sourceRef(lesson, it.claim_ids), claim_ids: it.claim_ids || [], payload };
    })
  }));
  if (!units.length) problems.push('practice.units is empty');
  if (problems.length) throw new Error(`${lesson.id}: ${problems.join('; ')}`);
  return {
    id: `${lesson.id}-package`, language: lesson.language, locale: lesson.locale, revision: lesson.revision,
    objectives: lesson.objectives.map(o => ({ id: o.id, verb: o.verb })), units
  };
}

/*
 * Generic composer for schema-1.0 ordered-procedure lessons that have no curated composer (Prova 3 keeps its
 * own, harness/packages/prova3.js). Every item is DERIVED from the lesson; nothing is authored here:
 * - the step ladder over every exercise (link to the lesson's step player);
 * - the step order of the first exercise (titles; rationale = the step prompt with the original data);
 * - the lab of the first exercise with an `explore` block and a plot (plot_spec from the engine's solution);
 * - the interpretation choice of the first exercise whose interpretation step has options with feedback;
 * - method classification only when two or more exercises use different methods (one case teaches nothing).
 * source_ref: the exercise's PDF pages when the lesson records them, else the lesson's own source labels.
 */
function composeProcedure(lesson, deps) {
  const E = deps.engine, Spec = deps.plotSpec;
  if (lesson.schema_version !== '1.0' || lesson.kind !== 'ordered-procedure') throw new Error(`${lesson.id}: the procedure composer needs a schema 1.0 lesson of kind ordered-procedure`);
  const exs = lesson.exercises;
  const labels = [...new Set((lesson.sources || []).map(s => s.short || s.title).filter(Boolean))];
  const ref = ex => {
    const pages = (ex && ex.source && ex.source.pdf_pages) || [];
    return pages.length ? `PDF p.${pages.join('–')}` : labels.length ? labels.join('; ') : null;
  };
  const title = s => s.title.replace(/^Passo \S+ — /, '');
  const items = [];
  const verbs = new Set(lesson.objectives.map(o => o.verb));

  const methodOf = ex => { const s = ex.steps.find(x => x.role === 'method'); return s && E.solve(lesson, ex, E.originalVariables(ex)).values[s.id]; };
  const methods = [...new Set(exs.map(methodOf).filter(Boolean))];
  if (methods.length >= 2 && (verbs.has('discriminate') || verbs.has('classify'))) {
    items.push({ id: 'metodo', format: 'fmt-match-classify', title: 'Qual método?', source_ref: ref(exs[0]),
      payload: { categories: lesson.methods.map(m => ({ id: m.id, label: m.label })),
        cases: exs.map(ex => ({ id: ex.id, text: E.statement(lesson, E.createRun(lesson, ex.id, 'original')), category: methodOf(ex), misconception_tag: 'method_confusion' })) } });
  }
  const first = exs[0];
  items.push({ id: 'exercicios', format: 'fmt-step-ladder', title: 'Exercícios passo a passo', source_ref: ref(first),
    payload: { lesson_id: lesson.id, exercises: exs.map(e => e.id), steps: first.steps.map(s => s.id), variables: Object.keys(first.variables), constraints: first.constraints || [] } });
  const run1 = E.createRun(lesson, first.id, 'original');
  items.push({ id: 'ordem-passos', format: 'fmt-sequence-order', title: 'Monte a ordem dos passos', source_ref: ref(first),
    payload: { key_order: first.steps.map(s => s.id), entries: first.steps.map(s => ({ id: s.id, label: title(s), rationale: E.renderTemplate(lesson, first, run1.key, s.prompt) })) } });
  const labEx = exs.find(e => e.explore && e.explore.predict && e.plot);
  if (labEx) {
    const cfg = labEx.explore, solved = E.solve(lesson, labEx, E.originalVariables(labEx));
    items.push({ id: `lab-${labEx.id}`, format: 'fmt-data-visual-lab', title: 'Laboratório: mude um dado e veja o gráfico', source_ref: ref(labEx),
      payload: { data_model: { exercise_id: labEx.id, control: { var: cfg.var, min: cfg.min, max: cfg.max, step: cfg.step, label: cfg.label, original: E.originalVariables(labEx)[cfg.var] } },
        plot_spec: Spec.plotSpecFor(lesson, labEx, solved),
        prompts: [{ kind: 'predict', question: cfg.predict.question, quantity: cfg.predict.label || cfg.predict.quantity, options: ['aumenta', 'diminui', 'igual'], expected: E.predictionAnswer(lesson, labEx) }] } });
  }
  const interpEx = exs.find(e => { const s = e.steps.find(x => x.role === 'interpretation' && x.type === 'choice'); return s && (s.options || []).some(o => o.feedback); });
  if (interpEx) {
    const s = interpEx.steps.find(x => x.role === 'interpretation' && x.type === 'choice'), key = E.createRun(lesson, interpEx.id, 'original').key, answer = key.values[s.id];
    items.push({ id: `interp-${interpEx.id}`, format: 'fmt-choice-feedback', title: 'Conclusão em linguagem simples', source_ref: ref(interpEx),
      payload: { id: `interp-${interpEx.id}`, stem: E.renderTemplate(lesson, interpEx, key, s.prompt),
        options: s.options.map(o => {
          const opt = { id: o.id, text: E.renderTemplate(lesson, interpEx, key, o.label), correct: o.id === answer };
          if (!opt.correct) { opt.misconception_tag = `interp_${o.id.replace(/-/g, '_')}`; opt.feedback = E.renderTemplate(lesson, interpEx, key, o.feedback || s.misconception); }
          return opt;
        }),
        explanation: E.renderTemplate(lesson, interpEx, key, s.worked) } });
  }
  const problems = items.filter(i => i.format !== 'fmt-step-ladder' && i.format !== 'fmt-data-visual-lab').flatMap(itemProblems);
  if (problems.length) throw new Error(`${lesson.id}: ${problems.join('; ')}`);
  return {
    id: `${lesson.id}-package`, language: lesson.language, locale: lesson.locale, revision: lesson.revision,
    objectives: lesson.objectives.filter(o => o.verb).map(o => ({ id: o.id, verb: o.verb })),
    units: [{ id: lesson.id, kind: 'ordered_procedure', title: lesson.title, objectives: lesson.objectives.filter(o => o.verb).map(o => o.id), items }]
  };
}

/*
 * Composer for schema-1.0 slides-practice lessons (migrated schema 0.1 files): one step-order item per exercise
 * with three or more steps (labels = the step prompts, rationale = the worked solution). These lessons carry no
 * objective verbs, so the package declares the one objective the item exercises ("sequence"), in the lesson's language.
 */
function composeSlidesPractice(lesson) {
  if (lesson.schema_version !== '1.0' || lesson.kind !== 'slides-practice') throw new Error(`${lesson.id}: the slides-practice composer needs a schema 1.0 lesson of kind slides-practice`);
  const pt = (lesson.language || '').startsWith('pt');
  const ref = [...new Set((lesson.sources || []).map(s => s.short || s.title).filter(Boolean))].join('; ') || null;
  const items = lesson.exercises.filter(ex => ex.steps.length >= 3).map(ex => ({
    id: `ordem-${ex.id}`, format: 'fmt-sequence-order', title: pt ? 'Monte a ordem dos passos' : 'Put the steps in order', source_ref: ref,
    payload: { key_order: ex.steps.map(s => s.id), entries: ex.steps.map(s => ({ id: s.id, label: s.prompt, rationale: s.worked_solution })) }
  }));
  if (!items.length) throw new Error(`${lesson.id}: no exercise with three or more steps to practise in order`);
  const problems = items.flatMap(itemProblems);
  if (problems.length) throw new Error(`${lesson.id}: ${problems.join('; ')}`);
  return {
    id: `${lesson.id}-package`, language: lesson.language, locale: lesson.locale, revision: lesson.revision,
    objectives: [{ id: 'o-sequence', verb: 'sequence' }],
    units: [{ id: lesson.id, kind: 'reorderable', title: lesson.title, objectives: ['o-sequence'], items }]
  };
}

/** Curated composers by lesson id; every other lesson is composed by its kind. */
const CURATED = {
  'prova3-estatistica': { key: 'prova3', compose: lesson => require('./prova3.js').buildProva3Package(lesson) },
  'humanidades-decisoes': { key: 'humanities', compose: lesson => require('./humanities.js').buildHumanitiesPackage(lesson) }
};

/**
 * The composer for one lesson: { key (caps.js key or null), name, compose(lesson, deps) -> package }.
 * `deps` carries the engine and plot-spec modules for procedure lessons (Node passes them in).
 */
function composerFor(lesson) {
  if (CURATED[lesson.id]) return { key: CURATED[lesson.id].key, name: `curated:${lesson.id}`, compose: CURATED[lesson.id].compose };
  const byKind = { 'ordered-procedure': composeProcedure, 'declarative-case': composeDeclarative, 'slides-practice': composeSlidesPractice };
  const fn = byKind[lesson.kind];
  if (!fn) throw new Error(`${lesson.id}: no composer for kind ${lesson.kind} (have: ${Object.keys(byKind).join(', ')})`);
  return { key: null, name: `generic:${lesson.kind}`, compose: fn };
}

module.exports = { composeDeclarative, composeProcedure, composeSlidesPractice, composerFor, sourceRef, itemProblems, UNVERIFIED_LABEL };
