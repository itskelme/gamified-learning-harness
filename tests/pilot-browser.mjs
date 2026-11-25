// Browser end-to-end evidence for the Prova 3 pilot (offline file:// page).
// Run after the build: node tests/pilot-browser.mjs [build/prova3]
// Writes build/prova3/qa/browser-report.json and screenshots.
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { brokenRender, bannedProvenance } from '../scripts/learner-copy-rules.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const dir = resolve(process.argv[2] || join(ROOT, 'build/prova3'));
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const answerKey = JSON.parse(readFileSync(join(dir, 'answer-key.json'), 'utf8'));
const url = pathToFileURL(join(dir, manifest.outputs.html.file)).href;
const qa = join(dir, 'qa'); mkdirSync(qa, { recursive: true });

function findChromium() {
  const c = [process.env.CHROMIUM_EXECUTABLE, '/usr/bin/google-chrome', '/usr/bin/chromium'];
  const cache = join(process.env.HOME || '', '.cache/ms-playwright');
  if (existsSync(cache)) for (const d of readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) c.push(join(cache, d, 'chrome-linux64/chrome'));
  return c.find(x => x && existsSync(x));
}

const passed = [], errors = [], network = [];
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
  await context.route('**/*', route => { const u = route.request().url(); if (u.startsWith('file:') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue(); network.push(u); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.reload();

  // Helpers evaluated with the page's own engine (same code the learner runs).
  const cur = () => page.evaluate(() => {
    const E = window.ProcedureEngine, L = window.__pilot.lesson, s = window.__pilot.state(), run = s.runs[s.current];
    const ex = E.exerciseById(L, s.current), solved = E.solve(L, ex, run.variables), step = ex.steps[run.step];
    if (run.finished) return { finished: true, exercise: s.current, run };
    let input;
    if (step.type === 'givens') { input = {}; for (const f of step.fields) input[f.var] = E.formatNumber(run.variables[f.var], E.decimalsOf(L, ex.id, f.var), L.locale); }
    else if (step.type === 'choice') input = solved.steps[run.step].answer;
    else input = E.formatNumber(solved.values[step.id], step.display_decimals, L.locale);
    return { finished: false, exercise: s.current, type: step.type, id: step.id, input, run };
  });
  const answer = async (c, override) => {
    const input = override !== undefined ? override : c.input;
    if (c.type === 'givens') for (const [k, v] of Object.entries(input)) await page.fill(`#g-${k}`, v);
    else if (c.type === 'choice') await page.check(`#opt-${input}`);
    else await page.fill('#answer', input);
    await page.click('#answer-form button[type=submit]');
  };
  const plotSvg = () => page.locator('.linked .plot svg').evaluate(n => n.outerHTML);
  const plotAlt = () => page.locator('#plot-alt').innerText();

  // Keyboard: reach Praticar by Tab and activate with Enter; focus goes to the step heading.
  await page.keyboard.press('Tab'); let guard = 0;
  while ((await page.evaluate(() => document.activeElement.id)) !== 'tab-practice' && guard++ < 10) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'step-title');
  passed.push('keyboard: Tab to "Praticar", Enter opens practice, focus moves to the step heading');

  // Walk through all five original exercises.
  const walkthrough = [], finalSvg = {};
  for (const ex of Object.keys(answerKey.exercises)) {
    await page.click(`.ex-list button:has-text("Ex. ${ex.match(/ex(\d)/)[1]}")`);
    const statement = await page.locator('#statement').innerText();
    const lessonEx = (await page.evaluate(id => window.__pilot.lesson.exercises.find(e => e.id === id), ex));
    assert.equal(statement, lessonEx.original_statement, `${ex}: first attempt shows the original statement`);
    let steps = 0;
    for (let c = await cur(); !c.finished; c = await cur()) {
      if (ex === 'ex1-ic-media-z' && c.id === 'ep') {
        assert.ok(await page.locator('#prompt math mfrac msqrt').count(), 'the error-standard prompt uses a fraction and radical');
      }
      await answer(c); steps++;
      if (ex === 'ex1-ic-media-z' && c.id === 'ep') {
        assert.ok(await page.locator('#feedback math mfrac msqrt').count(), 'the numeric feedback keeps the typeset fraction');
      }
      const fb = await page.locator('#feedback').innerText();
      assert.match(fb, /^Certo!/, `${ex}.${c.id}: ${fb}`);
    }
    assert.match(await page.locator('#step-title').innerText(), /Exercício concluído/);
    const alt = await plotAlt();
    for (const id of lessonEx.plot.label_values) {
      const step = lessonEx.steps.find(s => s.id === id);
      const shown = await page.evaluate(([v, d]) => window.ProcedureEngine.formatNumber(v, d, 'pt-BR'), [answerKey.exercises[ex].original.answers[id], step.display_decimals]);
      assert.ok(alt.includes(shown), `${ex}: plot text alternative shows ${id}=${shown}`);
    }
    walkthrough.push({ exercise: ex, steps, plot_alt: alt });
    finalSvg[ex] = await plotSvg();
    if (ex.startsWith('ex5')) await page.screenshot({ path: join(qa, 'desktop-1440-practice-ex5-complete.png'), fullPage: true });
  }
  passed.push('walkthrough: all five original exercises completed in the browser with the original statements; plot alternatives show the answer-key values');

  // Reload: progress persists, completion is not fabricated.
  await page.reload(); await page.click('#tab-practice');
  const st = await page.evaluate(() => window.__pilot.state());
  assert.equal(Object.keys(st.done).length, 5);
  assert.ok(Object.values(st.done).every(d => d.independent && d.wrong === 0));
  assert.match(await page.locator('#step-title').innerText(), /Exercício concluído/);
  passed.push('reload: five completions and the finished exercise restored from localStorage');

  // Export, then import into a cleared browser, then reject another lesson version.
  const dl = page.waitForEvent('download'); await page.click('#export');
  const exported = readFileSync(await (await dl).path(), 'utf8');
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.click('#tab-practice');
  assert.equal(Object.keys((await page.evaluate(() => window.__pilot.state())).done).length, 0);
  // Import reads the file asynchronously: wait (bounded) for the feedback, then assert on it.
  const feedbackAfterImport = async re => {
    await page.waitForFunction(src => new RegExp(src).test(document.getElementById('feedback')?.innerText || ''), re.source, { timeout: 5000 }).catch(() => {});
    return page.locator('#feedback').innerText();
  };
  await page.setInputFiles('#import', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  assert.match(await feedbackAfterImport(/Progresso importado/), /Progresso importado/);
  assert.equal(Object.keys((await page.evaluate(() => window.__pilot.state())).done).length, 5);
  const other = JSON.parse(exported); other.digest = 'outra-versao';
  await page.setInputFiles('#import', { name: 'o.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(other)) });
  assert.match(await feedbackAfterImport(/outra versão/), /outra versão/);
  const forged = JSON.parse(exported); forged.runs['ex5-teste-t-conjunto'].variables.x1 = 9.9;
  await page.setInputFiles('#import', { name: 'f.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(forged)) });
  assert.match(await feedbackAfterImport(/semente/), /semente/);
  passed.push('progress: export/import round trip; another lesson version and forged data (not reproducible from the seed) rejected');

  // Seed reproduces the exported variant exactly.
  await page.evaluate(() => localStorage.clear()); await page.reload(); await page.click('#tab-practice');
  await page.click('.ex-list button:has-text("Ex. 5")');
  const seed = answerKey.seeds[0], keyVariant = answerKey.exercises['ex5-teste-t-conjunto'].variants[0];
  await page.locator('details.settings summary').click();
  await page.fill('#seed', String(seed)); await page.click('.seed-form button[type=submit]');
  assert.equal(await page.locator('#statement').innerText(), keyVariant.statement);
  passed.push(`seed: entering seed ${seed} reproduces the exported variant statement`);

  // Malformed input does not count; wrong answer -> retry with new numbers -> earlier steps recomputed, plot changes.
  await page.click('.seed-form button:has-text("Números originais do PDF")');
  for (let c = await cur(); c.id !== 'ep'; c = await cur()) await answer(c);
  const before = { svg: await plotSvg(), alt: await plotAlt(), statement: await page.locator('#statement').innerText() };
  await page.fill('#answer', 'abc'); await page.click('#answer-form button[type=submit]');
  assert.match(await page.locator('#feedback').innerText(), /número/);
  assert.equal((await cur()).run.errors, 0);
  await page.fill('#answer', '9,999'); await page.click('#answer-form button[type=submit]');
  assert.match(await page.locator('#feedback').innerText(), /Ainda não/);
  assert.match(await page.locator('#retry').innerText(), /voltar ao passo 12 com números novos/);
  await page.click('#retry');
  const after = await cur();
  assert.equal(after.id, 'ep'); assert.notEqual(after.run.seed, 'original');
  const afterStatement = await page.locator('#statement').innerText();
  assert.notEqual(afterStatement, before.statement);
  assert.equal(await page.locator('ol.done .badge.recomputed').count(), 11);
  // The linked plot on the page is exactly the engine's render of the NEW key with the steps revealed so far.
  const engineRender = () => page.evaluate(() => {
    const E = window.ProcedureEngine, P = window.ProcedurePlots, L = window.__pilot.lesson, s = window.__pilot.state(), run = s.runs[s.current];
    const ex = E.exerciseById(L, s.current), solved = E.solve(L, ex, run.variables);
    const box = document.createElement('div'); box.innerHTML = P.render(L, ex, solved, { revealed: new Set(run.completed.map(c => c.id)) }).svg;
    return { svg: box.firstElementChild.outerHTML, t: E.formatNumber(solved.values.t, 3, L.locale), tc: E.formatNumber(solved.values.tc, 3, L.locale) };
  });
  const r1 = await engineRender();
  assert.ok((await plotSvg()) === r1.svg, 'plot after retry equals the engine render of the recomputed key');
  assert.ok((await plotAlt()).includes(r1.tc), 'plot text alternative after retry shows the recomputed critical value');
  await page.screenshot({ path: join(qa, 'desktop-1440-retry-new-variant.png'), fullPage: true });
  // Finish the variant: the final plot (with the statistic) and its text alternative differ from the original Ex5.
  for (let c = await cur(); !c.finished; c = await cur()) await answer(c);
  const r2 = await engineRender(), variantSvg = await plotSvg(), variantAlt = await plotAlt();
  assert.ok(variantSvg === r2.svg, 'final variant plot equals the engine render');
  assert.ok(variantSvg !== finalSvg['ex5-teste-t-conjunto'], 'final plot differs from the original Ex5 final plot');
  assert.ok(variantAlt !== walkthrough.find(w => w.exercise === 'ex5-teste-t-conjunto').plot_alt && variantAlt.includes(`t = ${r2.t}`), `variant plot text shows the new t = ${r2.t}`);
  passed.push(`retry: malformed input not counted; wrong EP -> failed-step retry with a new seed; 11 earlier steps recomputed and labelled; statement changes; linked plot equals the engine render of the new key; completed variant plot shows t = ${r2.t} instead of the original 2,724`);

  // D4: Ex2 exact-t path accepted with a note.
  await page.click('.ex-list button:has-text("Ex. 2")');
  await page.click('.seed-form button:has-text("Números originais do PDF")');
  for (let c = await cur(); c.id !== 'E'; c = await cur()) await answer(c);
  await page.fill('#answer', '2,558'); await page.click('#answer-form button[type=submit]');
  assert.match(await page.locator('#feedback').innerText(), /Certo![\s\S]*t exato[\s\S]*2,131/);
  passed.push('Ex2: exact-t margin 2,558 accepted with a note that the instructor key uses the table t = 2,131');

  // Carry paths. Ex1 seed 1: EP shown as 0,883 (key 0,8828); a learner who multiplies the shown value types 1,731.
  await page.click('.ex-list button:has-text("Ex. 1")');
  if (!(await page.locator('details.settings').evaluate(d => d.open))) await page.locator('details.settings summary').click();
  await page.fill('#seed', '1'); await page.click('.seed-form button[type=submit]');
  for (let c = await cur(); c.id !== 'E'; c = await cur()) await answer(c);
  assert.equal((await page.evaluate(() => window.__pilot.state().runs['ex1-ic-media-z'].completed.at(-1).display)), '0,883 min');
  await page.fill('#answer', '1,731'); await page.click('#answer-form button[type=submit]');
  assert.match(await page.locator('#feedback').innerText(), /Certo![\s\S]*arredondados[\s\S]*1,730/);
  await page.fill('#answer', '48,269'); await page.click('#answer-form button[type=submit]');
  assert.match(await page.locator('#feedback').innerText(), /^Certo!/);
  // Ex4 original: v1 = v2 = 2,002 accepted, then a reload; the sum 4,004 is followed through from the stored values.
  await page.click('.ex-list button:has-text("Ex. 4")');
  await page.click('.seed-form button:has-text("Números originais do PDF")');
  for (let c = await cur(); c.id !== 'v1'; c = await cur()) await answer(c);
  await page.fill('#answer', '2,002'); await page.click('#answer-form button[type=submit]');
  await page.fill('#answer', '2,002'); await page.click('#answer-form button[type=submit]');
  await page.reload(); await page.click('#tab-practice'); await page.click('.ex-list button:has-text("Ex. 4")');
  assert.equal((await cur()).id, 'soma');
  assert.deepEqual(await page.evaluate(() => window.__pilot.state().runs['ex4-teste-z-duas-medias'].completed.filter(c => c.value !== undefined).map(c => [c.id, c.value])), [['zc', 1.96], ['v1', 2.002], ['v2', 2.002]]);
  await page.fill('#answer', '4,004'); await page.click('#answer-form button[type=submit]');
  assert.match(await page.locator('#feedback').innerText(), /Certo![\s\S]*seguiu os valores[\s\S]*4,000/);
  // The reload closed the settings panel; reopen it so the later checks see the same page state as before.
  if (!(await page.locator('details.settings').evaluate(d => d.open))) await page.locator('details.settings summary').click();
  passed.push('carry: Ex1 seed 1 accepts 1,731 from the shown EP 0,883 (display-carry, note states key 1,730); Ex4 v1 = v2 = 2,002, reload, then sum 4,004 accepted by following the stored learner values (learner-carry)');

  // Study view: prediction gates the control; the control changes the plot.
  await page.click('#tab-study');
  assert.ok(await page.locator('.intro math mfrac').count(), 'the decision map contains typeset fractions');
  assert.ok(await page.locator('#study-ex5-teste-t-conjunto .worked math msubsup').count(), 'the pooled t exercise has subscript/superscript notation');
  const slider = page.locator('#explore-ex1-ic-media-z');
  assert.equal(await slider.isDisabled(), true);
  const plotBefore = await page.locator('#study-ex1-ic-media-z .explore .plot svg').evaluate(n => n.outerHTML);
  await page.check('#explore-ex1-ic-media-z-pred-diminui');
  await page.click('#study-ex1-ic-media-z .predict-check');
  assert.match(await page.locator('#study-ex1-ic-media-z .predict-result').innerText(), /Previsão certa/);
  assert.equal(await slider.isDisabled(), false);
  await slider.focus(); for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowRight');
  const plotAfter = await page.locator('#study-ex1-ic-media-z .explore .plot svg').evaluate(n => n.outerHTML);
  assert.notEqual(plotAfter, plotBefore);
  assert.match(await page.locator('#study-ex1-ic-media-z .explore-result').innerText(), /IC 95%/);
  passed.push('study: prediction required before the slider unlocks (answer computed by the engine); keyboard ArrowRight changes n and redraws the plot');

  // Responsive: no horizontal overflow at 360/768/1440 in study and practice.
  const sizes = [];
  for (const [w, hgt] of [[360, 780], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: hgt });
    for (const view of ['study', 'practice']) {
      await page.click(`#tab-${view}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `${view} at ${w}px overflows by ${overflow}px`);
      const clipped = await page.evaluate(async () => {
        await new Promise(requestAnimationFrame);
        return [...document.querySelectorAll('.lesson-math')].filter(n =>
          n.clientWidth && n.scrollWidth > n.clientWidth + 1 && n.tabIndex < 0).length;
      });
      assert.equal(clipped, 0, `${view} at ${w}px must allow keyboard scrolling for long equations`);
      const vb = await page.locator(`#view-${view} .plot svg`).first().getAttribute('viewBox');
      assert.ok(vb.startsWith(w < 600 ? '0 0 360 ' : '0 0 640 '), `${view} at ${w}px uses plot layout ${vb}`);
      await page.screenshot({ path: join(qa, `${view}-${w}.png`), fullPage: view === 'practice' });
      sizes.push({ width: w, view, overflow_px: overflow });
    }
  }
  passed.push('responsive: no horizontal overflow at 360, 768 and 1440 px (study and practice); 360 px uses the compact 360-unit plot layout');

  // Rendered-text integrity: no node or missing value stringified into any view (an array of [dt, dd]
  // pairs appended as one child gives "[object HTMLElement],[object HTMLElement]"); every dt/dd has text.
  {
    const r = await page.evaluate(() => ({
      text: ['header', '#view-study', '#view-practice', '#view-source'].map(s => document.querySelector(s).textContent).join('\n'),
      emptyDefs: [...document.querySelectorAll('dl > dt, dl > dd')].filter(el => !el.textContent.trim()).length,
      looseDefs: [...document.querySelectorAll('dl')].filter(dl => [...dl.children].some(c => !['DT', 'DD'].includes(c.tagName)) || !dl.children.length).length,
      ruleTerms: [...document.querySelectorAll('#view-source dl > dt')].map(dt => dt.textContent.trim()),
      ruleKeys: Object.keys(window.__pilot.lesson.conventions.step_rules)
    }));
    assert.equal(brokenRender(r.text), null, `page text has a broken render: ${brokenRender(r.text)}`);
    assert.equal(r.emptyDefs, 0, 'empty dt/dd');
    assert.equal(r.looseDefs, 0, 'a dl with no children or with children other than dt/dd');
    assert.equal(r.ruleTerms.length, r.ruleKeys.length, 'Fonte view lists one dt per step rule');
    for (const k of r.ruleKeys) assert.ok(!r.ruleTerms.includes(k), `Fonte view prints the English step-rule id "${k}"`);
    passed.push('integrity: no "[object", "undefined" or "NaN" text in the header, study, practice or Fonte views; every dl holds non-empty dt/dd pairs');
  }

  // Learner copy: no internal research/package/person names or card ids anywhere in the page,
  // and the Fonte view shows pt-BR labels, not the lesson's English note-kind ids.
  {
    const texts = await page.evaluate(() => Object.fromEntries(['header', '#view-study', '#view-practice', '#view-source'].map(s => [s, document.querySelector(s).textContent])));
    // Same rule as the study PDF (scripts/learner-copy-rules.mjs): textContent ignores CSS uppercase.
    for (const [where, t] of Object.entries(texts)) assert.equal(bannedProvenance(t), null, `${where} exposes internal provenance: ${bannedProvenance(t)}`);
    const kinds = await page.evaluate(() => [...new Set(window.__pilot.lesson.source_notes.map(n => n.kind))]);
    for (const k of kinds) assert.ok(!texts['#view-source'].includes(k), `Fonte view prints the English kind id "${k}"`);
    assert.match(texts['#view-practice'], /Repetir só o passo errado|passo errado/, 'practice settings still explain the modes');
    // The build provenance moved out of the page lives in manifest.json: source paths + SHA-256, format id/version, digest.
    const lessonMeta = await page.evaluate(() => ({ sources: window.__pilot.lesson.sources.map(s => ({ path: s.path, sha256: s.sha256 })), format: window.__pilot.lesson.format, format_version: window.__pilot.lesson.format_version, digest: window.LESSON_DIGEST }));
    assert.deepEqual(manifest.inputs, lessonMeta.sources, 'manifest keeps every source path and SHA-256');
    assert.deepEqual([manifest.format, manifest.format_version, manifest.digest], [lessonMeta.format, lessonMeta.format_version, lessonMeta.digest], 'manifest keeps the format id, version and digest');
    assert.match(texts['#view-source'], /Convenções da professora/, 'Fonte keeps the professor\'s conventions');
    assert.match(texts['#view-source'], /Divergências encontradas no material/, 'Fonte keeps the discrepancy notes');
    passed.push('copy: header, study, practice and Fonte views pass the banned-provenance rule of scripts/learner-copy-rules.mjs (people, card ids, tool/format names, paths, hashes, fingerprint, code ids, research jargon); Fonte shows pt-BR note kinds and keeps the conventions and discrepancy notes; paths, hashes, format and digest are in manifest.json');
  }

  // Ordered-list markers: the widest marker ("15. ") fits inside each list's left padding,
  // on screen (360 and 1440 px) and in print media (the study PDF).
  {
    const markerFit = () => page.evaluate(() => {
      const c = document.createElement('canvas').getContext('2d'), bad = [];
      let checked = 0;
      for (const ol of document.querySelectorAll('ol.worked, ol.done')) {
        const items = ol.querySelectorAll(':scope > li');
        if (!items.length || !ol.getClientRects().length) continue;
        const li = items[items.length - 1], cs = getComputedStyle(li);
        c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const need = c.measureText(`${items.length}. `).width, pad = parseFloat(getComputedStyle(ol).paddingLeft);
        checked++;
        if (pad < need) bad.push(`${ol.className} with ${items.length} items: padding ${pad.toFixed(1)}px < marker ${need.toFixed(1)}px`);
      }
      return { checked, bad };
    });
    for (const [w, hgt] of [[360, 780], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: hgt });
      for (const view of ['study', 'practice']) {
        await page.click(`#tab-${view}`);
        const r = await markerFit();
        assert.ok(r.checked > 0, `${view} at ${w}px: no ordered step list checked`);
        assert.deepEqual(r.bad, [], `${view} at ${w}px: clipped list markers`);
      }
    }
    await page.click('#tab-study'); await page.emulateMedia({ media: 'print' });
    const pr = await markerFit(); await page.emulateMedia({ media: 'screen' });
    assert.ok(pr.checked >= 5, 'print: the five worked-step lists are checked');
    assert.deepEqual(pr.bad, [], 'print (study PDF): clipped list markers');
    passed.push('lists: two-digit step markers (up to "15.") fit inside the list padding at 360 and 1440 px and in print media');
  }

  // 360 px: the linked plot starts less than one viewport below the answer input.
  {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.click('#tab-practice');
    await page.click('.ex-list button:has-text("Ex. 5")');
    await page.click('.seed-form button:has-text("Números originais do PDF")');
    for (let c = await cur(), k = 0; k < 9; c = await cur(), k++) await answer(c);
    assert.equal((await cur()).type, 'numeric', 'Ex5 step 10 is a numeric step');
    const geo = await page.evaluate(() => {
      const abs = s => { const b = document.querySelector(s).getBoundingClientRect(); return { top: b.top + scrollY, bottom: b.bottom + scrollY }; };
      return { input: abs('#answer'), plot: abs('.linked'), settings: abs('details.settings'), vh: innerHeight };
    });
    assert.ok(geo.plot.top - geo.input.bottom < geo.vh, `360 px: plot top is ${Math.round(geo.plot.top - geo.input.bottom)}px below the answer input (viewport ${geo.vh})`);
    assert.ok(geo.plot.top < geo.settings.top, '360 px: the plot comes before the settings panel');
    await page.locator('#answer').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(qa, 'practice-360-step-plot-near-input.png') });
    passed.push(`360 px: linked plot starts ${Math.round(geo.plot.top - geo.input.bottom)}px below the answer input (< ${geo.vh}px viewport), before the settings panel`);
  }

  // 1440 px viewport (not full-page): while scrolling, the sticky plot never covers the progress panel
  // and stays beside the step card.
  {
    await page.setViewportSize({ width: 1440, height: 900 });
    const overlaps = [], maxY = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    for (let y = 0; y <= maxY + 150; y += 150) {
      const g = await page.evaluate(y => {
        window.scrollTo(0, y);
        const r = s => document.querySelector(s).getBoundingClientRect();
        const a = r('.linked'), b = r('.io'), card = r('.play');
        return { y: scrollY, hit: a.bottom > b.top && a.top < b.bottom && a.right > b.left && a.left < b.right, beside: a.left >= card.right };
      }, y);
      if (g.hit) overlaps.push(`scrollY=${g.y}`);
      assert.ok(g.beside, `1440 px: plot column sits beside the step card at scrollY=${g.y}`);
    }
    assert.deepEqual(overlaps, [], '1440 px: sticky plot overlaps the progress panel');
    // A sticky column taller than the viewport would hide its bottom (the progress panel) while it sticks.
    for (const [w, hgt] of [[1024, 768], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: hgt });
      const fit = await page.evaluate(() => {
        const sticky = [...document.querySelectorAll('#view-practice *')].filter(e => getComputedStyle(e).position === 'sticky');
        return sticky.map(e => ({ cls: e.className, h: e.getBoundingClientRect().height, room: innerHeight - parseFloat(getComputedStyle(e).top) }));
      });
      assert.ok(fit.length > 0, `${w}x${hgt}: the plot is sticky beside the card`);
      for (const f of fit) assert.ok(f.h <= f.room, `${w}x${hgt}: sticky "${f.cls}" is ${Math.round(f.h)}px tall, only ${Math.round(f.room)}px fit below the tabs`);
    }
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.screenshot({ path: join(qa, 'practice-1440-viewport-scrolled.png') });
    passed.push(`1440 px viewport: plot column beside the step card; the sticky plot never covers the progress panel at any scroll position (0-${maxY}px, 150px steps); the sticky plot fits the viewport at 1024x768 and 1440x900`);
  }

  assert.deepEqual(errors, [], 'page errors');
  assert.deepEqual(network, [], 'network requests');
  passed.push('offline: zero non-file network requests; zero page/console errors');
  const report = { checked_at: new Date().toISOString(), browser: browser.version(), page: manifest.outputs.html.file, sha256: manifest.outputs.html.sha256, passed, walkthrough, sizes, limitations: ['Automated checks only; no screen-reader session and no human learner session', 'No learning-efficacy evaluation'] };
  writeFileSync(join(qa, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(passed.map(p => 'PASS ' + p).join('\n'));
} finally { await browser.close(); }
