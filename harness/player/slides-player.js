/*
 * Offline slide player for the deck embedded in #deck-data (harness/slides.js builds it).
 * One slide visible at a time; ←/→, PageUp/PageDown, Home/End and the two buttons move; the slide heading takes
 * focus after each move and a live region says "Slide n de N". Retrieval prompts hide the answer behind a
 * button (aria-expanded). #n in the URL opens slide n. Print shows every slide, one per page, answers open.
 * Plain text stays in text nodes. LessonMath renders equations, and figure SVG comes from our own renderer.
 */
(function () {
  'use strict';
  const D = JSON.parse(document.getElementById('deck-data').textContent), U = D.ui;
  const $ = id => document.getElementById(id);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v === null || v === undefined) continue;
      if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v;
      else if (k === 'math' && window.LessonMath) window.LessonMath.append(el, v, D.infer_notation);
      else if (k === 'math') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
    return el;
  }
  const svg = s => new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;
  // Narrow screens (< 600 px) get the compact drawing of a plot, as the package lab does.
  const narrow = window.matchMedia('(max-width: 599px)');
  const pickSvg = f => (narrow.matches && f.svg_compact ? f.svg_compact : f.svg);

  function slide(s, i) {
    const id = `s-${i + 1}`;
    const sec = h('section', { class: 'slide', id, 'data-id': s.id, 'aria-roledescription': U.slide, 'aria-labelledby': `${id}-h`, hidden: true });
    if (s.kicker) sec.append(h('p', { class: 'kicker', text: s.kicker }));
    sec.append(h('h2', { id: `${id}-h`, tabindex: '-1', text: s.title }));
    if (s.unverified) sec.append(h('p', { class: 'flag', text: U.flag }));
    for (const p of s.paragraphs || []) sec.append(h('p', { math: p }));
    if ((s.list || []).length) sec.append(h('ul', {}, s.list.map(t => h('li', { math: t }))));
    if ((s.steps || []).length) sec.append(h('ol', { class: 'steps' }, s.steps.map(st => h('li', {}, h('strong', { text: /[.:?!]$/.test(st.title) ? st.title : `${st.title}:` }), h('span', { math: ` ${st.text}` })))));
    // Tables scroll sideways on small screens: a named region the keyboard can reach (axe scrollable-region-focusable).
    if (s.table) sec.append(h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': s.title }, h('table', {}, h('thead', {}, h('tr', {}, s.table.head.map(t => h('th', { scope: 'col', text: t })))), h('tbody', {}, s.table.rows.map(r => h('tr', {}, r.map(c => h('td', { math: c }))))))));
    if (s.figure) {
      // A wide figure scrolls sideways inside a named region the keyboard can reach, so its labels keep their size.
      const pic = s.figure.wide ? h('div', { class: 'figure-scroll', tabindex: '0', role: 'region', 'aria-label': s.title }, svg(s.figure.svg)) : svg(pickSvg(s.figure));
      const fig = h('figure', {}, s.figure.wide ? h('p', { class: 'scroll-hint', text: U.scrollHint }) : null, pic, h('figcaption', { text: `${U.figure}${s.figure.alt}` }));
      if (s.figure.svg_compact) narrow.addEventListener('change', () => fig.querySelector('svg').replaceWith(svg(pickSvg(s.figure))));
      sec.append(fig);
    }
    if ((s.sources || []).length) sec.append(h('p', { class: 'sources', text: `${U.sourcesPrefix}${s.sources.join('; ')}.` }));
    if (s.retrieval) {
      const ans = h('p', { class: 'answer', id: `${id}-a`, hidden: true, math: s.retrieval.answer });
      const btn = h('button', { type: 'button', class: 'reveal', 'aria-expanded': 'false', 'aria-controls': `${id}-a`, text: U.show });
      btn.addEventListener('click', () => {
        const open = ans.hidden;
        ans.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        btn.textContent = open ? U.hide : U.show;
        if (open) window.LessonMath?.refresh();
      });
      sec.append(h('div', { class: 'retrieval' }, h('p', {}, h('strong', { text: U.recall }), h('span', { math: s.retrieval.prompt })), btn, ans));
    }
    return sec;
  }

  const root = $('slides'), slides = D.slides.map(slide);
  root.append(...slides);
  $('title').textContent = D.title;
  let at = 0;
  function go(i, moveFocus) {
    at = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach((s, k) => { s.hidden = k !== at; });
    window.LessonMath?.refresh();
    $('counter').textContent = U.counter.replace('{n}', at + 1).replace('{N}', slides.length);
    $('prev').disabled = at === 0; $('next').disabled = at === slides.length - 1;
    if (moveFocus) slides[at].querySelector('h2').focus();
    if (location.hash !== `#${at + 1}`) history.replaceState(null, '', `#${at + 1}`);
  }
  $('prev').addEventListener('click', () => go(at - 1, true));
  $('next').addEventListener('click', () => go(at + 1, true));
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    const k = { ArrowRight: 1, PageDown: 1, ArrowLeft: -1, PageUp: -1 }[e.key];
    if (k) { e.preventDefault(); go(at + k, true); }
    else if (e.key === 'Home') { e.preventDefault(); go(0, true); }
    else if (e.key === 'End') { e.preventDefault(); go(slides.length - 1, true); }
  });
  // Print: every slide, answers open.
  window.addEventListener('beforeprint', () => { slides.forEach(s => { s.hidden = false; }); document.querySelectorAll('.answer').forEach(a => { a.hidden = false; }); });
  window.addEventListener('afterprint', () => go(at, false));
  const fromHash = Number((location.hash || '').slice(1));
  go(Number.isInteger(fromHash) && fromHash >= 1 ? fromHash - 1 : 0, false);
  window.__slides = { count: slides.length, go: i => go(i, true), get at() { return at; }, deck: D };
})();
