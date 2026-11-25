'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const katex = require('katex');
const { parts } = require('../../harness/lesson-math.js');

test('the confidence interval and pooled variance use TeX fraction and radical groups', () => {
  const proportion = 'IC = p̂ ± 1,96 · √(p̂(1 − p̂)/n)';
  assert.deepEqual(parts(proportion), [{
    text: proportion,
    tex: String.raw`\mathrm{IC} = \hat{p} \pm 1{,}96 \cdot \sqrt{\frac{\hat{p} \left( 1 - \hat{p} \right)}{n}}`
  }]);
  const pooled = 'S²conj = [(n₁ − 1)s₁² + (n₂ − 1)s₂²]/(n₁ + n₂ − 2)';
  assert.match(parts(pooled)[0].tex, /^S_\{\\mathrm\{conj\}\}\^\{2\} = \\frac\{/);
  const mathml = katex.renderToString(parts(pooled)[0].tex, { output: 'mathml' });
  assert.match(mathml, /<mfrac>/);
  assert.match(mathml, /<msubsup>/);
});

test('worked numbers retain decimal commas and yield actual MathML on each run', () => {
  const sample = 'EP = σ/√n = 8/√64 = 1,000 min.';
  const result = parts(sample);
  assert.equal(result.map(part => part.text).join(''), sample);
  assert.match(result[0].tex, /\\frac\{8\}\{\\sqrt\{64\}\} = 1\{,\}000/);
  assert.equal(parts('IC 95% = (0,542; 0,638)')[0].tex,
    String.raw`\mathrm{IC}_{95\%} = \left( 0{,}542;\,0{,}638 \right)`);
  const mathml = katex.renderToString(result[0].tex, { output: 'mathml' });
  assert.match(mathml, /<mfrac>.*<msqrt>/);
});

test('ordinary prose stays text and explicit TeX can be authored without automatic inference', () => {
  const prose = 'Refaça usando t de Student e 95% de confiança.';
  assert.deepEqual(parts(prose), [{ text: prose }]);
  const formula = String.raw`\sqrt{\frac{a}{b}}`;
  assert.deepEqual(parts('Use \\(' + formula + '\\).', false), [
    { text: 'Use ' }, { text: '\\(' + formula + '\\)', tex: formula }, { text: '.' }
  ]);
});
