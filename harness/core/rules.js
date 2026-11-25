/*
 * Business rules as plain data (ADDENDUM-4; design-proposal rev 2 section 8). No engine, no DSL.
 * Layers, later wins: catalogue defaults -> named preset (rules/presets/<id>.json) -> overrides.
 * Node only: the build resolves the rule set once and embeds it in the offline player.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_PRESET = 'research-hybrid';
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function loadCatalogue(root) { return JSON.parse(fs.readFileSync(path.join(root, 'rules/catalogue.json'), 'utf8')); }
function listPresets(root) { return fs.readdirSync(path.join(root, 'rules/presets')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort(); }
function loadPreset(root, id) {
  const file = path.join(root, 'rules/presets', `${id}.json`);
  if (!/^[a-z0-9-]+$/.test(id) || !fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function displayRating(option) { return option.rating === 'GAP' ? 'GAP: no rating' : option.rating; }

function validateCatalogue(cat) {
  const p = [];
  for (const [slot, s] of Object.entries(cat.slots || {})) {
    if (!own(s.options || {}, s.default)) p.push(`${slot}: default ${s.default} is not an option`);
    for (const [id, o] of Object.entries(s.options || {})) if (typeof o.rating !== 'string' || !o.rating.trim()) p.push(`${slot}.${id}: empty rating`);
  }
  return p;
}

/** Canonical JSON with sorted keys, so the override digest ignores key order. */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/**
 * Resolve { preset?, overrides? } against the catalogue.
 * ctx.unitKinds: content kinds present in the lesson; ctx.contextVariants: every ordered item declares context_variants.
 * Returns { rule_set_id, preset, version, label, slots: { slot: { option, params, rating } }, problems[] }.
 * A non-empty problems list fails the build.
 */
function resolveRules(root, cfg = {}, ctx = {}) {
  const cat = loadCatalogue(root), problems = validateCatalogue(cat);
  const presetId = cfg.preset || DEFAULT_PRESET, preset = loadPreset(root, presetId);
  if (!preset) return { problems: [...problems, `unknown preset ${presetId} (have: ${listPresets(root).join(', ')})`], slots: {} };
  const kinds = new Set(ctx.unitKinds || []);
  const slots = {};
  for (const [slot, s] of Object.entries(cat.slots)) slots[slot] = { option: s.default, params: { ...((s.options[s.default] || {}).params || {}) } };
  const apply = (layer, source) => {
    for (const [slot, choice] of Object.entries(layer || {})) {
      const s = cat.slots[slot];
      if (!s) { problems.push(`${source}: unknown slot ${slot}`); continue; }
      const { option, ...params } = choice || {};
      const o = s.options[option];
      if (!o) { problems.push(`${source}: ${slot}: ${option} is not an option (have: ${Object.keys(s.options).join(', ')})`); continue; }
      const allowed = o.params || {};
      for (const [k, v] of Object.entries(params)) {
        if (!own(allowed, k)) problems.push(`${source}: ${slot}.${option}: unknown parameter ${k}`);
        else if (typeof v !== typeof allowed[k] || (Array.isArray(allowed[k]) !== Array.isArray(v))) problems.push(`${source}: ${slot}.${option}: parameter ${k} must be ${Array.isArray(allowed[k]) ? 'a list' : typeof allowed[k]}`);
      }
      slots[slot] = { option, params: { ...allowed, ...params } };
    }
  };
  apply(preset.slots, `preset ${presetId}`);
  apply(cfg.overrides, 'overrides');
  for (const [slot, r] of Object.entries(slots)) {
    const o = cat.slots[slot].options[r.option];
    if (!o) continue;
    r.rating = displayRating(o);
    for (const k of o.rejected_kinds || []) if (kinds.has(k)) problems.push(`${slot}: ${r.option} is rejected on ${k} content`);
    if (o.requires === 'context_variants' && !ctx.contextVariants) problems.push(`${slot}: ${r.option} needs context_variants on every ordered_procedure item`);
  }
  const ovr = cfg.overrides && Object.keys(cfg.overrides).length
    ? crypto.createHash('sha256').update(canonical(cfg.overrides)).digest('hex').slice(0, 12) : 'none';
  return { rule_set_id: `${presetId}@${preset.version}+ovr:${ovr}`, preset: presetId, version: preset.version, label: preset.label, slots, problems };
}

module.exports = { DEFAULT_PRESET, loadCatalogue, listPresets, loadPreset, validateCatalogue, displayRating, resolveRules };
