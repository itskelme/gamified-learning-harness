/*
 * Format registry (catalog r3 section 3.2): one skills/<format_id>/format.json per format skill.
 * Node only (reads the skills folder at build time); the player receives the resolved plan, not this module.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const events = require('./events.js');

const ORDER = ['fmt-step-ladder', 'fmt-choice-feedback', 'fmt-retrieval-cloze', 'fmt-match-classify',
  'fmt-sequence-order', 'fmt-branching-case', 'fmt-data-visual-lab', 'fmt-review-mix'];
const CONTENT_KINDS = ['ordered_procedure', 'declarative', 'reorderable'];
const RETRY_CLASSES = ['procedural', 'declarative', 'order', 'none'];
// Closed verb list (catalog 6.1); "explain relationship" is written explain_relationship.
const OBJECTIVE_VERBS = ['perform', 'compute', 'recall', 'define', 'recognize', 'interpret', 'discriminate', 'classify',
  'sequence', 'decide', 'evaluate', 'explain_relationship', 'predict', 'retain', 'review'];
// Learning-phase order the router enforces (design-proposal section 6; worked study is the Phase 1 PDF).
// Order inside "application or simulation" follows the catalog 6.2 worked example.
const PHASES = ['retrieval', 'discrimination', 'perform', 'reconstruct', 'simulation', 'application', 'review'];
const A11Y = ['keyboard', 'untimed', 'non_drag', 'text_alt'];

function validateEntry(e) {
  const p = [];
  const arr = (v, name) => { if (!Array.isArray(v)) { p.push(`${name} must be a list`); return []; } return v; };
  for (const k of ['format_id', 'skill_name', 'contract_version', 'phase', 'retry_class', 'evidence']) if (typeof e[k] !== 'string' || !e[k]) p.push(`missing ${k}`);
  if (e.skill_name !== e.format_id) p.push('skill_name must equal format_id');
  if (!PHASES.includes(e.phase)) p.push(`unknown phase ${e.phase}`);
  if (!RETRY_CLASSES.includes(e.retry_class)) p.push(`unknown retry_class ${e.retry_class}`);
  const acc = e.accepts || {};
  for (const k of arr(acc.content_kinds, 'accepts.content_kinds')) if (!CONTENT_KINDS.includes(k)) p.push(`unknown content kind ${k}`);
  arr(acc.requires_fields, 'accepts.requires_fields'); arr(acc.optional_fields, 'accepts.optional_fields');
  const sel = e.selects_when || {};
  for (const v of arr(sel.objective_verbs, 'selects_when.objective_verbs')) if (!OBJECTIVE_VERBS.includes(v)) p.push(`unknown objective verb ${v}`);
  arr(sel.needs, 'selects_when.needs');
  for (const t of arr(e.emits, 'emits')) if (!Object.prototype.hasOwnProperty.call(events.EVENT_FIELDS, t)) p.push(`unknown event ${t} (catalog 3.4)`);
  for (const r of arr(e.outcomes, 'outcomes')) if (!Object.prototype.hasOwnProperty.call(events.ROUTE_PARAMS, r)) p.push(`unknown outcome route ${r} (catalog 3.5)`);
  if (arr(e.outcomes, 'outcomes').length && !arr(e.emits, 'emits').includes('outcome')) p.push('lists outcomes but does not emit outcome');
  for (const k of A11Y) if (!e.a11y || e.a11y[k] !== true) p.push(`a11y.${k} must be true (catalog 3.8 baseline)`);
  if (!e.pdf || typeof e.pdf.renders_as !== 'string' || e.pdf.key_included !== true) p.push('pdf.renders_as and pdf.key_included are required (catalog 3.9)');
  if (!arr(e.fixtures, 'fixtures').length) p.push('fixtures must name at least one acceptance fixture');
  return p;
}

function loadRegistry(root) {
  return ORDER.map(id => {
    const file = path.join(root, 'skills', id, 'format.json');
    if (!fs.existsSync(file)) throw new Error(`registry entry missing: skills/${id}/format.json`);
    const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (entry.format_id !== id) throw new Error(`skills/${id}/format.json declares format_id ${entry.format_id}`);
    return entry;
  });
}

module.exports = { ORDER, CONTENT_KINDS, RETRY_CLASSES, OBJECTIVE_VERBS, PHASES, validateEntry, loadRegistry, events };
