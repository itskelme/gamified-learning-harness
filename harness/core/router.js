/*
 * Router (catalog r3 section 6.1): plain function over plain data. It reads each unit's content kind,
 * objective verbs and the payload fields that exist, and selects formats from the registry. It never
 * creates content: a format whose fields are missing is skipped with the reason.
 *
 * Implementation decisions (documented in docs/FORMATS.md):
 * - fmt-review-mix is planned once per lesson (lesson_level), not inside the per-unit cap, because it
 *   mixes items across units.
 * - Phase order is registry.PHASES; ties keep registry order.
 * - "order_key" exists when an item has key_order (authored) or sort_by (derived from data).
 */
'use strict';
const { PHASES, CONTENT_KINDS } = require('./registry.js');

const LESSON_LEVEL = new Set(['fmt-review-mix']);

function fieldsOf(unit) {
  const f = new Set(Object.keys(unit.payload || {}));
  for (const it of unit.items || []) for (const k of Object.keys(it.payload || {})) f.add(k);
  if (f.has('key_order') || f.has('sort_by')) f.add('order_key');
  return f;
}

// Catalog r3 6.1 step 4: "cap the plan at what the time budget allows (default 4 formats per unit)".
// Per-package overrides, each with a reason, live in harness/packages/caps.js (docs/FORMATS.md "Cap overrides").
const DEFAULT_MAX_FORMATS_PER_UNIT = 4;

function route(lesson, registry, opts = {}) {
  const cap = opts.maxFormatsPerUnit || DEFAULT_MAX_FORMATS_PER_UNIT;
  const errors = [], units = [], lessonLevel = new Map();
  const verbOf = new Map((lesson.objectives || []).map(o => [o.id, o.verb]));
  const unsourced = [];
  for (const u of lesson.units || []) {
    if (!CONTENT_KINDS.includes(u.kind)) errors.push(`unit ${u.id}: unknown content kind ${u.kind}`);
    for (const o of u.objectives || []) if (!verbOf.has(o)) errors.push(`unit ${u.id}: unknown objective ${o}`);
    for (const it of u.items || []) if (typeof it.source_ref !== 'string' || !it.source_ref.trim()) unsourced.push(`${u.id}/${it.id}`);
  }
  if (unsourced.length) errors.push(`items without source_ref: ${unsourced.join(', ')}`);
  if (errors.length) return { lesson_id: lesson.id, units: [], lesson_level: [], errors };

  for (const u of lesson.units) {
    const fields = fieldsOf(u), verbs = new Set(u.objectives.map(o => verbOf.get(o)));
    const chosen = [], skipped = [];
    for (const e of registry) {
      const why = [];
      if (!e.accepts.content_kinds.includes(u.kind)) why.push(`content kind ${u.kind} not accepted`);
      const missing = e.accepts.requires_fields.filter(k => !fields.has(k));
      if (missing.length) why.push(`missing fields: ${missing.join(', ')}`);
      if (!e.selects_when.objective_verbs.some(v => verbs.has(v))) why.push(`no matching objective verb (needs ${e.selects_when.objective_verbs.join(' or ')})`);
      if (why.length) { skipped.push({ format_id: e.format_id, reason: why.join('; ') }); continue; }
      const pick = { format_id: e.format_id, phase: e.phase, reason: `objective ${e.selects_when.objective_verbs.filter(v => verbs.has(v)).join(', ')}` };
      if (LESSON_LEVEL.has(e.format_id)) { if (!lessonLevel.has(e.format_id)) lessonLevel.set(e.format_id, { ...pick, units: [] }); lessonLevel.get(e.format_id).units.push(u.id); }
      else chosen.push(pick);
    }
    const order = id => registry.findIndex(e => e.format_id === id);
    chosen.sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || order(a.format_id) - order(b.format_id));
    units.push({
      unit_id: u.id, kind: u.kind, formats: chosen.slice(0, cap),
      dropped: chosen.slice(cap).map(f => ({ format_id: f.format_id, reason: `over the per-unit cap of ${cap}` })), skipped
    });
  }
  return { lesson_id: lesson.id, units, lesson_level: [...lessonLevel.values()], errors };
}

module.exports = { route, fieldsOf, DEFAULT_MAX_FORMATS_PER_UNIT };
