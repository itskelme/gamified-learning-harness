"""Course-rule checks for the Prova 3 variant generator demo."""
import json
import pathlib
import subprocess
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEMO = ROOT / "examples" / "variant_generator_course_rules.py"


class CourseRuleTests(unittest.TestCase):
    def test_architecture_states_the_sigma_known_rule_and_table_rows(self):
        text = (ROOT / "docs" / "ARCHITECTURE.md").read_text(encoding="utf-8")
        self.assertNotIn("sample-size cutoff", text)
        self.assertIn("no sample-size threshold", text)
        self.assertIn("{10, 12, 15, 16, 19, 20, 30}", text)
        self.assertIn("examples/variant_generator_course_rules.py", text)

    def test_generator_demo_has_no_n_below_30_branch_and_passes_its_self_check(self):
        src = DEMO.read_text(encoding="utf-8")
        self.assertNotIn('v["n"] < 30', src)
        self.assertIn("TABLE_ROWS_DF = {10, 12, 15, 16, 19, 20, 30}", src)
        run = subprocess.run([sys.executable, "-I", str(DEMO)], capture_output=True, text=True, timeout=60)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn("n=31 accepted", run.stdout)



if __name__ == "__main__":
    unittest.main()
