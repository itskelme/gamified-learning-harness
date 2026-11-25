// The shipped teste-z lesson with two changes: a formula step before the statistic, and unit input on the
// standard error (grams). Shared by tests/contract/expression-units.test.js and tests/expression-units-browser.mjs.
'use strict';
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');

function fixture(change = () => {}) {
  const lesson = JSON.parse(JSON.stringify(require(path.join(ROOT, 'lessons/teste-z-uma-media.lesson.json'))));
  lesson.id = 'teste-z-formula-unidade';
  const ex = lesson.exercises[0];
  const ep = ex.steps.find(s => s.id === 'ep');
  ep.unit = 'g';
  ep.unit_input = true;
  const formula = {
    id: 'formula', type: 'expression', role: 'compute',
    title: 'Montar a estatística', prompt: 'Escreva a fórmula da estatística z com os símbolos do passo.',
    expr: '(xbar - mu0) / ep', display: 'z = (x̄ − μ₀) / EP',
    symbols: [
      { name: 'xbar', aliases: ['media'] },
      { name: 'mu0', aliases: ['mu'], sample: [480, 520] },
      { name: 'ep', aliases: ['EP'], sample: [0.4, 2] }
    ],
    bugs: [
      { id: 'invertida', expr: '(mu0 - xbar) / ep', feedback: 'A ordem é média da amostra menos o valor da hipótese.' },
      { id: 'sem-ep', expr: 'xbar - mu0', feedback: 'Falta dividir pelo erro padrão.' }
    ],
    hints: ['A estatística mede a distância em erros padrão.'],
    misconception: 'A estatística é a diferença entre a média e o valor da hipótese, dividida pelo erro padrão.',
    worked: 'z = (x̄ − μ₀) / EP.'
  };
  ex.steps.splice(ex.steps.findIndex(s => s.id === 'z'), 0, formula);
  change(lesson, ex, formula, ep);
  return lesson;
}

module.exports = { fixture };
