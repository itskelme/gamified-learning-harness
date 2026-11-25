import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('harness',ROOT/'scripts/harness.py')
h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)

class LessonContractTests(unittest.TestCase):
    def setUp(self):self.lesson=json.loads((ROOT/'examples/stem.lesson.json').read_text(encoding='utf-8'))
    def test_original_arithmetic_is_independently_consistent(self):
        lesson=h.validate(self.lesson)
        se=16/(64**0.5);margin=1.96*se;steps=lesson['exercises'][0]['steps']
        self.assertEqual([s['answer'] for s in steps],[se,margin,100-margin])
    def test_cannot_accept_answer_missing_from_options(self):
        lesson=json.loads((ROOT/'examples/humanities.lesson.json').read_text(encoding='utf-8'))
        lesson['exercises'][0]['steps'][0]['answer']='Missing option'
        with self.assertRaisesRegex(ValueError,'not an option'):h.validate(lesson)
    def test_rejects_duplicate_step_identity(self):
        self.lesson['exercises'][0]['steps'][1]['id']=self.lesson['exercises'][0]['steps'][0]['id']
        with self.assertRaisesRegex(ValueError,'Duplicate'):h.validate(self.lesson)
    def test_rejects_invalid_numeric_tolerance(self):
        self.lesson['exercises'][0]['steps'][0]['tolerance']=-1
        with self.assertRaises(ValueError):h.validate(self.lesson)
    def test_after_n_policy_requires_explicit_threshold(self):
        self.lesson['restart_policy']='after-n-errors'
        with self.assertRaisesRegex(ValueError,'restart_after_errors'):h.validate(self.lesson)
    def test_serialized_script_payload_cannot_close_script_tag(self):
        self.lesson['title']='</script><script>alert(1)</script>'
        with tempfile.TemporaryDirectory() as d:
            source=Path(d)/'input.json';source.write_text(json.dumps(self.lesson))
            output=h.build(source,Path(d)/'out').read_text(encoding='utf-8')
            self.assertNotIn('</script><script>alert',output)
            self.assertIn('\\u003c/script\\u003e',output)
    def test_example_builds_are_complete_and_deterministic(self):
        for example in (ROOT/'examples').glob('*.lesson.json'):
            with self.subTest(example=example),tempfile.TemporaryDirectory() as d:
                first=h.build(example,Path(d));data=first.read_bytes()
                self.assertNotIn(b'__LESSON_',data)
                second=h.build(example,Path(d));self.assertEqual(data,second.read_bytes())
    def test_rejects_nonfinite_numbers(self):
        self.lesson['exercises'][0]['steps'][0]['answer']=float('inf')
        with self.assertRaisesRegex(ValueError,'finite'):h.validate(self.lesson)

if __name__=='__main__':unittest.main()
