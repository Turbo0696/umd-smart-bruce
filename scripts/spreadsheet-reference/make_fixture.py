"""Builds src/lib/__fixtures__/spreadsheetReference.json from the two mpmath reference sets.

    python gen_grid.py grid.json          # broad grid, incl. extreme tails and p next to 1
    python gen_large.py large.json        # huge parameters, 90-cell ranges, ROUND, random expressions
    python make_fixture.py grid.json large.json ../../src/lib/__fixtures__/spreadsheetReference.json

Each case is {"f": formula, "e": expected value (28 significant digits from mpmath), "c": cells}.
The fixture keeps every case from the large set except the (cheap to regenerate) bulk of ROUND
and expression cases, and a stride sample of the grid, so it stays small.
"""
import json, sys
from collections import defaultdict
from decimal import Decimal

grid = json.load(open(sys.argv[1]))
large = json.load(open(sys.argv[2]))

def keep(c):
    e = c["expected"]
    if e.startswith("#"):
        return True
    x = abs(float(e))
    # a t quantile beyond ~1e150 overflows t², so the engine reports #NUM! there on purpose
    return not (c["fn"] in ("T.INV", "T.INV.2T") and x > 1e150)

def trim(e):
    """24 significant digits, in scientific notation whatever the input's notation."""
    if e.startswith("#"):
        return e
    return format(Decimal(e), ".23e")

def compact(c):
    out = {"f": c["formula"], "e": trim(c["expected"])}
    if c.get("cells"):
        out["c"] = c["cells"]
    return out

by_fn = defaultdict(list)
for c in grid:
    if keep(c):
        by_fn[c["fn"]].append(c)
picked = []
for fn, cases in by_fn.items():
    if fn == "BINOM.INV":
        continue  # knife-edge ties are covered by hand-written tests
    step = 1 if len(cases) <= 40 else 5
    picked += cases[::step]

for fn in ("ROUND", "EXPR"):
    picked += [c for c in large if c["fn"] == fn][::12]
picked += [c for c in large if c["fn"] not in ("ROUND", "EXPR") and keep(c)]

json.dump([compact(c) for c in picked], open(sys.argv[3], "w"), separators=(",", ":"))
print(len(picked), "cases")
