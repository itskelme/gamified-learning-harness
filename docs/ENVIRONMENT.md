# Reproducible local environment

## Required for the starter harness

Python 3.10+ with `environment/requirements.lock.txt`, Node.js 24.15+ and npm with the committed package lock. Source host validation used Python 3.12 and Node 26.7.0; see `history/validation.json` for the measured versions at handoff. Node 26 matches the installed REA runtime. The declared engine floor is a harness support choice; native REA SQLite inspection has its own Node requirements.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r environment/requirements.lock.txt
npm ci
python scripts/harness.py doctor
```

The Python top-level dependency and REA are pinned; npm transitive packages are locked, and `requirements.lock.txt` pins the tested Python transitive versions. Python packages and Debian repositories are not content-hash-locked, and the TeX base image uses a release tag. This is reproducible at the workflow/dependency-version level, not a promise of byte-identical OS rebuilds. Freeze an image digest and Python package hashes at release time.

On Windows use WSL for the exact shell workflow. With native Python activate `.venv\Scripts\Activate.ps1`; configure MCP with the actual Windows Node and repository paths.

Native Windows was checked on 2026-11-19 (Windows 11, Python 3.12.15, Node 24.21.0, Git Bash): snapshot verification, the Python suite, `node --test tests/core.test.js tests/pilot-engine.test.js tests/contract/*.test.js`, `npm run rea:doctor` and `python scripts/harness.py rea-fgv` pass. Three things make that work:

- `.gitattributes` turns off line-ending conversion (`* -text`). With `core.autocrlf=true` and no such file, Git rewrote 1,308 files to CRLF and every recorded digest failed. A clone made before that file existed needs one re-checkout: `git rm --cached -r -q . && git reset --hard` on a clean tree.
- The Python scripts read and write UTF-8 with LF explicitly, because the Windows default is cp1252.
- A venv on Windows has no `python3.exe`, so `python3` can resolve to another interpreter without `jsonschema`. Set `PYTHON` to the venv interpreter for the Node scripts and tests, for example `export PYTHON="$PWD/.venv/Scripts/python.exe"` in Git Bash, and call `python` instead of `python3` for the Python commands.

LaTeX on native Windows (installed 2026-11-19 with the founder's approval): `winget install MiKTeX.MiKTeX --scope user` (MiKTeX 25.12, pdfTeX 4.23, latexmk 4.89) and `winget install oschwartz10612.Poppler` (pdftotext, pdftoppm, pdfinfo). Then, once: `initexmf --set-config-value "[MPM]AutoInstall=1"` so missing packages install on first use, and `miktex packages update`. latexmk needs Perl; Git Bash provides it, so run the build from Git Bash with both `bin` folders on `PATH`:

```bash
export PATH="$LOCALAPPDATA/Programs/MiKTeX/miktex/bin/x64:$(ls -d "$LOCALAPPDATA"/Microsoft/WinGet/Packages/oschwartz10612.Poppler*/poppler-*/Library/bin):$PATH"
bash scripts/build-all-lessons.sh --latex-pdf
```

All five gate lessons compile this way. MiKTeX resolves packages itself, so the package-to-Debian map in `harness/latex.js` still describes the container only.

Not checked on native Windows: the bash mutation scripts and the older browser suites (`pilot-browser`, `package-browser`, `a11y-browser` carry their own Linux-only Chromium lookup; set `CHROMIUM_EXECUTABLE`). Static JavaScript analysis is the portable initial route; do not assume native-engine availability is identical across operating systems.

## Optional LaTeX environment

The Ubuntu 24.04 host was verified with TeX Live 2023 (pdfTeX 1.40.25), latexmk 4.83, and Latin Modern fonts. On Ubuntu or Debian, install the packages needed for the supplied and generated lessons:

```bash
sudo apt-get install --no-install-recommends latexmk texlive-latex-extra texlive-science \
  texlive-fonts-recommended texlive-lang-portuguese lmodern poppler-utils
node scripts/build-lesson.mjs lessons/prova3-statistics.lesson.json --latex-pdf
```

The build runs pdfLaTeX without shell escape, checks the extracted PDF text, and records the PDF hash in `lesson-build.json`. The supplied example was independently recompiled to the same 17 pages and extracted text as the reference.

The Docker recipe provides another way to compile a `.tex` file:

```bash
docker build -f environment/Dockerfile.tex -t gamified-learning-tex:local .
mkdir -p build/pdf
docker run --rm --network none --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" gamified-learning-tex:local \
  skills/didactic-worked-solutions/examples/example_worked_solutions.tex
```

The same command can compile `build/lessons/<id>/<id>.tex` by passing that path in place of the supplied example.

## Chromium (study PDFs and browser suites)

`playwright-core` 1.58.2 is a pinned devDependency (it used to arrive only through rea-agents). Its matching browser is
Chrome for Testing 145.0.7632.6 (revision 1208): `node_modules/.bin/playwright-core install chromium` downloads it
to `~/.cache/ms-playwright`. The build and test scripts take `CHROMIUM_EXECUTABLE` first, then `/usr/bin/google-chrome`,
`/usr/bin/chromium`, then the newest `~/.cache/ms-playwright/chromium-*` (`scripts/lib/chromium.mjs`). The source host
had only newer revisions (1234, 1243) cached; the version used for each PDF is recorded in its build manifest
(`outputs.pdf.browser`). Set `CHROMIUM_EXECUTABLE` to pin one.

## Memory

The source machine reported 7.7 GiB RAM and 4 GiB swap, with both under severe pressure during several concurrent agent/browser/MCP workloads. The kernel killed the gateway. An extra temporary 4 GiB swap file was enabled for recovery. It is not part of this repository and does not change your machine.

On the new machine, start one static REA analysis with `--max-heap-mb 512`. This bounds the source analyzer's V8 heap, not the entire Node/MCP process tree. The harness also applies a process timeout. Record limits alongside evidence and raise them only for incomplete analysis that actually needs more resources. A 16–32 GiB development machine is a practical planning suggestion, not a measured minimum or upstream requirement.

## Agent configuration

`environment/hermes-mcp.example.yaml` and `environment/mcp.example.json` are templates. They contain no active credentials and do not write to your user configuration. Merge only the REA entry into the client you use; preserve existing servers and approval settings. Restart/reconnect that client if its active tool catalog is stale. `npm run rea:doctor` tests a fresh REA stdio server, not proof that every running agent already has its tools.

Install `skills/didactic-worked-solutions`, `skills/gamified-stem-learning` and `skills/gamified-humanities-learning` into the chosen local skill directory, or point your agent directly at them. For REA instructions use the captured skill under `references/rea-skill/` with its provenance, or install the matching upstream version intentionally. The supplied draft domain skills resolve the project through `GAMIFIED_LEARNING_ROOT` or the repository directory; set that variable if you copy the folders outside the project.
