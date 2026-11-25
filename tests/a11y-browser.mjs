// Accessibility walkthrough on the FINAL artifacts (ACCEPTANCE line 24; card t_fd19236f "Schema and state").
// Run after building each lesson with the generic entry:
//   for f in lessons/prova3-statistics.lesson.json lessons/humanities-decisions.lesson.json \
//            lessons/teste-z-uma-media.lesson.json examples/stem.lesson.json; do node scripts/build-lesson.mjs $f; done
//   node scripts/build-lesson.mjs --brief examples/briefs/vies-de-sobrevivencia.brief.json
//   node tests/a11y-browser.mjs
// For every lesson: the package page, the slides, the step player (procedures) and the study guide (other kinds).
//   1. axe-core (WCAG 2.0/2.1/2.2 A and AA rules, which include colour contrast) at 1440 and 360 px: no violations;
//      packages per format item (scoped run), slides per slide with the recall answer open;
//   2. screen-reader walkthrough: the accessibility tree of every package item and every slide is written to
//      build/lessons/qa/aria/ (the transcript a screen-reader user hears, in order) and checked for a named region,
//      a level-2 heading, named controls and a polite live region for feedback;
//   3. keyboard: every focusable control is reached with Tab alone; slides move with the arrow keys, Home and End,
//      focus lands on each slide heading and the recall answer opens with Enter;
//   4. reduced motion: with prefers-reduced-motion no element has a transition or animation;
//   5. untimed mode: every on-screen preset keeps gamification.timer off, no timer of a second or more is set, and
//      no page shows a countdown;
//   6. 360 px: no sideways scroll on any artifact or slide, and SVG plot labels render at 10 px or more.
// Writes build/lessons/qa/a11y-report.json. Exit 1 on any failure.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { findChromium } from '../scripts/lib/chromium.mjs';
import { emptySectionsInDom } from '../scripts/lib/empty-sections.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const ALL = ['prova3-estatistica', 'humanidades-decisoes', 'teste-z-uma-media', 'mean-confidence-interval', 'rascunho-vies-de-sobrevivencia'];
// A11Y_LESSONS=id1,id2 narrows the run (RED runs and debugging); the gate runs all five.
const LESSONS = process.env.A11Y_LESSONS ? process.env.A11Y_LESSONS.split(',').filter(id => ALL.includes(id)) : ALL;
const QA = join(ROOT, 'build/lessons/qa'), ARIA = join(QA, 'aria');
mkdirSync(ARIA, { recursive: true });

const report = { generated_by: 'tests/a11y-browser.mjs', axe_core: require('axe-core/package.json').version, tags: AXE_TAGS, artifacts: [] };
const failures = [];
let passes = 0;
async function check(label, fn) {
  try { await fn(); passes++; console.log(`PASS ${label}`); }
  catch (e) { failures.push(`${label}: ${e.message}`); console.log(`FAIL ${label}\n     ${e.message.split('\n').join('\n     ')}`); }
}

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
async function open(file, { width = 1440, reduce = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'pt-BR', bypassCSP: true, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  await context.route('**/*', r => (/^(file|data|blob):/.test(r.request().url()) ? r.continue() : r.abort()));
  // Untimed mode: record every timer of one second or more the page sets.
  await context.addInitScript(() => {
    window.__longTimers = [];
    for (const k of ['setTimeout', 'setInterval']) {
      const orig = window[k];
      window[k] = function (fn, ms, ...rest) { if (Number(ms) >= 1000) window.__longTimers.push({ kind: k, ms: Number(ms), stack: new Error().stack.split('\n').slice(2, 3).join('') }); return orig.call(this, fn, ms, ...rest); };
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(AXE);
  return { page, context, errors };
}
async function axe(page, include) {
  const r = await page.evaluate(async ({ include, tags }) => {
    // axe skips hidden content: callers open what they want checked.
    const res = await window.axe.run(include ? { include: [include] } : document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return res.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')) }));
  }, { include, tags: AXE_TAGS });
  return r;
}
const fmtViolations = v => v.map(x => `${x.id} (${x.impact}): ${x.help} @ ${x.nodes.join(', ')}`).join('\n');
async function noOverflow(page, what) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(o.sw <= o.cw, `${what}: page scrolls sideways at ${o.cw} px (content ${o.sw} px)`);
}
async function svgLabelsAtLeast(page, selector, px, what) {
  const small = await page.$$eval(`${selector} svg text`, (ts, px) => ts.filter(t => t.getClientRects().length && t.textContent.trim()).map(t => ({ text: t.textContent.trim(), h: t.getBoundingClientRect().height })).filter(x => x.h < px), px);
  assert.deepEqual(small, [], `${what}: SVG labels under ${px} px`);
}
async function noMotion(page, what) {
  const moving = await page.evaluate(() => [...document.querySelectorAll('*')].filter(el => {
    const cs = getComputedStyle(el), t = cs.transitionDuration.split(',').some(d => parseFloat(d) > 0), a = cs.animationName !== 'none' && cs.animationDuration.split(',').some(d => parseFloat(d) > 0);
    return t || a;
  }).slice(0, 5).map(el => el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '')));
  assert.deepEqual(moving, [], `${what}: elements still move with prefers-reduced-motion`);
}
async function untimed(page, what) {
  // Frames from code the test itself evaluates (axe-core) are not the page's timers.
  const t = await page.evaluate(() => window.__longTimers.filter(x => !/eval at evaluate/.test(x.stack)));
  assert.deepEqual(t, [], `${what}: timers of a second or more`);
  const text = await page.evaluate(() => document.body.innerText);
  // "Sem cronômetro" states the untimed mode; any other timer wording or a running clock (m:ss) is a countdown.
  assert.doesNotMatch(text.replace(/sem cron[ôo]metro/gi, ''), /tempo restante|cron[ôo]metro|segundos restantes|time left|countdown|\b\d{1,2}:\d{2}\b/i, `${what}: countdown text`);
}
/** Tab from the top: every visible, enabled, tabbable control must receive focus. */
async function tabReachesAll(page, what) {
  const total = await page.evaluate(() => {
    const sel = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    // Content of a closed <details> is reached by opening its summary (the summary itself is counted).
    const closed = el => { const d = el.closest('details:not([open])'); return d && !(el.tagName === 'SUMMARY' && el.parentElement === d); };
    const els = [...document.querySelectorAll(sel)].filter(el => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert]') && !closed(el));
    // Radio groups take one Tab stop: count one per group name.
    const seen = new Set();
    let n = 0;
    els.forEach(el => { if (el.type === 'radio') { if (seen.has(el.name)) { el.dataset.qa = 'radio-dup'; return; } seen.add(el.name); } el.dataset.qa = String(n++); });
    return n;
  });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.locator('body').focus();
  const reached = new Set();
  for (let i = 0; i < total + 10 && reached.size < total; i++) {
    await page.keyboard.press('Tab');
    const k = await page.evaluate(() => { const a = document.activeElement; if (!a) return null; if (a.type === 'radio') { const first = document.querySelector(`input[type=radio][name="${CSS.escape(a.name)}"][data-qa]:not([data-qa="radio-dup"])`); return first ? first.dataset.qa : null; } return a.dataset.qa || null; });
    if (k !== null && k !== 'radio-dup') reached.add(k);
  }
  const missed = await page.evaluate(reached => [...document.querySelectorAll('[data-qa]:not([data-qa="radio-dup"])')].filter(el => !reached.includes(el.dataset.qa))
    .map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.type ? '[' + el.type + ']' : ''} "${(el.getAttribute('aria-label') || el.textContent || el.name || '').trim().slice(0, 40)}"`), [...reached]);
  assert.equal(reached.size, total, `${what}: Tab reached ${reached.size} of ${total} controls; never reached: ${missed.join('; ')}`);
}

try {
  for (const id of LESSONS) {
    const dir = join(ROOT, 'build/lessons', id), mf = join(dir, 'lesson-build.json');
    await check(`${id}: built by scripts/build-lesson.mjs`, async () => assert.ok(existsSync(mf), `${mf} missing: build the lesson first`));
    if (!existsSync(mf)) continue;
    const m = JSON.parse(readFileSync(mf, 'utf8'));
    const entry = { lesson: id, kind: m.kind, checks: {} };
    report.artifacts.push(entry);

    // ---------------------------------------------------------------- package page
    const pkgFile = join(dir, m.outputs.package.file);
    for (const width of [1440, 360]) {
      const { page, context, errors } = await open(pkgFile, { width });
      await check(`${id} package @${width}: axe, whole page`, async () => { const v = await axe(page); assert.equal(v.length, 0, fmtViolations(v)); });
      if (width === 360) {
        await check(`${id} package @360: no sideways scroll`, () => noOverflow(page, 'package'));
        await check(`${id} package @360: lab SVG labels at least 10 px`, () => svgLabelsAtLeast(page, '[data-format="fmt-data-visual-lab"]', 10, 'lab'));
      } else {
        const items = await page.$$eval('section.item[data-format]', s => s.map(x => ({ id: x.id, format: x.dataset.format })));
        entry.checks.package_items = items;
        for (const it of items) {
          await check(`${id} package: ${it.format} (#${it.id}) axe + screen-reader walkthrough`, async () => {
            const v = await axe(page, `#${it.id}`);
            assert.equal(v.length, 0, fmtViolations(v));
            const tree = await page.locator(`#${it.id}`).ariaSnapshot();
            writeFileSync(join(ARIA, `${id}--${it.id}.aria.yml`), tree + '\n');
            assert.match(tree, /^- '?region "[^"]+"/, 'the item is a region named by its heading');
            assert.match(tree, /heading "[^"]+" \[level=2\]/, 'level-2 heading');
            assert.doesNotMatch(tree, /- (button|textbox|combobox|checkbox|radio|slider|spinbutton)(:| \[|$)/m, 'every control has a name');
            const live = await page.$$eval(`#${it.id} [aria-live="polite"], #${it.id} [role="status"]`, x => x.length);
            if (it.format !== 'fmt-step-ladder') assert.ok(live > 0, 'feedback goes to a live region');
          });
        }
        await check(`${id} package: keyboard, Tab reaches every control`, () => tabReachesAll(page, 'package'));
        await check(`${id} package: untimed (every preset keeps the timer off; no long timer; no countdown)`, async () => {
          const data = await page.evaluate(() => JSON.parse(document.getElementById('package-data').textContent));
          const opts = data.rule_options;
          for (const [preset, row] of Object.entries(opts.matrix)) for (const [restart, r] of Object.entries(row)) assert.equal(r.slots['gamification.timer'].option, 'off', `${preset}/${restart}`);
          await untimed(page, 'package');
        });
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    {
      const { page, context } = await open(pkgFile, { reduce: true });
      await check(`${id} package: reduced motion`, () => noMotion(page, 'package'));
      await context.close();
    }

    // ---------------------------------------------------------------- slides
    const slidesFile = join(dir, m.outputs.slides.file);
    for (const width of [1440, 360]) {
      const { page, context, errors } = await open(slidesFile, { width });
      const n = await page.evaluate(() => window.__slides.count);
      await check(`${id} slides @${width}: every slide passes axe with its recall answer open${width === 360 ? ', fits 360 px and keeps figure labels at 10 px or more' : ''}`, async () => {
        const bad = [];
        for (let i = 0; i < n; i++) {
          await page.evaluate(i => window.__slides.go(i), i);
          const btn = page.locator(`#s-${i + 1} button.reveal`);
          if (await btn.count()) await btn.click();
          const v = await axe(page, `#s-${i + 1}`);
          if (v.length) bad.push(`slide ${i + 1}: ${fmtViolations(v)}`);
          if (width === 360) {
            await noOverflow(page, `slide ${i + 1}`);
            await svgLabelsAtLeast(page, `#s-${i + 1}`, 10, `slide ${i + 1} figure`);
          } else {
            writeFileSync(join(ARIA, `${id}--slide-${String(i + 1).padStart(2, '0')}.aria.yml`), (await page.locator(`#s-${i + 1}`).ariaSnapshot()) + '\n');
          }
        }
        assert.deepEqual(bad, []);
        const v = await axe(page);
        assert.equal(v.length, 0, fmtViolations(v));
      });
      if (width === 1440) {
        await check(`${id} slides: keyboard (arrows, Home, End), focus on each heading, counter announced, Enter opens the answer`, async () => {
          await page.evaluate(() => window.__slides.go(0));
          await page.keyboard.press('ArrowRight');
          assert.equal(await page.evaluate(() => document.activeElement.id), 's-2-h');
          assert.match(await page.textContent('#counter'), /^(Slide 2 de|Slide 2 of) /);
          await page.keyboard.press('End');
          assert.equal(await page.evaluate(() => document.activeElement.id), `s-${n}-h`);
          await page.keyboard.press('Home');
          assert.equal(await page.evaluate(() => document.activeElement.id), 's-1-h');
          const withRecall = await page.evaluate(() => [...document.querySelectorAll('section.slide')].findIndex(s => s.querySelector('button.reveal')));
          if (withRecall >= 0) {
            await page.evaluate(i => window.__slides.go(i), withRecall);
            const btn = page.locator(`#s-${withRecall + 1} button.reveal`);
            if ((await btn.getAttribute('aria-expanded')) === 'true') await btn.click();
            await btn.focus();
            await page.keyboard.press('Enter');
            assert.equal(await btn.getAttribute('aria-expanded'), 'true');
            assert.ok(await page.locator(`#s-${withRecall + 1} .answer`).isVisible());
          }
          assert.equal(await page.getAttribute('#counter', 'aria-live'), 'polite');
        });
        await check(`${id} slides: untimed`, () => untimed(page, 'slides'));
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    {
      const { page, context } = await open(slidesFile, { reduce: true });
      await check(`${id} slides: reduced motion`, () => noMotion(page, 'slides'));
      await context.close();
    }

    // ---------------------------------------------------------------- step player / study guide
    const extra = m.outputs.step_player ? ['step player', m.outputs.step_player.file] : ['study guide', m.outputs.study_html.file];
    for (const width of [1440, 360]) {
      const { page, context } = await open(join(dir, extra[1]), { width });
      await check(`${id} ${extra[0]} @${width}: axe${width === 360 ? ', no sideways scroll, SVG labels at least 10 px' : ', Tab reaches every control, untimed'}`, async () => {
        const v = await axe(page);
        assert.equal(v.length, 0, fmtViolations(v));
        if (width === 360) { await noOverflow(page, extra[0]); await svgLabelsAtLeast(page, 'body', 10, `${extra[0]} figures`); }
        else { await tabReachesAll(page, extra[0]); await untimed(page, extra[0]); }
      });
      await context.close();
    }
    {
      const { page, context } = await open(join(dir, extra[1]), { reduce: true });
      await check(`${id} ${extra[0]}: reduced motion`, () => noMotion(page, extra[0]));
      await context.close();
    }
    // Empty sections on screen (the builds run the same check on the print DOM): the step player's Fonte view
    // opened by its tab, the study guide page, and the package page.
    {
      const { page, context } = await open(join(dir, extra[1]));
      await check(`${id} ${extra[0]}: no empty heading, table or list${m.outputs.step_player ? ' in the Fonte view' : ''}`, async () => {
        if (m.outputs.step_player) await page.click('#tab-source');
        const r = await page.evaluate(emptySectionsInDom, m.outputs.step_player ? '#view-source' : undefined);
        assert.deepEqual(r.problems, []);
        assert.ok(r.headings.length > 0, 'the checked view has headings');
        if (m.outputs.step_player) {
          // The view title names divergences only when the lesson has source notes (teste-z has none).
          const { notes, h2 } = await page.evaluate(() => ({ notes: (window.__pilot.lesson.source_notes || []).length, h2: document.querySelector('#view-source h2').textContent }));
          assert.equal(/diverg/i.test(h2), notes > 0, `Fonte title "${h2}" with ${notes} source notes`);
        }
      });
      await context.close();
    }
    {
      const { page, context } = await open(pkgFile);
      await check(`${id} package: no empty heading, table or list`, async () => { assert.deepEqual((await page.evaluate(emptySectionsInDom)).problems, []); });
      await context.close();
    }
  }
} finally {
  await browser.close();
}
report.passed = passes;
report.failures = failures;
writeFileSync(join(QA, 'a11y-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`\n${passes} passed, ${failures.length} failed; report build/lessons/qa/a11y-report.json, walkthrough transcripts build/lessons/qa/aria/`);
process.exit(failures.length ? 1 : 0);
