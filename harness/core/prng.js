/*
 * Portable PRNG shared by every format (catalog r3 section 3.7).
 *
 * mulberry32 seeded by 32-bit FNV-1a of the UTF-8 text "{seed}:{item_id}:{purpose}:{n}".
 * Shuffle: Fisher-Yates from the end with j = floor(rnd() * (i + 1)). Rounding: half_up.
 * Anchor: fnv1a32("anchor") = 1122880180; the Python reference is format_fixtures.py.
 *
 * Migration from the Prova 3 pilot (ordered-procedure 0.2.0): the pilot already uses the same
 * mulberry32, seeded directly with an integer variant seed. Step-ladder variants keep that
 * integer seeding, so exported pilot progress (which stores the integer seed) restores the same
 * data. New formats seed from text via seedText(). Test: tests/core.test.js "PRNG migration".
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HarnessPrng = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function utf8Bytes(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    return Buffer.from(text, 'utf8');
  }

  function fnv1a32(text) {
    let h = 0x811C9DC5;
    for (const b of utf8Bytes(String(text))) h = Math.imul(h ^ b, 0x01000193) >>> 0;
    return h >>> 0;
  }

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

  function seedText(seed, itemId, purpose, n) { return `${seed}:${itemId}:${purpose}:${n}`; }

  function rngFor(text) { return mulberry32(fnv1a32(text)); }

  /** Seeded Fisher-Yates on a copy; the input array is never modified. */
  function shuffled(items, text) {
    const rnd = rngFor(text), a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function halfUp(x, d) { const f = 10 ** d; return Math.floor(x * f + 0.5) / f; }

  return { fnv1a32, mulberry32, seedText, rngFor, shuffled, halfUp };
});
