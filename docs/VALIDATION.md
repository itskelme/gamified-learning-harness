# Checkpoint validation

Measured versions and results are in `history/validation.json`. The local environment was installed from the committed npm lockfile and pinned Python schema validator; a Python transitive lock is also included.

Eight Python tests passed: independent arithmetic consistency, missing-choice-answer rejection, duplicate-step rejection, invalid tolerance rejection, explicit after-N threshold, non-finite numeric rejection, deterministic complete example generation and protection against closing the embedded JSON script tag with lesson text.

The browser smoke test passed in Chromium 153.0.8010.12. It exercised the full/failed-step/checkpoint/after-N restart transitions, slide navigation, hints, completion and reload persistence, progress export/import and incompatible-content rejection, numeric malformed input and decimal comma/point handling, STEM completion and a 390-pixel viewport without horizontal overflow. No browser JavaScript errors were observed. See `history/qa/browser-smoke.json`.

The desktop slide and mobile practice screenshots were visually inspected and are retained under `history/qa/`. This is a basic readability/layout check, not a complete accessibility audit or final product design approval.

A fresh REA production-stdio doctor passed from this repository's installed dependency: 207 expected tools observed, matching version 6.7.0 and catalog identity, plus a successful target-free request. See `history/qa/rea-mcp-doctor.json`. Native engines were not installed or tested.

Both draft domain skill entrypoints passed the skill creator's frontmatter/naming validation. This verifies their packaging, not the correctness or effectiveness of the future pedagogical recommendations.

The source artifact manifest was checked for matching SHA-256 digests, blocked credential/state filenames and common credential patterns. Source exports are scoped to this workstream. The migration does not claim a full forensic export of the machine.

Not executed here: TeX container build, final PDF compilation/visual inspection, native REA analysis engines, complete accessibility/offline evaluation, new-machine end-to-end final product validation, and educational efficacy testing. These are explicitly part of the construction plan.
