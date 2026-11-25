/*
 * Study guide (Phase 1 document) for schema-1.0 lessons of kind declarative-case and slides-practice, as one
 * static, script-free HTML page that Chromium prints to the study PDF (the fallback renderer; the LaTeX source
 * from harness/latex.js is the intended print path once its container is approved). Ordered-procedure lessons
 * keep their own study view (templates/ordered-procedure.html, printed by scripts/build-pilot.mjs).
 * Every text node is escaped; figures are our own SVG (harness/case-diagram.js).
 * Shallow-brief drafts carry a banner with the assumptions, and every printed occurrence of an unverified claim
 * (section heading and paragraphs, glossary definition, recall answer) carries the flag.
 */
'use strict';
const Case = require('./case-diagram.js');
const { sourceLine, sourceLabel, hasUnverified } = require('./slides.js');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const objText = o => (typeof o === 'string' ? o : o.text);

function css() {
  return `:root{--ink:#1f2a26;--muted:#4e5c56;--line:#c6cfc9;--brand:#1d4b6e;--ok:#2f7a4f;--bad:#9a2b1b;--warn:#8a4b00;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
*{box-sizing:border-box}body{margin:0;background:#f5f4ef}.wrap{max-width:860px;margin:0 auto;padding:20px 16px 48px;background:#fff}
h1{font-size:clamp(1.5rem,4.5vw,2.2rem);line-height:1.15;margin:.2em 0}h2{font-size:1.35rem;margin:1.4em 0 .4em;color:var(--brand);break-after:avoid}h3{font-size:1.1rem;margin:1em 0 .3em;break-after:avoid}
.eyebrow{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0}.muted{color:var(--muted);font-size:.92rem}
.box{border-left:5px solid var(--brand);background:#f1f5f8;padding:10px 14px;margin:12px 0;border-radius:4px;break-inside:avoid}
.box.recall{border-color:var(--ok);background:#eef5f0}.box.draft{border-color:var(--warn);background:#fff6e8}
.flag{color:var(--bad);font-weight:700}
.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.9rem}th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}tr{break-inside:avoid}
figure{margin:12px 0;break-inside:avoid}figure svg{width:100%;height:auto;display:block}.figure-scroll{overflow-x:auto}.figure-scroll svg{min-width:600px}.scroll-hint{display:none;font-size:.85rem;color:var(--muted);margin:0 0 4px}figcaption{font-size:.88rem;color:var(--muted)}
section{break-inside:auto}.sec-body{break-inside:avoid}
dl{display:grid;grid-template-columns:fit-content(14em) 1fr;gap:4px 14px}dt{font-weight:700}dd{margin:0}
@media (max-width:599px){.wrap{padding:16px 10px 40px}dl{grid-template-columns:1fr}.scroll-hint{display:block}.figure-scroll{border:1px solid var(--line);border-radius:6px}}
@media print{body{background:#fff}.wrap{padding:0;max-width:none}}`;
}

// The flag goes on every printed block that rests on an unverified claim (heading, paragraph, glossary definition,
// recall answer), not only on the section heading: tests/contract/unverified-flags.test.js checks each occurrence.
function claimMark(lesson, ids) {
  return hasUnverified(lesson, ids) ? ' <span class="flag">(afirmação não verificada)</span>' : '';
}

function declarativeBody(lesson) {
  const st = lesson.study, out = [];
  if (st.intro) out.push(`<p>${esc(st.intro)}</p>`);
  const answers = [];
  st.sections.forEach((sec, i) => {
    const src = sourceLine(lesson, sec.claim_ids), mark = claimMark(lesson, sec.claim_ids);
    out.push(`<section id="${esc(sec.id)}"><h2>${i + 1}. ${esc(sec.title)}${mark}</h2><div class="sec-body">${sec.paragraphs.map(p => `<p>${esc(p)}${mark}</p>`).join('')}`);
    if (src.length) out.push(`<p class="muted">Fontes: ${esc(src.join('; '))}.</p>`);
    out.push('</div>');
    if (sec.retrieval) { out.push(`<div class="box recall"><strong>Tente lembrar, sem olhar:</strong> ${esc(sec.retrieval.prompt)} <span class="muted">(resposta no fim do guia)</span></div>`); answers.push([`${i + 1}. ${sec.title}`, sec.retrieval.answer, mark]); }
    out.push('</section>');
  });
  const caseItem = ((lesson.practice || {}).units || []).flatMap(u => u.items).find(i => i.format === 'fmt-branching-case');
  if (caseItem) {
    const d = Case.render(caseItem.payload.graph);
    out.push(`<section id="caso"><h2>${st.sections.length + 1}. O caso em uma figura</h2><figure><p class="scroll-hint">Deslize a figura para os lados para ver tudo.</p><div class="figure-scroll" tabindex="0" role="region" aria-label="O caso em uma figura">${d.svg}</div><figcaption>Descrição da figura: ${esc(d.alt)}</figcaption></figure>`);
    out.push(`<dl>${d.legend.map(l => `<dt>${esc(l.label)}</dt><dd>${esc(l.text)}</dd>`).join('')}</dl>`);
    out.push(`<h3>Todos os caminhos, finais, pontos e princípios</h3><div class="table-wrap"><table><thead><tr><th scope="col">Escolhas</th><th scope="col">Final</th><th scope="col">Pontos</th><th scope="col">Princípio</th></tr></thead><tbody>${d.paths.map(p => `<tr><td>${esc(p.steps.join(' → '))}</td><td>${esc(p.ending)}</td><td>${p.score.earned} de ${p.score.max}</td><td>${esc(p.principle)}</td></tr>`).join('')}</tbody></table></div></section>`);
  }
  if ((st.glossary || []).length) out.push(`<section id="glossario"><h2>Glossário</h2><dl>${st.glossary.map(g => `<dt>${esc(g.term)}</dt><dd>${esc(g.definition)}${claimMark(lesson, g.claim_ids)}</dd>`).join('')}</dl></section>`);
  if ((st.summary || []).length) out.push(`<section id="resumo"><h2>Para lembrar</h2><ul>${st.summary.map(s => `<li>${esc(s)}</li>`).join('')}</ul></section>`);
  if (answers.length) out.push(`<section id="respostas"><h2>Respostas do “Tente lembrar”</h2><dl>${answers.map(([q, a, mark]) => `<dt>${esc(q)}</dt><dd>${esc(a)}${mark}</dd>`).join('')}</dl></section>`);
  return out.join('\n');
}

function slidesPracticeBody(lesson) {
  const out = [];
  lesson.slides.forEach((s, i) => out.push(`<section><h2>${i + 1}. ${esc(s.title)}</h2><p>${esc(s.body)}</p><div class="box recall"><strong>Recall:</strong> ${esc(s.retrieval_prompt)}</div></section>`));
  for (const ex of lesson.exercises) {
    out.push(`<section><h2>${esc(ex.statement)}</h2><p>${esc(ex.translation)}</p><ol>${ex.steps.map(st => `<li><strong>${esc(st.prompt)}</strong> ${esc(st.worked_solution)}</li>`).join('')}</ol><div class="box">${esc(ex.interpretation)}</div></section>`);
  }
  return out.join('\n');
}

function renderStudyGuide(lesson) {
  if (lesson.schema_version !== '1.0' || !['declarative-case', 'slides-practice'].includes(lesson.kind)) throw new Error('renderStudyGuide needs a schema 1.0 declarative-case or slides-practice lesson');
  const pt = (lesson.language || '').startsWith('pt');
  const head = [`<p class="eyebrow">${pt ? 'Guia de estudo · leia, lembre e pratique' : 'Study guide · read, recall, practise'}</p>`, `<h1>${esc(lesson.title)}</h1>`,
    `<h2>${pt ? 'Objetivos' : 'Objectives'}</h2><ul>${lesson.objectives.map(o => `<li>${esc(objText(o))}</li>`).join('')}</ul>`];
  if (lesson.brief) {
    head.push(`<div class="box draft" id="brief"><strong>Rascunho feito a partir de um pedido curto.</strong> Antes de usar, confira as suposições e as afirmações marcadas como não verificadas.
<h3>Suposições</h3><ul>${lesson.brief.assumptions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
<h3>Afirmações ainda não verificadas</h3><ul>${lesson.brief.unverified_claims.map(a => `<li>${esc(a)}</li>`).join('') || '<li>Nenhuma.</li>'}</ul></div>`);
  }
  const body = lesson.kind === 'declarative-case' ? declarativeBody(lesson) : slidesPracticeBody(lesson);
  const sources = `<section id="fontes"><h2>${pt ? 'Fontes' : 'Sources'}</h2><ul>${(lesson.sources || []).map(s => `<li>${esc(sourceLabel(s, lesson.language))}</li>`).join('')}</ul></section>`;
  return `<!doctype html><html lang="${esc(lesson.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>${esc(lesson.title)}</title><style>${css()}</style></head><body><main class="wrap">${head.join('\n')}\n${body}\n${sources}</main></body></html>\n`;
}

module.exports = { renderStudyGuide };
