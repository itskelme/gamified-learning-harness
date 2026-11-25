// Browser evidence for formula steps and unit input in the step player (offline file:// page).
// Builds the fixture lesson (tests/fixtures/expression-units-fixture.js) through the one entry point, then
// walks the exercise by keyboard. Run: node tests/expression-units-browser.mjs
// Writes build/expression-units/qa/browser-report.json and two screenshots.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { findChromium } from '../scripts/lib/chromium.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const { fixture } = require('./fixtures/expression-units-fixture.js');

const dir = join(ROOT, 'build/expression-units'), qa = join(dir, 'qa');
mkdirSync(qa, { recursive: true });
const lessonFile = join(dir, 'teste-z-formula-unidade.lesson.json');
writeFileSync(lessonFile, JSON.stringify(fixture(), null, 2) + '\n');
const built = spawnSync(process.execPath, [join(ROOT, 'scripts/build-lesson.mjs'), lessonFile, '--out', dir, '--no-pdf'], { encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr || built.stdout);
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const url = pathToFileURL(join(dir, manifest.outputs.html.file)).href;

const executablePath = findChromium();
assert.ok(executablePath, 'No Chromium found: set CHROMIUM_EXECUTABLE or run node_modules/.bin/playwright-core install chromium');
const passed = [], errors = [], network = [];
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route => { const u = route.request().url(); if (u.startsWith('file:') || u.startsWith('blob:') || u.startsWith('data:')) return route.continue(); network.push(u); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url); await page.evaluate(() => localStorage.clear()); await page.reload();
  assert.equal(await page.locator('#title').innerText(), fixture().title, 'a title without a topic part is shown as written');
  passed.push('page title: a lesson title without a dash-separated topic has no stray text');
  await page.click('#tab-practice');

  // The key for the current step, from the page's own engine and data.
  const cur = () => page.evaluate(() => {
    const E = window.ProcedureEngine, L = window.__pilot.lesson, s = window.__pilot.state(), run = s.runs[s.current];
    const ex = E.exerciseById(L, s.current), solved = E.solve(L, ex, run.variables), step = ex.steps[run.step];
    if (run.finished) return { finished: true, run };
    let input;
    if (step.type === 'givens') { input = {}; for (const f of step.fields) input[f.var] = E.formatNumber(run.variables[f.var], E.decimalsOf(L, ex.id, f.var), L.locale); }
    else if (step.type === 'choice') input = solved.steps[run.step].answer;
    else if (step.type === 'expression') input = step.expr;
    else input = E.formatNumber(solved.values[step.id], step.display_decimals, L.locale) + (step.unit_input ? ' ' + step.unit : '');
    return { finished: false, type: step.type, id: step.id, input, value: solved.values[step.id], run };
  });
  const type = async text => { await page.fill('#answer', text); await page.press('#answer', 'Enter'); };
  const answer = async c => {
    if (c.type === 'givens') { for (const [k, v] of Object.entries(c.input)) await page.fill(`#g-${k}`, v); await page.click('#answer-form button[type=submit]'); }
    else if (c.type === 'choice') { await page.check(`#opt-${c.input}`); await page.click('#answer-form button[type=submit]'); }
    else await type(c.input);
  };
  const feedback = () => page.locator('#feedback').innerText();
  const until = async id => { for (let c = await cur(); c.id !== id; c = await cur()) { assert.ok(!c.finished, `reached the end before ${id}`); await answer(c); assert.match(await feedback(), /^Certo!/, c.id); } return cur(); };
  const mg = v => String((v * 1000).toFixed(1)).replace('.', ',') + ' mg';

  // ---- unit input on the standard error (asked in g)
  let c = await until('ep');
  assert.equal(await page.locator('label[for=answer]').innerText(), 'Sua resposta, com a unidade');
  assert.match(await page.locator('#answer-help').innerText(), /este passo pede g/);
  await type(c.input.replace(' g', ''));
  assert.match(await feedback(), /Inclua a unidade depois do número \(este passo pede g\)/);
  let now = await cur();
  assert.deepEqual([now.run.attempts, now.run.errors, now.run.awaitingRetry], [c.run.attempts, 0, false], 'a number without unit is not an attempt');
  await type(c.input.replace(' g', ' gramas'));
  assert.match(await feedback(), /Não reconheci a unidade “gramas”/);
  assert.equal((await cur()).run.attempts, c.run.attempts);
  passed.push('unit input: a missing or unknown unit shows a message and counts neither an attempt nor an error');

  await type(c.input.replace(' g', ' m'));
  assert.match(await feedback(), /Ainda não\.\s*A unidade “m” mede outra grandeza\. A resposta deste passo é em g/);
  now = await cur();
  assert.deepEqual([now.run.errors, now.run.awaitingRetry], [1, true], 'a unit of another quantity is an error');
  await page.screenshot({ path: join(qa, 'mobile-390-unit-mismatch.png'), fullPage: true });
  await page.click('#retry');
  passed.push('unit input: a unit of another quantity is a wrong answer with its own feedback, and the restart rule applies');

  c = await until('ep');
  await type(mg(c.value));
  assert.match(await feedback(), /^Certo!/, `milligrams accepted for an answer in grams: ${mg(c.value)}`);
  now = await cur();
  const done = now.run.completed.find(x => x.id === 'ep');
  assert.ok(Math.abs(done.value - c.value) <= 0.002 + 1e-9, 'the carried value is in grams');
  assert.match(done.display, / g$/);
  passed.push('unit input: the answer typed in mg is converted and accepted; the value carried forward is in g');

  // ---- formula step
  c = await until('formula');
  assert.equal(await page.locator('label[for=answer]').innerText(), 'Sua fórmula');
  assert.match(await page.locator('#answer-help').innerText(), /Símbolos deste passo: xbar, mu0, ep\./);
  const before = c.run.attempts;
  await type(String(c.value).replace('.', ','));
  assert.match(await feedback(), /Escreva a fórmula com os símbolos \(xbar, mu0, ep\), não o resultado numérico\./);
  await type('(xbar - sigma)/ep');
  assert.match(await feedback(), /“sigma” não é um símbolo deste passo\. Use: xbar, mu0, ep\./);
  await type('(xbar - mu0');
  assert.match(await feedback(), /Não consegui ler a expressão/);
  now = await cur();
  assert.deepEqual([now.run.attempts, now.run.awaitingRetry], [before, false], 'unreadable formulas are not attempts');
  passed.push('formula step: a number, an unknown symbol and an unbalanced formula each show a message and are not attempts');

  await type('(mu0 - xbar)/ep');
  assert.match(await feedback(), /Ainda não\.\s*A ordem é média da amostra menos o valor da hipótese\./);
  await page.screenshot({ path: join(qa, 'mobile-390-formula-bug.png'), fullPage: true });
  await page.click('#retry');
  c = await until('formula');
  await type('(media − mu) ÷ EP');
  assert.match(await feedback(), /^Certo!/);
  assert.ok((await page.locator('.step-log').innerText()).includes('z = (x̄ − μ₀) / EP'), 'the accepted formula is listed among the completed steps');
  passed.push('formula step: the inverted formula gets its declared feedback; an equivalent spelling with aliases and typographic operators is accepted');

  for (c = await cur(); !c.finished; c = await cur()) { await answer(c); assert.match(await feedback(), /^Certo!/, c.id); }
  assert.match(await page.locator('#step-title').innerText(), /Exercício concluído/);
  await page.reload(); await page.click('#tab-practice');
  assert.equal((await cur()).finished, true, 'the finished run survives a reload');
  passed.push('the exercise completes after both steps and the saved progress restores after a reload');

  assert.deepEqual(network, [], 'no network request');
  assert.deepEqual(errors, [], 'no page error');
  passed.push('offline: no request left the page; no console or page error');
} finally {
  await browser.close();
}
writeFileSync(join(qa, 'browser-report.json'), JSON.stringify({ url: manifest.outputs.html.file, lesson_digest: manifest.digest, viewport: '390x844', browser: executablePath.replace(/^.*ms-playwright[\\/]/, ''), passed, errors, network }, null, 2) + '\n');
for (const p of passed) console.log('ok -', p);
