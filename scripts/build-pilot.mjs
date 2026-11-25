#!/usr/bin/env node
// One-command build for the Prova 3 ordered-procedure pilot.
//   node scripts/build-pilot.mjs [lesson.json] [--out DIR] [--variants N] [--no-pdf] [--no-oracle]
// 1. validates the lesson contract (original key vs printed PDF values, 200 seeded variants)
// 2. writes one offline HTML file (engine + plots + app + lesson inlined, CSP blocks network)
// 3. exports the engine answer key for the original data and N seeded variants
// 4. runs the independent Python oracle against that key
// 5. prints the study view to PDF and writes static SVG diagrams (same solved data); checks every PDF
//    page with pdftotext against scripts/learner-copy-rules.mjs
// 6. writes a manifest with SHA-256 digests
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { pdfPages, pdfProblems } from './learner-copy-rules.mjs';
import { findChromium, PDF_OPTIONS } from './lib/chromium.mjs';
import { inlineLessonMath } from './lib/lesson-math.mjs';
import { emptySectionsInDom, pdfEmptySections, pdfOrphans } from './lib/empty-sections.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const E = require(join(ROOT, 'harness/procedure-engine.js'));
const P = require(join(ROOT, 'harness/plots.js'));

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const lessonPath = resolve(args.find((a, i) => !a.startsWith('--') && !['--out', '--variants'].includes(args[i - 1])) || join(ROOT, 'lessons/prova3-statistics.lesson.json'));
const out = resolve(opt('--out', join(ROOT, 'build/prova3')));
const nVariants = Number(opt('--variants', 25));
const sha = b => createHash('sha256').update(b).digest('hex');
const fail = msg => { console.error('BUILD FAILED: ' + msg); process.exit(1); };

// 1. validate
const lessonText = readFileSync(lessonPath, 'utf8');
const lesson = JSON.parse(lessonText);
const problems = E.validateLesson(lesson, { seedCount: 200 });
if (problems.length) fail('lesson contract:\n  ' + problems.join('\n  '));
// Supplied material is pinned by path and digest; sources without a file (a lesson written from scratch, a
// published reference) have nothing on disk to check.
for (const s of lesson.sources.filter(x => x.path)) {
  const p = join(ROOT, s.path);
  if (!existsSync(p)) fail(`source missing: ${s.path}`);
  if (sha(readFileSync(p)) !== s.sha256) fail(`source digest changed: ${s.path}`);
}
const canonical = JSON.stringify(lesson);
const digest = sha(canonical);
mkdirSync(out, { recursive: true });

// 2. offline HTML
const inline = f => readFileSync(join(ROOT, f), 'utf8').replace(/<\/script/gi, '<\\/script');
const payload = canonical.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
const formatVersion = lesson.format_version || `schema ${lesson.schema_version}`;
const parts = {
  __FORMAT_VERSION__: formatVersion, __LESSON_JSON__: payload, __DIGEST__: digest,
  __ENGINE__: inline('harness/procedure-engine.js'), __PLOTS__: inline('harness/plots.js'), __APP__: inline('harness/app.js'),
  __SCREEN_STYLE__: inline('templates/ordered-procedure.screen.css'),
  __FONT_DATA__: readFileSync(join(ROOT, 'templates/fonts/newsreader/latin.woff2')).toString('base64'),
  __FONT_LICENSE__: readFileSync(join(ROOT, 'templates/fonts/newsreader/OFL.txt'), 'utf8')
};
let html = readFileSync(join(ROOT, 'templates/ordered-procedure.html'), 'utf8');
for (const [k, v] of Object.entries(parts)) html = html.split(k).join(v);
if (/__[A-Z_]+__/.test(html.replace(/<script>[\s\S]*?<\/script>/g, '').replace('__MATH_RENDERER__', ''))) fail('unfilled template placeholder');
html = html.replace('__MATH_RENDERER__', inlineLessonMath);
if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) fail('remote asset reference in HTML');
const htmlPath = join(out, `${lesson.id}.html`);
writeFileSync(htmlPath, html);

// 3. answer key: original + seeded variants
const answersOf = solved => Object.fromEntries(solved.steps.filter(s => s.type !== 'givens').map(s => [s.id, s.answer]));
const key = { lesson: lesson.id, digest, generated_by: 'harness/procedure-engine.js', seeds: Array.from({ length: nVariants }, (_, i) => 101 + i * 104729), exercises: {} };
for (const ex of lesson.exercises) {
  const orig = E.solve(lesson, ex, E.originalVariables(ex));
  key.exercises[ex.id] = {
    original: { variables: orig.variables, answers: answersOf(orig) },
    variants: key.seeds.map(seed => {
      const v = E.drawVariant(lesson, ex, seed), s = E.solve(lesson, ex, v.variables);
      return { seed, variables: v.variables, discarded_before_accept: v.discarded, answers: answersOf(s), statement: E.renderTemplate(lesson, ex, s, ex.statement_template) };
    })
  };
}
const keyPath = join(out, 'answer-key.json');
writeFileSync(keyPath, JSON.stringify(key, null, 2) + '\n');

// 4. independent oracle
let oracle = { status: 'skipped' };
if (!flag('--no-oracle')) {
  const r = spawnSync(process.env.PYTHON || 'python3', ['-I', join(ROOT, 'scripts/oracle_prova3.py'), '--lesson', lessonPath, '--key', keyPath, '--out', join(out, 'oracle-report.json')], { encoding: 'utf8' });
  process.stdout.write(r.stdout); process.stderr.write(r.stderr);
  if (r.status !== 0) fail('independent oracle disagrees (see oracle-report.json)');
  oracle = { status: 'pass', report: 'oracle-report.json' };
}

// 5. static diagrams + study PDF from the same solved data
const diagrams = [];
mkdirSync(join(out, 'diagrams'), { recursive: true });
for (const ex of lesson.exercises) {
  const r = P.render(lesson, ex, E.solve(lesson, ex, E.originalVariables(ex)), { revealAll: true });
  const f = `diagrams/${ex.id}.svg`;
  writeFileSync(join(out, f), r.svg + '\n');
  diagrams.push({ file: f, alt: r.alt });
}
let pdf = { status: 'skipped' };
if (!flag('--no-pdf')) {
  const exe = findChromium();
  if (!exe) fail('no Chromium found for the study PDF (set CHROMIUM_EXECUTABLE or pass --no-pdf)');
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(htmlPath).href);
    await page.emulateMedia({ media: 'print' });
    // Empty sections in the DOM being printed fail the build before the PDF is written (fail-closed).
    const dom = await page.evaluate(emptySectionsInDom);
    if (dom.problems.length) fail(`study PDF empty-section check (print DOM):\n  ${dom.problems.join('\n  ')}`);
    const pdfPath = join(out, `${lesson.id}-estudo.pdf`);
    await page.pdf({ path: pdfPath, ...PDF_OPTIONS });
    if (errors.length) fail('page errors while printing: ' + errors.join('; '));
    const pages = pdfPages(pdfPath), textProblems = [...pdfProblems(pages), ...pdfEmptySections(pages, dom.headings), ...pdfOrphans(pages, dom.keepWithNext)];
    if (textProblems.length) fail(`study PDF text check (${pages.length} pages, pdftotext):\n  ` + textProblems.join('\n  '));
    pdf = { status: 'built', file: relative(out, pdfPath), sha256: sha(readFileSync(pdfPath)), browser: browser.version(), renderer: 'chromium-html', role: 'fallback', note: 'Fallback PDF printed from the HTML study view. Pass --latex-pdf to scripts/build-lesson.mjs to compile the LaTeX study PDF.' };
  } finally { await browser.close(); }
}

// 6. manifest
const manifest = {
  lesson: lesson.id, revision: lesson.revision, format: lesson.format || lesson.kind, format_version: formatVersion, digest,
  source: relative(ROOT, lessonPath), inputs: lesson.sources.filter(s => s.path).map(s => ({ path: s.path, sha256: s.sha256 })),
  outputs: {
    html: { file: relative(out, htmlPath), sha256: sha(readFileSync(htmlPath)), bytes: readFileSync(htmlPath).length },
    answer_key: { file: 'answer-key.json', sha256: sha(readFileSync(keyPath)), variants_per_exercise: nVariants },
    diagrams, pdf, oracle
  },
  validation: { contract_problems: 0, seeds_checked_per_exercise: 200 },
  status: 'pilot; no learning-efficacy evaluation'
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`built ${relative(ROOT, htmlPath)} (${manifest.outputs.html.bytes} bytes), ${lesson.exercises.length} exercises, ${nVariants} variants each, oracle ${oracle.status}, pdf ${pdf.status}`);

