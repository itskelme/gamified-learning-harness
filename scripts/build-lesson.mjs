#!/usr/bin/env node
// Generic entry point: ANY known lesson file (schema 0.1, ordered-procedure 0.2.0 or schema 1.0), or a shallow brief,
// -> study PDF + offline package + slides + LaTeX source, from one lesson model.
//   node scripts/build-lesson.mjs <lesson.json> [--out DIR] [--preset ID] [--latex-pdf | --no-pdf]
//   node scripts/build-lesson.mjs --brief <brief.json> [--provider <module.js>] [--out DIR] [--preset ID] [--latex-pdf | --no-pdf]
// 1. normalize: scripts/harness.py normalize migrates to 1.0 and validates (JSON Schema + cross-references); a
//    brief is first drafted by the provider (harness/brief/brief.js; default harness/brief/stub-provider.js)
// 2. package: composer by lesson id (curated) or kind (harness/packages/compose.js), then the shared package
//    builder (scripts/lib/package-page.mjs: router, rules, caps.js)
// 3. slides: harness/slides.js deck in templates/slides.html (offline, keyboard)
// 4. PDF: ordered-procedure lessons run scripts/build-pilot.mjs (step player + its printed study view); other kinds
//    print the study guide (harness/study-guide.js). Both are Chromium-printed FALLBACK PDFs, checked with pdftotext.
// 5. LaTeX: harness/latex.js source + dry-run check; --latex-pdf uses the local TeX installation.
// Exit 1 on any failure, exit 2 when a brief is refused (nothing is written).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { buildPackagePage, sha } from './lib/package-page.mjs';
import { findChromium, PDF_OPTIONS } from './lib/chromium.mjs';
import { inlineLessonMath } from './lib/lesson-math.mjs';
import { emptySectionsInDom, pdfEmptySections, pdfOrphans } from './lib/empty-sections.mjs';
import { pdfPages, pdfProblems } from './learner-copy-rules.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const Rules = require('../harness/core/rules.js');
const { composerFor } = require('../harness/packages/compose.js');
const { buildDeck } = require('../harness/slides.js');
const { renderStudyGuide } = require('../harness/study-guide.js');
const { renderLatex, checkLatex } = require('../harness/latex.js');
const Brief = require('../harness/brief/brief.js');
const deps = { engine: require('../harness/procedure-engine.js'), plotSpec: require('../harness/formats/fmt-data-visual-lab/procedure-spec.js') };

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const VALUE_OPTS = ['--out', '--preset', '--brief', '--provider'];
const fail = m => { console.error(`build-lesson: ${m}`); process.exit(1); };
const PY = process.env.PYTHON || 'python3';
const latexPdf = flag('--latex-pdf');
if (latexPdf && flag('--no-pdf')) fail('--latex-pdf and --no-pdf are mutually exclusive');
const chromiumPdf = !latexPdf && !flag('--no-pdf');

function normalize(path) {
  const r = spawnSync(PY, ['-I', join(ROOT, 'scripts/harness.py'), 'normalize', path], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) fail(`lesson contract (${relative(ROOT, path)}):\n  ${(r.stderr || r.stdout).trim().split('\n').join('\n  ')}`);
  return JSON.parse(r.stdout);
}

// ---- 1. lesson: a file, or a draft from a shallow brief
let lessonPath, raw, briefInfo = null;
const briefPath = opt('--brief');
if (briefPath) {
  const providerPath = opt('--provider');
  const provider = providerPath ? require(isAbsolute(providerPath) ? providerPath : resolve(providerPath)) : require('../harness/brief/stub-provider.js');
  let draft;
  try { draft = Brief.draftLesson(JSON.parse(readFileSync(resolve(briefPath), 'utf8')), provider); }
  catch (e) { console.error(`build-lesson: ${e.message}`); process.exit(e instanceof Brief.BriefError ? 2 : 1); }
  const out0 = resolve(opt('--out') || join(ROOT, 'build/lessons', draft.id));
  mkdirSync(out0, { recursive: true });
  lessonPath = join(out0, `${draft.id}.lesson.json`);
  writeFileSync(lessonPath, JSON.stringify(draft, null, 2) + '\n');
  briefInfo = { brief: relative(ROOT, resolve(briefPath)), provider: provider.id, draft: relative(ROOT, lessonPath) };
} else {
  const file = args.find((a, i) => !a.startsWith('--') && !VALUE_OPTS.includes(args[i - 1]));
  if (!file) fail('usage: node scripts/build-lesson.mjs <lesson.json> | --brief <brief.json> [--provider module.js] [--out DIR] [--preset ID] [--no-pdf]');
  lessonPath = resolve(file);
}
raw = JSON.parse(readFileSync(lessonPath, 'utf8'));
const { lesson, content_digest: lessonDigest, migrated_from: migratedFrom } = normalize(lessonPath);
const out = resolve(opt('--out') || join(ROOT, 'build/lessons', lesson.id));
mkdirSync(out, { recursive: true });
const pt = (lesson.language || '').startsWith('pt');
const outputs = {};

// ---- 2. offline package
const composer = composerFor(lesson);
// Curated composers read the file as written (Prova 3 is a pilot 0.2.0 file); generic ones read the 1.0 lesson.
const curated = composer.name.startsWith('curated:');
const pkg = curated ? composer.compose(raw, deps) : composer.compose(lesson, deps);
const procedure = lesson.kind === 'ordered-procedure';
const pageLesson = procedure || lesson.kind === 'declarative-case' ? (curated ? raw : lesson) : null;
try {
  const file = `${lesson.id}-pacote.html`;
  const m = buildPackagePage({ key: composer.key, pkg, lesson: pageLesson, title: `${lesson.title} — ${pt ? 'prática' : 'practice'}`,
    links: procedure ? { 'fmt-step-ladder': `${lesson.id}.html` } : {}, preset: opt('--preset') || Rules.DEFAULT_PRESET, out, file });
  outputs.package = { file, sha256: m.html.sha256, composer: composer.name, plan: m.plan, lesson_level: m.lesson_level, rule_set_id: m.rule_set_id };
} catch (e) { fail(`package: ${e.message}`); }

// ---- 3. slides
{
  const deck = { ...buildDeck(lesson), infer_notation: procedure };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const json = JSON.stringify(deck).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  let html = readFileSync(join(ROOT, 'templates/slides.html'), 'utf8').replace('__LANG__', esc(lesson.language)).replace('__TITLE__', esc(`${lesson.title} — slides`));
  for (const [k, v] of Object.entries({ __UI_HINT__: deck.ui.hint, __UI_DECK__: deck.ui.deck, __UI_NAV__: deck.ui.nav, __UI_PREV__: deck.ui.prev, __UI_NEXT__: deck.ui.next })) html = html.split(k).join(esc(v));
  if (/__(?!DECK_JSON__|PLAYER__|MATH_RENDERER__)[A-Z_]+__/.test(html)) fail('slides: unfilled template placeholder');
  html = html.split('__DECK_JSON__').join(json).split('__PLAYER__').join(readFileSync(join(ROOT, 'harness/player/slides-player.js'), 'utf8').replace(/<\/script/gi, '<\\/script'));
  html = html.replace('__MATH_RENDERER__', () => procedure || json.includes('\\\\(') ? inlineLessonMath() : '');
  if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) fail('slides: remote asset reference');
  const file = `${lesson.id}-slides.html`;
  writeFileSync(join(out, file), html);
  outputs.slides = { file, sha256: sha(html), slides: deck.slides.length, figures: deck.slides.filter(s => s.figure).length, retrieval_prompts: deck.slides.filter(s => s.retrieval).length };
}

// ---- 4. study PDF (fallback renderer: Chromium) and, for procedures, the step player
if (procedure) {
  const a = [join(ROOT, 'scripts/build-pilot.mjs'), lessonPath, '--out', out];
  if (lesson.id !== 'prova3-estatistica') a.push('--no-oracle'); // the oracle transcribes the Prova 3 PDF; other lessons rely on the engine's 200-seed contract
  if (!chromiumPdf) a.push('--no-pdf');
  const r = spawnSync(process.execPath, a, { encoding: 'utf8' });
  process.stdout.write(r.stdout); process.stderr.write(r.stderr);
  if (r.status !== 0) fail('step player / study PDF (scripts/build-pilot.mjs) failed');
  const pm = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  outputs.step_player = { file: pm.outputs.html.file, sha256: pm.outputs.html.sha256, oracle: pm.outputs.oracle.status };
  outputs.pdf = pm.outputs.pdf;
} else {
  const html = renderStudyGuide(lesson), htmlFile = `${lesson.id}-estudo.html`;
  writeFileSync(join(out, htmlFile), html);
  outputs.study_html = { file: htmlFile, sha256: sha(html) };
  outputs.pdf = { status: 'skipped' };
  if (chromiumPdf) {
    const exe = findChromium();
    if (!exe) fail('no Chromium found for the study PDF (set CHROMIUM_EXECUTABLE or pass --no-pdf)');
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(join(out, htmlFile)).href);
      await page.emulateMedia({ media: 'print' });
      // Empty sections in the DOM being printed fail the build before the PDF is written (fail-closed).
      const dom = await page.evaluate(emptySectionsInDom);
      if (dom.problems.length) fail(`study PDF empty-section check (print DOM):\n  ${dom.problems.join('\n  ')}`);
      const pdfFile = `${lesson.id}-estudo.pdf`;
      await page.pdf({ path: join(out, pdfFile), ...PDF_OPTIONS });
      const pages = pdfPages(join(out, pdfFile)), problems = [...pdfProblems(pages), ...pdfEmptySections(pages, dom.headings), ...pdfOrphans(pages, dom.keepWithNext)];
      if (problems.length) fail(`study PDF text check (${pages.length} pages, pdftotext):\n  ${problems.join('\n  ')}`);
      outputs.pdf = { status: 'built', file: pdfFile, pages: pages.length, renderer: 'chromium-html', role: 'fallback', browser: browser.version(),
        note: 'Fallback PDF printed from the HTML study guide. Pass --latex-pdf with TeX Live installed to compile the LaTeX source.' };
    } finally { await browser.close(); }
  }
}

// ---- 5. LaTeX source, static checks and optional compilation
{
  const src = renderLatex(lesson), file = `${lesson.id}.tex`;
  const problems = checkLatex(src);
  if (problems.length) fail(`LaTeX dry run:\n  ${problems.join('\n  ')}`);
  writeFileSync(join(out, file), src);
  outputs.latex = { file, sha256: sha(src), dry_run: 'pass', compiled: false,
    compile_with: 'node scripts/build-lesson.mjs <lesson.json> --latex-pdf',
    status: 'source and dry run only' };
  if (latexPdf) {
    const stage = mkdtempSync(join(out, '.tex-build-'));
    let failure;
    try {
      const pdfFile = `${lesson.id}-estudo.pdf`;
      writeFileSync(join(stage, file), src);
      const result = spawnSync('latexmk', [
        '-norc', '-pdf', '-pdflatex=pdflatex -no-shell-escape %O %S',
        '-interaction=nonstopmode', '-halt-on-error', '-file-line-error',
        `-jobname=${lesson.id}-estudo`, file
      ], { cwd: stage, encoding: 'utf8', maxBuffer: 8 << 20 });
      if (result.error?.code === 'ENOENT') {
        throw new Error('latexmk was not found. Install TeX Live and latexmk (see docs/ENVIRONMENT.md).');
      }
      if (result.error) throw result.error;
      if (result.status !== 0) {
        const log = (result.stdout + result.stderr).trim().split('\n');
        const firstError = log.findIndex(line => /^! |\.tex:\d+:/.test(line));
        throw new Error((firstError < 0 ? log.slice(-24) : log.slice(firstError, firstError + 12)).join('\n'));
      }
      const stagedPdf = join(stage, pdfFile), pages = pdfPages(stagedPdf);
      const textProblems = pdfProblems(pages);
      if (!pages.length || textProblems.length) throw new Error(textProblems.join('\n') || 'empty PDF');
      const pdfSha = sha(readFileSync(stagedPdf));
      renameSync(stagedPdf, join(out, pdfFile));
      outputs.pdf = { status: 'built', file: pdfFile, pages: pages.length, sha256: pdfSha, renderer: 'pdflatex', role: 'study' };
      outputs.latex.compiled = true;
      outputs.latex.status = 'compiled with latexmk and pdfLaTeX';
    } catch (error) {
      failure = error;
    } finally {
      rmSync(stage, { recursive: true, force: true });
    }
    if (failure) fail(`LaTeX compilation failed:\n${failure.message}`);
  }
}

const manifest = {
  entry: 'scripts/build-lesson.mjs', lesson: lesson.id, revision: lesson.revision, kind: lesson.kind, source: relative(ROOT, lessonPath),
  migrated_from: migratedFrom || null, content_digest: lessonDigest, brief: briefInfo && { ...briefInfo, assumptions: lesson.brief.assumptions, unverified_claims: lesson.brief.unverified_claims },
  outputs
};
writeFileSync(join(out, 'lesson-build.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`built ${relative(ROOT, out)}: ${lesson.kind} "${lesson.id}" rev ${lesson.revision}${migratedFrom ? ` (migrated from ${migratedFrom.schema} ${migratedFrom.version})` : ''}; package ${outputs.package.plan.map(p => p.formats.join(' > ')).join(' | ')}; ${outputs.slides.slides} slides; pdf ${outputs.pdf.status}${outputs.pdf.role ? ` (${outputs.pdf.role})` : ''}; LaTeX dry run ${outputs.latex.dry_run}${briefInfo ? `; brief: ${lesson.brief.assumptions.length} assumptions, ${lesson.brief.unverified_claims.length} unverified claims` : ''}`);
