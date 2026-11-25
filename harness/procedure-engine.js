/*
 * Ordered-procedure engine (format "ordered-procedure").
 *
 * Input boundary: a lesson JSON (see docs/formats/fmt-step-ladder.md).
 * Output boundary: pure functions that solve an exercise from its variables, draw
 * validated seeded variants, check learner input and apply restart policies.
 * No DOM access; runs unchanged in Node (tests, build) and in the browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ProcedureEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------------------------------------------------------- expressions
  // Small arithmetic language: numbers, identifiers from an explicit scope,
  // + - * / ^, comparisons, && || !, parentheses and whitelisted functions.
  // No property access and no host objects are reachable.
  const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(&&|\|\||<=|>=|==|!=|[-+*/^(),<>!]))/y;

  function tokenize(src) {
    const out = [];
    TOKEN.lastIndex = 0;
    let pos = 0;
    while (pos < src.length) {
      if (/^\s*$/.test(src.slice(pos))) break;
      TOKEN.lastIndex = pos;
      const m = TOKEN.exec(src);
      if (!m) throw new Error(`Unexpected character at ${pos} in "${src}"`);
      if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) });
      else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
      else out.push({ t: 'op', v: m[3] });
      pos = TOKEN.lastIndex;
    }
    return out;
  }

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  function compile(src) {
    if (typeof src !== 'string') throw new Error('Expression must be a string');
    const toks = tokenize(src);
    let i = 0;
    const peek = () => toks[i];
    const isOp = v => toks[i] && toks[i].t === 'op' && toks[i].v === v;
    const expect = v => { if (!isOp(v)) throw new Error(`Expected "${v}" in "${src}"`); i++; };

    function primary() {
      const tok = toks[i++];
      if (!tok) throw new Error(`Unexpected end of "${src}"`);
      if (tok.t === 'num') return () => tok.v;
      if (tok.t === 'id') {
        const name = tok.v;
        if (isOp('(')) {
          i++;
          const args = [];
          if (!isOp(')')) { args.push(or()); while (isOp(',')) { i++; args.push(or()); } }
          expect(')');
          return (s, f) => {
            if (!own(f, name)) throw new Error(`Unknown function ${name}`);
            return f[name](...args.map(a => a(s, f)));
          };
        }
        return s => { if (!own(s, name)) throw new Error(`Unknown identifier ${name}`); return s[name]; };
      }
      if (tok.v === '(') { const e = or(); expect(')'); return e; }
      throw new Error(`Unexpected "${tok.v}" in "${src}"`);
    }
    function power() {
      const base = primary();
      if (isOp('^')) { i++; const exp = unary(); return (s, f) => Math.pow(base(s, f), exp(s, f)); }
      return base;
    }
    function unary() {
      if (isOp('-')) { i++; const e = unary(); return (s, f) => -e(s, f); }
      if (isOp('+')) { i++; return unary(); }
      if (isOp('!')) { i++; const e = unary(); return (s, f) => !e(s, f); }
      return power();
    }
    function binary(next, ops) {
      return function () {
        let left = next();
        while (peek() && peek().t === 'op' && ops[peek().v]) {
          const fn = ops[toks[i++].v], l = left, r = next();
          left = (s, f) => fn(l(s, f), r(s, f));
        }
        return left;
      };
    }
    const mul = binary(unary, { '*': (a, b) => a * b, '/': (a, b) => a / b });
    const add = binary(mul, { '+': (a, b) => a + b, '-': (a, b) => a - b });
    const cmp = binary(add, { '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, '==': (a, b) => a === b, '!=': (a, b) => a !== b });
    const and = binary(cmp, { '&&': (a, b) => a && b });
    const or = binary(and, { '||': (a, b) => a || b });
    const ast = or();
    if (i !== toks.length) throw new Error(`Unexpected "${toks[i].v}" in "${src}"`);
    return ast;
  }

  const cache = new Map();
  const BASE_FUNCTIONS = Object.freeze({
    sqrt: Math.sqrt, abs: Math.abs, min: Math.min, max: Math.max,
    round: (x, d = 0) => roundTo(x, d)
  });

  function evaluate(src, scope, functions = BASE_FUNCTIONS) {
    if (!cache.has(src)) cache.set(src, compile(src));
    return cache.get(src)(scope, functions);
  }

  // Exact Student t quantile (two-sided 95% => p = 0.975). Used only for declared
  // alternative learner paths and audits; the instructor key uses the table.
  function lgamma(x) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
    x -= 1;
    let a = c[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function tCdf(x, df) {
    const c = Math.exp(lgamma((df + 1) / 2) - lgamma(df / 2)) / Math.sqrt(df * Math.PI);
    const pdf = u => c * Math.pow(1 + u * u / df, -(df + 1) / 2);
    const n = 2000, h = Math.abs(x) / n;
    let s = pdf(0) + pdf(Math.abs(x));
    for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * pdf(i * h);
    return 0.5 + Math.sign(x) * s * h / 3;
  }
  const tqCache = new Map();
  function tQuantile(p, df) {
    const k = p + ':' + df;
    if (tqCache.has(k)) return tqCache.get(k);
    let lo = 0, hi = 20;
    for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; if (tCdf(mid, df) < p) lo = mid; else hi = mid; }
    tqCache.set(k, (lo + hi) / 2);
    return (lo + hi) / 2;
  }

  function lessonFunctions(lesson) {
    const table = lesson.conventions.t_table;
    return Object.freeze({
      ...BASE_FUNCTIONS,
      tcrit: df => (own(table, String(df)) ? table[String(df)] : NaN),
      intable: df => own(table, String(df)),
      tquant: df => tQuantile(1 - (1 - lesson.conventions.confidence) / 2, df)
    });
  }

  // ------------------------------------------------------------------ numbers
  function roundTo(v, d) {
    const f = Math.pow(10, d), sign = v < 0 ? -1 : 1;
    return sign * Math.round(Number((Math.abs(v) * f).toPrecision(12))) / f;
  }
  function decimalSeparator(locale) { return /^(pt|es|fr|de|it)\b/i.test(locale || '') ? ',' : '.'; }
  function formatNumber(v, d, locale) {
    let s = roundTo(v, d).toFixed(d);
    if (Number(s) === 0) s = s.replace('-', '');
    return s.replace('.', decimalSeparator(locale));
  }
  // Locale contract (docs/FORMATS.md "Locale contract for typed numbers", tests/fixtures/locale-numbers.json):
  // in a comma-decimal locale the point groups thousands, so one point followed by exactly three digits and no
  // comma ("1.960") is thousands-shaped and refused as ambiguous (a no-op, never an error). The mirror rule holds
  // for point-decimal locales and the comma.
  function groupingSeparator(locale) { return decimalSeparator(locale) === ',' ? '.' : ','; }
  function isAmbiguousGrouping(s, locale) {
    const g = groupingSeparator(locale) === '.' ? '\\.' : ',';
    // An integer part of 0 ("0.950", "-0.975") cannot be a thousands group: it is read as a decimal.
    return new RegExp(`^[+-]?(?!0${g})\\d{1,3}${g}\\d{3}$`).test(s);
  }
  /** null when the text is a number in this locale; otherwise 'ambiguous_grouping' or 'malformed'. */
  function numberIssue(raw, locale, opts = {}) {
    if (Number.isFinite(parseNumber(raw, locale, opts))) return null;
    const s = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim().replace(/−/g, '-').replace(/\s+/g, '').replace(/%$/, '') : '';
    return isAmbiguousGrouping(s, locale) ? 'ambiguous_grouping' : 'malformed';
  }
  /** Learner message for thousands-shaped text: shows the decimal form and the plain-thousands form. */
  function ambiguousMessage(raw, locale) {
    const s = String(raw).trim(), dec = decimalSeparator(locale), grp = groupingSeparator(locale);
    const asDecimal = s.replace(grp, dec), asThousands = s.replace(grp, '');
    return dec === ','
      ? `“${s}” tem ponto de milhar. Para um número decimal, use vírgula: ${asDecimal}. Para milhar, escreva sem o ponto: ${asThousands}.`
      : `"${s}" has a thousands comma. For a decimal number, use a point: ${asDecimal}. For thousands, write it without the comma: ${asThousands}.`;
  }
  function parseNumber(raw, locale, opts = {}) {
    if (typeof raw !== 'string' && typeof raw !== 'number') return NaN;
    // Spaces inside the number ("1 960") are malformed, as in the catalog parse; only the ends are trimmed.
    let s = String(raw).trim().replace(/−/g, '-');
    let pct = false;
    if (s.endsWith('%')) { if (!opts.percent) return NaN; pct = true; s = s.slice(0, -1).trim(); }
    const comma = decimalSeparator(locale) === ',';
    let norm;
    if (typeof raw === 'string' && isAmbiguousGrouping(s, locale)) return NaN;
    if (comma && /^[+-]?\d{1,3}(\.\d{3})+,\d+$/.test(s)) norm = s.replace(/\./g, '').replace(',', '.');
    else if (!comma && /^[+-]?\d{1,3}(,\d{3})+\.\d+$/.test(s)) norm = s.replace(/,/g, '');
    else if (/^[+-]?(\d+([.,]\d+)?|[.,]\d+)$/.test(s)) norm = s.replace(',', '.');
    else return NaN;
    let v = Number(norm);
    if (!Number.isFinite(v)) return NaN;
    if (pct || (opts.percent && Math.abs(v) > 1)) v = Number(norm + 'e-2');
    return v;
  }
  /** True when value rounds to exactly the printed pt-BR text at its printed decimals. */
  function matchesPrinted(value, text) {
    const t = String(text).trim(), d = t.includes(',') ? t.split(',')[1].length : 0;
    return typeof value === 'number' && Number.isFinite(value) && formatNumber(value, d, 'pt-BR') === t;
  }
  function toleranceFor(step, expected) {
    const tol = step.tolerance || {};
    return (tol.abs || 0) + (tol.rel || 0) * Math.abs(expected) + 1e-9 * Math.max(1, Math.abs(expected));
  }

  // ------------------------------------------------------- learner expressions
  // A step of type "expression" asks for a formula written with the step's declared symbols. The typed text is
  // rewritten into the small language above (the host never evaluates it) and compared with the key at sample
  // points: equal values at every point where the key is finite, on at least MIN_POINTS points. Agreement at
  // sample points is strong evidence of equivalence, not a proof (docs/formats/fmt-step-ladder.md).
  const LEARNER_TOKEN = /\s*(?:(\d+(?:[.,]\d+)?)|([A-Za-z_À-ɏͰ-Ͽ][A-Za-z0-9_À-ɏͰ-Ͽ]*)|([-+*/^()]))/y;
  const LEARNER_FUNCTIONS = { sqrt: 'sqrt', raiz: 'sqrt', abs: 'abs' };
  const SYMBOL_NAME = /^[A-Za-z_\u00C0-\u024F\u0370-\u03FF][A-Za-z0-9_\u00C0-\u024F\u0370-\u03FF]*$/;
  const SAMPLE_POINTS = 8, MIN_POINTS = 3;

  function symbolRefs(step) {
    const names = new Map();
    for (const sym of step.symbols || []) for (const n of [sym.name, ...(sym.aliases || [])]) names.set(n, sym.ref || sym.name);
    return names;
  }

  /**
   * Read a typed formula. Returns { ok: true, src, used } with src in the engine language, or
   * { ok: false, issue, detail } where issue is 'malformed', 'unknown_symbol', 'no_symbols' or 'ambiguous_grouping'.
   * None of these is an answer: the caller treats them as a no-op.
   */
  function parseLearnerExpression(raw, step, locale) {
    if (typeof raw !== 'string' || !raw.trim()) return { ok: false, issue: 'malformed' };
    const s = raw.trim().replace(/[−–]/g, '-').replace(/[×·⋅]/g, '*').replace(/[÷:]/g, '/').replace(/√/g, ' sqrt ').replace(/²/g, '^2').replace(/³/g, '^3');
    const names = symbolRefs(step), lower = new Map();
    for (const [n, ref] of names) { const k = n.toLowerCase(); lower.set(k, lower.has(k) && lower.get(k) !== ref ? null : ref); }
    const toks = [];
    let pos = 0;
    while (pos < s.length) {
      if (/^\s*$/.test(s.slice(pos))) break;
      LEARNER_TOKEN.lastIndex = pos;
      const m = LEARNER_TOKEN.exec(s);
      if (!m) return { ok: false, issue: 'malformed' };
      if (m[1] !== undefined) {
        if (isAmbiguousGrouping(m[1], locale)) return { ok: false, issue: 'ambiguous_grouping', detail: m[1] };
        toks.push({ t: 'num', v: m[1].replace(',', '.') });
      } else if (m[2] !== undefined) {
        const id = m[2], fn = LEARNER_FUNCTIONS[id.toLowerCase()];
        if (names.has(id)) toks.push({ t: 'id', v: names.get(id) });
        else if (own(LEARNER_FUNCTIONS, id.toLowerCase())) toks.push({ t: 'fn', v: fn });
        else if (lower.get(id.toLowerCase())) toks.push({ t: 'id', v: lower.get(id.toLowerCase()) });
        else return { ok: false, issue: 'unknown_symbol', detail: id };
      } else toks.push({ t: 'op', v: m[3] });
      pos = LEARNER_TOKEN.lastIndex;
    }
    const out = [], used = new Set();
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], prev = toks[i - 1];
      const starts = t.t !== 'op' || t.v === '(';
      const ends = prev && (prev.t === 'num' || prev.t === 'id' || (prev.t === 'op' && prev.v === ')'));
      if (starts && ends) out.push('*'); // implicit product: "2n", "z sigma", ")("
      if (t.t === 'fn') {
        const next = toks[i + 1];
        if (next && next.t === 'op' && next.v === '(') out.push(t.v);
        else if (next && (next.t === 'num' || next.t === 'id')) { // "√n"
          out.push(t.v, '(', next.v, ')');
          if (next.t === 'id') used.add(next.v);
          toks[++i] = { t: 'op', v: ')' };
        } else return { ok: false, issue: 'malformed' };
      } else {
        out.push(t.v);
        if (t.t === 'id') used.add(t.v);
      }
    }
    const src = out.join(' ');
    try { compile(src); } catch (e) { return { ok: false, issue: 'malformed' }; }
    if (!used.size) return { ok: false, issue: 'no_symbols' };
    return { ok: true, src, used: [...used] };
  }

  /** Sampling range of one symbol: its own `sample`, else the min and max of the variable it refers to. */
  function symbolRange(ex, sym) {
    const spec = ex.variables[sym.ref || sym.name];
    if (Array.isArray(sym.sample)) return { lo: sym.sample[0], hi: sym.sample[1], integer: false };
    if (spec && typeof spec.min === 'number' && typeof spec.max === 'number') return { lo: spec.min, hi: spec.max, integer: spec.type !== 'decimal' };
    return null;
  }

  /** The current data first, then SAMPLE_POINTS reproducible points inside the symbols' ranges. */
  function expressionPoints(lesson, ex, step, values) {
    const refs = (step.symbols || []).map(sym => sym.ref || sym.name), actual = Object.create(null), all = baseScope(lesson, values);
    for (const r of refs) actual[r] = all[r];
    const points = [actual], rng = mulberry32(hashString(ex.id + '/' + step.id));
    for (let k = 0; k < SAMPLE_POINTS; k++) {
      const p = Object.create(null);
      for (const sym of step.symbols || []) {
        const range = symbolRange(ex, sym), u = rng();
        p[sym.ref || sym.name] = !range ? NaN : range.integer ? range.lo + Math.floor(u * (range.hi - range.lo + 1)) : range.lo + u * (range.hi - range.lo);
      }
      points.push(p);
    }
    return points;
  }

  /** True when candidate equals reference at every point where reference is finite, on at least MIN_POINTS points. */
  function sameAtPoints(reference, candidate, points, fns) {
    let usable = 0;
    for (const p of points) {
      let a, b;
      try { a = evaluate(reference, p, fns); } catch (e) { return false; }
      if (typeof a !== 'number' || !Number.isFinite(a)) continue;
      usable++;
      try { b = evaluate(candidate, p, fns); } catch (e) { return false; }
      if (typeof b !== 'number' || !Number.isFinite(b) || Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))) return false;
    }
    return usable >= MIN_POINTS;
  }

  function gradeExpression(lesson, ex, step, values, src) {
    const points = expressionPoints(lesson, ex, step, values), fns = lessonFunctions(lesson);
    if (sameAtPoints(step.expr, src, points, fns)) return { valid: true, correct: true };
    for (const b of step.bugs || []) if (sameAtPoints(b.expr, src, points, fns)) return { valid: true, correct: false, bug: b.id, feedback: b.feedback };
    return { valid: true, correct: false };
  }

  // -------------------------------------------------------------------- units
  // A numeric step with unit_input asks for "number unit". The unit is reduced to SI base dimensions and a
  // factor: another unit of the same dimension is converted to the step's unit before grading ("12 cm" for
  // an answer in m); a unit of another dimension is a wrong answer with its own feedback; a missing or
  // unknown unit is a no-op. Tokens of step.unit outside the table ("embalagens") count as their own
  // dimension. Offsets (°C, °F) are out of scope.
  const unit = (factor, dims) => Object.freeze({ factor, dims: Object.freeze(dims) });
  const FORCE = { kg: 1, m: 1, s: -2 }, ENERGY = { kg: 1, m: 2, s: -2 }, POWER = { kg: 1, m: 2, s: -3 }, PRESSURE = { kg: 1, m: -1, s: -2 };
  const UNITS = Object.freeze({
    '1': unit(1, {}), '%': unit(0.01, {}),
    m: unit(1, { m: 1 }), km: unit(1e3, { m: 1 }), cm: unit(1e-2, { m: 1 }), mm: unit(1e-3, { m: 1 }), 'µm': unit(1e-6, { m: 1 }), um: unit(1e-6, { m: 1 }),
    kg: unit(1, { kg: 1 }), g: unit(1e-3, { kg: 1 }), mg: unit(1e-6, { kg: 1 }), t: unit(1e3, { kg: 1 }),
    s: unit(1, { s: 1 }), ms: unit(1e-3, { s: 1 }), min: unit(60, { s: 1 }), h: unit(3600, { s: 1 }),
    Hz: unit(1, { s: -1 }), N: unit(1, FORCE), kN: unit(1e3, FORCE), J: unit(1, ENERGY), kJ: unit(1e3, ENERGY),
    W: unit(1, POWER), kW: unit(1e3, POWER), Pa: unit(1, PRESSURE), kPa: unit(1e3, PRESSURE),
    L: unit(1e-3, { m: 3 }), l: unit(1e-3, { m: 3 }), mL: unit(1e-6, { m: 3 }), ml: unit(1e-6, { m: 3 }),
    A: unit(1, { A: 1 }), mA: unit(1e-3, { A: 1 }), C: unit(1, { A: 1, s: 1 }), V: unit(1, { kg: 1, m: 2, s: -3, A: -1 }),
    ohm: unit(1, { kg: 1, m: 2, s: -3, A: -2 }), 'Ω': unit(1, { kg: 1, m: 2, s: -3, A: -2 }),
    K: unit(1, { K: 1 }), mol: unit(1, { mol: 1 })
  });
  const UNIT_FACTOR = /^([^\s*/^]+?)(?:\^(-?\d+))?$/;

  /** Tokens of a unit text that are not in the table: each becomes its own dimension for that step. */
  function customUnits(text) {
    const out = [];
    for (const part of String(text).replace(/²/g, '^2').replace(/³/g, '^3').split(/[\s*/·⋅×.]+/)) {
      const m = UNIT_FACTOR.exec(part);
      if (m && !own(UNITS, m[1]) && !out.includes(m[1])) out.push(m[1]);
    }
    return out;
  }

  /** { factor, dims } for "m/s^2", "kg·m/s²", "km/h"; { unknown: token } for a token outside the table; null when unreadable. */
  function parseUnit(text, custom = []) {
    const s = String(text).trim().replace(/²/g, '^2').replace(/³/g, '^3').replace(/[·⋅×.]/g, '*').replace(/\s*([*/^])\s*/g, '$1').replace(/\s+/g, '*');
    if (!s) return null;
    const lookup = name => {
      if (own(UNITS, name)) return UNITS[name];
      if (custom.includes(name)) return unit(1, { [name]: 1 });
      const hits = [...Object.keys(UNITS), ...custom].filter(k => k.toLowerCase() === name.toLowerCase());
      const distinct = new Set(hits.map(k => (own(UNITS, k) ? JSON.stringify([UNITS[k].factor, UNITS[k].dims]) : k)));
      if (distinct.size !== 1) return null;
      return own(UNITS, hits[0]) ? UNITS[hits[0]] : unit(1, { [hits[0]]: 1 });
    };
    let factor = 1;
    const dims = {};
    const groups = s.split('/');
    for (let g = 0; g < groups.length; g++) {
      if (!groups[g]) return null;
      for (const part of groups[g].split('*')) {
        const m = UNIT_FACTOR.exec(part);
        if (!m) return null;
        const u = lookup(m[1]);
        if (!u) return { unknown: m[1] };
        const power = (m[2] === undefined ? 1 : Number(m[2])) * (g === 0 ? 1 : -1);
        factor *= Math.pow(u.factor, power);
        for (const [d, e] of Object.entries(u.dims)) { dims[d] = (dims[d] || 0) + e * power; if (!dims[d]) delete dims[d]; }
      }
    }
    return { factor, dims };
  }
  const sameDimensions = (a, b) => Object.keys({ ...a, ...b }).every(k => (a[k] || 0) === (b[k] || 0));

  /** "12,5 cm" -> { ok, value, unit }; issues 'malformed', 'ambiguous_grouping', 'missing_unit', 'unknown_unit' are no-ops. */
  function parseQuantity(raw, locale, custom = []) {
    if (typeof raw !== 'string') return { ok: false, issue: 'malformed' };
    const m = /^([+\-−]?[\d.,]+)\s*(.*)$/.exec(raw.trim());
    if (!m) return { ok: false, issue: 'malformed' };
    const value = parseNumber(m[1], locale);
    if (!Number.isFinite(value)) return { ok: false, issue: numberIssue(m[1], locale), detail: m[1] };
    if (!m[2]) return { ok: false, issue: 'missing_unit' };
    const u = parseUnit(m[2], custom);
    if (!u) return { ok: false, issue: 'malformed' };
    if (u.unknown) return { ok: false, issue: 'unknown_unit', detail: u.unknown };
    return { ok: true, value, unit: u, text: m[2].trim() };
  }

  // ------------------------------------------------------------------ lesson
  function exerciseById(lesson, id) {
    const ex = lesson.exercises.find(e => e.id === id);
    if (!ex) throw new Error(`Unknown exercise ${id}`);
    return ex;
  }
  function originalVariables(ex) {
    const out = {};
    for (const [k, spec] of Object.entries(ex.variables)) out[k] = spec.original;
    return out;
  }
  function decimalsOf(lesson, exId, name) {
    const ex = exerciseById(lesson, exId), spec = ex.variables[name];
    return spec && spec.type === 'decimal' ? spec.decimals : 0;
  }
  function optionsOf(lesson, step) {
    if (step.options_from === 'methods') return lesson.methods.map(m => ({ id: m.id, label: m.label, feedback: (step.feedback || {})[m.id] }));
    return step.options || [];
  }

  function baseScope(lesson, vars) {
    const scope = Object.create(null);
    scope.z95 = lesson.conventions.z95;
    for (const [k, v] of Object.entries(vars)) scope[k] = v;
    return scope;
  }

  /**
   * Solve one exercise from its variables. Every value is recomputed from the
   * expressions; nothing is cached from earlier variants.
   */
  function solve(lesson, ex, vars, opts = {}) {
    const fns = lessonFunctions(lesson), scope = baseScope(lesson, vars), problems = [], steps = [];
    const values = { ...vars };
    const safe = (src, label) => {
      try { return evaluate(src, scope, fns); } catch (e) { problems.push(`${label}: ${e.message}`); return NaN; }
    };
    for (const [name, spec] of Object.entries(ex.variables)) {
      const v = vars[name];
      if (typeof v !== 'number' || !Number.isFinite(v)) { problems.push(`${name}: variável ausente ou não finita`); continue; }
      if (spec.type !== 'decimal' && !Number.isInteger(v)) problems.push(`${name}: precisa ser inteiro`);
    }
    for (const step of ex.steps) {
      if (step.type === 'givens') {
        const answer = {};
        for (const f of step.fields) answer[f.var] = vars[f.var];
        steps.push({ id: step.id, type: step.type, answer });
      } else if (step.type === 'numeric') {
        const expr = opts.overrides && own(opts.overrides, step.id) ? opts.overrides[step.id] : step.expr;
        const v = safe(expr, step.id);
        if (!Number.isFinite(v)) problems.push(`${step.id}: valor não finito (${step.expr})`);
        // Later steps see the value the learner carried (opts.carried), the value rounded to the
        // decimals the step asks for (opts.carry === 'display') or, by default, full precision.
        let carried = v;
        if (opts.carried && own(opts.carried, step.id)) carried = opts.carried[step.id];
        else if (opts.carry === 'display') carried = roundTo(v, step.display_decimals);
        else if (typeof opts.carry === 'number') carried = roundTo(v, Math.max(opts.carry, step.display_decimals));
        scope[step.id] = carried; values[step.id] = v;
        steps.push({ id: step.id, type: step.type, answer: v });
      } else if (step.type === 'choice') {
        const options = optionsOf(lesson, step);
        let answer = step.answer;
        if (answer === undefined) {
          const hits = options.filter(o => o.when !== undefined && safe(o.when, `${step.id}.${o.id}`));
          if (hits.length !== 1) problems.push(`${step.id}: ${hits.length} opções corretas (esperado 1)`);
          answer = hits.length ? hits[0].id : null;
        } else if (!options.some(o => o.id === answer)) problems.push(`${step.id}: resposta não está nas opções`);
        values[step.id] = answer;
        steps.push({ id: step.id, type: step.type, answer });
      } else if (step.type === 'expression') {
        // The answer is the formula itself; its value for the current data stays available to later steps.
        const v = safe(step.expr, step.id);
        if (!Number.isFinite(v)) problems.push(`${step.id}: valor não finito (${step.expr})`);
        scope[step.id] = v; values[step.id] = v;
        steps.push({ id: step.id, type: step.type, answer: step.expr });
      } else problems.push(`${step.id}: tipo de passo desconhecido ${step.type}`);
    }
    for (const d of ex.derived || []) { const v = safe(d.expr, d.id); scope[d.id] = v; values[d.id] = v; }
    for (const c of ex.constraints || []) {
      if (c.scope === 'variant' && !opts.variant) continue;
      if (!safe(c.expr, 'restrição')) problems.push(c.message);
    }
    return { exercise: ex.id, variables: { ...vars }, values, steps, problems };
  }

  // ---------------------------------------------------------------- variants
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function drawOne(ex, rng) {
    const out = {};
    for (const [name, spec] of Object.entries(ex.variables)) {
      if (spec.values) out[name] = spec.values[Math.floor(rng() * spec.values.length)];
      else if (spec.type === 'decimal') out[name] = roundTo(spec.min + rng() * (spec.max - spec.min), spec.decimals);
      else out[name] = spec.min + Math.floor(rng() * (spec.max - spec.min + 1));
    }
    return out;
  }
  const sameVars = (a, b) => Object.keys(a).every(k => a[k] === b[k]);

  /**
   * Draw a validated variant: constraints hold, the answers listed in
   * preserve_answers (method, decision branch, interpretation) equal the
   * original ones, and the data differ from the original. Rejected draws are
   * discarded, never returned.
   */
  function drawVariant(lesson, ex, seed, maxTries = 2000) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new Error('Seed must be an integer between 0 and 4294967295');
    const rng = mulberry32(seed), original = originalVariables(ex);
    const base = solve(lesson, ex, original);
    let discarded = 0;
    for (let k = 0; k < maxTries; k++) {
      const vars = drawOne(ex, rng);
      if (sameVars(vars, original)) { discarded++; continue; }
      const solved = solve(lesson, ex, vars, { variant: true });
      const keeps = (ex.preserve_answers || []).every(id => solved.values[id] === base.values[id]);
      if (solved.problems.length || !keeps) { discarded++; continue; }
      return { seed, variables: vars, discarded };
    }
    throw new Error(`${ex.id}: nenhuma variante válida para a semente ${seed}`);
  }

  // ---------------------------------------------------------------- templates
  // {name}, {name:3}, {name|pct:1}, {@choice}; plus, in worked lines:
  //   {name:carry}  an earlier result used as an operand, at the carry precision;
  //   {name:result} this step's result as "carried ≈ displayed" (just "displayed" when equal).
  const PLACEHOLDER = /\{(@)?([A-Za-z_][A-Za-z0-9_]*)(\|pct)?(?::(\d+|carry|result))?\}/g;
  const MAX_CARRY = 12;

  /** Fixed decimals p, then trailing zeros trimmed down to keep (never below keep decimals). */
  function formatCarried(v, p, keep, locale) {
    let s = formatNumber(v, p, locale);
    const sep = decimalSeparator(locale);
    if (!s.includes(sep)) return s;
    let [int, frac] = s.split(sep);
    while (frac.length > keep && frac.endsWith('0')) frac = frac.slice(0, -1);
    return frac.length ? int + sep + frac : int;
  }

  /**
   * Precisions for a step's worked line. self = decimals of this step's carried result
   * ({id:result}/{id:carry}); operand = decimals of earlier results used as operands
   * ({x:carry}); both >= conventions.carry_decimals, operand >= self. Chosen as the
   * smallest pair for which
   *   - every printed form of this step's result is a plain rounding of the key value
   *     with no double rounding ("1,1145 ≈ 1,114" is never printed), and
   *   - the step's own expression, evaluated on the operands exactly as printed,
   *     rounds to every printed form of the result (the line reproduces itself).
   * ok is false only if no pair up to MAX_CARRY works (validateLesson reports it).
   */
  function carryFor(lesson, ex, key, tpl) {
    const base = lesson.conventions && Number.isInteger(lesson.conventions.carry_decimals) ? lesson.conventions.carry_decimals : 4;
    const plain = { self: base, operand: base, ok: true, step: null };
    const idx = ex.steps.findIndex(s => s.worked === tpl);
    const step = ex.steps[idx];
    if (!step || step.type !== 'numeric' || !own(key.values, step.id)) return plain;
    const full = key.values[step.id], d = step.display_decimals, fns = lessonFunctions(lesson);
    const forms = [...tpl.matchAll(PLACEHOLDER)].filter(m => !m[1] && !m[3] && m[2] === step.id).map(m => m[4]);
    for (let c = base; c <= MAX_CARRY; c++) {
      const shown = new Set();
      for (const f of forms) {
        if (f === undefined) shown.add(d);
        else if (f === 'carry') shown.add(Math.max(c, d));
        else if (f === 'result') { shown.add(Math.max(c, d)); shown.add(d); }
        else shown.add(Number(f));
      }
      const ps = [...shown].sort((a, b) => a - b);
      if (!ps.every((p, i) => ps.slice(i + 1).every(q => roundTo(roundTo(full, q), p) === roundTo(full, p)))) continue;
      for (let o = c; o <= Math.min(c + 4, MAX_CARRY); o++) {
        const scope = baseScope(lesson, key.variables);
        for (const s of ex.steps.slice(0, idx)) if (s.type === 'numeric') scope[s.id] = roundTo(key.values[s.id], Math.max(o, s.display_decimals));
        let w;
        try { w = evaluate(step.expr, scope, fns); } catch (e) { return plain; }
        if (ps.every(p => roundTo(w, p) === roundTo(full, p))) return { self: c, operand: o, ok: true, step: step.id };
      }
    }
    return { self: MAX_CARRY, operand: MAX_CARRY, ok: false, step: step.id };
  }

  function defaultDecimals(lesson, ex, name, value) {
    if (own(ex.variables, name)) return decimalsOf(lesson, ex.id, name);
    const step = ex.steps.find(s => s.id === name);
    if (step && step.display_decimals !== undefined) return step.display_decimals;
    const d = (ex.derived || []).find(x => x.id === name);
    if (d && d.decimals !== undefined) return d.decimals;
    return Number.isInteger(value) ? 0 : 4;
  }

  function renderTemplate(lesson, ex, key, tpl, depth = 0) {
    if (typeof tpl !== 'string') return '';
    const carry = /:(carry|result)\}/.test(tpl) ? carryFor(lesson, ex, key, tpl) : null;
    return tpl.replace(PLACEHOLDER, (_, at, name, pct, dec) => {
      if (at) {
        const step = ex.steps.find(s => s.id === name);
        if (!step || step.type !== 'choice' || depth > 0) throw new Error(`Bad choice reference {@${name}}`);
        const opt = optionsOf(lesson, step).find(o => o.id === key.values[name]);
        if (!opt) throw new Error(`No correct option for {@${name}}`);
        return renderTemplate(lesson, ex, key, opt.label, depth + 1);
      }
      if (!own(key.values, name) || typeof key.values[name] !== 'number') throw new Error(`Unknown placeholder {${name}} in ${ex.id}`);
      const v = key.values[name];
      if (pct) return formatNumber(v * 100, dec === undefined || isNaN(Number(dec)) ? 1 : Number(dec), lesson.locale);
      const places = defaultDecimals(lesson, ex, name, v);
      if (dec === 'carry' || dec === 'result') {
        const p = name === carry.step ? carry.self : carry.operand;
        const carried = formatCarried(v, Math.max(p, places), places, lesson.locale), shown = formatNumber(v, places, lesson.locale);
        return dec === 'result' && carried !== shown ? `${carried} ≈ ${shown}` : carried;
      }
      return formatNumber(v, dec === undefined ? places : Number(dec), lesson.locale);
    });
  }

  // --------------------------------------------------------------------- runs
  function createRun(lesson, exId, seed = 'original') {
    const ex = exerciseById(lesson, exId);
    const variables = seed === 'original' ? originalVariables(ex) : drawVariant(lesson, ex, seed).variables;
    return {
      lesson: lesson.id, exercise: exId, seed, variables, key: solve(lesson, ex, variables),
      step: 0, errors: 0, attempts: 0, wrong: 0, hints: 0, hintLevel: 0, restarts: 0,
      completed: [], finished: false, awaitingRetry: false
    };
  }
  function currentStep(lesson, run) { return exerciseById(lesson, run.exercise).steps[run.step]; }
  function statement(lesson, run) {
    const ex = exerciseById(lesson, run.exercise);
    return run.seed === 'original' ? ex.original_statement : renderTemplate(lesson, ex, run.key, ex.statement_template);
  }
  function text(lesson, run, tpl) { return renderTemplate(lesson, exerciseById(lesson, run.exercise), run.key, tpl); }

  function displayFor(lesson, run, i) {
    const ex = exerciseById(lesson, run.exercise), step = ex.steps[i], answer = run.key.steps[i].answer;
    if (step.type === 'numeric') return formatNumber(answer, step.display_decimals, lesson.locale) + (step.unit ? ' ' + step.unit : '');
    if (step.type === 'choice') return renderTemplate(lesson, ex, run.key, optionsOf(lesson, step).find(o => o.id === answer).label);
    if (step.type === 'expression') return renderTemplate(lesson, ex, run.key, step.display);
    return step.fields.map(f => `${ex.variables[f.var].symbol} = ${formatNumber(answer[f.var], decimalsOf(lesson, ex.id, f.var), lesson.locale)}`).join('; ');
  }

  /** Options for a choice step, rendered for the current data; shuffled reproducibly per seed and step. */
  function optionsFor(lesson, run, i, shuffle = false) {
    const ex = exerciseById(lesson, run.exercise), step = ex.steps[i];
    const opts = optionsOf(lesson, step).map(o => ({ id: o.id, label: renderTemplate(lesson, ex, run.key, o.label) }));
    if (!shuffle) return opts;
    const seedNum = (typeof run.seed === 'number' ? run.seed : 7) ^ (i * 2654435761);
    const rng = mulberry32(seedNum >>> 0);
    for (let k = opts.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [opts[k], opts[j]] = [opts[j], opts[k]]; }
    return opts;
  }

  function hint(lesson, run) {
    const step = currentStep(lesson, run), hints = step.hints || [];
    const level = run.hintLevel;
    run.hintLevel++; run.hints++;
    if (level < hints.length) return { level: level + 1, text: text(lesson, run, hints[level]), worked: false };
    return { level: level + 1, text: text(lesson, run, step.worked), worked: true };
  }

  function check(lesson, run, input) {
    const ex = exerciseById(lesson, run.exercise), step = ex.steps[run.step], key = run.key.steps[run.step];
    if (step.type === 'givens') {
      if (!input || typeof input !== 'object') return { valid: false };
      const wrong = [];
      for (const f of step.fields) {
        const v = parseNumber(input[f.var], lesson.locale);
        if (!Number.isFinite(v)) return { valid: false };
        if (Math.abs(v - key.answer[f.var]) > 1e-9 * Math.max(1, Math.abs(key.answer[f.var]))) wrong.push(f.var);
      }
      return { valid: true, correct: wrong.length === 0, fields: wrong };
    }
    if (step.type === 'choice') {
      const opt = optionsOf(lesson, step).find(o => o.id === input);
      if (!opt) return { valid: false };
      return { valid: true, correct: input === key.answer, feedback: opt.feedback };
    }
    if (step.type === 'expression') {
      const parsed = parseLearnerExpression(input, step, lesson.locale);
      if (!parsed.ok) return { valid: false, issue: parsed.issue, detail: parsed.detail };
      return gradeExpression(lesson, ex, step, run.key.values, parsed.src);
    }
    if (step.unit_input) {
      const custom = customUnits(step.unit), q = parseQuantity(input, lesson.locale, custom), expected = parseUnit(step.unit, custom);
      if (!q.ok) return { valid: false, issue: q.issue, detail: q.detail };
      if (!sameDimensions(q.unit.dims, expected.dims)) return { valid: true, correct: false, unitMismatch: true, feedback: step.unit_feedback || unitMismatchText(lesson, q.text, step.unit) };
      return gradeNumeric(lesson, run, q.value * q.unit.factor / expected.factor);
    }
    const v = parseNumber(input, lesson.locale, { percent: !!step.percent });
    if (!Number.isFinite(v)) return { valid: false };
    return gradeNumeric(lesson, run, v);
  }

  const isPt = lesson => /^pt/i.test(lesson.language || lesson.locale || '');
  function unitMismatchText(lesson, typed, wanted) {
    return isPt(lesson)
      ? `A unidade “${typed}” mede outra grandeza. A resposta deste passo é em ${wanted} (ou em outra unidade da mesma grandeza).`
      : `The unit "${typed}" measures a different quantity. This step's answer is in ${wanted} (or another unit of the same quantity).`;
  }
  /** Learner message for typed text that is not an answer (never counted as an attempt). */
  function invalidMessage(lesson, step, r) {
    const pt = isPt(lesson), symbols = (step.symbols || []).map(sym => sym.name).join(', ');
    if (r.issue === 'ambiguous_grouping') return ambiguousMessage(r.detail, lesson.locale);
    if (r.issue === 'unknown_symbol') return pt ? `“${r.detail}” não é um símbolo deste passo. Use: ${symbols}.` : `"${r.detail}" is not a symbol of this step. Use: ${symbols}.`;
    if (r.issue === 'no_symbols') return pt ? `Escreva a fórmula com os símbolos (${symbols}), não o resultado numérico.` : `Write the formula with the symbols (${symbols}), not the numeric result.`;
    if (r.issue === 'missing_unit') return pt ? `Inclua a unidade depois do número (este passo pede ${step.unit}).` : `Add the unit after the number (this step asks for ${step.unit}).`;
    if (r.issue === 'unknown_unit') return pt ? `Não reconheci a unidade “${r.detail}”. Este passo pede ${step.unit}.` : `Unit "${r.detail}" was not recognised. This step asks for ${step.unit}.`;
    if (step.type === 'expression') return pt ? `Não consegui ler a expressão. Use os símbolos ${symbols}, números e os operadores + - * / ^ ( ) e sqrt( ).` : `The expression could not be read. Use the symbols ${symbols}, numbers and the operators + - * / ^ ( ) and sqrt( ).`;
    return pt ? `Digite um número seguido da unidade (este passo pede ${step.unit}).` : `Type a number followed by the unit (this step asks for ${step.unit}).`;
  }

  /** Values the learner typed and had accepted on earlier numeric steps of this run (same data). */
  function learnerValues(run, upTo) {
    const out = Object.create(null);
    let any = false;
    for (let i = 0; i < Math.min(upTo, run.completed.length); i++) {
      const c = run.completed[i];
      if (c && typeof c.value === 'number' && Number.isFinite(c.value)) { out[c.id] = c.value; any = true; }
    }
    return any ? out : null;
  }

  function closestAccepting(step, v, candidates) {
    let best = null;
    for (const c of candidates) {
      if (!Number.isFinite(c.value)) continue;
      const d = Math.abs(v - c.value);
      if (d <= toleranceFor(step, c.value) && (!best || d < best.d - 1e-12)) best = { d, path: c.path };
    }
    return best;
  }

  /** Half a unit in the last decimal the step asks for: the rounding of a computed value. */
  function halfUnit(step, v) { return 0.5 * 10 ** -step.display_decimals + 1e-9 * Math.max(1, Math.abs(v)); }

  /**
   * Grade a numeric answer (docs/formats/fmt-step-ladder.md, "Grading tiers and the follow-through bound").
   * Tier 1: the instructor key and the lesson's declared accepted_paths (e.g. exact
   *   t quantile, division by printed rounded values), each within the step tolerance;
   *   closest wins, ties go to the key.
   * Bugs: when tier 1 rejects, a declared bug value is diagnosed BEFORE follow-through,
   *   so a documented misconception never passes as carried drift.
   * Tier 2 (follow-through), only when neither matches: rounding only. The typed value must be
   *   within half a display unit of a carry path; no step tolerance is added on top, so
   *   tolerances cannot stack from step to step:
   *     display-carry  every earlier result rounded to the decimals the app asked for;
   *     learner-carry  the learner's own accepted earlier values.
   *   Remaining drift is the propagation of earlier tier-1 tolerances through the formulas.
   * A rejected value is never stored, so it cannot be carried.
   */
  function gradeNumeric(lesson, run, v) {
    const ex = exerciseById(lesson, run.exercise), step = ex.steps[run.step], key = run.key.steps[run.step];
    const candidates = [{ value: key.answer, path: null }];
    for (const p of ex.accepted_paths || []) {
      candidates.push({ value: solve(lesson, ex, run.variables, { overrides: p.overrides }).values[step.id], path: p });
    }
    const best = closestAccepting(step, v, candidates);
    if (best) {
      if (!best.path) return { valid: true, correct: true, value: v };
      return { valid: true, correct: true, value: v, path: best.path.id, note: keyNote(lesson, step, key, best.path.note) };
    }
    const scope = baseScope(lesson, run.key.values), fns = lessonFunctions(lesson);
    for (const b of step.bugs || []) {
      let bv;
      try { bv = evaluate(b.expr, scope, fns); } catch (e) { continue; }
      if (Number.isFinite(bv) && Math.abs(v - bv) <= toleranceFor(step, bv)) return { valid: true, correct: false, value: v, bug: b.id, feedback: b.feedback };
    }
    if (lesson.carry_paths) {
      const carry = [{ value: solve(lesson, ex, run.variables, { carry: 'display' }).values[step.id], path: { id: 'display-carry', ...lesson.carry_paths.display } }];
      const mine = learnerValues(run, run.step);
      if (mine) carry.push({ value: solve(lesson, ex, run.variables, { carried: mine }).values[step.id], path: { id: 'learner-carry', ...lesson.carry_paths.learner } });
      let near = null;
      for (const c of carry) {
        const d = Math.abs(v - c.value);
        if (Number.isFinite(c.value) && d <= halfUnit(step, c.value) && (!near || d < near.d - 1e-12)) near = { d, path: c.path };
      }
      if (near) return { valid: true, correct: true, value: v, path: near.path.id, note: keyNote(lesson, step, key, near.path.note) };
    }
    return { valid: true, correct: false, value: v };
  }
  function keyNote(lesson, step, key, note) {
    return String(note).split('{=gabarito}').join(formatNumber(key.answer, step.display_decimals, lesson.locale));
  }

  /** Submit one answer. Malformed input never counts as an attempt or an error. */
  function submit(lesson, run, input) {
    if (run.finished || run.awaitingRetry) return { status: 'locked' };
    const step = currentStep(lesson, run), r = check(lesson, run, input);
    if (!r.valid && (step.type === 'expression' || step.unit_input)) {
      return { status: 'invalid', message: invalidMessage(lesson, step, r), issue: r.issue || 'malformed' };
    }
    if (!r.valid) {
      const typed = step.type === 'givens' ? Object.values(input && typeof input === 'object' ? input : {}) : step.type === 'numeric' ? [input] : [];
      const amb = typed.find(t => typeof t === 'string' && numberIssue(t, lesson.locale) === 'ambiguous_grouping');
      const message = amb !== undefined ? ambiguousMessage(amb, lesson.locale) :
        step.type === 'givens' ? 'Preencha todos os campos com um número (vírgula ou ponto).' :
        step.type === 'choice' ? 'Escolha uma das opções.' : 'Digite um único número (vírgula ou ponto decimal).';
      return { status: 'invalid', message, issue: amb !== undefined ? 'ambiguous_grouping' : 'malformed' };
    }
    run.attempts++;
    if (r.correct) {
      run.completed[run.step] = { id: step.id, display: displayFor(lesson, run, run.step), how: run.hintLevel > 0 ? 'hinted' : 'learner' };
      // Keep the accepted number so later steps can follow it through (learner-carry).
      if (step.type === 'numeric') run.completed[run.step].value = r.value;
      run.step++; run.hintLevel = 0;
      if (run.step >= exerciseById(lesson, run.exercise).steps.length) { run.finished = true; run.step = run.completed.length; }
      const out = { status: 'correct', worked: text(lesson, run, step.worked), finished: run.finished };
      if (r.path) { out.path = r.path; out.note = text(lesson, run, r.note); }
      return out;
    }
    run.errors++; run.wrong++; run.awaitingRetry = true;
    // Engine-made unit feedback quotes typed text, so it is not passed through the template renderer.
    const feedback = r.unitMismatch && !step.unit_feedback ? r.feedback : text(lesson, run, r.feedback || step.misconception);
    return {
      status: 'wrong', bug: r.bug || null, fields: r.fields || null, unitMismatch: !!r.unitMismatch, feedback,
      worked: run.errors >= 2 ? text(lesson, run, step.worked) : null,
      hint: step.hints && step.hints.length ? text(lesson, run, step.hints[0]) : null
    };
  }

  function returnStepFor(lesson, run, policy, afterN) {
    const failed = run.step, ex = exerciseById(lesson, run.exercise);
    if (policy === 'full') return 0;
    if (policy === 'failed-step') return failed;
    if (policy === 'checkpoint') { let cp = 0; for (let i = 0; i < failed; i++) if (ex.steps[i].checkpoint) cp = i + 1; return cp; }
    if (policy === 'after-n-errors') return run.errors >= afterN ? 0 : failed;
    throw new Error(`Unknown restart policy ${policy}`);
  }
  function nextSeed(run) {
    const base = typeof run.seed === 'number' ? run.seed : 0x9E3779B1 ^ hashString(run.exercise);
    return (Math.imul(base ^ (run.restarts + 1), 2654435761) + 0x7F4A7C15) >>> 0;
  }
  function hashString(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

  /**
   * Apply a restart policy after a wrong answer. With newVariant the data are
   * redrawn from a seed and every completed earlier step is recomputed for the
   * new data (marked "recomputed", i.e. not the learner's own work).
   */
  function retry(lesson, run, opts) {
    const policy = opts.policy, afterN = opts.afterN || lesson.restart.after_n_errors;
    const target = returnStepFor(lesson, run, policy, afterN);
    if (target === 0) run.errors = 0;
    if (opts.newVariant) {
      const seed = opts.seed !== undefined ? opts.seed : nextSeed(run);
      const v = drawVariant(lesson, exerciseById(lesson, run.exercise), seed);
      run.seed = seed; run.variables = v.variables;
      run.key = solve(lesson, exerciseById(lesson, run.exercise), v.variables);
    }
    // New data: earlier steps are recomputed and the learner's old numbers are dropped (never stale).
    run.completed = run.completed.slice(0, target).map((c, i) => (opts.newVariant
      ? { id: c.id, display: displayFor(lesson, run, i), how: 'recomputed' }
      : { id: c.id, display: displayFor(lesson, run, i), how: c.how, ...(c.value !== undefined ? { value: c.value } : {}) }));
    run.step = target; run.awaitingRetry = false; run.hintLevel = 0; run.restarts++;
    return { returnStep: target, seed: run.seed };
  }

  /**
   * Answer to the explore prediction ("aumenta" | "diminui" | "igual"), computed
   * by solving the original data and the data with explore.var + delta.
   */
  function predictionAnswer(lesson, ex) {
    const p = ex.explore && ex.explore.predict;
    if (!p) return null;
    const base = originalVariables(ex), moved = { ...base, [ex.explore.var]: base[ex.explore.var] + p.delta };
    const a = solve(lesson, ex, base).values[p.quantity], b = solve(lesson, ex, moved).values[p.quantity];
    if (Math.abs(b - a) < 1e-9 * Math.max(1, Math.abs(a))) return 'igual';
    return b > a ? 'aumenta' : 'diminui';
  }

  // ------------------------------------------------------------- persistence
  function serializeRun(run) {
    const { key, ...rest } = run;
    return JSON.parse(JSON.stringify(rest));
  }
  /**
   * Restore a saved run. The data must be reproducible from the stored seed and
   * the answer key is always recomputed; progress cannot claim more steps than exist.
   */
  function restoreRun(lesson, saved) {
    if (!saved || typeof saved !== 'object') throw new Error('Progresso inválido');
    const ex = exerciseById(lesson, saved.exercise);
    const expected = saved.seed === 'original' ? originalVariables(ex) : drawVariant(lesson, ex, saved.seed).variables;
    if (!saved.variables || !sameVars(expected, saved.variables) || Object.keys(saved.variables).length !== Object.keys(expected).length) throw new Error('Os dados salvos não correspondem à semente');
    const n = ex.steps.length;
    for (const k of ['step', 'errors', 'attempts', 'wrong', 'hints', 'hintLevel', 'restarts']) if (!Number.isInteger(saved[k]) || saved[k] < 0) throw new Error(`Campo inválido: ${k}`);
    if (saved.step > n || !Array.isArray(saved.completed) || saved.completed.length !== saved.step) throw new Error('Passos salvos inconsistentes');
    if (typeof saved.finished !== 'boolean' || saved.finished !== (saved.step === n)) throw new Error('Estado de conclusão inconsistente');
    const run = { ...saved, variables: expected, key: solve(lesson, ex, expected) };
    run.completed = [];
    saved.completed.forEach((c, i) => {
      if (!c || c.id !== ex.steps[i].id || !['learner', 'hinted', 'recomputed'].includes(c.how)) throw new Error('Passo salvo inválido');
      const entry = { id: c.id, display: displayFor(lesson, run, i), how: c.how };
      if (c.value !== undefined) {
        // A carried value must be one the engine accepts at that step, given the earlier ones.
        if (ex.steps[i].type !== 'numeric' || c.how === 'recomputed' || typeof c.value !== 'number' || !Number.isFinite(c.value) ||
            !gradeNumeric(lesson, { ...run, step: i }, c.value).correct) throw new Error(`Valor salvo inválido no passo ${c.id}`);
        entry.value = c.value;
      }
      run.completed.push(entry);
    });
    return run;
  }

  // -------------------------------------------------------------- validation
  function templatesOf(ex, lesson) {
    const out = [ex.statement_template, ex.translation_template, ex.interpretation_template, ...(ex.common_mistakes || []), ...(ex.accepted_paths || []).map(p => p.note)];
    for (const s of ex.steps) {
      out.push(s.prompt, s.misconception, s.worked, ...(s.hints || []));
      for (const b of s.bugs || []) out.push(b.feedback);
      for (const o of optionsOf(lesson, s)) out.push(o.label, o.feedback);
    }
    return out.filter(t => typeof t === 'string');
  }

  /** Build-time checks of one expression step: readable key, declared symbols with real ranges, distinct bugs. */
  function expressionProblems(lesson, ex, s) {
    const out = [], fns = lessonFunctions(lesson);
    if (typeof s.display !== 'string' || !s.display.trim()) out.push('needs display (the formula as shown once accepted)');
    if (!Array.isArray(s.symbols) || !s.symbols.length) return [...out, 'needs symbols'];
    const refs = Object.create(null), seen = new Set(), earlier = new Set();
    for (const p of ex.steps) { if (p === s) break; if (p.type === 'numeric' || p.type === 'expression') earlier.add(p.id); }
    const known = baseScope(lesson, originalVariables(ex));
    for (const sym of s.symbols) {
      const ref = sym.ref || sym.name;
      for (const n of [sym.name, ...(sym.aliases || [])]) {
        if (typeof n !== 'string' || !SYMBOL_NAME.test(n) || own(LEARNER_FUNCTIONS, n.toLowerCase())) out.push(`symbol name "${n}" cannot be typed`);
        else if (seen.has(n)) out.push(`duplicate symbol name ${n}`);
        seen.add(n);
      }
      if (!own(known, ref) && !earlier.has(ref)) out.push(`symbol ${sym.name} refers to ${ref}, which is not a variable, a convention or an earlier numeric step`);
      const range = symbolRange(ex, sym);
      if (!range || !(range.hi > range.lo)) out.push(`symbol ${sym.name} needs sample [min, max] with max > min`);
      refs[ref] = 1;
    }
    if (out.length) return out;
    try { compile(s.expr); evaluate(s.expr, refs, fns); } catch (e) { return [`expr must use only the declared symbols: ${e.message}`]; }
    const points = expressionPoints(lesson, ex, s, originalVariables(ex)).slice(1);
    const vals = points.map(p => { try { return evaluate(s.expr, p, fns); } catch (e) { return NaN; } }).filter(Number.isFinite);
    if (vals.length < MIN_POINTS) out.push('expr is finite at too few sample points; adjust the sample ranges');
    else if (vals.every(v => Math.abs(v - vals[0]) <= 1e-9 * Math.max(1, Math.abs(vals[0])))) out.push('expr does not vary over the sample ranges');
    for (const b of s.bugs || []) {
      try { evaluate(b.expr, refs, fns); } catch (e) { out.push(`bug ${b.id}: ${e.message}`); continue; }
      if (sameAtPoints(s.expr, b.expr, points, fns)) out.push(`bug ${b.id} is equivalent to the key`);
    }
    return out;
  }

  /** Contract validation run by the build. Returns a list of problems (empty = valid). */
  function validateLesson(lesson, opts = {}) {
    const problems = [], seedCount = opts.seedCount === undefined ? 100 : opts.seedCount;
    // Pilot files (format ordered-procedure 0.2.0) and schema 1.0 lessons of kind ordered-procedure (docs/SCHEMA.md).
    if (lesson.format !== 'ordered-procedure' && !(lesson.schema_version === '1.0' && lesson.kind === 'ordered-procedure')) problems.push('format must be ordered-procedure');
    for (const k of ['id', 'title', 'language', 'locale', 'conventions', 'restart', 'methods', 'exercises']) if (!lesson[k]) problems.push(`missing ${k}`);
    if (problems.length) return problems;
    // Learner copy and research provenance stay separate: only learner_help is shown while practising.
    for (const k of ['learner_help', 'source_rationale']) if (typeof lesson.restart[k] !== 'string' || !lesson.restart[k].trim()) problems.push(`missing restart.${k}`);
    // Carry paths: a learner who carries the displayed or their own accepted values is followed through.
    for (const k of ['display', 'learner']) {
      const p = (lesson.carry_paths || {})[k];
      if (!p || typeof p.label !== 'string' || typeof p.note !== 'string' || !p.label.trim() || !p.note.trim()) problems.push(`missing carry_paths.${k}`);
    }
    const unreproducible = (ex, key, tag) => {
      for (const s of ex.steps) if (/:(carry|result)\}/.test(s.worked || '') && !carryFor(lesson, ex, key, s.worked).ok) problems.push(`${ex.id}.${s.id} (${tag}): a resolução não reproduz o próprio resultado em nenhuma precisão até ${MAX_CARRY} casas`);
    };
    const ids = new Set();
    for (const ex of lesson.exercises) {
      if (ids.has(ex.id)) problems.push(`duplicate exercise ${ex.id}`);
      ids.add(ex.id);
      const stepIds = new Set();
      for (const s of ex.steps) {
        if (stepIds.has(s.id)) problems.push(`${ex.id}: duplicate step ${s.id}`);
        stepIds.add(s.id);
        if (!s.title || !s.prompt || !s.worked || !Array.isArray(s.hints) || !s.hints.length) problems.push(`${ex.id}.${s.id}: needs title, prompt, worked and hints`);
        if (s.type === 'numeric') {
          try { compile(s.expr); } catch (e) { problems.push(`${ex.id}.${s.id}: ${e.message}`); }
          if (!Number.isInteger(s.display_decimals) || !s.tolerance) problems.push(`${ex.id}.${s.id}: needs display_decimals and tolerance`);
          if (s.unit_input) {
            const u = typeof s.unit === 'string' && s.unit.trim() ? parseUnit(s.unit, customUnits(s.unit)) : null;
            if (!u || u.unknown) problems.push(`${ex.id}.${s.id}: unit_input needs a readable unit`);
            if (s.percent) problems.push(`${ex.id}.${s.id}: unit_input and percent cannot be combined`);
          }
        }
        if (s.type === 'expression') problems.push(...expressionProblems(lesson, ex, s).map(p => `${ex.id}.${s.id}: ${p}`));
      }
      if (!ex.steps.some(s => s.role === 'method')) problems.push(`${ex.id}: needs a method step`);
      let solved;
      try { solved = solve(lesson, ex, originalVariables(ex)); } catch (e) { problems.push(`${ex.id}: ${e.message}`); continue; }
      problems.push(...solved.problems.map(p => `${ex.id} (original): ${p}`));
      unreproducible(ex, solved, 'original');
      try {
        for (const t of templatesOf(ex, lesson)) renderTemplate(lesson, ex, solved, t);
        if (renderTemplate(lesson, ex, solved, ex.statement_template) !== ex.original_statement) problems.push(`${ex.id}: statement_template with original data differs from original_statement`);
      } catch (e) { problems.push(`${ex.id}: ${e.message}`); }
      for (const [id, printed] of Object.entries((ex.source_answer_key || {}).printed || {})) {
        if (!matchesPrinted(solved.values[id], printed)) problems.push(`${ex.id}.${id}: engine ${solved.values[id]} does not match PDF ${printed}`);
      }
      for (const [id, choice] of Object.entries((ex.source_answer_key || {}).choices || {})) {
        if (solved.values[id] !== choice) problems.push(`${ex.id}.${id}: engine ${solved.values[id]} does not match PDF ${choice}`);
      }
      for (let seed = 1; seed <= seedCount; seed++) {
        try {
          const v = drawVariant(lesson, ex, seed), s = solve(lesson, ex, v.variables);
          for (const t of templatesOf(ex, lesson)) renderTemplate(lesson, ex, s, t);
          unreproducible(ex, s, `seed ${seed}`);
        } catch (e) { problems.push(`${ex.id} seed ${seed}: ${e.message}`); break; }
      }
    }
    return problems;
  }

  return {
    evaluate, compile, roundTo, formatNumber, parseNumber, numberIssue, ambiguousMessage, matchesPrinted, toleranceFor,
    exerciseById, originalVariables, decimalsOf, optionsOf, solve, drawVariant, mulberry32,
    renderTemplate, createRun, currentStep, statement, text, displayFor, optionsFor, hint,
    check, submit, retry, returnStepFor, nextSeed, serializeRun, restoreRun, validateLesson,
    predictionAnswer, tQuantile, parseLearnerExpression, parseUnit, parseQuantity, sameDimensions
  };
});
