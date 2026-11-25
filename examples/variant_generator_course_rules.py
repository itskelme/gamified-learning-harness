#!/usr/bin/env python3
"""Course-rule demo of the data-only variant generator for ordered procedures (ADDENDUM-3).

Derived from the captured research export research/outputs/C-tools/variant_generator_demo.py, which stays
byte for byte as recorded in history/artifact-manifest.json. This copy encodes the Prova 3 course rules
(sigma-known decision map, df table constraint) and is guarded by tests/test_course_rules.py.

One structured solution (single source of truth) holds: statement_template, variables with
constraints, ordered steps computed FROM the variables, branch signature, and a variant_seed.
A variant is accepted only if every constraint holds AND its decision-map branch equals the
branch declared by the template. Otherwise it is discarded and regenerated (never shown).

Scope: confidence interval for a mean, sigma unknown (t branch) as a stand-in for the
Prova 3 exercise type. This is a demonstration of the mechanism, not a product component.
Stdlib only. The t quantile is computed numerically (no table typed from memory).

Course rules encoded here (from the instructor's material, example-output.pdf p.5 and her t-table
excerpt, as checked in t_d16b6d81 section 5, D1):
  - The decision map chooses Z vs t ONLY by whether the population sigma is known
    ("sigma known -> Z; only s -> t"). There is NO sample-size threshold (no "n < 30" rule).
    The branch is therefore read from the statement keywords, and a numbers-only variant cannot flip it.
    Demo limitation: decision_map parses English keywords only and fails closed (ValueError) on any
    other wording. The real generator must parse the instructor's pt-BR keywords.
  - The numeric constraint is the TABLE: degrees of freedom must be a row of her excerpt,
    df in {10, 12, 15, 16, 19, 20, 30}, i.e. n in {11, 13, 16, 17, 20, 21, 31} for one sample.
  - Rule for any new course: derive branch_rule and the table constraint from that instructor's
    material, never from a generic textbook rule.
Not verified here: which confidence-level columns her table excerpt has (90/95/99 below is an assumption).

Usage: python3 -I examples/variant_generator_course_rules.py [seed ...]
"""
import math
import random
import sys

TABLE_ROWS_DF = {10, 12, 15, 16, 19, 20, 30}  # instructor's t-table excerpt (Prova 3 material)


def decision_map(statement):
    """Instructor's map: population sigma known -> Z; only s given (sigma unknown) -> t. No n threshold."""
    text = statement.lower()
    if "population standard deviation is unknown" in text or "sigma is unknown" in text:
        return "t"
    if "population standard deviation is" in text and "known" in text:
        return "z"
    raise ValueError("statement does not say whether the population sigma is known")


TEMPLATE = {
    "id": "ci_mean_sigma_unknown",
    "statement_template": (
        "A sample of n = {n} {unit_plural} has mean {xbar} {unit} and sample standard deviation {s} {unit}; "
        "the population standard deviation is unknown. "
        "Build a {conf_pct}% confidence interval for the population mean."
    ),
    "variables": {
        "n": {"type": "choice", "values": [11, 13, 16, 17, 20, 21, 31]},  # df = n - 1 in TABLE_ROWS_DF
        "xbar": {"type": "float", "min": 20.0, "max": 80.0, "round": 1},
        "s": {"type": "float", "min": 2.0, "max": 12.0, "round": 1},
        "conf_pct": {"type": "choice", "values": [90, 95, 99]},
        "unit": {"type": "choice", "values": ["kg"]},
        "unit_plural": {"type": "choice", "values": ["boxes"]},
    },
    # Branch the learner is expected to take. The instructor's decision map picks it by whether the
    # population sigma is known, which is stated in the text (keywords), not by n.
    "branch": "t",
    "branch_rule": lambda v, statement: decision_map(statement),
    # table excerpt available to the learner (degrees-of-freedom rows on her sheet)
    "table_rows_df": TABLE_ROWS_DF,
    "steps": [
        ("separate_data", lambda v, a: {"n": v["n"], "xbar": v["xbar"], "s": v["s"], "conf": v["conf_pct"]}),
        ("choose_formula", lambda v, a: "t interval (population sigma unknown, only s given)"),
        ("df", lambda v, a: v["n"] - 1),
        ("t_critical", lambda v, a: round(t_quantile(1 - (1 - v["conf_pct"] / 100) / 2, v["n"] - 1), 3)),
        ("std_error", lambda v, a: round(v["s"] / math.sqrt(v["n"]), 4)),
        ("margin", lambda v, a: round(a["t_critical"] * a["std_error"], 4)),
        ("interval", lambda v, a: (round(v["xbar"] - a["margin"], 2), round(v["xbar"] + a["margin"], 2))),
    ],
}


def t_cdf(x, df):
    """CDF of Student t via Simpson integration of the pdf from 0 to |x| (symmetric)."""
    c = math.exp(math.lgamma((df + 1) / 2) - math.lgamma(df / 2)) / math.sqrt(df * math.pi)

    def pdf(u):
        return c * (1 + u * u / df) ** (-(df + 1) / 2)

    steps = 2000
    h = abs(x) / steps
    total = pdf(0) + pdf(abs(x))
    for i in range(1, steps):
        total += pdf(i * h) * (4 if i % 2 else 2)
    area = total * h / 3
    return 0.5 + math.copysign(area, x)


def t_quantile(p, df):
    lo, hi = 0.0, 100.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if t_cdf(mid, df) < p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def draw(template, rng):
    out = {}
    for name, spec in template["variables"].items():
        if spec["type"] == "int":
            out[name] = rng.randint(spec["min"], spec["max"])
        elif spec["type"] == "float":
            out[name] = round(rng.uniform(spec["min"], spec["max"]), spec["round"])
        else:
            out[name] = rng.choice(spec["values"])
    return out


def check_constraints(template, v, statement=None):
    problems = []
    if statement is None:
        statement = template["statement_template"].format(**v)
    if v["s"] <= 0:
        problems.append("s must be positive")
    if (v["n"] - 1) not in template["table_rows_df"]:
        problems.append("df not in the table excerpt")
    if template["branch_rule"](v, statement) != template["branch"]:
        problems.append("variant flips the decision-map branch")
    return problems


def solve(template, v):
    answers = {}
    for name, fn in template["steps"]:
        answers[name] = fn(v, answers)
    return answers


def make_variant(template, seed, max_tries=200):
    rng = random.Random(seed)
    discarded = 0
    for _ in range(max_tries):
        v = draw(template, rng)
        problems = check_constraints(template, v)
        if problems:
            discarded += 1
            continue
        ans = solve(template, v)
        lo, hi = ans["interval"]
        if not (lo < v["xbar"] < hi):
            discarded += 1
            continue
        return {"variant_seed": seed, "variables": v, "statement": template["statement_template"].format(**v),
                "answer_key": ans, "discarded_before_accept": discarded}
    raise RuntimeError("no valid variant found")


def self_check():
    # the numeric quantile must reproduce the instructor's printed table row at 95% (3 decimals)
    printed = {10: 2.228, 12: 2.179, 15: 2.131, 16: 2.120, 19: 2.093, 20: 2.086, 30: 2.042}
    for df, val in printed.items():
        assert abs(t_quantile(0.975, df) - val) < 0.0006, (df, t_quantile(0.975, df), val)
    base = {"xbar": 50.0, "s": 5.0, "conf_pct": 95, "unit": "kg", "unit_plural": "boxes"}
    # n = 31 (df = 30) is a row of her table, so it must be ACCEPTED: no n < 30 rule exists
    assert check_constraints(TEMPLATE, dict(base, n=31)) == []
    # n = 30 (df = 29) is rejected only because df 29 is not a row of the excerpt
    assert check_constraints(TEMPLATE, dict(base, n=30)) == ["df not in the table excerpt"]
    # n = 40 is rejected for the same reason (table row), not because of a branch
    assert check_constraints(TEMPLATE, dict(base, n=40)) == ["df not in the table excerpt"]
    # a statement whose keywords say sigma is KNOWN flips the branch to Z and is rejected
    known = "The population standard deviation is known. Build a 95% confidence interval."
    assert decision_map(known) == "z"
    assert "variant flips the decision-map branch" in check_constraints(TEMPLATE, dict(base, n=16), known)
    # reproducibility: same seed, same variant
    assert make_variant(TEMPLATE, 7) == make_variant(TEMPLATE, 7)
    print("self_check OK: t quantile matches her table row (df 10..30); n=31 accepted; "
          "n=30 and n=40 rejected by the table constraint; sigma-known text flips the branch; seed reproducible")


if __name__ == "__main__":
    self_check()
    for s in (int(a) for a in sys.argv[1:]) or (1, 2, 3):
        var = make_variant(TEMPLATE, s)
        print(f"\nseed {s}: {var['statement']}")
        for k, val in var["answer_key"].items():
            print(f"  {k}: {val}")
        print(f"  (discarded before accept: {var['discarded_before_accept']})")
