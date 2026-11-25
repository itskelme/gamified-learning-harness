// Shared builder for the offline package page: package -> rules -> router plan -> one HTML file with every module
// inlined. Used by scripts/build-package.mjs (named packages) and scripts/build-lesson.mjs (any lesson file).
// Throws on any router error, rule problem or unfilled placeholder.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { inlineLessonMath } from './lesson-math.mjs';

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, '..', '..');
const { route, DEFAULT_MAX_FORMATS_PER_UNIT } = require('../../harness/core/router.js');
const { loadRegistry } = require('../../harness/core/registry.js');
const Rules = require('../../harness/core/rules.js');
const CAPS = require('../../harness/packages/caps.js');

export const sha = b => createHash('sha256').update(b).digest('hex');
/** Canonical JSON (sorted keys): the content digest ignores key order. */
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export const MODULES = ['harness/core/prng.js', 'harness/core/events.js', 'harness/procedure-engine.js', 'harness/plots.js',
  'harness/formats/fmt-data-visual-lab/procedure-spec.js',
  'harness/formats/fmt-choice-feedback/grader.js', 'harness/formats/fmt-retrieval-cloze/grader.js', 'harness/formats/fmt-match-classify/grader.js',
  'harness/formats/fmt-sequence-order/grader.js', 'harness/formats/fmt-branching-case/grader.js', 'harness/formats/fmt-data-visual-lab/lab.js',
  'harness/formats/fmt-review-mix/scheduler.js', 'harness/player/views.js'];

const slim = r => ({ rule_set_id: r.rule_set_id, preset: r.preset, label: r.label, slots: r.slots });

/**
 * Every preset x procedural-restart pair, resolved by harness/core/rules.js (the page never re-resolves rules).
 * The preset's own procedural option needs no override; any other is an override of restart_on_error.procedural.
 * Pairs with rule problems (e.g. a slot rejected on this content) are left out of the on-screen choices.
 */
export function ruleOptions(unitKinds, hasProcedure) {
  const cat = Rules.loadCatalogue(ROOT), proc = cat.slots['restart_on_error.procedural'];
  const restartOptions = Object.keys(proc.options).filter(o => o !== 'none');
  const presets = Rules.listPresets(ROOT);
  const matrix = {}, defaults = {};
  for (const p of presets) {
    const base = Rules.resolveRules(ROOT, { preset: p }, { unitKinds });
    if (base.problems.length) continue;
    const own = base.slots['restart_on_error.procedural'].option;
    defaults[p] = own;
    matrix[p] = {};
    for (const o of restartOptions) {
      const r = o === own ? base : Rules.resolveRules(ROOT, { preset: p, overrides: { 'restart_on_error.procedural': { option: o } } }, { unitKinds });
      if (!r.problems.length) matrix[p][o] = slim(r);
    }
  }
  // Without a step-by-step item the procedural restart changes nothing on the page: only the preset is offered.
  return { presets: Object.keys(matrix), restart_options: hasProcedure ? restartOptions : [], default_restart: defaults, matrix: hasProcedure ? matrix : Object.fromEntries(Object.entries(matrix).map(([p, row]) => [p, { [defaults[p]]: row[defaults[p]] }])) };
}

/**
 * Build one package page.
 * cfg: { key (caps.js key or null), pkg, lesson (embedded for the lab view, or null), title, links, preset, out (dir), file }
 * Returns the manifest (also written next to the HTML).
 */
export function buildPackagePage(cfg) {
  const cap = cfg.key && CAPS[cfg.key];
  const maxFormatsPerUnit = cap ? cap.max_formats_per_unit : DEFAULT_MAX_FORMATS_PER_UNIT;
  const capReason = cap ? cap.reason : 'router default (catalog r3 6.1 step 4)';
  const plan = route(cfg.pkg, loadRegistry(ROOT), { maxFormatsPerUnit });
  if (plan.errors.length) throw new Error(plan.errors.join('; '));
  const preset = cfg.preset || Rules.DEFAULT_PRESET;
  const unitKinds = cfg.pkg.units.map(u => u.kind);
  const rules = Rules.resolveRules(ROOT, { preset }, { unitKinds });
  if (rules.problems.length) throw new Error(rules.problems.join('; '));
  const hasProcedure = plan.units.some(u => u.formats.some(f => f.format_id === 'fmt-step-ladder'));
  const options = ruleOptions(unitKinds, hasProcedure);
  if (!options.matrix[preset]) throw new Error(`preset ${preset} has rule problems on this content`);

  // Content identity for saved progress: the package and the lesson it embeds (not the rule choices).
  const content = { lesson_id: cfg.lesson ? cfg.lesson.id : cfg.pkg.id, revision: cfg.lesson ? cfg.lesson.revision : (cfg.pkg.revision || 1), digest: sha(canonical({ package: cfg.pkg, lesson: cfg.lesson || null })) };
  const data = { title: cfg.title, package: cfg.pkg, plan, rules: slim(rules), rule_options: options, links: cfg.links || {}, lesson: cfg.lesson || null, content };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const scripts = MODULES.map(f => `<script>/* ${f} */\n${readFileSync(join(ROOT, f), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`).join('\n');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let html = readFileSync(join(ROOT, 'templates/package.html'), 'utf8');
  html = html.replace('__LANG__', esc(cfg.pkg.language || 'pt-BR')).replace('__TITLE__', esc(cfg.title));
  if (/__[A-Z_]+__/.test(html.replace('__PACKAGE_JSON__', '').replace('__SCRIPTS__', '').replace('__MATH_RENDERER__', ''))) throw new Error('unfilled template placeholder');
  html = html.split('__PACKAGE_JSON__').join(json).split('__SCRIPTS__').join(scripts);
  html = html.replace('__MATH_RENDERER__', () =>
    unitKinds.includes('ordered_procedure') || json.includes('\\\\(') ? inlineLessonMath() : '');
  if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) throw new Error('remote asset reference in package HTML');

  mkdirSync(cfg.out, { recursive: true });
  writeFileSync(join(cfg.out, cfg.file), html);
  const manifest = {
    package: cfg.pkg.id, preset, rule_set_id: rules.rule_set_id, max_formats_per_unit: maxFormatsPerUnit, max_formats_per_unit_reason: capReason,
    rule_choices_on_screen: { presets: options.presets, restart_options: options.restart_options },
    content,
    plan: plan.units.map(u => ({ unit: u.unit_id, formats: u.formats.map(f => f.format_id), dropped: u.dropped, skipped: u.skipped })), lesson_level: plan.lesson_level.map(f => f.format_id),
    html: { file: cfg.file, bytes: Buffer.byteLength(html), sha256: sha(html) },
    modules: MODULES.map(f => ({ file: f, sha256: sha(readFileSync(join(ROOT, f))) }))
  };
  writeFileSync(join(cfg.out, `${cfg.file.replace(/\.html$/, '')}.manifest.json`), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
