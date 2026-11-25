"""Mutation helper: replace exactly one occurrence of OLD with NEW in FILE (exit 3 when OLD occurs 0 or 2+ times).
Usage: python3 -I scripts/mutants/replace.py FILE OLD NEW"""
import sys

path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path, encoding='utf-8').read()
n = text.count(old)
if n != 1:
    print(f'replace.py: {n} occurrences in {path} of: {old[:80]}', file=sys.stderr)
    sys.exit(3)
open(path, 'w', encoding='utf-8').write(text.replace(old, new))
