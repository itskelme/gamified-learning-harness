#!/usr/bin/env node
// Build an offline package page for a named package: package -> rules -> router plan -> one HTML file with every
// module inlined (scripts/lib/package-page.mjs). For any lesson file, use scripts/build-lesson.mjs instead.
// Usage: node scripts/build-package.mjs <prova3|humanities> [--preset <id>]
// Fails (exit 1) on any router error, rule problem or unfilled placeholder.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildPackagePage } from './lib/package-page.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const Rules = require('../harness/core/rules.js');
const fail = m => { console.error(`build-package: ${m}`); process.exit(1); };

const args = process.argv.slice(2), name = args[0];
const preset = args.includes('--preset') ? args[args.indexOf('--preset') + 1] : Rules.DEFAULT_PRESET;
const read = f => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const PACKAGES = {
  prova3: () => {
    const lesson = read('lessons/prova3-statistics.lesson.json');
    return { pkg: require('../harness/packages/prova3.js').buildProva3Package(lesson), lesson, out: 'build/prova3', file: 'prova3-pacote.html',
      title: `${lesson.title} — prática em vários formatos`, links: { 'fmt-step-ladder': 'prova3-estatistica.html' } };
  },
  humanities: () => {
    const lesson = read('lessons/humanities-decisions.lesson.json');
    const pkg = require('../harness/packages/humanities.js').buildHumanitiesPackage(lesson);
    return { pkg, lesson, out: 'build/humanities', file: 'humanidades-pacote.html', title: `${lesson.title} — prática`, links: {} };
  }
};
if (!PACKAGES[name]) fail(`unknown package ${name} (have: ${Object.keys(PACKAGES).join(', ')})`);
let manifest;
try {
  const cfg = PACKAGES[name]();
  manifest = buildPackagePage({ key: name, pkg: cfg.pkg, lesson: cfg.lesson, title: cfg.title, links: cfg.links, preset, out: join(ROOT, cfg.out), file: cfg.file });
  console.log(`built ${cfg.out}/${cfg.file} (${manifest.html.bytes} bytes), ${manifest.plan.length} unit(s), formats: ${manifest.plan.map(p => p.formats.join(' > ')).join(' | ')}, lesson level: ${manifest.lesson_level.join(', ') || 'none'}, rules ${manifest.rule_set_id}`);
} catch (e) { fail(e.message); }
