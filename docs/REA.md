# REA continuation

The source host installed **rea-agents 6.7.0** and copied the REA instruction skill into Minerva's `teacher` profile. The main and teacher Hermes configurations received a narrowly scoped stdio entry, with backups retained on the source host. Those live configurations and credentials are not shipped.

`research/outputs/rea-mcp-doctor.json` records a fresh stdio handshake: healthy, 207 tools, six prompts, matching package/catalog identity and one successful target-free request. That is a runtime availability check. It is not a completed FGV analysis and does not establish that an already-running conversation refreshed its MCP catalog.

## Local commands

```bash
npm ci
npm run rea:doctor
python scripts/harness.py rea-fgv --max-heap-mb 512
```

On Windows the harness calls the `rea.cmd` shim that npm writes. The last command analyzes the supplied local JavaScript tree, records its exact command and writes evidence to `build/evidence/fgv-rea.json` plus stderr. This workstream needs static JavaScript first, so Ghidra, Hopper, JADX and native instrumentation are not prerequisites. Optional npm-native dependencies such as Frida may have platform-specific install steps; the validated static/MCP path does not require approving unrelated native instrumentation.

The checked-in FGV tree is a partial capture with both packed originals and unpacked files. Missing resources or parser limitations must appear as limitations. Do not infer an exhaustive site inventory from that local tree. Preserve input digests and inspect the returned findings before making claims.

For a narrower investigation, REA supports repeated `--source-path` selection relative to the analyzed root. Read `node_modules/.bin/rea analyze-javascript-application --help` for the installed version's exact schema. Do not blindly use flags or tool names from a newer skill or README.

## Questions to resolve

Answered from static evidence on 2026-11-19 in `research/outputs/fgv-mechanics-matrix.md` (questions 1 to 5 in its section 2, question 6 in its section 5). The list is kept as the record of what was asked.

1. The [static analysis](../research/outputs/fgv-reverse-engineering.md) shows that the queue contains all 20 questions, grouped by difficulty and shuffled within each group. How does the 15-rung score ladder behave on questions 16 through 20?
2. How are question difficulty buckets and answer shuffling used in this particular object?
3. Which transitions reset question index, timer, score and each lifeline?
4. Is timeout behavior the same as incorrect-answer behavior?
5. Which review/teacher-mode paths exist and when are they reachable?
6. Which mechanics should be retained, enhanced or rejected under the product and learning evidence?

Start from the inherited notes and the captured `onPlayGame`, `onFinish`, `onResetGame`, `onFinishTime` and shuffle routines. The reference's user-facing reset message and 60-second limit were identified in static code; label them as static findings until observed.

For any runtime browser scenario, scope the target and declared actions to the supplied FGV reference. Capture original evidence, avoid unrelated accounts and traffic, and distinguish passive observations from actions. Record browser version, artifact URLs, timestamps and what was actually exercised. REA is an analysis tool, not permission to invoke arbitrary page-declared tools.

## Stable deliverable

The final REA report must link claims to retained evidence and separate observed facts, inferred mechanics and unknowns. It should feed an original interaction specification. It must not transplant FGV code, content or artwork into the product.
