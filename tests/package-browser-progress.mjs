// Browser checks shared by every package page (tests/package-browser.mjs imports them):
// - progress: reload restores every answer and the event log; export/import round trip; refusals for another
//   package, another content digest, another revision and a forged journal; an explicit notice after a content
//   version change (ACCEPTANCE lines 21-22);
// - rule presets chosen on screen: each preset resolves to the rule set harness/core/rules.js computes in Node and
//   changes what the page does (hints, declarative restart, lifeline);
// - the four procedural restart policies, chosen on the package page and carried to the step player (#modo=...).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, '..');
const Rules = require('../harness/core/rules.js');

/** Everything a learner can see they did: field values, checked radios, card order, feedback text, the event log. */
export const snapshotPage = page => page.evaluate(() => ({
  fields: [...document.querySelectorAll('main section.item input:not([type=file]), main section.item select')].map(el => [el.id || el.name || el.dataset.blank || '', el.type === 'radio' ? el.checked : el.value]),
  order: [...document.querySelectorAll('.seq-card')].map(c => c.dataset.id),
  feedback: [...document.querySelectorAll('main section.item .feedback, main section.item [role=status]')].map(el => el.textContent),
  events: window.__harness.events,
  journal: window.__harness.journal
}));

export async function progressChecks({ page, check, assert, qa }) {
  const store = await page.evaluate(() => `harness-package:${window.__harness.data.package.id}`);
  const content = await page.evaluate(() => window.__harness.data.content);

  await check('progress: a reload restores every answer, card order, feedback and the event log (journal replay)', async () => {
    const before = await snapshotPage(page);
    assert.ok(before.journal.length >= 4, `only ${before.journal.length} recorded actions`);
    assert.ok(before.fields.some(([, v]) => v !== '' && v !== false), 'some answer is on screen');
    await page.reload();
    const after = await snapshotPage(page);
    assert.deepEqual(after.journal, before.journal);
    assert.deepEqual(after.fields, before.fields, 'every field value and radio comes back');
    assert.deepEqual(after.order, before.order);
    assert.deepEqual(after.feedback, before.feedback);
    assert.deepEqual(after.events, before.events, 'the replayed event log equals the original one');
  });

  let exported;
  await check('progress: export -> "Recomeçar tudo" -> import restores the same state (round trip)', async () => {
    const before = await snapshotPage(page);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-progress')]);
    const file = join(qa, 'progress-export.json');
    await dl.saveAs(file);
    exported = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(exported.format, 'harness-package-progress');
    assert.deepEqual([exported.content_digest, exported.lesson_id, exported.revision], [content.digest, content.lesson_id, content.revision]);
    assert.deepEqual(exported.journal, before.journal);
    await page.click('#reset-progress');
    assert.equal((await snapshotPage(page)).journal.length, 0);
    await page.setInputFiles('#import-progress', file);
    await page.waitForFunction(() => document.getElementById('progress-status').dataset.result === 'imported');
    const after = await snapshotPage(page);
    assert.deepEqual(after.journal, before.journal);
    assert.deepEqual(after.fields, before.fields);
    assert.deepEqual(after.events, before.events);
  });

  await check('progress: files for another package, another content digest or revision, or a forged journal are refused and change nothing', async () => {
    const cases = [
      ['outro-pacote', p => ({ ...p, package_id: 'outro-pacote' }), /outra prática/],
      ['outro-digest', p => ({ ...p, content_digest: '0'.repeat(64) }), /outra versão do conteúdo/],
      ['outra-revisao', p => ({ ...p, content_digest: 'f'.repeat(64), revision: p.revision + 1 }), new RegExp(`revisão ${content.revision + 1} do conteúdo; esta página é a revisão ${content.revision}`)],
      ['acao-forjada', p => ({ ...p, journal: [...p.journal, { i: 'nao-existe', a: 'check', v: {} }] }), /não corresponde/],
      ['nao-progresso', () => ({ hello: 'world' }), /não é um progresso/]
    ];
    const before = await snapshotPage(page);
    for (const [name, edit, msg] of cases) {
      const f = join(qa, `progress-${name}.json`);
      writeFileSync(f, JSON.stringify(edit(exported)));
      await page.setInputFiles('#import-progress', f);
      await page.waitForFunction(() => document.getElementById('progress-status').dataset.result === 'refused');
      assert.match(await page.textContent('#progress-status'), msg, name);
      const now = await snapshotPage(page);
      assert.deepEqual(now.journal, before.journal, `${name}: journal unchanged`);
      assert.deepEqual(now.events, before.events, `${name}: events unchanged`);
      await page.evaluate(() => { document.getElementById('progress-status').dataset.result = ''; });
    }
  });

  await check('progress: after a content version change the old progress is not replayed; the page says so and offers its export', async () => {
    const saved = await page.evaluate(k => localStorage.getItem(k), store);
    await page.evaluate(([k, c]) => {
      const s = JSON.parse(localStorage.getItem(k)), mine = s.by_digest[c.digest];
      delete s.by_digest[c.digest];
      s.by_digest['old-digest'] = { ...mine, content_digest: 'old-digest', revision: c.revision - 1 };
      s.last_digest = 'old-digest';
      localStorage.setItem(k, JSON.stringify(s));
    }, [store, content]);
    await page.reload();
    assert.match(await page.textContent('#progress-status'), new RegExp(`mudou \\(revisão ${content.revision - 1} → ${content.revision}\\)`));
    assert.equal((await snapshotPage(page)).journal.length, 0, 'nothing replayed onto the new content');
    assert.equal(await page.isVisible('#export-old-progress'), true);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-old-progress')]);
    const old = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    assert.equal(old.revision, content.revision - 1);
    // Restore the real progress for the checks that follow.
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [store, saved]);
    await page.reload();
    assert.ok((await snapshotPage(page)).journal.length > 0);
  });
}

export async function presetChecks({ page, check, assert, manifest, events }) {
  const ro = await page.evaluate(() => window.__harness.data.rule_options);
  const kinds = await page.evaluate(() => window.__harness.data.package.units.map(u => u.kind));
  const COPY_BANNED = /hybrid|research|kelme|fgv|exam-prep|@\d|\+ovr|GAP|rating/i;
  await check(`presets on screen: ${ro.presets.length} modes; each resolves to the Node rule set and changes hints, declarative restart and the 50/50 aid`, async () => {
    assert.deepEqual(ro.presets, Rules.listPresets(ROOT), 'every preset is offered');
    for (const id of ro.presets) {
      await page.check(`#preset-control input[value="${id}"]`);
      const want = Rules.resolveRules(ROOT, { preset: id }, { unitKinds: kinds });
      assert.equal(await page.getAttribute('#rules', 'data-rule-set'), want.rule_set_id, id);
      assert.equal((await page.evaluate(() => window.__harness.rules)).rule_set_id, want.rule_set_id);
      assert.doesNotMatch(await page.textContent('#rules'), COPY_BANNED, `${id}: learner copy`);
      assert.match(await page.textContent('#progress-status'), /Modo alterado/);
      assert.equal((await page.evaluate(() => window.__harness.journal)).length, 0, 'switching starts over');
      // Hints: the cue button exists only when the preset allows at least one hint level.
      const hints = want.slots.feedback_ladder.params.hint_levels;
      const cloze = await page.$$eval('section[data-format="fmt-retrieval-cloze"]', s => s.map(x => ({ id: x.id, hint: !!x.querySelector('button:not(.primary)'), ladder: (window.__harness.data.package.units.flatMap(u => u.items).find(i => `item-${i.id}` === x.id).payload.cue_ladder || []).length })));
      for (const c of cloze) assert.equal(c.hint, hints > 0 && c.ladder > 0, `${id}: hint button on ${c.id}`);
      // Declarative restart on a wrong choice: requeue (locked, returns later) or an immediate reshuffled retry.
      const choiceId = await page.evaluate(() => { const it = window.__harness.data.package.units.flatMap(u => u.items).find(i => i.format === 'fmt-choice-feedback'); return it && it.id; });
      if (choiceId) {
        const wrong = await page.evaluate(id => window.__harness.data.package.units.flatMap(u => u.items).find(i => i.id === id).payload.options.find(o => !o.correct).id, choiceId);
        await page.check(`#item-${choiceId} input[value="${wrong}"]`);
        await page.click(`#item-${choiceId} button.primary`);
        const last = (await page.evaluate(() => window.__harness.events)).filter(e => e.item_id === choiceId && e.type === 'outcome').pop();
        const reshuffle = want.slots['restart_on_error.declarative'].option === 'full_restart_reshuffle';
        assert.equal(last.route, reshuffle ? 'retry_same' : 'requeue_later', `${id}: route`);
        assert.equal(await page.isDisabled(`#item-${choiceId} button.primary`), !reshuffle, `${id}: choice locked only with requeue`);
        const shown = (await page.evaluate(() => window.__harness.events)).filter(e => e.item_id === choiceId && e.type === 'item_presented');
        assert.equal(shown.length, reshuffle ? 2 : 1, `${id}: reshuffled presentation`);
        const fifty = await page.$(`#item-${choiceId} button:has-text("50/50")`);
        assert.equal(!!fifty, want.slots['gamification.lifelines'].option === 'fifty_fifty_assisted', `${id}: 50/50 aid`);
        if (fifty) {
          await fifty.click();
          assert.equal(await page.$$eval(`#item-${choiceId} .opt:not([hidden])`, o => o.length), 2, '50/50 leaves two options');
          const right = await page.evaluate(id => window.__harness.data.package.units.flatMap(u => u.items).find(i => i.id === id).payload.options.find(o => o.correct).id, choiceId);
          await page.check(`#item-${choiceId} input[value="${right}"]`);
          await page.click(`#item-${choiceId} button.primary`);
          const ans = (await page.evaluate(() => window.__harness.events)).filter(e => e.item_id === choiceId && e.type === 'answer_submitted').pop();
          assert.deepEqual([ans.result, ans.assisted], ['correct', true], 'an answer after 50/50 is assisted');
        }
      }
      // Procedural restart: defaults to the preset's own option.
      if (ro.restart_options.length) assert.equal(await page.inputValue('#restart-control'), ro.default_restart[id], `${id}: restart default`);
      assert.deepEqual(events.checkEvents(await page.evaluate(() => window.__harness.events)), [], `${id}: events inside the closed vocabulary`);
    }
    await page.check('#preset-control input[value="research-hybrid"]');
    assert.equal(await page.getAttribute('#rules', 'data-rule-set'), manifest.rule_set_id);
  });
}

export async function restartPolicyChecks({ browser, page, check, assert, dir }) {
  const ro = await page.evaluate(() => window.__harness.data.rule_options);
  if (!ro.restart_options.length) return;
  const POLICY = { full_restart: 'full', restart_at_failed_step_new_numbers: 'failed-step', last_checkpoint_plus_worked_step: 'checkpoint', full_restart_after_n_errors: 'after-n-errors' };
  await check('restart policies: each of the four, chosen on the package page, reaches the step player (#modo=) and sends a wrong answer back to the step the engine computes', async () => {
    assert.deepEqual(ro.restart_options.map(o => POLICY[o]).sort(), ['after-n-errors', 'checkpoint', 'failed-step', 'full']);
    for (const opt of ro.restart_options) {
      await page.selectOption('#restart-control', opt);
      const want = Rules.resolveRules(ROOT, { preset: 'research-hybrid', overrides: opt === 'last_checkpoint_plus_worked_step' ? undefined : { 'restart_on_error.procedural': { option: opt } } }, { unitKinds: ['ordered_procedure'] });
      assert.equal(await page.getAttribute('#rules', 'data-rule-set'), want.rule_set_id, `${opt}: rule set with the override`);
      const link = await page.locator('section[data-format="fmt-step-ladder"] a.go');
      const href = await link.getAttribute('href');
      assert.match(href, new RegExp(`#modo=${POLICY[opt]}$`), opt);
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await ctx.route('**/*', r => { const u = r.request().url(); return u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:') ? r.continue() : r.abort(); });
      const p = await ctx.newPage();
      try {
        await p.goto(new URL(href, page.url()).href);
        await p.click('#tab-practice');
        assert.equal(await p.inputValue('#policy'), POLICY[opt], `${opt}: the step player uses the chosen mode`);
        const walk = async target => {
          for (let guard = 0; guard < 40; guard++) {
            const c = await p.evaluate(() => {
              const E = window.ProcedureEngine, L = window.__pilot.lesson, s = window.__pilot.state(), run = s.runs[s.current];
              const ex = E.exerciseById(L, s.current), solved = E.solve(L, ex, run.variables), step = ex.steps[run.step];
              let input;
              if (step.type === 'givens') { input = {}; for (const f of step.fields) input[f.var] = E.formatNumber(run.variables[f.var], E.decimalsOf(L, ex.id, f.var), L.locale); }
              else if (step.type === 'choice') input = solved.steps[run.step].answer;
              else input = E.formatNumber(solved.values[step.id], step.display_decimals, L.locale);
              return { step: run.step, type: step.type, input };
            });
            if (c.step >= target) return c;
            if (c.type === 'givens') for (const [k, v] of Object.entries(c.input)) await p.fill(`#g-${k}`, v);
            else if (c.type === 'choice') await p.check(`#opt-${c.input}`);
            else await p.fill('#answer', c.input);
            await p.click('#answer-form button[type=submit]');
          }
          throw new Error('walk did not reach the step');
        };
        // A numeric step after a checkpoint, so all four policies give different return steps.
        const target = await p.evaluate(() => { const L = window.__pilot.lesson, ex = L.exercises[0]; const cp = ex.steps.findIndex(s => s.checkpoint); return ex.steps.findIndex((s, i) => i > cp + 1 && s.type === 'numeric'); });
        const wrongOnce = async () => {
          await walk(target);
          await p.fill('#answer', '999999'); await p.click('#answer-form button[type=submit]');
          const expected = await p.evaluate(pol => { const E = window.ProcedureEngine, L = window.__pilot.lesson, s = window.__pilot.state(); return E.returnStepFor(L, s.runs[s.current], pol, s.afterN); }, POLICY[opt]);
          assert.match(await p.textContent('#retry'), new RegExp(`voltar ao passo ${expected + 1}\\b`), `${opt}: retry label`);
          await p.click('#retry');
          const now = await p.evaluate(() => { const s = window.__pilot.state(); return s.runs[s.current].step; });
          assert.equal(now, expected, `${opt}: step after retry`);
          return expected;
        };
        const first = await wrongOnce();
        const byPolicy = { full: 0, 'failed-step': target, 'after-n-errors': target };
        if (POLICY[opt] in byPolicy) assert.equal(first, byPolicy[POLICY[opt]], `${opt}: first error`);
        else assert.ok(first > 0 && first < target, `checkpoint: returns to the step after the last checkpoint (${first})`);
        if (POLICY[opt] === 'after-n-errors') {
          // N = 3: the second error still repeats the step; the third restarts from step 1.
          assert.equal(await wrongOnce(), target);
          assert.equal(await wrongOnce(), 0);
        }
      } finally { await ctx.close(); }
    }
    await page.selectOption('#restart-control', 'last_checkpoint_plus_worked_step');
  });
}
