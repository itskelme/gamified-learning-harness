/* Display-only translation of the ordered-procedure notation into TeX.
 * Keep the lesson data and the grader's decimal strings as the source of truth.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LessonMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const names = new Map([
    ['α', '\\alpha'], ['μ', '\\mu'], ['σ', '\\sigma'],
    ['x̄', '\\bar{x}'], ['p̂', '\\hat{p}'], ['Sconj', 'S_{\\mathrm{conj}}'],
    ['S²conj', 'S_{\\mathrm{conj}}^{2}'], ['H0', 'H_{0}'], ['H1', 'H_{1}'],
    ['IC', '\\mathrm{IC}'], ['EP', '\\mathrm{EP}'], ['gl', '\\mathrm{gl}'],
    ['soma', '\\mathrm{soma}'],
    ...Array.from('ExnspqtzZS', s => [s, s])
  ]);
  const sub = '₀₁₂₃₄₅₆₇₈₉';
  const sup = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const relation = new Map([
    ['=', '='], ['≠', '\\ne'], ['≈', '\\approx'], ['<', '<'], ['>', '>'],
    ['≤', '\\le'], ['≥', '\\ge']
  ]);
  const sum = new Map([['+', '+'], ['-', '-'], ['−', '-'], ['±', '\\pm']]);
  const product = new Map([['×', '\\times'], ['·', '\\cdot'], ['*', '\\cdot']]);
  const groupEnds = new Map([['(', ')'], ['[', ']'], ['|', '|']]);
  const groupingTeX = (left, body, right) => '\\left' + left + ' ' + body + ' \\right' + right;

  function variable(raw) {
    if (names.has(raw)) return names.get(raw);
    const m = /^(.+?)([₀-₉]+)$/.exec(raw);
    return m && names.has(m[1]) ? names.get(m[1]) + '_{' +
      Array.from(m[2], ch => sub.indexOf(ch)).join('') + '}' : null;
  }

  function operand(tokens, at, depth) {
    const raw = tokens[at]?.raw;
    if (!raw || depth > 24) return null;
    const sign = sum.get(raw);
    if (sign) {
      const value = operand(tokens, at + 1, depth + 1);
      return value && { tex: sign + ' ' + value.tex, end: value.end, rich: true };
    }
    if (raw === '√') {
      const value = operand(tokens, at + 1, depth + 1);
      return value && { tex: '\\sqrt{' + (value.body || value.tex) + '}', end: value.end, rich: true };
    }
    let end = at + 1, tex, body, rich = false;
    const closer = groupEnds.get(raw);
    if (closer) {
      const value = expression(tokens, end, 1, depth + 1);
      if (!value) return null;
      end = value.end;
      body = value.tex;
      rich = value.rich || raw === '|';
      if (raw === '(' && tokens[end]?.raw === ';') {
        const upper = expression(tokens, end + 1, 1, depth + 1);
        if (!upper) return null;
        body += ';\\,' + upper.tex;
        end = upper.end;
        rich = true;
      }
      if (tokens[end]?.raw !== closer) return null;
      tex = groupingTeX(raw, body, closer);
      end++;
    } else if (raw.startsWith('IC ')) {
      tex = '\\mathrm{IC}_{' + raw.slice(3, -1).replace(',', '{,}') + '\\%}';
      rich = true;
    } else if (/^\d/.test(raw)) {
      tex = raw.replace(',', '{,}');
      if (tokens[end]?.raw === '%' && tokens[at].end === tokens[end].start) {
        tex += '\\%';
        end++;
      }
    } else {
      tex = variable(raw);
      if (!tex) return null;
      rich = /[αμσ\u0302\u0304₀-₉]|^(?:H[01]|S²?conj)$/.test(raw);
    }
    let exponent = '';
    while (tokens[end] && tokens[end - 1].end === tokens[end].start && sup.includes(tokens[end].raw)) {
      exponent += sup.indexOf(tokens[end].raw);
      end++;
    }
    if (exponent) return { tex: tex + '^{' + exponent + '}', end, rich: true };
    return { tex, end, body, rich };
  }

  function expression(tokens, at, minimum, depth) {
    let left = operand(tokens, at, depth);
    if (!left) return null;
    while (tokens[left.end]) {
      const next = tokens[left.end], raw = next.raw;
      const implicit = (raw === '(' || !!variable(raw)) && tokens[left.end - 1].end === next.start;
      const fraction = raw === '/' || raw === '÷';
      const operator = relation.get(raw) || sum.get(raw) || product.get(raw);
      const priority = relation.has(raw) ? 1 : sum.has(raw) ? 2 : (product.has(raw) || fraction) ? 3 : implicit ? 4 : 0;
      if (priority < minimum) break;
      const right = expression(tokens, left.end + (implicit ? 0 : 1), priority + 1, depth + 1);
      if (!right) break;
      const tex = fraction
        ? '\\frac{' + (left.body || left.tex) + '}{' + (right.body || right.tex) + '}'
        : left.tex + (implicit ? ' ' : ' ' + operator + ' ') + right.tex;
      left = { tex, end: right.end, rich: true };
    }
    return left;
  }

  function infer(text) {
    const tokens = Array.from(text.matchAll(/IC \d+(?:[.,]\d+)?%|S²conj|[\p{L}\p{M}][\p{L}\p{M}\d₀-₉]*|\d+(?:[.,]\d+)?|[^\s]/gu),
      m => ({ raw: m[0], start: m.index, end: m.index + m[0].length }));
    const parts = [];
    let cursor = 0;
    for (let i = 0; i < tokens.length;) {
      const match = expression(tokens, i, 1, 0);
      if (!match?.rich) { i++; continue; }
      const start = tokens[i].start, end = tokens[match.end - 1].end;
      if (start > cursor) parts.push({ text: text.slice(cursor, start) });
      parts.push({ text: text.slice(start, end), tex: match.tex });
      cursor = end;
      i = match.end;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor) });
    return parts;
  }

  function parts(text, inferNotation = true) {
    const output = [], plain = chunk => inferNotation ? infer(chunk) : [{ text: chunk }];
    let cursor = 0;
    for (const match of text.matchAll(/\\\(([^]*?)\\\)/g)) {
      output.push(...plain(text.slice(cursor, match.index)), { text: match[0], tex: match[1] });
      cursor = match.index + match[0].length;
    }
    return output.concat(plain(text.slice(cursor)));
  }

  let measuring = false;
  function refresh() {
    if (measuring) return;
    measuring = true;
    globalThis.requestAnimationFrame(() => {
      measuring = false;
      for (const node of globalThis.document.querySelectorAll('.lesson-math')) {
        if (node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1) node.tabIndex = 0;
        else node.removeAttribute('tabindex');
      }
    });
  }
  if (globalThis.document) globalThis.addEventListener('resize', refresh);

  function append(element, text, inferNotation = true) {
    const document = element.ownerDocument;
    for (const part of parts(String(text), inferNotation)) {
      if (part.tex && part.tex.length <= 800 && globalThis.katex) {
        const wrapper = document.createElement('span');
        wrapper.className = 'lesson-math';
        try {
          globalThis.katex.render(part.tex, wrapper, { output: 'mathml', trust: false, maxExpand: 250, maxSize: 24 });
          element.append(wrapper);
          refresh();
          continue;
        } catch (error) {
          if (!(error instanceof globalThis.katex.ParseError)) throw error;
        }
      }
      element.append(document.createTextNode(part.text));
    }
  }

  return { append, parts, refresh };
});
