"""Lesson schema 1.0: migrations from earlier lesson files, validation and the content digest.

Known inputs (docs/SCHEMA.md):
- schema 0.1 (examples/*.lesson.json, schemas/lesson.schema.json)      -> kind "slides-practice"
- ordered-procedure 0.2.0 (lessons/prova3-statistics.lesson.json)       -> kind "ordered-procedure"
- schema 1.0 (lessons/humanities-decisions.lesson.json, ...)            -> unchanged (idempotent)
Anything else is refused with the list of known versions: a version change is never guessed.

`revision` is the content version. Migration never changes it, and the content digest (sha256 of the canonical
1.0 JSON) changes with any content edit, so saved progress for another revision or digest is refused by the players.
"""
import copy
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_1_0 = ROOT / 'schemas/lesson-1.0.schema.json'
POLICIES = ['full', 'failed-step', 'checkpoint', 'after-n-errors']
KNOWN = ['0.1', 'ordered-procedure 0.2.0', '1.0']


class ContractError(ValueError):
    pass


def detect(lesson):
    """'1.0', '0.1' or 'ordered-procedure 0.2.0'; ContractError for anything else."""
    if not isinstance(lesson, dict):
        raise ContractError('A lesson file must hold a JSON object.')
    if lesson.get('schema_version') == '1.0':
        return '1.0'
    if lesson.get('schema_version') == '0.1':
        return '0.1'
    if lesson.get('format') == 'ordered-procedure' and lesson.get('format_version') == '0.2.0':
        return 'ordered-procedure 0.2.0'
    found = lesson.get('schema_version') or (f"{lesson.get('format')} {lesson.get('format_version')}" if lesson.get('format') else 'none')
    raise ContractError(f'Unsupported lesson version {found!r}; known: {", ".join(KNOWN)}. Add an explicit migration instead of guessing.')


def _objectives(items):
    return [o if isinstance(o, dict) else {'id': f'o{i + 1}', 'text': o} for i, o in enumerate(items)]


def migrate_v01(lesson):
    """0.1 -> 1.0 (kind slides-practice). The 0.1 file is validated against its own schema first."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('harness_v01', ROOT / 'scripts/harness.py')
    assert spec and spec.loader
    h = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(h)
    h.validate(copy.deepcopy(lesson))
    old = copy.deepcopy(lesson)
    restart = {'default_policy': old.pop('restart_policy'), 'policies': list(POLICIES)}
    if 'restart_after_errors' in old:
        restart['after_n_errors'] = old.pop('restart_after_errors')
    out = {
        'schema_version': '1.0', 'kind': 'slides-practice', 'id': old['id'], 'revision': old['revision'], 'title': old['title'],
        'language': old['language'], 'locale': old['language'], 'domain': old['domain'],
        'objectives': _objectives(old['objectives']),
        'sources': [{k: v for k, v in s.items() if k != 'url' or v} for s in old['sources']],
        'slides': old['slides'], 'exercises': old['exercises'], 'restart': restart,
        'migrated_from': {'schema': 'lesson', 'version': '0.1'}
    }
    return out


def migrate_pilot(lesson):
    """ordered-procedure 0.2.0 -> 1.0 (kind ordered-procedure). Exercise bodies are kept byte for byte."""
    out = copy.deepcopy(lesson)
    out.pop('format')
    out.pop('format_version')
    out = {'schema_version': '1.0', 'kind': 'ordered-procedure', **out}
    out['objectives'] = _objectives(lesson['objectives'])
    out['sources'] = [{**s, 'status': s.get('status', 'supplied-material')} for s in lesson['sources']]
    out['migrated_from'] = {'schema': 'ordered-procedure', 'version': '0.2.0'}
    return out


def to_1_0(lesson):
    v = detect(lesson)
    if v == '1.0':
        return copy.deepcopy(lesson)
    if v == '0.1':
        return migrate_v01(lesson)
    return migrate_pilot(lesson)


def _dupes(ids):
    seen, out = set(), []
    for i in ids:
        if i in seen:
            out.append(i)
        seen.add(i)
    return out


def semantic_problems(lesson):
    """Cross-reference checks JSON Schema cannot express."""
    p = []
    for name, ids in [('objective', [o['id'] for o in lesson['objectives']]), ('source', [s['id'] for s in lesson['sources']]),
                      ('claim', [c['id'] for c in lesson.get('claims', [])])]:
        p += [f'duplicate {name} id {d}' for d in _dupes(ids)]
    sources = {s['id'] for s in lesson['sources']}
    claims = {c['id']: c for c in lesson.get('claims', [])}
    objectives = {o['id']: o for o in lesson['objectives']}
    for c in claims.values():
        p += [f'claim {c["id"]}: unknown source {s}' for s in c['source_ids'] if s not in sources]
    for s in lesson.get('study', {}).get('sections', []):
        p += [f'study section {s["id"]}: unknown claim {c}' for c in s.get('claim_ids', []) if c not in claims]
    for g in lesson.get('study', {}).get('glossary', []):
        p += [f'glossary "{g["term"]}": unknown claim {c}' for c in g.get('claim_ids', []) if c not in claims]
    item_ids = []
    for u in lesson.get('practice', {}).get('units', []):
        for o in u['objectives']:
            if o not in objectives:
                p.append(f'unit {u["id"]}: unknown objective {o}')
            elif 'verb' not in objectives[o]:
                p.append(f'unit {u["id"]}: objective {o} needs a verb for routing')
        for it in u['items']:
            item_ids.append(it['id'])
            p += [f'item {it["id"]}: unknown claim {c}' for c in it.get('claim_ids', []) if c not in claims]
            if not it.get('claim_ids'):
                p.append(f'item {it["id"]}: needs claim_ids (every practice item rests on a stated claim)')
    p += [f'duplicate practice item id {d}' for d in _dupes(item_ids)]
    if lesson['kind'] == 'declarative-case':
        unsourced = [c['id'] for c in claims.values() if c['status'] == 'unverified']
        if unsourced and 'brief' not in lesson:
            p.append(f'unverified claims outside a shallow brief: {", ".join(unsourced)}')
    restart = lesson.get('restart', {})
    if restart.get('default_policy') == 'after-n-errors' and 'after_n_errors' not in restart:
        p.append('restart: after-n-errors needs after_n_errors')
    return p


def validate_1_0(lesson):
    from jsonschema import Draft202012Validator
    schema = json.loads(SCHEMA_1_0.read_text(encoding='utf-8'))
    errors = sorted(Draft202012Validator(schema).iter_errors(lesson), key=lambda e: str(list(e.path)))
    if errors:
        raise ContractError('\n'.join('/'.join(map(str, e.path)) + ': ' + e.message for e in errors))
    problems = semantic_problems(lesson)
    if problems:
        raise ContractError('\n'.join(problems))
    return lesson


def load_json(path):
    def reject(value):
        raise ContractError('Non-finite JSON number: ' + value)
    return json.loads(Path(path).read_text(encoding='utf-8'), parse_constant=reject)


def normalize(path):
    """Load any known lesson file, migrate it to 1.0 and validate it. Returns the 1.0 lesson."""
    return validate_1_0(to_1_0(load_json(path)))


def canonical(lesson):
    return json.dumps(lesson, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def content_digest(lesson):
    return hashlib.sha256(canonical(lesson).encode('utf-8')).hexdigest()


def finite(x):
    return isinstance(x, (int, float)) and math.isfinite(x)
