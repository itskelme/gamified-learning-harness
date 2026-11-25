#!/usr/bin/env python3
"""Independent numeric oracle for the Prova 3 pilot.

Independent of the JavaScript engine: the original data, the instructor tables and
the printed answer key are transcribed here directly from inputs/example-output.pdf,
and the formulas are re-implemented in Python. The lesson JSON expressions are NOT
used. Checks:

  A. oracle(original data) matches every value printed in the PDF, at the printed
     decimals (a 0,001 difference in a bound fails);
  B. the lesson's original variables and printed key equal this transcription, and
     each original statement occurs verbatim in the PDF text (pdftotext, if present);
  C. the engine answer key (build/prova3/answer-key.json) equals the oracle for the
     original data and for every exported seeded variant, and every variant keeps
     the original method, decision and interpretation;
  D. the instructor's critical values agree with exact quantiles to < 0.0006;
  E. printed chain: each printed intermediate recomputed from the PRINTED inputs; every
     disagreement found must be disclosed in the lesson's source_notes (with page).

Usage: python3 -I scripts/oracle_prova3.py [--lesson PATH] [--key PATH] [--out PATH]
Standard library only. Exit 1 on any failed check.
"""
import argparse
import json
import math
import re
import shutil
import subprocess
import sys
from pathlib import Path
from statistics import NormalDist

ROOT = Path(__file__).resolve().parents[1]

# --- transcribed from the PDF (page numbers of inputs/example-output.pdf) ---------
Z95 = 1.96                                                          # p.4
T_TABLE = {10: 2.228, 12: 2.179, 15: 2.131, 16: 2.120, 19: 2.093, 20: 2.086, 30: 2.042}  # p.4
ORIGINAL = {
    "ex1-ic-media-z": {"n": 64, "xbar": 72, "sigma": 8},                               # p.6
    "ex2-ic-media-t": {"n": 16, "xbar": 38.4, "s": 4.8},                               # p.8
    "ex3-ic-proporcao": {"n": 400, "x": 236},                                          # p.10
    "ex4-teste-z-duas-medias": {"n1": 50, "n2": 50, "x1": 84, "x2": 79, "sigma": 10},  # p.13
    "ex5-teste-t-conjunto": {"n1": 12, "n2": 10, "x1": 7.8, "x2": 6.5, "s1": 1.2, "s2": 1.0},  # p.15
}
PRINTED = {  # value printed in the PDF: (text, page)
    "ex1-ic-media-z": {"ep": ("1,000", 6), "E": ("1,960", 6), "lower": ("70,040", 6), "upper": ("73,960", 6)},
    "ex2-ic-media-t": {"gl": ("15", 8), "tc": ("2,131", 8), "ep": ("1,200", 8), "E": ("2,557", 8), "lower": ("35,843", 8), "upper": ("40,957", 8)},
    "ex3-ic-proporcao": {"phat": ("0,590", 10), "q": ("0,410", 10), "prod": ("0,2419", 10), "var": ("0,00060475", 10), "ep": ("0,0246", 10), "E": ("0,0482", 10), "lower": ("0,542", 10), "upper": ("0,638", 10)},
    "ex4-teste-z-duas-medias": {"v1": ("2", 13), "v2": ("2", 13), "soma": ("4", 13), "ep": ("2,000", 13), "z": ("2,500", 13)},
    "ex5-teste-t-conjunto": {"gl": ("20", 15), "tc": ("2,086", 15), "s1q": ("1,44", 15), "s2q": ("1,00", 15), "num": ("24,84", 15), "sp2": ("1,242", 15), "sp": ("1,114", 15), "raiz": ("0,4282", 16), "ep": ("0,477", 16), "t": ("2,724", 16)},
}
PRINTED_CHOICES = {"ex4-teste-z-duas-medias": {"decisao": "rejeita", "interp": "dif-a"}, "ex5-teste-t-conjunto": {"decisao": "rejeita", "interp": "dif-a"}}
METHOD = {"ex1-ic-media-z": "z_mean_ci", "ex2-ic-media-t": "t_mean_ci", "ex3-ic-proporcao": "prop_ci", "ex4-teste-z-duas-medias": "z_two_means", "ex5-teste-t-conjunto": "t_pooled"}

# Each printed result recomputed from the printed inputs: (id, page, description, value, printed, note)
CHAIN = [
    ("ex1-ep", 6, "8 / sqrt(64)", 8 / math.sqrt(64), "1,000", None),
    ("ex1-E", 6, "1,96 x 1,000", 1.96 * 1.0, "1,960", None),
    ("ex1-lower", 6, "72 - 1,960", 72 - 1.96, "70,040", None),
    ("ex1-upper", 6, "72 + 1,960", 72 + 1.96, "73,960", None),
    ("ex2-ep", 8, "4,8 / sqrt(16)", 4.8 / 4, "1,200", None),
    ("ex2-E", 8, "2,131 x 1,200", 2.131 * 1.2, "2,557", None),
    ("ex2-lower", 8, "38,4 - 2,557", 38.4 - 2.557, "35,843", None),
    ("ex2-upper", 8, "38,4 + 2,557", 38.4 + 2.557, "40,957", None),
    ("ex3-phat", 10, "236 / 400", 236 / 400, "0,590", None),
    ("ex3-q", 10, "1 - 0,590", 1 - 0.59, "0,410", None),
    ("ex3-prod", 10, "0,590 x 0,410", 0.59 * 0.41, "0,2419", None),
    ("ex3-var", 10, "0,2419 / 400", 0.2419 / 400, "0,00060475", None),
    ("ex3-ep", 10, "sqrt(0,00060475)", math.sqrt(0.00060475), "0,0246", None),
    ("ex3-E", 10, "1,96 x 0,0246", 1.96 * 0.0246, "0,0482", None),
    ("ex3-lower", 10, "0,590 - 0,048", 0.59 - 0.048, "0,542", None),
    ("ex3-upper", 10, "0,590 + 0,048", 0.59 + 0.048, "0,638", None),
    ("ex3-summary-E", 17, "1,96 x 0,025 (EP ~ 0,025 on the summary sheet)", 1.96 * 0.025, "0,048", "note-ex3-ep"),
    ("ex4-v1", 13, "100 / 50", 100 / 50, "2", None),
    ("ex4-soma", 13, "2 + 2", 4, "4", None),
    ("ex4-ep", 13, "sqrt(4)", 2.0, "2,000", None),
    ("ex4-z", 13, "5 / 2,000", 2.5, "2,500", None),
    ("ex5-s1q", 15, "1,2^2", 1.2 ** 2, "1,44", None),
    ("ex5-a", 15, "11 x 1,44", 11 * 1.44, "15,84", None),
    ("ex5-b", 15, "9 x 1,00", 9.0, "9,00", None),
    ("ex5-num", 15, "15,84 + 9,00", 15.84 + 9.0, "24,84", None),
    ("ex5-sp2", 15, "24,84 / 20", 24.84 / 20, "1,242", None),
    ("ex5-sp", 15, "sqrt(1,242)", math.sqrt(1.242), "1,114", None),
    ("ex5-inv1", 16, "1 / 12", 1 / 12, "0,0833", None),
    ("ex5-inv2", 16, "1 / 10", 0.1, "0,1000", None),
    ("ex5-invsum", 16, "0,0833 + 0,1000", 0.0833 + 0.1, "0,1833", None),
    ("ex5-raiz", 16, "sqrt(0,1833)", math.sqrt(0.1833), "0,4282", "note-ex5-root"),
    ("ex5-ep", 16, "1,114 x 0,4282", 1.114 * 0.4282, "0,477", None),
    ("ex5-t", 16, "1,3 / 0,477", 1.3 / 0.477, "2,724", "note-ex5-t-rounding"),
]


def fmt(v, d):
    """Half-away-from-zero rounding to d decimals, pt-BR decimal comma."""
    q = round(abs(v) * 10 ** d + 1e-9)
    s = f"{q / 10 ** d:.{d}f}".replace(".", ",")
    return ("-" + s) if v < 0 and q else s


def decimals(text):
    return len(text.split(",")[1]) if "," in text else 0


def matches(v, text):
    return fmt(v, decimals(text)) == text


# --- formulas (re-implemented here, not read from the lesson) ----------------------
def interp_for(stat, crit, x1, x2):
    if abs(stat) <= crit:
        return "sem-evidencia"
    return "dif-a" if x1 > x2 else "dif-b"


def ex1(v):
    ep = v["sigma"] / math.sqrt(v["n"])
    e = Z95 * ep
    return {"metodo": "z_mean_ci", "zc": Z95, "ep": ep, "E": e, "lower": v["xbar"] - e, "upper": v["xbar"] + e, "interp": "ok"}


def ex2(v):
    gl = v["n"] - 1
    tc = T_TABLE[gl]
    ep = v["s"] / math.sqrt(v["n"])
    e = tc * ep
    return {"metodo": "t_mean_ci", "gl": gl, "tc": tc, "ep": ep, "E": e, "lower": v["xbar"] - e, "upper": v["xbar"] + e, "interp": "ok"}


def ex3(v):
    p = v["x"] / v["n"]
    q = 1 - p
    prod = p * q
    var = prod / v["n"]
    ep = math.sqrt(var)
    e = Z95 * ep
    return {"metodo": "prop_ci", "zc": Z95, "phat": p, "q": q, "prod": prod, "var": var, "ep": ep, "E": e, "lower": p - e, "upper": p + e, "interp": "ok"}


def ex4(v):
    v1 = v["sigma"] ** 2 / v["n1"]
    v2 = v["sigma"] ** 2 / v["n2"]
    ep = math.sqrt(v1 + v2)
    z = (v["x1"] - v["x2"]) / ep
    return {"hip": "ok", "metodo": "z_two_means", "zc": Z95, "v1": v1, "v2": v2, "soma": v1 + v2, "ep": ep, "z": z,
            "decisao": "rejeita" if abs(z) > Z95 else "nao-rejeita", "interp": interp_for(z, Z95, v["x1"], v["x2"])}


def ex5(v):
    gl = v["n1"] + v["n2"] - 2
    tc = T_TABLE[gl]
    s1q, s2q = v["s1"] ** 2, v["s2"] ** 2
    num = (v["n1"] - 1) * s1q + (v["n2"] - 1) * s2q
    sp2 = num / gl
    sp = math.sqrt(sp2)
    raiz = math.sqrt(1 / v["n1"] + 1 / v["n2"])
    ep = sp * raiz
    t = (v["x1"] - v["x2"]) / ep
    return {"hip": "ok", "metodo": "t_pooled", "gl": gl, "tc": tc, "s1q": s1q, "s2q": s2q, "num": num, "sp2": sp2, "sp": sp,
            "raiz": raiz, "ep": ep, "t": t, "decisao": "rejeita" if abs(t) > tc else "nao-rejeita", "interp": interp_for(t, tc, v["x1"], v["x2"])}


SOLVERS = {"ex1-ic-media-z": ex1, "ex2-ic-media-t": ex2, "ex3-ic-proporcao": ex3, "ex4-teste-z-duas-medias": ex4, "ex5-teste-t-conjunto": ex5}


# --- exact quantiles (to audit the instructor's tables) ----------------------------
def t_cdf(x, df):
    c = math.exp(math.lgamma((df + 1) / 2) - math.lgamma(df / 2)) / math.sqrt(df * math.pi)
    n, h = 4000, abs(x) / 4000
    s = c + c * (1 + x * x / df) ** (-(df + 1) / 2)
    for i in range(1, n):
        u = i * h
        s += (4 if i % 2 else 2) * c * (1 + u * u / df) ** (-(df + 1) / 2)
    return 0.5 + math.copysign(s * h / 3, x)


def t_quantile(p, df):
    lo, hi = 0.0, 20.0
    for _ in range(80):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if t_cdf(mid, df) < p else (lo, mid)
    return (lo + hi) / 2


def close(a, b):
    if isinstance(a, str) or isinstance(b, str):
        return a == b
    return abs(a - b) <= 1e-9 * max(1.0, abs(b))


def pdf_text():
    if not shutil.which("pdftotext"):
        return None
    # Ask for UTF-8 and decode it as such: the Windows default (cp1252) cannot decode the PDF's symbols.
    out = subprocess.run(["pdftotext", "-enc", "UTF-8", str(ROOT / "inputs/example-output.pdf"), "-"], capture_output=True, text=True, encoding="utf-8", check=True).stdout
    return re.sub(r"\s+", " ", out)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--lesson", type=Path, default=ROOT / "lessons/prova3-statistics.lesson.json")
    ap.add_argument("--key", type=Path, default=ROOT / "build/prova3/answer-key.json")
    ap.add_argument("--out", type=Path, default=ROOT / "build/prova3/oracle-report.json")
    args = ap.parse_args()
    lesson = json.loads(args.lesson.read_text(encoding="utf-8"))
    failures, report = [], {"checks": {}, "disagreements": [], "conventions": []}

    # A. oracle vs printed PDF values
    rows = []
    for ex_id, printed in PRINTED.items():
        sol = SOLVERS[ex_id](ORIGINAL[ex_id])
        for step, (text, page) in printed.items():
            ok = matches(sol[step], text)
            rows.append({"exercise": ex_id, "step": step, "page": page, "pdf": text, "oracle": fmt(sol[step], decimals(text)), "oracle_full": sol[step], "ok": ok})
            if not ok:
                failures.append(f"A {ex_id}.{step}: oracle {sol[step]} vs PDF {text} (p.{page})")
        for step, choice in PRINTED_CHOICES.get(ex_id, {}).items():
            if sol[step] != choice:
                failures.append(f"A {ex_id}.{step}: oracle {sol[step]} vs PDF {choice}")
    report["checks"]["A_pdf_key"] = rows

    # B. lesson transcription
    text = pdf_text()
    for ex in lesson["exercises"]:
        orig = {k: s["original"] for k, s in ex["variables"].items()}
        if orig != ORIGINAL[ex["id"]]:
            failures.append(f"B {ex['id']}: lesson original variables {orig} differ from PDF {ORIGINAL[ex['id']]}")
        lesson_printed = ex["source_answer_key"]["printed"]
        if lesson_printed != {k: v[0] for k, v in PRINTED[ex["id"]].items()}:
            failures.append(f"B {ex['id']}: lesson printed key differs from the PDF transcription")
        if text is not None and re.sub(r"\s+", " ", ex["original_statement"]) not in text:
            failures.append(f"B {ex['id']}: original statement not found verbatim in the PDF text")
    report["checks"]["B_statement_in_pdf"] = "checked" if text is not None else "skipped: pdftotext missing"

    # C. engine key vs oracle (original + variants)
    key = json.loads(args.key.read_text(encoding="utf-8"))
    compared = 0
    for ex_id, entry in key["exercises"].items():
        solve = SOLVERS[ex_id]
        base = solve(ORIGINAL[ex_id])
        for case in [dict(entry["original"], seed="original")] + entry["variants"]:
            sol = solve(case["variables"])
            for step, ans in case["answers"].items():
                if step not in sol:
                    continue
                compared += 1
                if not close(ans, sol[step]):
                    failures.append(f"C {ex_id} seed {case['seed']} {step}: engine {ans} vs oracle {sol[step]}")
            for step in ("metodo", "decisao", "interp"):
                if step in base and sol[step] != base[step]:
                    failures.append(f"C {ex_id} seed {case['seed']}: variant changes {step} ({base[step]} -> {sol[step]})")
            if sol["metodo"] != METHOD[ex_id]:
                failures.append(f"C {ex_id}: method {sol['metodo']}")
        report["checks"].setdefault("C_engine_vs_oracle", {})[ex_id] = 1 + len(entry["variants"])
    report["checks"]["C_values_compared"] = compared

    # D. instructor tables vs exact quantiles
    zq = NormalDist().inv_cdf(0.975)
    quant = [{"table": "z 95%", "instructor": Z95, "exact": round(zq, 5)}]
    for df, tv in T_TABLE.items():
        quant.append({"table": f"t gl={df}", "instructor": tv, "exact": round(t_quantile(0.975, df), 5)})
    for q in quant:
        q["ok"] = abs(q["instructor"] - q["exact"]) < 0.0006
        if not q["ok"]:
            failures.append(f"D {q['table']}: instructor {q['instructor']} vs exact {q['exact']}")
    report["checks"]["D_quantiles"] = quant
    e_exact = t_quantile(0.975, 15) * 1.2
    report["conventions"].append({
        "exercise": "ex2-ic-media-t", "page": 8,
        "text": f"With the exact quantile t(0,975; 15) = {fmt(t_quantile(0.975, 15), 4)} the margin is E = {fmt(e_exact, 4)} -> {fmt(e_exact, 3)} and the interval ({fmt(38.4 - e_exact, 3)}; {fmt(38.4 + e_exact, 3)}); the PDF uses the instructor table 2,131 -> E = 2,557 -> (35,843; 40,957). The pilot keeps the table."})

    # E. printed chain
    notes = {n["id"]: n for n in lesson.get("source_notes", [])}
    chain_rows = []
    for cid, page, desc, value, printed, note in CHAIN:
        got = fmt(value, decimals(printed))
        ok = got == printed
        chain_rows.append({"id": cid, "page": page, "computation": desc, "recomputed": got, "printed": printed, "ok": ok})
        if not ok:
            report["disagreements"].append({"id": cid, "page": page, "computation": desc, "printed": printed, "recomputed_from_printed_inputs": got, "disclosed_in": note})
            if note is None or note not in notes or page not in notes[note]["pages"]:
                failures.append(f"E {cid} (p.{page}): printed {printed} but {desc} = {got}; not disclosed in source_notes")
        elif note is not None:
            failures.append(f"E {cid}: expected a disagreement but none was found")
    report["checks"]["E_printed_chain"] = chain_rows

    report["failures"] = failures
    report["status"] = "pass" if not failures else "fail"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"oracle: {report['status']}; {len(rows)} PDF values, {compared} engine values compared, "
          f"{len(report['disagreements'])} printed-chain disagreements (all disclosed: {not any(f.startswith('E') for f in failures)})")
    for d in report["disagreements"]:
        print(f"  p.{d['page']} {d['computation']}: printed {d['printed']}, recomputed {d['recomputed_from_printed_inputs']} [{d['disclosed_in']}]")
    for f in failures:
        print("FAIL", f, file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
