---
name: "didactic-worked-solutions"
description: "Use when asked for a beginner-friendly, step-by-step worked-solution PDF (LaTeX, with drawings) for exercises or a topic, from rich course materials or just a short prompt."
---

# Didactic Worked-Solutions PDF

Build a PDF that lets someone who has **never seen the topic** solve the exercises with **the instructor's own method** and reach **the same answers as the answer key**. Write it in LaTeX, add drawings wherever a picture helps, and keep the interpretations easy to read.

Write the document in the user's language. These instructions are in English, but the output is not.

## 1. Gather the input (rich or sparse)

**Rich input** (slides, handouts, review lists, answer keys):
- Extract every file's text (for example `pdftotext -layout`). Read all of it before you plan anything.
- Record the **instructor's method**: notation (x̄, s, p̂, gl/df), how the tables are read (e.g. a table that gives the area *between 0 and z*, not the cumulative area), critical values, rounding habits, and how answers are phrased (semicolon intervals, %, units).
- Use the instructor's **exact exercises and numbers**. Never swap in textbook examples.
- If an answer key exists, it is the target. Your final numbers must match it.

**Sparse input** (e.g. "confidence intervals for a test tomorrow"):
- Build 4–6 representative exercises that cover each case of the topic, with clean numbers.
- Use the most common conventions (95% confidence, α = 0.05, standard table formats).
- Ask at most one quick question, and only if a wrong guess would make the whole document useless. Otherwise go ahead, and state your assumptions in one short box on page 1.

## 2. Verify every number in code first

Before you write any LaTeX, compute every intermediate value in Python. Then:
- Match the answer key. When a rounded intermediate value changes the result (e.g. SE 0.0246 vs 0.025 → margin 0.048 vs 0.049), tell the reader which value to carry and why.
- Keep 4 decimal places in intermediate steps and round only at the end. Tell the reader to do the same.
- If the key's value differs from a recomputation only in the last digit, keep the key's value and add a small note that this is rounding.

## 3. Document structure

1. **Cover**: title, topic and course, a "How to use this material" box (read Part 0, then the decision map, then the exercises in order, then redo them without looking), a calculator tip, and a table of contents.
2. **Part 0 – The minimum you need to know**
   - The idea in one sentence, plus one everyday analogy (e.g. tasting one spoonful of soup = a sample).
   - A **symbol dictionary** with three columns: symbol, *how to read it aloud*, and what it means in plain words.
   - The 2–4 recurring building blocks (e.g. standard error, critical value, margin of error) and one boxed "universal recipe".
   - Where the key constants come from, shown on **the instructor's own table**, with a drawing (e.g. 95% / 2 = 0.4750 → z = 1.96).
   - A small excerpt of any lookup table the exercises need (e.g. t critical values by df), with the values the exercises use in bold.
3. **Decision map**: a TikZ flowchart from questions about the problem to the formula, with each leaf tagged "(Ex. N)". Add a box listing the **keywords in the problem statement** that trigger each branch.
4. **Before a new family of problems** (e.g. hypothesis tests): one page with an analogy (e.g. a court trial, where H0 is innocent until proven otherwise), the fixed recipe, and a decision-rule table.
5. **One section per exercise**, always in this order:
   - **Statement** (verbatim from the instructor)
   - **Plain-language translation**: what is really being asked, in 1–3 sentences
   - **Step 1 – Separate the data**: a table of each symbol and its value with units; for two groups, use side-by-side columns
   - **Step 2 – Choose the distribution or formula**, quoting the keyword from the statement that decides it
   - **Steps 3+ – One calculation per step**: break composite formulas into numbered sub-steps (square → divide → add → square root)
   - **Drawing**: an interval on a number line, or a test curve with the statistic marked
   - **Final answer** box
   - **Easy interpretation** in context, with units and plain words (no jargon)
   - **Common mistake** box, when there is a real trap
6. **Summary sheet**: a table of situation, formula and critical value; all the final results; and a checklist for exam time.

## 4. Writing rules for absolute beginners

- Never skip an arithmetic step, and never write "it is easy to see".
- Spell out where a square root ends ("the root covers the whole fraction") and what goes on top or bottom of a fraction.
- Use the instructor's vocabulary and symbols, even when another convention is more common.
- Each interpretation should be a sentence a layperson could say out loud.

## 5. LaTeX build

**Packages:** `article` 12pt a4, `lmodern`, `amsmath`, `tcolorbox[most]`, `tikz` (with `arrows.meta`), `pgfplots` (compat 1.18), `booktabs`, `array`, `enumitem`, `fancyhdr`, `hyperref`.

**Decimal commas** (pt, es, fr, de…): use `icomma`, so `$1,96$` works while `, ` stays punctuation.

**Colour-coded box environments:**
- statement: grey
- translation: orange outline
- data: blue
- step: white with blue frame
- final answer: green
- interpretation: orange
- common mistake: red

**Reusable macros:**
- `\pgfmathdeclarefunction{gauss}{1}{\pgfmathparse{exp(-(#1)^2/2)/sqrt(2*pi)}}`
- `\ICline{lower}{centre}{upper}{margin}{centre name}`: a schematic number line with the band shaded, ±E arrows above, and the values and labels below
- `\RejCurve{crit}{stat}{stat label}{crit label}`: a normal curve with green acceptance and red rejection tails (2.5% each), and an arrow at the statistic

**Known pitfalls:**
- pgfplots `xticklabels` splits on commas, so wrap each label in braces: `xticklabels={{$-1,96$},{$0$},{$+1,96$}}`.
- Accented words inside math mode break the build. Write `t_{\text{crítico}}`.
- Babel language files may be missing (check with `kpsewhich`). If they are, skip babel and set `\contentsname` manually.
- Place flowchart nodes at **absolute coordinates** with explicit `text width`. Relative positioning overlaps.
- Run `pdflatex` twice so the table of contents and page references resolve. Then grep the log for `^!` and large `Overfull` warnings.

## 6. Visual QA (mandatory)

1. Render the pages (`pdftoppm -r 45 -png`) and tile them into one contact sheet. Look at the sheet.
2. Re-render any page with a diagram at about 80 dpi and inspect it.
3. Fix overlapping nodes, labels that show the wrong decimal mark, a drawing stranded alone on a page, and hard-coded page references that no longer match.
4. Rebuild and check again.

## 7. Deliver

- Send the PDF with a short caption.
- In the reply, describe what is inside in a few bullets.
- Point out any rounding trap that would otherwise make the reader's answer differ from the answer key.