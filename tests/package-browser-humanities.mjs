// Humanities package browser checks (imported by tests/package-browser.mjs humanities).
// The fmt-branching-case view is walked end to end, keyboard only, along EVERY path that
// BranchingCase.allPaths lists for the lesson's graph: each ends at its terminal with the right score and
// principle, focus moves to each new node's legend, weaker paths get the worked debrief and the principle check
// before a replay, and every event is inside the closed vocabulary.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const BRA = require('../harness/formats/fmt-branching-case/grader.js');
const EV = require('../harness/core/events.js');

export async function humanitiesBrowserChecks({ page, check, evs, answers, assert }) {
  const item = await page.evaluate(() => window.__harness.data.package.units.flatMap(u => u.items).find(i => i.format === 'fmt-branching-case'));
  const g = item.payload.graph, pc = item.payload.principle_check, sel = `#item-${item.id}`;
  const paths = BRA.allPaths(g);
  const best = n => Math.max(...Object.values(n.choices).map(c => c.quality));
  const activeIs = () => page.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, text: a.textContent, node: a.closest('fieldset') && a.closest('fieldset').dataset.node }; });

  // Choose option k of the current node with the keyboard only: Tab into the radio group, Arrow keys to the
  // option (Space for the first), Tab to "Escolher", Enter.
  const chooseByKeyboard = async (nodeId, key) => {
    const keys = Object.keys(g.nodes[nodeId].choices), k = keys.indexOf(key);
    await page.keyboard.press('Tab');
    let a = await page.evaluate(() => [document.activeElement.type, document.activeElement.name]);
    assert.equal(a[0], 'radio', `${nodeId}: Tab from the legend reaches the first option`);
    if (k === 0) await page.keyboard.press('Space');
    for (let i = 0; i < k; i++) await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.value), key, `${nodeId}: arrow keys reach ${key}`);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Escolher');
    await page.keyboard.press('Enter');
  };

  await check(`branching: all ${paths.length} paths of allPaths walked keyboard-only; each reaches its ending with the allPaths score and principle; focus moves to every new node's legend; weaker paths get the worked debrief`, async () => {
    assert.ok(paths.length >= 6, `${paths.length} paths`);
    for (const p of paths) {
      await page.click('#reset-progress');
      await page.focus(`${sel} fieldset[data-node="${g.start}"] legend`);
      let at = g.start;
      for (const step of p.path) {
        const [nodeId, key] = step.split(':');
        assert.equal(nodeId, at);
        await chooseByKeyboard(nodeId, key);
        at = g.nodes[nodeId].choices[key].to;
        const a = await activeIs();
        if (g.nodes[at].terminal) assert.deepEqual([a.tag, a.text], ['H3', 'Fim do caso'], `${p.path.join(' > ')}: focus on the ending`);
        else assert.deepEqual([a.tag, a.node, a.text], ['LEGEND', at, g.nodes[at].text], `${p.path.join(' > ')}: focus on the new node's legend`);
      }
      assert.equal(at, p.terminal_id);
      const text = await page.textContent(sel);
      assert.ok(text.includes(`Princípio: ${p.principle}`), `${p.terminal_id}: principle shown`);
      assert.ok(text.includes(`Pontos: ${p.score.earned} de ${p.score.max}.`), `${p.path.join(' > ')}: score ${p.score.earned}/${p.score.max}`);
      const mine = (await evs()).filter(e => e.item_id === item.id);
      const done = mine.find(e => e.type === 'item_completed'), out = mine.filter(e => e.type === 'outcome').pop();
      assert.deepEqual([done.terminal_id, done.path, done.score], [p.terminal_id, p.path, p.score]);
      const optimal = p.score.earned === p.score.max;
      assert.equal(out.route, optimal ? 'advance' : 'worked_debrief_then_requeue_branch');
      // Worked debrief: one entry per decision below the best, each naming the better action.
      let id = g.start, weaker = 0;
      for (const step of p.path) { const [, key] = step.split(':'); if (g.nodes[id].choices[key].quality < best(g.nodes[id])) weaker++; id = g.nodes[id].choices[key].to; }
      assert.equal(await page.locator(`${sel} ol.debrief > li`).count(), optimal ? 0 : weaker, `${p.path.join(' > ')}: debrief entries`);
      if (!optimal) assert.match(await page.textContent(`${sel} ol.debrief`), /Melhor ação:/);
      assert.equal(await page.isVisible(`${sel} [data-role="principle-check"]`), !optimal && !!pc);
      assert.deepEqual(EV.checkEvents(await evs()), []);
    }
  });

  await check('branching: after a weak ending the replay unlocks only after the principle check is answered correctly; replay starts a new attempt with focus on the first situation', async () => {
    await page.click('#reset-progress');
    const weak = paths.find(p => p.score.earned < p.score.max);
    await page.focus(`${sel} fieldset[data-node="${g.start}"] legend`);
    for (const step of weak.path) { const [n, k] = step.split(':'); await chooseByKeyboard(n, k); }
    assert.equal(await page.locator(`${sel}-replay`).count(), 0, 'no replay before the principle check');
    const wrong = pc.options.find(o => !o.correct), right = pc.options.find(o => o.correct);
    await page.check(`${sel} [data-role="principle-check"] input[value="${wrong.id}"]`);
    await page.click(`${sel} [data-role="principle-check"] button`);
    assert.equal(await page.textContent(`${sel} [data-role="principle-check"] .feedback`), wrong.feedback);
    assert.equal(await page.locator(`${sel}-replay`).count(), 0, 'a wrong principle answer keeps the replay locked');
    await page.check(`${sel} [data-role="principle-check"] input[value="${right.id}"]`);
    await page.click(`${sel} [data-role="principle-check"] button`);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Refazer o caso', 'focus moves to the replay button');
    await page.keyboard.press('Enter');
    const a = await activeIs();
    assert.deepEqual([a.tag, a.node], ['LEGEND', g.start]);
    const shown = (await evs()).filter(e => e.item_id === item.id && e.type === 'item_presented');
    assert.deepEqual(shown.map(e => e.attempt_no), [1, 2]);
    const principle = (await answers(item.id)).filter(e => e.step_id === 'principle');
    assert.deepEqual(principle.map(e => e.result), ['incorrect', 'correct']);
    // The path list starts again with no choice in it; its placeholder item keeps it from being an empty list.
    assert.deepEqual(await page.$$eval(`${sel} ol[aria-label="Caminho até aqui"] > li`, ls => ls.map(l => [l.className, l.textContent])), [['none', 'Nenhuma escolha ainda.']], 'the path list starts again with only its placeholder');
  });

  await check('humanities concepts: cloze accepts the key and synonyms, a one-letter slip is a near miss (not an error), the number blank follows the pt-BR contract; classify and choice give their own feedback', async () => {
    await page.click('#reset-progress');
    await page.fill('input[data-blank="b_media"]', 'media');
    await page.fill('input[data-blank="b_grupo"]', 'semelhante');
    await page.fill('input[data-blank="b_efeito"]', '3');
    await page.click('#item-lembrar button.primary');
    assert.match(await page.textContent('#item-lembrar .feedback'), /Quase/);
    const near = (await answers('lembrar')).find(e => e.step_id === 'b_media');
    assert.deepEqual([near.result, near.score], ['near_miss', { earned: 0, max: 1 }]);
    await page.fill('input[data-blank="b_media"]', 'Média');
    await page.click('#item-lembrar button.primary');
    assert.match(await page.textContent('#item-lembrar .feedback'), /Certo/);
    // classify: one mistake is diagnosed with the right type
    const cases = await page.$$eval('#item-classificar select', s => s.map(x => x.dataset.case));
    const key = await page.evaluate(() => Object.fromEntries(window.__harness.data.package.units[0].items.find(i => i.id === 'classificar').payload.cases.map(c => [c.id, c.category])));
    for (const c of cases) await page.selectOption(`#item-classificar select[data-case="${c}"]`, c === 'a2' ? 'fato' : key[c]);
    await page.click('#item-classificar button.primary');
    assert.match(await page.textContent('#item-classificar .feedback'), /Acertos: 4 de 5/);
    assert.match(await page.textContent('#item-classificar .feedback'), /o tipo certo é “Explicação causal”/);
    assert.equal((await answers('a2')).pop().misconception_tag, 'cause_read_as_fact');
    // choice: a distractor shows its own feedback
    const q = await page.evaluate(() => window.__harness.data.package.units[0].items.find(i => i.id === 'interpretar').payload);
    const wrong = q.options.find(o => o.id === 'efeito-6');
    await page.check(`#item-interpretar input[value="${wrong.id}"]`);
    await page.click('#item-interpretar button.primary');
    assert.equal(await page.textContent('#item-interpretar .feedback'), wrong.feedback);
    // sequence: the worked debrief appears after the second wrong order
    await page.click('#item-ordem-avaliacao button.primary');
    await page.click('#item-ordem-avaliacao button.primary');
    const order = await page.$$eval('#item-ordem-avaliacao .seq-card', c => c.map(x => x.dataset.id));
    const keyOrder = await page.evaluate(() => window.__harness.data.package.units[1].items.find(i => i.id === 'ordem-avaliacao').payload.key_order);
    if (order.join() !== keyOrder.join()) assert.match(await page.textContent('#item-ordem-avaliacao .feedback'), /Decidir e combinar como medir de novo/);
    // review: an exam date in 20 days shows the plan table
    const exam = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 20); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; });
    await page.fill('#exam-date', exam); await page.dispatchEvent('#exam-date', 'change');
    assert.ok(await page.locator('#item-revisao tr[data-date]').count() > 0);
    // Leave one branching path in the journal for the shared progress checks.
    await page.focus(`${sel} fieldset[data-node="${g.start}"] legend`);
    const p0 = paths.find(p => p.score.earned < p.score.max);
    for (const step of p0.path) { const [n, k] = step.split(':'); await chooseByKeyboard(n, k); }
  });
}
