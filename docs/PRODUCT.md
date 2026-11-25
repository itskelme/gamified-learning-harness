# Product contract and FGV comparison

## Scope

Deliver two domain skills and their shared, documented harness:

- Programming and exact sciences: programming, math, physics, chemistry, statistics, engineering and quantitative finance.
- Humanities and conceptual domains: history, languages, administration, law, marketing and related declarative or conceptual learning.

Both route through one lesson representation and three learning artifacts: beginner-friendly worked PDF, participatory step practice, rich slides plus practice. The original didactic PDF skill is a supplied asset, not a replacement target. Deliverable instructions stay in en-US; lesson output follows the learner's language and notation.

The latest founder instruction is stronger than the older phrase “as rich as FGV”: the final product must be **better than the FGV object shown**, and the output must be the skill set and documented harness. Do not confuse a plan or prototype with that finished product.

## What “better” must mean

The FGV baseline below is from static analysis of the shipped scripts (REA 6.7.0 plus direct reading), not from a runtime observation. Read `research/outputs/fgv-mechanics-matrix.md`, which corrects the inherited notes in `research/outputs/fgv-reverse-engineering.md`.

| Dimension | Captured FGV baseline | Required improvement | Acceptance evidence |
| --- | --- | --- | --- |
| Material | Literature gallery and quiz | Real learner exercise lists and course material; both domains | Two end-to-end cases from supplied and new fixtures |
| Consistency | Packed content embedded in a page | One validated lesson representation drives all artifacts | Same IDs, numbers, units, source citations and interpretations across outputs |
| Participation | Five-option quiz | Learner performs each meaningful solution step; conceptual cases demand reasoning | Wrong-formula, wrong-unit and misconception fixtures |
| Teaching | Ten slides with brief captions in this object | Concept-focused slides, purposeful diagrams and recall prompts | Slide review and keyboard/screen reader QA |
| Restart | Wrong answer or timeout resets the game | Retain full restart; compare failed-step, checkpoint and after-N-errors modes | Observable transition tests for all modes and an explicit recommended default |
| Repetition | Question and answer order reshuffled | Shuffle declarative questions and answers. For ordered procedures, retry with validated variable data that preserves the meaning and the step order. | Reproducible seeds, recomputed answer keys and checks for the same decision branch |
| Guidance | None reachable: three lifeline handlers exist in the code but nothing wires them in this build (static finding) | Evidence-informed hint ladder, worked examples, faded support and expertise-sensitive guidance | Novice/expert fixtures with reported rationale |
| Persistence | None: no storage access in first-party scripts; the game loops after a win | Local progress, exact lesson version, export/import and explicit migration | Round-trip tests and incompatible-version rejection |
| Feedback | A fixed restart message; the correct answer is not revealed and nothing is explained | Explain the misconception and how to repair it | Content review and wrong-answer walkthrough |
| Time pressure | 60 seconds per question in the capture; a timeout restarts the game like a wrong answer | Optional timers that never block accessible untimed use | Timed/untimed keyboard walkthrough |
| Access | Legacy web object | Responsive HTML, keyboard operation, visible focus, reduced motion and contrast | Accessibility audit, mobile viewport and offline test |
| Effectiveness | Not measured here | Report time-to-criterion, delayed retention and transfer separately | Pilot protocol and observed results; no unsupported superiority claim |
| Delivery | Website object | Reusable skills, source, schema, commands, PDF, HTML and evidence manifests | Fresh-machine setup and reproducible output build |

## Product constraints

Restart-on-error is a strong user preference. Keep it available and visible. Do not silently replace it with a softer mode; make the recommendation explicit and label evidence vs design inference. Avoid punitive restarts for malformed input or accessibility interactions.

For ordered procedures like the Prova 3 statistics exercise, prefer a retry with fresh numbers. Preserve the statement's meaning, the algorithm and the learning objective. Names, units and context may vary only when the method and required table lookups stay valid. Present a variant that changes the decision branch as a separate case, or reject it before delivery. See [Addendum 3](../research/ADDENDUM-3-fixed-procedures-and-repo.md).

No forced account, analytics endpoint or cloud database is needed for the initial local product. Start with files and local storage. The final exercises and simulation components need correctness oracles; a visually attractive slider with no valid model does not satisfy the simulation requirement.

The evidence work must not promise that a fixed review calendar, point streaks or a chosen restart policy is scientifically optimal. “Fastest” is a measurable objective under specified retention and transfer conditions, not a universal marketing claim.
