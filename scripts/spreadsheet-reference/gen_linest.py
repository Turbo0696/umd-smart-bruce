"""Builds src/lib/__fixtures__/linestReference.json: LINEST reference values in exact arithmetic.

    python gen_linest.py ../../src/lib/__fixtures__/linestReference.json

Every input is a short decimal, so the least-squares problem is solved exactly with Fractions
(normal equations, Gauss-Jordan) and only the final statistics are rounded, to 24 significant
digits. Nothing here uses floating point or the engine's own algorithm.

Each case is {"kind", "row", "const", "y": [...], "x": [[...] per observation], "e": {...}} with
the inputs as decimal strings. "row" cases are laid out across rows (y in a row, one x row per
variable); the others run down columns. "e" holds, in LINEST's output order (last variable first,
intercept last): coef, se (null where Excel shows #N/A), and r2, sey, f, df, ssreg, ssresid.
The kinds are chosen to stress the numerics: ordinary data, values near 1e6 (the intercept cancels
against the offset), tiny and huge scales, small integers, and nearly collinear columns.
"""
import json
import random
import sys
from decimal import Decimal, getcontext
from fractions import Fraction as F

getcontext().prec = 40
random.seed(20261104)
PER_KIND = 24
KINDS = ["normal", "offset", "tiny", "huge", "int", "nearcol"]


def solve(a, b):
    n = len(a)
    m = [r[:] + [b[i]] for i, r in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]
        for r in range(n):
            if r != c and m[r][c] != 0:
                f = m[r][c] / m[c][c]
                m[r] = [x - f * y for x, y in zip(m[r], m[c])]
    return [m[i][n] / m[i][i] for i in range(n)]


def inverse(a):
    n = len(a)
    return [solve(a, [F(int(i == j)) for i in range(n)]) for j in range(n)]


def sig(fr, digits=24):
    """A Fraction as a decimal string with `digits` significant digits."""
    d = Decimal(fr.numerator) / Decimal(fr.denominator)
    return format(d, f".{digits - 1}e")


def sqrt_sig(fr, digits=24):
    d = (Decimal(fr.numerator) / Decimal(fr.denominator)).sqrt()
    return format(d, f".{digits - 1}e")


def exact(y, x, const):
    n, k = len(y), len(x[0])
    a = [([F(1)] if const else []) + [F(v) for v in row] for row in x]
    yy = [F(v) for v in y]
    p = len(a[0])
    xtx = [[sum(a[t][i] * a[t][j] for t in range(n)) for j in range(p)] for i in range(p)]
    b = solve(xtx, [sum(a[t][i] * yy[t] for t in range(n)) for i in range(p)])
    fit = [sum(a[t][i] * b[i] for i in range(p)) for t in range(n)]
    ssr = sum((yy[t] - fit[t]) ** 2 for t in range(n))
    df = n - p
    my = sum(yy) / n if const else F(0)
    sst = sum((v - my) ** 2 for v in yy)
    ssreg = sum((f - my) ** 2 for f in fit)
    off = 1 if const else 0
    s2 = ssr / df
    tinv = inverse(xtx)
    order = list(range(k - 1, -1, -1))
    coef = [sig(b[off + j]) for j in order] + [sig(b[0]) if const else "0"]
    se = [sqrt_sig(s2 * tinv[off + j][off + j]) for j in order] + [sqrt_sig(s2 * tinv[0][0]) if const else None]
    return {
        "coef": coef,
        "se": se,
        "r2": sig(1 - ssr / sst if const else ssreg / sst),
        "sey": sqrt_sig(s2),
        "f": sig(ssreg / (p - off) / s2),
        "df": df,
        "ssreg": sig(ssreg),
        "ssresid": sig(ssr),
    }


def dec(v, places):
    return f"{v:.{places}f}"


def make(kind):
    k = random.randint(1, 5)
    row = random.random() < 0.3
    n = random.randint(k + 2, 12 if row else 15)
    const = random.random() < 0.75

    def draw(mu, sd, pl):
        return [dec(random.gauss(mu, sd), pl) for _ in range(n)]

    places = {"normal": 2, "offset": 2, "tiny": 7, "huge": 0, "int": 0, "nearcol": 4}[kind]
    if kind == "normal":
        cols = [draw(random.uniform(-5, 20), random.uniform(1, 6), 2) for _ in range(k)]
    elif kind == "offset":
        cols = [draw(1e6, 3, 2) for _ in range(k)]
    elif kind == "tiny":
        cols = [draw(0, 1e-3, 7) for _ in range(k)]
    elif kind == "huge":
        cols = [draw(5e7, 2e7, 0) for _ in range(k)]
    elif kind == "int":
        cols = [[str(random.randint(-9, 9)) for _ in range(n)] for _ in range(k)]
    else:
        base = draw(10, 3, 2)
        cols = [base] + [[dec(float(v) + random.gauss(0, 1e-3), 4) for v in base] for _ in range(k - 1)]
    x = [[cols[j][t] for j in range(k)] for t in range(n)]
    beta = [random.uniform(-3, 3) for _ in range(k)]
    means = [sum(float(x[t][j]) for t in range(n)) / n for j in range(k)]
    mid = [sum(beta[j] * (float(x[t][j]) - means[j]) for j in range(k)) for t in range(n)]
    sd = max(1e-9, max(abs(m) for m in mid) * 0.15 or 1)
    if kind == "tiny":
        y = [dec(m + random.gauss(0, 1e-3), 7) for m in mid]
    elif kind == "huge":
        y = [dec(m + random.gauss(3e7, 1e7), 0) for m in mid]
    else:
        y = [dec(random.uniform(-20, 20) + mid[t] + random.gauss(0, sd), places) for t in range(n)]
    try:
        e = exact(y, x, const)
    except ZeroDivisionError:  # singular (e.g. integer columns that happen to be collinear)
        return None
    if F(e["ssresid"]) == 0:
        return None
    return {"kind": kind, "row": row, "const": const, "y": y, "x": x, "e": e}


out = []
for kind in KINDS:
    got = 0
    while got < PER_KIND:
        c = make(kind)
        if c:
            out.append(c)
            got += 1
json.dump(out, open(sys.argv[1], "w"), separators=(",", ":"))
print(len(out), "cases")
