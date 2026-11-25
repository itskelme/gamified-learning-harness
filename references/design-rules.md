# Design rules shared by the two domain skills

Source: `research/outputs/design-proposal.md` (approved by the founder on 2026-11-19), which rests on the independent verification in `research/outputs/verification.md` and the corrected reports in `research/outputs/revised/`. Both domain skills read this file so that they cannot drift apart. Change a rule here only together with the proposal.

Ratings: **A** = a meta-analysis or classroom trial tests the statement itself; **B** = consistent controlled studies in narrower conditions; **C** = design inference from component evidence. A C rule is a reasoned default, not a finding. Say so when you explain a design choice to a learner or an author.

## Rules

| # | Rule | Rating |
| --- | --- | --- |
| R1 | Study the worked example first, then let the learner perform the steps. Remove support from the last step backwards as the learner succeeds. Do not force a novice to solve before seeing an example. | A for the sequence; C for where the fade starts |
| R2 | Every practice item ends with feedback that names the error and how to repair it. Never restart without it. | A |
| R3 | An ordered procedure keeps its step order on every retry. A retry redraws the variable data from a seed, recomputes every answer, and is discarded if it breaks a constraint or changes the decision branch. | C |
| R4 | A declarative quiz shuffles questions and options on every run. | B |
| R5 | Text that is not an answer (malformed number, missing unit, unreadable formula) is never counted as an error and never triggers a restart. A timeout is not a wrong answer. | C |
| R6 | Mix exercise types that are easy to confuse, after each has been practised alone. Do not mix vocabulary-like items. | A in mathematics; B elsewhere |
| R7 | Prefer recall to recognition: typed or constructed answers over picking, where the content allows. | A |
| R8 | Ask the learner to redo each exercise without looking and offer a later review. Suggest gaps from the date the knowledge is needed; a longer gap costs less than one that is too short. Never present a fixed calendar as optimal. | B |
| R9 | A hint on the first error, the worked step on the second. | C |
| R10 | Record assisted and independent answers separately. Report time to criterion, retention after 7 and 30 days, and transfer as three separate numbers. | C |
| R11 | A simulation states its model, valid range and units, and asks for a prediction before the learner moves a control. | B |
| R12 | A keyword mnemonic for vocabulary is used only together with repeated retrieval. | B, laboratory |

## Restart on error

All four policies stay available and visible: full restart, failed step with new numbers, last checkpoint plus the worked step, and full restart after N errors. No study ranks them; every rating is C.

Approved defaults:

- Procedures: preset `research-hybrid` (hint, then the worked step with a twin of that step, then return to the checkpoint with new numbers). `strict-kelme` (full restart with new numbers) is offered on the start screen and must never be removed or hidden.
- Declarative quizzes: full restart with a new order for short quizzes (up to about 10 items); re-queue the failed item beyond that.
- A procedural retry changes numbers only, until the lesson author declares context variants that keep the method and the table lookups.

State of the harness on 2026-11-19: the procedure default and the numbers-only default are what `rules/presets/research-hybrid.json` and `rules/catalogue.json` already do. The length-dependent quiz default is approved but not built: `research-hybrid` re-queues the failed item at any length, and the full restart of a quiz is the `fgv-style-quiz` preset. Until the router chooses by length, pick the preset by hand and say so.

Explain the trade-off when a learner or author chooses: a full restart repeats the early steps most and costs more as the chain grows; a step-level retry repeats only what failed.

## Gamification

Include: visible progress and a real completion state; the restart modes with new data or a new order; marks that separate independent from assisted completion; a story only when it carries the content; optional timers.

Avoid: rankings and competition against other learners (B: lowers the effect in single-player settings); points for speed as a default (C: reported as a problem by students and teachers, not a measured harm); rewards unrelated to the task and streaks that punish a missed day (C: inferred from the reward literature); a timeout treated as an error; decorative animation.

## Never promise

- An effect size for a lesson built with this harness.
- That the product teaches better than the FGV reference object. Only feature and usability differences are tested.
- That a restart rule, a hint ladder or a review schedule is optimal.
- That content drafted from a short brief is correct: unverified claims are flagged, not validated.
- Bloom's "2 sigma", learning styles, or any fixed review calendar.

## Numbers that may be quoted, with their conditions

Quote a number only with its comparison and population. Gamification against the same instruction without it: cognitive g about 0.4 to 0.5, and 0.42 in rigorous designs, where the motivation and behaviour effects are not significant (Sailer & Homner 2020). Worked examples in mathematics: g = 0.48 pooled over all levels, which is not the expected gain of this pipeline (Barbieri 2023). Tutoring systems: 0.42 against teacher-led large-group instruction (Ma 2014), a median of 0.66 against conventional classes (Kulik & Fletcher 2016), 0.76 against no tutoring (VanLehn 2011), and 0.01 to 0.09 on standardized K-12 mathematics in one meta-analysis (Steenbergen-Hu 2013). Retrieval practice: restudy 42% against testing 56% after one week in Roediger & Karpicke 2006, Experiment 1, with restudy ahead at 5 minutes.
