/*
 * Prova 3 composed package (catalog r3 section 6.2). Every item is DERIVED from the validated pilot
 * lesson (lessons/prova3-statistics.lesson.json): statements, methods, step titles and prompts,
 * interpretation options and the PDF pages recorded in each source_answer_key. No text is invented;
 * when a lesson records no page for an item, its source_ref is null and the router refuses the plan.
 */
'use strict';
const E = require('../procedure-engine.js');
const Spec = require('../formats/fmt-data-visual-lab/procedure-spec.js');

// Which confusion each method answer tests (catalog AF-MAT-01 tag vocabulary).
const METHOD_TAG = { z_mean_ci: 'sigma_known_vs_unknown', t_mean_ci: 'sigma_known_vs_unknown', prop_ci: 'mean_vs_proportion', z_two_means: 'interval_vs_test', t_pooled: 'interval_vs_test' };
const DECISION_MAP_PAGE = 5; // decision map (verification.md D1); also cited by docs/ARCHITECTURE.md
// Learner-facing item headings (pt-BR, the lesson's language).
const TITLES = {
  simbolos: 'Símbolos e valores da tabela', metodo: 'Qual método? Use o mapa de decisão', exercicios: 'Exercícios passo a passo',
  receita: 'Monte a receita do IC com t', 'lab-ex1': 'Laboratório: margem de erro e tamanho da amostra', 'interp-ex2': 'Interpretação do intervalo (Exercício 2)'
};

function page(ex, stepId) {
  const p = ((ex.source_answer_key || {}).pages || {})[stepId];
  return Number.isInteger(p) ? `PDF p.${p}` : null;
}

function buildProva3Package(lesson) {
  const exs = lesson.exercises, byId = id => exs.find(e => e.id === id);
  const ex1 = byId('ex1-ic-media-z'), ex2 = byId('ex2-ic-media-t');
  const run2 = E.createRun(lesson, ex2.id, 'original');
  const anySourced = exs.some(e => page(e, 'ep') || page(e, 'z') || page(e, 't'));

  const z95 = lesson.conventions.z95, gl = ex2.steps.find(s => s.id === 'gl');
  const cloze = {
    id: 'simbolos', format: 'fmt-retrieval-cloze', source_ref: anySourced ? `PDF p.4 (${lesson.conventions.z95_source.replace(/ \(PDF p\.4\)$/, '')}); ${page(ex2, 'gl')}` : null,
    payload: {
      template: `Com 95% de confiança, o valor crítico Z da tabela é {{z95}}; no IC com t para uma amostra, gl = n − {{gl_menos}}.`,
      blanks: [
        { id: 'z95', spec: { type: 'number', value: z95, tolerance: 0 }, key_text: E.formatNumber(z95, 2, lesson.locale) },
        { id: 'gl_menos', spec: { type: 'number', value: run2.variables.n - run2.key.values.gl, tolerance: 0 }, key_text: '1' }
      ],
      cue_ladder: [gl.hints && gl.hints[0]].filter(Boolean)
    }
  };

  const match = {
    id: 'metodo', format: 'fmt-match-classify', source_ref: anySourced ? `PDF p.${DECISION_MAP_PAGE} (mapa de decisão)` : null,
    payload: {
      categories: lesson.methods.map(m => ({ id: m.id, label: m.label })),
      cases: exs.map(ex => {
        const run = E.createRun(lesson, ex.id, 'original');
        const category = run.key.steps.find(s => s.id === 'metodo').answer;
        return { id: ex.id, text: E.statement(lesson, run), category, misconception_tag: METHOD_TAG[category] };
      })
    }
  };

  const ladder = {
    id: 'exercicios', format: 'fmt-step-ladder', source_ref: page(ex1, 'ep') && page(byId('ex5-teste-t-conjunto'), 't') ? `${page(ex1, 'ep')}-${page(byId('ex5-teste-t-conjunto'), 't').slice(6)}` : null,
    payload: { lesson_id: lesson.id, exercises: exs.map(e => e.id), steps: ex2.steps.map(s => s.id), variables: Object.keys(ex2.variables), constraints: ex2.constraints || [] }
  };

  const entries = ex2.steps.map(s => ({ id: s.id, label: s.title.replace(/^Passo \d+ — /, ''), rationale: s.prompt }));
  const sequence = { id: 'receita', format: 'fmt-sequence-order', source_ref: page(ex2, 'gl'), payload: { key_order: ex2.steps.map(s => s.id), entries } };

  const run1 = E.createRun(lesson, ex1.id, 'original'), solved1 = E.solve(lesson, ex1, run1.variables);
  const cfg = ex1.explore;
  const lab = {
    id: 'lab-ex1', format: 'fmt-data-visual-lab', source_ref: page(ex1, 'E'),
    payload: {
      data_model: { exercise_id: ex1.id, control: { var: cfg.var, min: cfg.min, max: cfg.max, step: cfg.step, label: cfg.label, original: run1.variables[cfg.var] } },
      plot_spec: Spec.plotSpecFor(lesson, ex1, solved1),
      prompts: [{ kind: 'predict', question: cfg.predict.question, quantity: cfg.predict.quantity, options: ['aumenta', 'diminui', 'igual'], expected: E.predictionAnswer(lesson, ex1) }]
    }
  };

  const interp = ex2.steps.find(s => s.id === 'interp'), key2 = run2.key;
  const choice = {
    id: 'interp-ex2', format: 'fmt-choice-feedback', source_ref: page(ex2, 'interp'),
    payload: {
      id: 'interp-ex2', stem: interp.prompt,
      options: interp.options.map(o => {
        const opt = { id: o.id, text: E.renderTemplate(lesson, ex2, key2, o.label), correct: o.id === interp.answer };
        if (!opt.correct) { opt.misconception_tag = `interp_${o.id.replace(/-/g, '_')}`; opt.feedback = o.feedback; }
        return opt;
      }),
      explanation: E.renderTemplate(lesson, ex2, key2, interp.worked)
    }
  };

  return {
    id: `${lesson.id}-package`, language: lesson.language, locale: lesson.locale,
    objectives: [
      { id: 'o-recall', verb: 'recall' }, { id: 'o-disc', verb: 'discriminate' }, { id: 'o-perform', verb: 'perform' },
      { id: 'o-seq', verb: 'sequence' }, { id: 'o-why', verb: 'explain_relationship' }, { id: 'o-interp', verb: 'interpret' }, { id: 'o-review', verb: 'review' }
    ],
    units: [{ id: 'prova3', kind: 'ordered_procedure', objectives: ['o-recall', 'o-disc', 'o-perform', 'o-seq', 'o-why', 'o-interp', 'o-review'], items: [cloze, match, ladder, sequence, lab, choice].map(it => ({ title: TITLES[it.id], ...it })) }]
  };
}

module.exports = { buildProva3Package, METHOD_TAG };
