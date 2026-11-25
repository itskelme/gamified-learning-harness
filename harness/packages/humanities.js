/*
 * Humanities composed package: lessons/humanities-decisions.lesson.json (schema 1.0, kind declarative-case).
 * Two units from the lesson's own practice items: "Conceitos" (cloze, classify, interpretation choice) and
 * "O caso da prefeitura" (evaluation order, branching case), plus the lesson-level review. No text is invented
 * here; every item keeps the claim ids it rests on and its source_ref is built from them
 * (harness/packages/compose.js). The branching item is the one the browser suite walks end to end.
 */
'use strict';
const { composeDeclarative } = require('./compose.js');
const BRA = require('../formats/fmt-branching-case/grader.js');

function buildHumanitiesPackage(lesson) {
  const pkg = composeDeclarative(lesson);
  const cases = pkg.units.flatMap(u => u.items).filter(i => i.format === 'fmt-branching-case');
  if (cases.length !== 1) throw new Error(`${lesson.id}: the humanities package needs exactly one case graph (found ${cases.length})`);
  const paths = BRA.allPaths(cases[0].payload.graph);
  if (!paths.some(p => p.score.earned === p.score.max) || !paths.some(p => p.score.earned < p.score.max)) throw new Error(`${lesson.id}: the case needs a best path and at least one weaker path`);
  return pkg;
}

module.exports = { buildHumanitiesPackage };
