// Branching-case endings must be true for every path that reaches them (Sofia, t_fd19236f round 1). Before:
// "Aprovo a expansão" > "Comparo com cruzamentos e períodos parecidos" ended at a terminal whose principle said
// "Sem um grupo parecido para comparar..." and whose ending said "sem saber bem quanto elas ajudam"; confirmation-bias
// and "ano atípico" paths ended on a regression-to-the-mean principle. The e2e test compared the screen with
// allPaths (the same data), so it could not catch this.
//
// Contract: every terminal declares a principle_tag (the one lesson its principle and ending teach) and every choice
// that enters a terminal carries the same tag. BranchingCase.validate reports principle_mismatch otherwise, so the
// composer refuses the graph at build time. The tags are written per choice, independent of the terminal texts.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ROOT = path.join(__dirname, '..', '..');
const BRA = require('../../harness/formats/fmt-branching-case/grader.js');
const lesson = require(path.join(ROOT, 'lessons/humanities-decisions.lesson.json'));

const clone = o => JSON.parse(JSON.stringify(o));
const caseGraph = () => clone(lesson.practice.units.flatMap(u => u.items).find(i => i.format === 'fmt-branching-case').payload.graph);
const choiceAt = (g, step) => { const [node, key] = step.split(':'); return g.nodes[node].choices[key]; };
const pathEndingAt = (g, picks) => BRA.allPaths(g).find(p => p.path.map(s => s.split(':')[1]).join('>') === picks);

test('validator: a choice entering a terminal must carry that terminal\'s principle_tag', () => {
  const g = { start: 'a', nodes: {
    a: { choices: { x: { to: 't1', quality: 1, principle_tag: 'p1' }, y: { to: 't2', quality: 0, principle_tag: 'p1' } } },
    t1: { terminal: true, principle: 'P1', principle_tag: 'p1' }, t2: { terminal: true, principle: 'P2', principle_tag: 'p2' } } };
  assert.deepEqual(BRA.validate(g), ['principle_mismatch:a.y->t2']);
  g.nodes.a.choices.y.principle_tag = 'p2';
  assert.deepEqual(BRA.validate(g), []);
  delete g.nodes.t2.principle_tag;
  assert.deepEqual(BRA.validate(g), ['terminal_without_principle_tag:t2']);
  // Untagged graphs (the catalog fixture AF-BRA-01) keep the catalog rules only.
  const plain = clone(g); delete plain.nodes.t1.principle_tag; for (const c of Object.values(plain.nodes.a.choices)) delete c.principle_tag;
  assert.deepEqual(BRA.validate(plain), []);
});

test('humanities case: every terminal declares a principle_tag and every path enters its terminal by a choice with that tag', () => {
  const g = caseGraph();
  const terminals = Object.entries(g.nodes).filter(([, n]) => n.terminal);
  for (const [id, n] of terminals) assert.equal(typeof n.principle_tag, 'string', `${id} declares its principle_tag`);
  assert.deepEqual(BRA.validate(g), []);
  for (const p of BRA.allPaths(g)) {
    const last = choiceAt(g, p.path[p.path.length - 1]);
    assert.equal(last.principle_tag, g.nodes[p.terminal_id].principle_tag, `${p.path.join(' > ')} -> ${p.terminal_id}`);
  }
  assert.equal(new Set(terminals.map(([, n]) => n.principle_tag)).size, terminals.length, 'each terminal teaches its own lesson');
});

test('humanities case: the endings Sofia reproduced now match the path played', () => {
  const g = caseGraph();
  const late = pathEndingAt(g, 'aprovar>estimar'), lateNode = g.nodes[late.terminal_id];
  assert.doesNotMatch(late.principle, /Sem um grupo parecido para comparar/, 'the learner did compare');
  assert.doesNotMatch(lateNode.ending, /sem saber/, 'the learner estimated the effect');
  assert.match(late.principle, /depois|tarde/, 'the principle is about comparing late, after the decision');
  const bias = pathEndingAt(g, 'melhores>manter');
  assert.match(bias.principle, /confirmação/);
  assert.doesNotMatch(bias.principle, /regressão à média/);
  const excuse = pathEndingAt(g, 'aprovar>atipico');
  assert.match(excuse.principle, /atípico/);
  assert.doesNotMatch(excuse.principle, /regressão à média/);
  const allOrNothing = pathEndingAt(g, 'perguntar>efeito0');
  assert.match(allOrNothing.principle, /diferença/, 'the effect is the difference between the groups');
  assert.match(pathEndingAt(g, 'perguntar>efeito6').principle, /regressão à média/, 'regression to the mean stays where it is the error');
});

test('a mismatched lesson graph is refused by the composer at build time', () => {
  const { buildHumanitiesPackage } = require('../../harness/packages/humanities.js');
  const bad = clone(lesson);
  const g = bad.practice.units.flatMap(u => u.items).find(i => i.format === 'fmt-branching-case').payload.graph;
  const late = Object.values(g.nodes).find(n => n.choices && n.choices.estimar).choices.estimar;
  const other = Object.entries(g.nodes).find(([k, n]) => n.terminal && n.principle_tag !== late.principle_tag)[0];
  late.to = other;
  assert.throws(() => buildHumanitiesPackage(bad), /principle_mismatch/);
});
