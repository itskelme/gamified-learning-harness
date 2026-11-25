# Lesson schema 1.0

One lesson representation feeds every artifact: the study PDF, the LaTeX source, the offline package, the slides
and (for procedures) the step player. Schema: `schemas/lesson-1.0.schema.json`. Migrations, validation and the
content digest: `scripts/lesson_contract.py`, also on the command line as `python3 scripts/harness.py normalize <file>`.

## Envelope (every kind)

`schema_version` "1.0", `kind`, `id`, `revision` (content version, integer from 1), `title`, `language`, `locale`,
`domain`, `objectives[]` (`id`, `text`, optional `verb` for routing), `sources[]` (`id`, `status`: `verified`,
`unverified`, `author-created-example` or `supplied-material`; supplied material is pinned by `path` and `sha256`).
Optional: `claims[]`, `restart`, `brief`, `migrated_from`.

`claims[]` tie the text to the sources: `status` is `sourced` (one or more `source_ids`), `author-example` (an
example written for the lesson, tied to that example's source) or `unverified`. Unverified claims are accepted only
inside a shallow-brief draft (a lesson with a `brief` block); anywhere else the contract refuses them.

## Kinds

| Kind | Body | Example |
| --- | --- | --- |
| `ordered-procedure` | `exercises[]` in the step-engine contract (variables, constraints, steps with roles, templates), `conventions`, `carry_paths`, `methods`, `decision_map`, `restart` | `lessons/prova3-statistics.lesson.json` (migrated), `lessons/teste-z-uma-media.lesson.json` (native) |
| `declarative-case` | `claims`, `study` (intro, sections with claim ids and recall prompts, glossary entries with optional claim ids, summary), `practice.units[]` whose items are authored in each format's payload contract and carry `claim_ids` | `lessons/humanities-decisions.lesson.json`, every shallow-brief draft |
| `slides-practice` | `slides[]` (body plus recall prompt), simple `exercises[]` (steps with worked solutions), `restart` | `examples/*.lesson.json` (migrated from 0.1) |

Cross-reference checks the JSON Schema cannot express (unknown claim, source or objective ids, duplicate ids,
practice items without claims, objectives without a routing verb, `after-n-errors` without its count) run in
`semantic_problems()`.

## Migrations

| From | To | What changes |
| --- | --- | --- |
| schema 0.1 (`schemas/lesson.schema.json`) | `slides-practice` | validated against 0.1 first; objectives become `{id, text}`; `restart_policy` / `restart_after_errors` move into `restart`; empty URLs dropped |
| ordered-procedure 0.2.0 (the pilot file) | `ordered-procedure` | `format` / `format_version` dropped; objectives become `{id, text}`; sources get `status` (`supplied-material` by default); exercise bodies kept byte for byte |
| 1.0 | 1.0 | unchanged (idempotent) |
| anything else | refused | "Unsupported lesson version '0.3'; known: 0.1, ordered-procedure 0.2.0, 1.0. Add an explicit migration instead of guessing." |

Every migrated lesson records `migrated_from`. The engine validates the migrated Prova 3, and every answer for the
original data and 25 seeds is unchanged (`tests/contract/schema-1.0.test.js`). Python tests: `tests/test_schema_1_0.py`.

## Content version changes

`revision` is the content version. It is never changed by a migration; an author raises it with any content edit
(Prova 3 went from 2 to 3 with the copy fixes; teste-z-uma-media from 1 to 2 with the wording change). The content
digest is the SHA-256 of the canonical 1.0 JSON (sorted keys), so any edit changes it even if the revision is not
raised. Saved progress records both: the package page refuses a progress file for another digest, and names the
revision when it differs ("este arquivo é da revisão N do conteúdo; esta página é a revisão M"). The pilot keys
its saved state on the lesson digest the same way.

## Shallow-brief block

`brief`: `provider` (id), `request`, `assumptions[]` (never empty) and `unverified_claims[]` (the text of every
unverified claim). See `docs/AUTHORING.md`.
