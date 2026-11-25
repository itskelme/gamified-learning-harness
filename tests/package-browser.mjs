// Browser end-to-end checks for an offline package page (file://), driven like a learner.
// Run after the build: node tests/package-browser.mjs <prova3|humanities>
// Writes build/<dir>/qa/package-browser-report.json and screenshots at 360, 768 and 1440 px.
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const events = require('../harness/core/events.js');
const name = process.argv[2] || 'prova3';
const TARGET = { prova3: ['build/prova3', 'prova3-pacote'], humanities: ['build/humanities', 'humanidades-pacote'] }[name];
if (!TARGET) throw new Error(`unknown package ${name}`);
const dir = join(ROOT, TARGET[0]), manifest = JSON.parse(readFileSync(join(dir, `${TARGET[1]}.manifest.json`), 'utf8'));
const url = pathToFileURL(join(dir, manifest.html.file)).href;
const qa = join(dir, 'qa'); mkdirSync(qa, { recursive: true });

function findChromium() {
  const c = [process.env.CHROMIUM_EXECUTABLE, '/usr/bin/google-chrome', '/usr/bin/chromium'];
  const cache = join(process.env.HOME || '', '.cache/ms-playwright');
  if (existsSync(cache)) for (const d of readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)).sort().reverse()) c.push(join(cache, d, 'chrome-linux64/chrome'));
  return c.find(x => x && existsSync(x));
}

const passed = [], errors = [], network = [];
const check = async (label, fn) => { await fn(); passed.push(label); console.log(`PASS ${label}`); };
const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', acceptDownloads: true });
  await context.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return r.continue(); network.push(u); return r.abort(); });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  const evs = () => page.evaluate(() => window.__harness.events);
  const answers = async id => (await evs()).filter(e => e.type === 'answer_submitted' && e.item_id === id);

  await check('page renders every planned format in plan order, review last, no event-contract error', async () => {
    const formats = await page.$$eval('section.item', s => s.map(x => x.dataset.format));
    assert.deepEqual(formats, [...manifest.plan.flatMap(p => p.formats), ...manifest.lesson_level]);
    assert.equal(await page.textContent('#event-errors'), '');
    assert.equal(await page.getAttribute('#rules', 'data-rule-set'), manifest.rule_set_id, 'rule set kept as data, not copy');
    assert.equal(await page.getAttribute('html', 'lang'), 'pt-BR');
  });

  // Rendered-text integrity per format: every option a learner must pick has visible text, and no node was
  // stringified into the page (e.g. an array of elements appended as text gives "[object HTMLDivElement]").
  const integrity = async () => {
    const r = await page.evaluate(() => {
      const bad = [], vis = el => el.offsetParent !== null || el.tagName === 'OPTION';
      if (/\[object /.test(document.body.innerText)) bad.push(`[object text: ${document.body.innerText.match(/.{0,40}\[object [^\]]*\]/)[0]}`);
      for (const s of document.querySelectorAll('section.item')) {
        const f = s.dataset.format;
        for (const el of s.querySelectorAll('h2, legend, label, .step-name, option, th')) if (vis(el) && !el.textContent.trim()) bad.push(`${f}: empty ${el.tagName}`);
        for (const fs of s.querySelectorAll('fieldset')) {
          const radios = [...fs.querySelectorAll('input[type=radio]')];
          if (radios.length < 2) bad.push(`${f}: fieldset "${fs.querySelector('legend') && fs.querySelector('legend').textContent.slice(0, 30)}" has ${radios.length} radios`);
          for (const rd of radios) { const l = fs.querySelector(`label[for="${rd.id}"]`); if (!l || !l.textContent.trim()) bad.push(`${f}: radio ${rd.id} has no label text`); }
        }
        for (const sel of s.querySelectorAll('select')) if (sel.options.length < 3) bad.push(`${f}: select ${sel.id} has ${sel.options.length} options`);
      }
      return bad;
    });
    assert.deepEqual(r, []);
  };
  // Learner copy: the pilot's banned-provenance rule plus package internals (preset/rule ids, ratings, format ids).
  const BANNED = /Pacote|pacote de formatos|Kelme|Sofia|Hermes|Minerva|evidência|evidence|research|hybrid|\+ovr|@\d+\.\d|\bfmt-|rule_set|\bGAP\b|convenção|harness|catálogo|catalog|missing fields|\bt_[0-9a-f]{8}\b/i;
  const copy = async () => {
    const t = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(t, BANNED, `learner copy exposes internals: ${(t.match(BANNED) || [])[0]}`);
  };

  await check('copy and integrity: no internal ids, jargon or [object] text; every option, label and heading has text', async () => {
    await integrity();
    await copy();
    const eyebrows = await page.$$eval('section.item .eyebrow', e => e.map(x => x.textContent));
    assert.equal(eyebrows.length, manifest.plan.flatMap(p => p.formats).length + manifest.lesson_level.length);
  });

  await check('every form control has an accessible name (label or aria-label)', async () => {
    const unnamed = await page.$$eval('input, select, button', els => els.filter(el => {
      if (el.getAttribute('aria-label')) return false;
      if (el.tagName === 'BUTTON') return !el.textContent.trim();
      return !(el.id && document.querySelector(`label[for="${el.id}"]`));
    }).map(el => el.outerHTML.slice(0, 80)));
    assert.deepEqual(unnamed, []);
  });

  // Element-level overflow: a .table-wrap scrolls (overflow-x:auto), so a too-wide table never shows up in the
  // document width; it is clipped inside its wrap with no scroll cue. Every visible table must fit its wrap,
  // and no header or cell may clip its own text.
  const tablesFit = async width => {
    const bad = await page.$$eval('.table-wrap', wraps => wraps.filter(w => w.offsetParent !== null).flatMap(w => {
      const t = w.querySelector('table'), id = (w.closest('section.item') || {}).id || '?', out = [];
      if (t.scrollWidth > w.clientWidth) out.push(`${id}: table ${t.scrollWidth}px in a ${w.clientWidth}px .table-wrap`);
      for (const c of t.querySelectorAll('th, td')) if (c.scrollWidth > c.clientWidth) out.push(`${id}: "${c.textContent.trim().slice(0, 24)}" clipped (${c.scrollWidth} > ${c.clientWidth})`);
      return out;
    }));
    assert.deepEqual(bad, [], `${width} px`);
  };

  for (const width of [360, 768, 1440]) {
    await check(`${width} px: no sideways overflow (document and every .table-wrap); every target is at least 44 px tall (radios 24 px in a 44 px row)`, async () => {
      await page.setViewportSize({ width, height: 900 });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(over <= 0, `overflow ${over}px`);
      await tablesFit(width);
      const small = await page.$$eval('main button, main select, main input, main a', els => els.filter(el => el.offsetParent !== null).map(el => {
        const r = el.getBoundingClientRect(), row = el.closest('.opt');
        if (el.type === 'radio') return r.width < 24 || r.height < 24 || row.getBoundingClientRect().height < 44 ? `radio ${el.id} ${r.width}x${r.height}` : null;
        return r.height < 44 || r.width < 44 ? `${el.tagName} ${(el.textContent || el.id).slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}` : null;
      }).filter(Boolean));
      assert.deepEqual(small, []);
      await page.screenshot({ path: join(qa, `package-${width}.png`), fullPage: true });
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  if (name === 'prova3') {
    await check('cloze: key answers are correct; a wrong number is incorrect; the cue is logged as hint_shown', async () => {
      const lead = await page.$eval('input[data-blank="gl_menos"]', el => [el.parentElement.className, el.parentElement.textContent]);
      assert.deepEqual([lead[0], /gl = n − $/.test(lead[1])], ['nowrap', true], 'the blank never wraps away from "gl = n −"');
      await page.fill('input[data-blank="z95"]', '1,64');
      await page.fill('input[data-blank="gl_menos"]', '1');
      await page.click('#item-simbolos button.primary');
      assert.match(await page.textContent('#item-simbolos .feedback'), /Ainda não/);
      await page.click('#item-simbolos button:has-text("Dica")');
      assert.ok((await evs()).some(e => e.type === 'hint_shown' && e.item_id === 'simbolos'));
      await page.fill('input[data-blank="z95"]', ' 1,96 ');
      await page.click('#item-simbolos button.primary');
      assert.match(await page.textContent('#item-simbolos .feedback'), /Certo/);
      const last = (await answers('simbolos')).slice(-2);
      assert.deepEqual(last.map(e => [e.result, e.assisted]), [['correct', true], ['correct', true]], 'answers after a cue are assisted');
    });

    await check('locale: "1.960" in a pt-BR blank is refused as thousands-shaped (no score, no error) with the comma form shown', async () => {
      const before = (await answers('simbolos')).length;
      await page.fill('input[data-blank="z95"]', '1.960');
      await page.click('#item-simbolos button.primary');
      const fb = await page.textContent('#item-simbolos .feedback');
      assert.match(fb, /1,960/); assert.match(fb, /vírgula/);
      const z = (await answers('simbolos')).slice(before).find(e => e.step_id === 'z95');
      assert.deepEqual([z.result, 'score' in z], ['invalid', false]);
      await page.fill('input[data-blank="z95"]', '1,96');
      await page.click('#item-simbolos button.primary');
      assert.match(await page.textContent('#item-simbolos .feedback'), /Certo/);
    });

    await check('match: a wrong method is diagnosed, locked, and only the missed case returns after 3 other answers', async () => {
      const cases = await page.$$eval('#item-metodo select', s => s.map(x => x.dataset.case));
      const key = await page.evaluate(() => Object.fromEntries(window.__harness.data.package.units[0].items.find(i => i.id === 'metodo').payload.cases.map(c => [c.id, c.category])));
      for (const c of cases) await page.selectOption(`#item-metodo select[data-case="${c}"]`, c === 'ex2-ic-media-t' ? 'z_mean_ci' : key[c]);
      await page.click('#item-metodo button.primary');
      assert.match(await page.textContent('#item-metodo .feedback'), /Acertos: 4 de 5/);
      assert.equal(await page.isDisabled('#item-metodo button.primary'), true);
      const miss = (await answers('ex2-ic-media-t')).pop();
      assert.equal(miss.misconception_tag, 'sigma_known_vs_unknown');
      // Three answers elsewhere: two cloze blanks plus one interpretation pick.
      await page.click('#item-simbolos button.primary');
      assert.equal(await page.isDisabled('#item-metodo button.primary'), true, 'still locked after 2 other answers');
      const right = await page.evaluate(() => window.__harness.data.package.units[0].items.find(i => i.id === 'interp-ex2').payload.options.find(o => o.correct).id);
      await page.check(`#item-interp-ex2 input[value="${right}"]`);
      await page.click('#item-interp-ex2 button.primary');
      assert.equal(await page.isDisabled('#item-metodo button.primary'), false, 'reopened after the third');
      assert.deepEqual(await page.$$eval('#item-metodo select', s => s.map(x => x.dataset.case)), ['ex2-ic-media-t']);
      await page.selectOption('#item-metodo select[data-case="ex2-ic-media-t"]', 't_mean_ci');
      await page.click('#item-metodo button.primary');
      assert.match(await page.textContent('#item-metodo .feedback'), /Acertos: 1 de 1/);
    });

    await check('sequence: keyboard move buttons rebuild the recipe; focus follows the moved card; exact order is correct', async () => {
      const key = await page.evaluate(() => window.__harness.data.package.units[0].items.find(i => i.id === 'receita').payload.key_order);
      for (let target = 0; target < key.length; target++) {
        let ids = await page.$$eval('#item-receita .seq-card', c => c.map(x => x.dataset.id));
        let at = ids.indexOf(key[target]);
        while (at > target) {
          await page.locator('#item-receita .seq-card').nth(at).locator('button').first().press('Enter');
          at--;
          const focused = await page.evaluate(() => document.activeElement.closest('.seq-card').dataset.id);
          assert.equal(focused, key[target], 'focus stays on the moved card');
        }
      }
      assert.match(await page.textContent('#item-receita [aria-live="polite"].muted'), /posição/);
      await page.click('#item-receita button.primary');
      assert.match(await page.textContent('#item-receita .feedback'), /Ordem certa/);
    });

    await check('lab: controls stay locked until the prediction; moving n is logged, never scored, and redraws the plot from the engine', async () => {
      assert.equal(await page.isDisabled('#lab-ex1-range'), true);
      await page.check('#item-lab-ex1 input[value="diminui"]');
      await page.click('#item-lab-ex1 button:has-text("Conferir previsão")');
      assert.match(await page.textContent('#item-lab-ex1 .feedback'), /Previsão certa/);
      await page.fill('#lab-ex1-num', '400');
      await page.dispatchEvent('#lab-ex1-num', 'change');
      const ev = (await evs()).filter(e => e.type === 'control_changed' && e.item_id === 'lab-ex1').pop();
      assert.deepEqual([ev.control_id, ev.value, 'score' in ev], ['n', 400, false]);
      const expected = await page.evaluate(() => {
        const E = window.ProcedureEngine, L = window.__harness.data.lesson, ex = L.exercises[0];
        const v = { ...E.createRun(L, ex.id, 'original').variables, n: 400 };
        return window.ProcedurePlots.render(L, ex, E.solve(L, ex, v), { revealAll: true }).alt;
      });
      assert.equal(await page.textContent('#item-lab-ex1 figcaption'), expected);
      await page.click('#item-lab-ex1 button:has-text("Concluir")');
      const done = (await evs()).filter(e => e.item_id === 'lab-ex1').map(e => e.route || e.type);
      assert.deepEqual(done.slice(-2), ['item_completed', 'advance']);
    });

    await check('choice: a distractor shows its own feedback and the item reopens reshuffled after 3 answers elsewhere', async () => {
      // Progress now survives a reload, so start this check from a clean page with "Recomeçar tudo".
      await page.click('#reset-progress');
      assert.equal((await page.evaluate(() => window.__harness.journal)).length, 0);
      const q = await page.evaluate(() => window.__harness.data.package.units[0].items.find(i => i.id === 'interp-ex2').payload);
      const wrong = q.options.find(o => o.id === 'individuais');
      await page.check(`#item-interp-ex2 input[value="${wrong.id}"]`);
      assert.equal(await page.locator('#item-interp-ex2 input:checked + label').textContent(), wrong.text);
      await page.click('#item-interp-ex2 button.primary');
      assert.equal(await page.textContent('#item-interp-ex2 .feedback'), wrong.feedback);
      assert.equal(await page.isDisabled('#item-interp-ex2 button.primary'), true);
      await page.fill('input[data-blank="z95"]', '1,96');
      await page.fill('input[data-blank="gl_menos"]', '1');
      await page.click('#item-simbolos button.primary');
      await page.click('#item-receita button.primary');
      assert.equal(await page.isDisabled('#item-interp-ex2 button.primary'), false);
      const shown = (await evs()).filter(e => e.type === 'item_presented' && e.item_id === 'interp-ex2');
      assert.equal(shown.length, 2);
      assert.equal(shown[1].attempt_no, 2);
    });

    await check('review: queue alternates formats; a dd/mm/aaaa exam date gives the scheduler plan in pt-BR dates; bad dates are refused', async () => {
      const queue = await page.$$eval('#review-queue li', l => l.map(x => x.textContent));
      assert.equal(queue.length, manifest.plan[0].formats.length);
      assert.match(await page.textContent('#item-revisao'), /próxima revisão é amanhã, \d{2}\/\d{2}\/\d{4}/);
      assert.equal(await page.getAttribute('#exam-date', 'placeholder'), 'dd/mm/aaaa');
      assert.equal(await page.getAttribute('#exam-date', 'type'), 'text', 'explicit field, not the locale-dependent native date input');
      for (const bad of ['31/02/2027', '2027-01-15', '01/01/2020']) {
        await page.fill('#exam-date', bad);
        await page.dispatchEvent('#exam-date', 'change');
        assert.match(await page.textContent('#item-revisao [role=alert]'), /dd\/mm\/aaaa/, bad);
      }
      const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
      const today = await page.evaluate(`(${localToday})()`);
      const exam = await page.evaluate(t => window.ReviewMix.addDays(t, 30), today);
      await page.fill('#exam-date', `${exam.slice(8, 10)}/${exam.slice(5, 7)}/${exam.slice(0, 4)}`);
      await page.dispatchEvent('#exam-date', 'change');
      const rows = await page.$$eval('#item-revisao tr[data-date]', r => r.map(x => [x.dataset.date, x.cells[0].textContent]));
      const want = await page.evaluate(([t, e]) => window.ReviewMix.reviewPlan(t, e).map(r => r.date), [today, exam]);
      assert.ok(rows.length > 0);
      assert.deepEqual(rows.map(r => r[0]), want);
      for (const [iso, shown] of rows) assert.equal(shown, `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`);
    });

    // "Today" is the learner's local calendar date, not the UTC date. 22:30 in São Paulo (-03:00) is already
    // the next day in UTC; 08:30 in Tokyo (+09:00) is still the previous day in UTC.
    await check('review: "today" is the local calendar date (São Paulo 19/11 22:30 and Tokyo 20/11 08:30, fixed clock)', async () => {
      const cases = [
        { timezoneId: 'America/Sao_Paulo', at: '2026-11-19T22:30:00-03:00', today: '19/11/2026', tomorrow: '20/11/2026', isoToday: '2026-11-19' },
        { timezoneId: 'Asia/Tokyo', at: '2026-11-20T08:30:00+09:00', today: '20/11/2026', tomorrow: '21/11/2026', isoToday: '2026-11-20' }
      ];
      for (const c of cases) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR', timezoneId: c.timezoneId });
        await ctx.route('**/*', r => { const u = r.request().url(); return u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:') ? r.continue() : r.abort(); });
        const p = await ctx.newPage();
        try {
          await p.clock.setFixedTime(new Date(c.at));
          await p.goto(url);
          const where = `${c.timezoneId} ${c.at}`;
          assert.match(await p.textContent('#item-revisao'), new RegExp(`próxima revisão é amanhã, ${c.tomorrow.replace(/\//g, '\\/')}\\.`), `${where}: no-date plan`);
          await p.fill('#exam-date', c.tomorrow); await p.dispatchEvent('#exam-date', 'change');
          assert.equal((await p.textContent('#item-revisao [aria-live]')).trim(), 'A prova é amanhã: revise hoje os itens acima.', `${where}: exam tomorrow (local) accepted`);
          await p.fill('#exam-date', c.today); await p.dispatchEvent('#exam-date', 'change');
          assert.match(await p.textContent('#item-revisao [role=alert]'), /data depois de hoje/, `${where}: exam today (local) refused`);
          const exam = await p.evaluate(d => window.ReviewMix.addDays(d, 8), c.isoToday);
          await p.fill('#exam-date', `${exam.slice(8, 10)}/${exam.slice(5, 7)}/${exam.slice(0, 4)}`); await p.dispatchEvent('#exam-date', 'change');
          const rows = await p.$$eval('#item-revisao tr[data-date]', r => r.map(x => x.dataset.date));
          assert.deepEqual(rows, await p.evaluate(([t, e]) => window.ReviewMix.reviewPlan(t, e).map(r => r.date), [c.isoToday, exam]), `${where}: plan counted from the local date`);
        } finally { await ctx.close(); }
      }
    });
  }

  if (name === 'humanities') {
    const { humanitiesBrowserChecks } = await import('./package-browser-humanities.mjs');
    await humanitiesBrowserChecks({ page, check, evs, answers, assert, qa });
  }

  await check('after every interaction: still no [object] text, empty options or internal jargon (feedback, requeue notes, plan)', async () => {
    await integrity();
    await copy();
  });

  await check('after every interaction: every visible .table-wrap (lab values, review plan) fits at 360, 768 and 1440 px', async () => {
    assert.ok(await page.$$eval('.table-wrap', w => w.filter(x => x.offsetParent !== null).length) >= 1, 'no table visible');
    for (const width of [360, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); await tablesFit(width); }
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await check('every event logged in the session is inside the closed vocabulary (re-checked in Node)', async () => {
    const all = await evs();
    assert.ok(all.length > 10, `${all.length}`);
    assert.deepEqual(events.checkEvents(all), []);
  });

  // Shared by every package: progress persistence/export/import, presets on screen, restart policies.
  const shared = await import('./package-browser-progress.mjs');
  await shared.progressChecks({ page, check, assert, qa });
  await shared.presetChecks({ page, check, assert, manifest, events });
  await shared.restartPolicyChecks({ browser, page, check, assert, dir });

  await check('after the preset and restart changes: no [object] text or jargon; tables fit; events inside the vocabulary', async () => {
    await integrity();
    await copy();
    for (const width of [360, 768, 1440]) { await page.setViewportSize({ width, height: 900 }); await tablesFit(width); }
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.deepEqual(events.checkEvents(await evs()), []);
  });

  await check('no page errors and no network requests', async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
  });
} finally {
  await browser.close();
}
writeFileSync(join(qa, 'package-browser-report.json'), JSON.stringify({ url: manifest.html.file, sha256: manifest.html.sha256, passed, errors, network }, null, 2) + '\n');
console.log(`${passed.length} checks passed`);
