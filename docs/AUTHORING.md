# Authoring environment and visuals

Status: draft, like the two domain skills (`skills/gamified-stem-learning`, `skills/gamified-humanities-learning`).
It documents what is built and tested; the research verification has not approved the design yet.

## One entry point

```bash
node scripts/build-lesson.mjs <lesson.json> [--out DIR] [--preset ID] [--latex-pdf | --no-pdf]
node scripts/build-lesson.mjs --brief <brief.json> [--provider <module.js>] [--out DIR] [--preset ID] [--latex-pdf | --no-pdf]
```

Any known lesson file (schema 0.1, ordered-procedure 0.2.0 or schema 1.0; `docs/SCHEMA.md`) is migrated to 1.0 and
validated, then built into `build/lessons/<lesson id>/`:

| Output | File | Made by |
| --- | --- | --- |
| Offline package (practice in several formats) | `<id>-pacote.html` (+ `.manifest.json`) | composer by lesson id or kind (`harness/packages/compose.js`), router, rules and caps (`scripts/lib/package-page.mjs`) |
| Slides | `<id>-slides.html` | `harness/slides.js` deck in `templates/slides.html`, player `harness/player/slides-player.js` |
| Step player (procedures) | `<id>.html` | `scripts/build-pilot.mjs` (engine, 200-seed contract, answer key) |
| Study guide (other kinds) | `<id>-estudo.html` | `harness/study-guide.js` (script-free) |
| Study PDF | `<id>-estudo.pdf` | pdfLaTeX with `--latex-pdf`, or Chromium by default. Both check the extracted PDF text. The Chromium build also checks empty sections and orphaned headings in the printed view. |
| LaTeX source | `<id>.tex` | `harness/latex.js`, statically checked before compilation |
| Build manifest | `lesson-build.json` | composer, plan, digests, PDF role, LaTeX status, brief assumptions and unverified claims |

The composer is chosen by data, never by a package name in the command: Prova 3 (`prova3-estatistica`) and the
humanities lesson (`humanidades-decisoes`) have curated composers; every other lesson is composed by its kind.
`scripts/build-package.mjs prova3|humanities` stays as the named shortcut and gives the same package plan.

Shown on a new lesson that is neither of the two: `lessons/teste-z-uma-media.lesson.json` (one-sample Z test,
author-created numbers, engine-valid over 200 seeds), and on the migrated `examples/stem.lesson.json`.

## Structured path

Write a schema 1.0 file of the kind that fits the content:

- **ordered-procedure** for fixed step orders with numbers (statistics, finance, physics): exercises in the step
  engine contract. The generic composer derives the package from the lesson: step ladder over every exercise, step
  order of the first exercise, the lab of the first exercise with an `explore` block, the interpretation choice of
  the first exercise whose interpretation step has options with feedback, and method classification only when two
  or more exercises use different methods.
- **declarative-case** for concepts, cases and decisions (humanities, administration, law with jurisdiction and
  date): claims tied to sources, a study guide with recall prompts, and practice items authored in each format's
  payload contract (`skills/fmt-*/SKILL.md`), each resting on claim ids. The composer refuses an item its format's
  validator rejects; it invents no text.
  In a branching case, each ending must be true for every path that reaches it. Give each terminal a
  `principle_tag` (the one lesson its principle and ending teach) and give the same tag to every choice that enters
  that terminal; `BranchingCase.validate` reports `principle_mismatch` otherwise and the build stops. Two different
  errors, or a late correction, get two different endings (`tests/contract/branching-principles.test.js`).
- **slides-practice** for the simple 0.1 files: slides with recall prompts and short worked exercises.

## Shallow-brief path

A short request plus at least one source becomes a declarative-case **draft**, through an injectable provider
(`{ id, draft(brief) -> { lesson, assumptions[] } }`). The default `harness/brief/stub-provider.js` is
deterministic and only rearranges the brief (points become sections and claims, terms become the glossary and a
term-to-definition classification). A model-backed provider plugs in with `--provider`. `harness/brief/brief.js`
does not trust the provider:

1. **No source, no draft.** A brief without a usable source is refused before any provider runs: exit 2,
   "Pedido recusado: nenhuma fonte foi informada...", nothing written.
2. **Unverified claims are flagged.** A claim tied to no source, or to a source the brief did not give, becomes
   `unverified` and is listed in `brief.unverified_claims`. Glossary entries carry `claim_ids` too; an entry the
   provider left without them gets an unsourced claim of its own. The study guide, slides and LaTeX flag **every
   printed occurrence**: the section heading and each paragraph, each glossary definition, each "Tente lembrar"
   answer (slides: the slide flag on a section slide, a marker on each glossary row). The package names it
   "afirmação não verificada" in the item's source line. `tests/contract/unverified-flags.test.js` checks each
   occurrence in each artifact, not each section.
3. **assumptions[] are listed.** The provider must state what it assumed (audience, length, language, scope); an
   empty list is refused. The draft opens with a banner (guide, LaTeX) or a first slide listing them.

Example: `examples/briefs/vies-de-sobrevivencia.brief.json` (one source, Mangel and Samaniego 1984, checked on
Crossref; one point and two terms deliberately left without a source to show the flags). Tests:
`tests/contract/brief.test.js`.

## Study PDF

`harness/latex.js` emits LaTeX from the normalized lesson. The static check covers character mappings, balanced
environments and supported packages. Pass `--latex-pdf` to compile with the local `latexmk` and pdfLaTeX, disable
shell escape, and record `compiled: true` and `renderer: pdflatex` in the manifest. The default build writes
the same source alongside the Chromium fallback. Use `--no-pdf` for HTML and LaTeX source only. See [TeX setup](ENVIRONMENT.md).

## Visuals

- Ordered-procedure HTML outputs typeset the lesson's notation as native MathML from TeX, using an embedded KaTeX
  renderer. Fractions, radicals and scripts use the same numbers that the exercise engine generates. The HTML
  renderer also accepts explicit `\( … \)` notation in formatted fields. See [KaTeX rendering options](https://katex.org/docs/options.html).
- **Plots** are drawn from a `plot_spec` alone (`ProcedurePlots.renderSpec`): the engine solves the data, the spec
  carries marks, labels, df and the text alternative, and the SVG renderer, the slides and the TikZ figure read only
  the spec. The same spec gives a compact drawing for screens under 600 px (labels stay 10 px or more at 360 px).
- **Case figure** (`harness/case-diagram.js`): boxes S1, S2... for situations and F1... for endings, one arrow per
  choice. Line style carries the quality of a choice (solid green best at that point, dashed orange partial, dotted
  red weak), in a drawn key and in the text alternative, so colour is never the only cue (each colour has 3:1 or
  more against white). Arrows that meet at a box enter at separate points; a long arrow detours around any box in
  between. Each column is ordered by the height of its boxes' parents, so endings sit next to the situations that
  lead to them and the humanities figure has no crossing arrows; F1, F2... read from the top. A legend and a table of every path, its ending, points and principle carry the text. In slides and the
  study guide a wide figure scrolls sideways in a named, keyboard-reachable region instead of shrinking its labels.
- **Accessibility gate**: `tests/a11y-browser.mjs` runs axe-core (WCAG 2.0/2.1/2.2 A and AA, including contrast) on
  every final artifact at 1440 and 360 px, writes the accessibility tree of every package item and slide (the
  screen-reader walkthrough) to `build/lessons/qa/aria/`, and checks keyboard reach, reduced motion, untimed mode and
  small screens.
