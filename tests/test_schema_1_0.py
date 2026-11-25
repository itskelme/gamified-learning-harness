"""Schema 1.0 and its migrations (ACCEPTANCE line 22; card t_fd19236f "Schema and state").

Both migrations run on real lessons: v0.1 -> 1.0 on examples/stem.lesson.json and examples/humanities.lesson.json,
pilot 0.2.0 -> 1.0 on lessons/prova3-statistics.lesson.json. The native 1.0 lessons validate unchanged. Unknown
versions are refused, migration keeps the content version (revision) and any content change moves the digest.
"""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('lesson_contract', ROOT / 'scripts/lesson_contract.py')
lc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lc)
read = lambda p: json.loads((ROOT / p).read_text(encoding='utf-8'))
V01 = ['examples/stem.lesson.json', 'examples/humanities.lesson.json']
PILOT = 'lessons/prova3-statistics.lesson.json'
NATIVE = ['lessons/humanities-decisions.lesson.json', 'lessons/teste-z-uma-media.lesson.json']


class MigrationTests(unittest.TestCase):
    def test_v01_lessons_migrate_and_validate_with_content_kept(self):
        for path in V01:
            with self.subTest(path=path):
                old = read(path)
                new = lc.validate_1_0(lc.to_1_0(old))
                self.assertEqual((new['schema_version'], new['kind']), ('1.0', 'slides-practice'))
                self.assertEqual(new['migrated_from'], {'schema': 'lesson', 'version': '0.1'})
                self.assertEqual(new['revision'], old['revision'], 'migration keeps the content version')
                self.assertEqual(new['slides'], old['slides'])
                self.assertEqual(new['exercises'], old['exercises'])
                self.assertEqual([o['text'] for o in new['objectives']], old['objectives'])
                self.assertEqual(new['restart']['default_policy'], old['restart_policy'])
                self.assertNotIn('restart_policy', new)

    def test_pilot_0_2_0_migrates_and_validates_with_exercises_byte_identical(self):
        old = read(PILOT)
        new = lc.validate_1_0(lc.to_1_0(old))
        self.assertEqual((new['schema_version'], new['kind']), ('1.0', 'ordered-procedure'))
        self.assertEqual(new['migrated_from'], {'schema': 'ordered-procedure', 'version': '0.2.0'})
        self.assertNotIn('format', new)
        self.assertNotIn('format_version', new)
        self.assertEqual(new['revision'], old['revision'])
        for k in ['exercises', 'conventions', 'carry_paths', 'methods', 'decision_map', 'source_notes', 'restart', 'locale']:
            self.assertEqual(json.dumps(new[k], sort_keys=True), json.dumps(old[k], sort_keys=True), k)
        self.assertEqual([o['text'] for o in new['objectives']], old['objectives'])
        self.assertTrue(all(s['status'] == 'supplied-material' and len(s['sha256']) == 64 for s in new['sources']))

    def test_native_1_0_lessons_validate_and_migration_is_idempotent(self):
        for path in NATIVE:
            with self.subTest(path=path):
                lesson = read(path)
                self.assertEqual(lc.to_1_0(lesson), lesson)
                lc.validate_1_0(lesson)
        for path in V01 + [PILOT]:
            once = lc.to_1_0(read(path))
            self.assertEqual(lc.to_1_0(once), once, path)

    def test_unknown_versions_are_refused_with_the_known_list(self):
        for bad in [{'schema_version': '0.2'}, {'schema_version': '2.0'}, {'format': 'ordered-procedure', 'format_version': '0.3.0'}, {}]:
            with self.subTest(bad=bad), self.assertRaisesRegex(lc.ContractError, 'known: 0.1, ordered-procedure 0.2.0, 1.0'):
                lc.to_1_0(bad)

    def test_content_version_change_is_explicit_in_the_digest(self):
        lesson = read(NATIVE[0])
        d = lc.content_digest(lesson)
        self.assertEqual(d, lc.content_digest(json.loads(json.dumps(lesson))), 'digest ignores serialisation')
        edited = copy.deepcopy(lesson)
        edited['study']['sections'][0]['paragraphs'][0] += ' '
        self.assertNotEqual(lc.content_digest(edited), d, 'any content edit moves the digest')
        bumped = copy.deepcopy(lesson)
        bumped['revision'] += 1
        self.assertNotEqual(lc.content_digest(bumped), d, 'a revision bump moves the digest')
        self.assertEqual(lc.to_1_0(bumped)['revision'], lesson['revision'] + 1)

    def test_semantic_cross_references_are_checked(self):
        base = read(NATIVE[0])
        cases = [
            (lambda l: l['practice']['units'][0]['items'][0].__setitem__('claim_ids', ['c-nao-existe']), 'unknown claim c-nao-existe'),
            (lambda l: l['practice']['units'][0]['items'][0].__setitem__('claim_ids', []), 'needs claim_ids'),
            (lambda l: l['objectives'][0].pop('verb'), 'needs a verb for routing'),
            (lambda l: l['claims'][0].__setitem__('source_ids', ['s-nao-existe']), 'unknown source s-nao-existe'),
            (lambda l: l['claims'][0].__setitem__('status', 'unverified'), 'unverified claims outside a shallow brief'),
            (lambda l: l['sources'].append(dict(l['sources'][0])), 'duplicate source id'),
            (lambda l: l['sources'].append({'id': 'x', 'status': 'supplied-material'}), "'path' is a required property"),
        ]
        for edit, msg in cases:
            with self.subTest(msg=msg):
                lesson = copy.deepcopy(base)
                edit(lesson)
                with self.assertRaisesRegex(lc.ContractError, msg):
                    lc.validate_1_0(lesson)

    def test_cli_normalize(self):
        ok = subprocess.run([sys.executable, '-I', str(ROOT / 'scripts/harness.py'), 'normalize', str(ROOT / PILOT)], capture_output=True, text=True, encoding='utf-8')
        self.assertEqual(ok.returncode, 0, ok.stderr)
        out = json.loads(ok.stdout)
        self.assertEqual(out['lesson']['kind'], 'ordered-procedure')
        self.assertEqual(out['content_digest'], lc.content_digest(out['lesson']))
        bad = ROOT / 'build' / 'tmp-unknown-version.json'
        bad.parent.mkdir(exist_ok=True)
        bad.write_text(json.dumps({'schema_version': '9.9'}))
        try:
            r = subprocess.run([sys.executable, '-I', str(ROOT / 'scripts/harness.py'), 'normalize', str(bad)], capture_output=True, text=True, encoding='utf-8')
        finally:
            bad.unlink()
        self.assertEqual(r.returncode, 1)
        self.assertIn('Unsupported lesson version', r.stderr)


if __name__ == '__main__':
    unittest.main()
