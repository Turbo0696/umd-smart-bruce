"""Ground-truth values for the Excel Simulator's math (broad grid), computed with mpmath.

    pip install mpmath
    python gen_grid.py grid.json

Inputs are taken as the exact IEEE double a JS parser would produce, so the engine and the
reference see the same numbers. Every reference uses a different route from the engine
(mpmath's hypergeometric series and exact sums vs. the engine's continued fractions).
Solved quantiles are bisected to ~30 digits, working on the smaller of p and 1 - p.
"""
import json, sys, itertools, time
from mpmath import mp, mpf, sqrt, pi, erfc, gamma, loggamma, betainc, gammainc, exp, log, binomial, inf, floor, fabs

mp.dps = 40
out = []
t0 = time.time()


def D(s):
    """Decimal literal -> the exact double it parses to."""
    return mpf(float(s))


def add(fn, args, expected, note=""):
    """`expected` is an mpf, or a string starting with '#' for an error code."""
    formula = f"={fn}({','.join(args)})"
    out.append({"fn": fn, "formula": formula, "expected": expected if isinstance(expected, str) else mp.nstr(expected, 30), "note": note})


# ---------- distributions ----------
Phi = lambda z: erfc(-z / sqrt(2)) / 2
phi = lambda z: exp(-z * z / 2) / sqrt(2 * pi)


def solve_inc(f, target, lo_unused, hi_unused, increasing):
    """Root of a monotone positive-domain function: bracket, then geometric bisection to ~30 digits."""
    below = (lambda x: f(x) < target) if increasing else (lambda x: f(x) > target)   # True => root is above x
    lo = hi = mpf(1)
    if below(hi):
        while below(hi) and hi < mpf(10) ** 320:
            lo = hi; hi *= 4
    else:
        while not below(lo) and lo > mpf(10) ** -330:
            hi = lo; lo /= 4
    for _ in range(400):
        mid = sqrt(lo * hi)
        if below(mid): lo = mid
        else: hi = mid
        if hi / lo - 1 < mpf(10) ** -30:
            break
    return sqrt(lo * hi)


def bracket_pos(f, target, increasing):
    return mpf(0)


P = ["1e-300", "1e-100", "1e-15", "1e-10", "1e-6", "0.001", "0.01", "0.025", "0.05", "0.1", "0.25", "0.5", "0.75", "0.9", "0.95", "0.975", "0.99", "0.999", "0.999999", "0.9999999999"]
DF = ["1", "2", "3", "4", "5", "10", "30", "100", "1000", "10000"]

# --- normal ---
Z = ["-38", "-20", "-10", "-6", "-3.5", "-1.96", "-1", "-0.1", "0", "0.1", "1", "1.645", "1.96", "3", "5", "8", "20"]
for z in Z:
    add("NORM.S.DIST", [z, "1"], Phi(D(z)))
    add("NORM.S.DIST", [z, "0"], phi(D(z)))
for x, m, s in itertools.product(["-7", "0", "3.3", "100", "1e6"], ["0", "10", "-2.5"], ["1", "0.001", "15"]):
    z = (D(x) - D(m)) / D(s)
    add("NORM.DIST", [x, m, s, "1"], Phi(z))
    add("NORM.DIST", [x, m, s, "0"], phi(z) / D(s))
for p in P:
    pv = D(p)
    # solve Phi(x)=p using whichever tail is smaller
    if pv <= mpf("0.5"):
        x = -solve_inc(lambda t: Phi(-t), pv, mpf(0), bracket_pos(lambda t: Phi(-t), pv, False), False)
    else:
        q = 1 - pv
        x = solve_inc(lambda t: Phi(-t), q, mpf(0), bracket_pos(lambda t: Phi(-t), q, False), False)
    add("NORM.S.INV", [p], x)
    add("NORM.INV", [p, "100", "15"], D("100") + D("15") * x)
    add("NORM.INV", [p, "-2.5", "0.001"], D("-2.5") + D("0.001") * x)

# --- Student t ---
def t_tail2(x, v):  # P(|T| > |x|)
    x = fabs(x)
    return betainc(v / 2, mpf(1) / 2, 0, v / (v + x * x), regularized=True)


def t_cdf(x, v):
    tt = t_tail2(x, v) / 2
    return 1 - tt if x > 0 else tt


def t_pdf(x, v):
    return exp(loggamma((v + 1) / 2) - loggamma(v / 2)) / sqrt(v * pi) * (1 + x * x / v) ** (-(v + 1) / 2)


TX = ["-1e4", "-40", "-10", "-5", "-2.5", "-1", "-0.5", "-0.001", "0", "0.001", "0.5", "1", "2.5", "5", "10", "40", "1e4"]
for v, x in itertools.product(DF, TX):
    vv, xv = D(v), D(x)
    add("T.DIST", [x, v, "1"], t_cdf(xv, vv))
    add("T.DIST", [x, v, "0"], t_pdf(xv, vv))
    add("T.DIST.RT", [x, v], (t_tail2(xv, vv) / 2) if xv > 0 else 1 - t_tail2(xv, vv) / 2 if xv < 0 else mpf(1) / 2)
    if xv >= 0:
        add("T.DIST.2T", [x, v], t_tail2(xv, vv))
    else:
        add("T.DIST.2T", [x, v], "#NUM!")

def t_upper_inv(q, v):
    f = lambda t: t_tail2(t, v) / 2
    return solve_inc(f, q, mpf(0), bracket_pos(f, q, False), False)

for v, p in itertools.product(DF, P):
    vv, pv = D(v), D(p)
    if pv == 0 or pv >= 1:
        continue
    if float(pv) == 0.5:
        add("T.INV", [p, v], mpf(0));
    else:
        t = t_upper_inv(min(pv, 1 - pv), vv)
        add("T.INV", [p, v], t if pv > mpf("0.5") else -t)
    add("T.INV.2T", [p, v], t_upper_inv(pv / 2, vv))

# --- chi-square ---
def chi_cdf(x, k): return gammainc(k / 2, 0, x / 2, regularized=True)
def chi_rt(x, k): return gammainc(k / 2, x / 2, inf, regularized=True)
def chi_pdf(x, k): return exp((k / 2 - 1) * log(x) - x / 2 - (k / 2) * log(2) - loggamma(k / 2))

CX = ["0", "0.001", "0.1", "1", "3", "5", "10", "50", "100", "500", "2000"]
for k, x in itertools.product(DF, CX):
    kv, xv = D(k), D(x)
    if xv > 0:
        add("CHISQ.DIST", [x, k, "1"], chi_cdf(xv, kv))
        add("CHISQ.DIST", [x, k, "0"], chi_pdf(xv, kv))
        add("CHISQ.DIST.RT", [x, k], chi_rt(xv, kv))
    else:
        add("CHISQ.DIST", [x, k, "1"], mpf(0))
        add("CHISQ.DIST", [x, k, "0"], mpf(0.5) if kv == 2 else ("#DIV/0!" if kv < 2 else mpf(0)))
        add("CHISQ.DIST.RT", [x, k], mpf(1))
for k, p in itertools.product(DF, P):
    kv, pv = D(k), D(p)
    if float(k) >= 1000 and float(p) < 1e-100:
        continue  # quantile is far outside anything real; mp too slow
    # CHISQ.INV(p): P(X<=x)=p ; use the smaller tail for conditioning
    if pv <= mpf("0.5"):
        x = solve_inc(lambda t: chi_cdf(t, kv), pv, mpf(0), bracket_pos(lambda t: chi_cdf(t, kv), pv, True), True)
    else:
        q = 1 - pv
        x = solve_inc(lambda t: chi_rt(t, kv), q, mpf(0), bracket_pos(lambda t: chi_rt(t, kv), q, False), False)
    add("CHISQ.INV", [p, k], x)
    # CHISQ.INV.RT(p): P(X>x)=p
    if pv <= mpf("0.5"):
        x2 = solve_inc(lambda t: chi_rt(t, kv), pv, mpf(0), bracket_pos(lambda t: chi_rt(t, kv), pv, False), False)
    else:
        q = 1 - pv
        x2 = solve_inc(lambda t: chi_cdf(t, kv), q, mpf(0), bracket_pos(lambda t: chi_cdf(t, kv), q, True), True)
    add("CHISQ.INV.RT", [p, k], x2)

# --- F ---
def f_cdf(x, a, b): return betainc(a / 2, b / 2, 0, a * x / (a * x + b), regularized=True)
def f_rt(x, a, b): return betainc(b / 2, a / 2, 0, b / (b + a * x), regularized=True)
def f_pdf(x, a, b):
    return exp(loggamma((a + b) / 2) - loggamma(a / 2) - loggamma(b / 2) + (a / 2) * log(a / b) + (a / 2 - 1) * log(x) - ((a + b) / 2) * log(1 + a * x / b))

FD = ["1", "2", "3", "5", "10", "30", "100", "1000"]
FX = ["0", "0.01", "0.5", "1", "2", "5", "20", "100", "1e4"]
for a, b, x in itertools.product(FD, FD, FX):
    av, bv, xv = D(a), D(b), D(x)
    if xv > 0:
        add("F.DIST", [x, a, b, "1"], f_cdf(xv, av, bv))
        add("F.DIST", [x, a, b, "0"], f_pdf(xv, av, bv))
        add("F.DIST.RT", [x, a, b], f_rt(xv, av, bv))
    else:
        add("F.DIST", [x, a, b, "1"], mpf(0))
        add("F.DIST", [x, a, b, "0"], mpf(1) if av == 2 else ("#DIV/0!" if av < 2 else mpf(0)))
        add("F.DIST.RT", [x, a, b], mpf(1))
PF = ["1e-10", "1e-6", "0.001", "0.01", "0.05", "0.1", "0.25", "0.5", "0.75", "0.9", "0.95", "0.99", "0.999", "0.9999999"]
for a, b, p in itertools.product(["1", "2", "3", "5", "10", "30", "100"], ["1", "2", "3", "10", "30", "100", "1000"], PF):
    av, bv, pv = D(a), D(b), D(p)
    if pv <= mpf("0.5"):
        x = solve_inc(lambda t: f_cdf(t, av, bv), pv, mpf(0), bracket_pos(lambda t: f_cdf(t, av, bv), pv, True), True)
        x2 = solve_inc(lambda t: f_rt(t, av, bv), pv, mpf(0), bracket_pos(lambda t: f_rt(t, av, bv), pv, False), False)
    else:
        q = 1 - pv
        x = solve_inc(lambda t: f_rt(t, av, bv), q, mpf(0), bracket_pos(lambda t: f_rt(t, av, bv), q, False), False)
        x2 = solve_inc(lambda t: f_cdf(t, av, bv), q, mpf(0), bracket_pos(lambda t: f_cdf(t, av, bv), q, True), True)
    add("F.INV", [p, a, b], x)
    add("F.INV.RT", [p, a, b], x2)

# --- binomial (exact sums) ---
def b_pmf(k, n, p):
    return binomial(n, k) * p ** k * (1 - p) ** (n - k)

def b_cdf(k, n, p):
    if k >= n: return mpf(1)
    # sum the shorter side for speed, exact in mp
    if k < n * p:        # small left tail: sum it directly (no cancellation)
        return sum(b_pmf(i, n, p) for i in range(0, k + 1))
    return 1 - sum(b_pmf(i, n, p) for i in range(k + 1, n + 1))

NS = [1, 2, 5, 10, 30, 100, 500, 1000, 10000]
PS = ["0", "1e-6", "0.01", "0.1", "0.3", "0.5", "0.9", "0.999", "1"]
for n, p in itertools.product(NS, PS):
    pv = D(p)
    for k in sorted({0, 1, n // 4, n // 2, max(n - 1, 0), n}):
        add("BINOM.DIST", [str(k), str(n), p, "0"], mp.mpf(0) if (pv == 0 and k > 0) or (pv == 1 and k < n) else b_pmf(k, n, pv), f"pmf n={n} k={k}")
        if n <= 1000 or k in (0, n):
            add("BINOM.DIST", [str(k), str(n), p, "1"], b_cdf(k, n, pv), f"cdf n={n} k={k}")
    if n <= 1000:
        for al in ["0", "1e-9", "0.01", "0.05", "0.5", "0.95", "0.99", "0.999999999", "1"]:
            av = D(al)
            k_star = n
            acc = mpf(0)
            for k in range(0, n + 1):
                acc += b_pmf(k, n, pv)
                if acc >= av:
                    k_star = k; break
            # margin: how close is the decision to a knife edge?
            if av == 1:
                k_star = 0 if pv == 0 else n     # all the mass is only reached at n
            add("BINOM.INV", [str(n), p, al], mpf(k_star), f"n={n} p={p} alpha={al} margin={mp.nstr(fabs(acc - av), 5)}")

# ---------- descriptive stats vs exact arithmetic ----------
import random
random.seed(20260924)
def datasets():
    yield [2, 4, 4, 4, 5, 5, 7, 9]
    yield [1.5, 2.5]
    yield [1e8 + 0.1, 1e8 + 0.2, 1e8 + 0.3, 1e8 + 0.4]           # big offset, tiny variance
    yield [1e-8, 3e-8, 2e-8, 9e-8]
    yield [-3.7, 12.25, 0, 8.125, -0.001]
    for _ in range(12):
        n = random.randint(2, 10)
        yield [round(random.uniform(-1000, 1000), random.randint(0, 6)) for _ in range(n)]

cells = "ABCDEFGHIJ"
def refs(vals, col):
    return {f"{col}{i+1}": repr(v) for i, v in enumerate(vals)}, f"{col}1:{col}{len(vals)}"

for vals in datasets():
    xs = [mpf(float(v)) for v in vals]
    n = len(xs)
    mean = sum(xs) / n
    ss = sum((x - mean) ** 2 for x in xs)
    cells_x, rx = refs(vals, "B")
    srt = sorted(xs)
    med = srt[n // 2] if n % 2 else (srt[n // 2 - 1] + srt[n // 2]) / 2
    def addr(fn, e):
        out.append({"fn": fn, "formula": f"={fn}({rx})", "cells": cells_x, "expected": mp.nstr(e, 30) if not isinstance(e, str) else e, "note": f"data={vals}"})
    addr("SUM", sum(xs)); addr("AVERAGE", mean); addr("MIN", min(xs)); addr("MAX", max(xs)); addr("COUNT", mpf(n)); addr("MEDIAN", med)
    addr("VAR.P", ss / n); addr("STDEV.P", sqrt(ss / n))
    addr("VAR.S", ss / (n - 1)); addr("STDEV.S", sqrt(ss / (n - 1)))
    ys = [x * mpf("0.37") + mpf(random.uniform(-50, 50)) for x in xs]
    yv = [float(y) for y in ys]; ys = [mpf(v) for v in yv]
    cells_y, ry = refs(yv, "C")
    my = sum(ys) / n
    sxy = sum((a - mean) * (b - my) for a, b in zip(xs, ys)); syy = sum((b - my) ** 2 for b in ys)
    if ss != 0 and syy != 0:
        out.append({"fn": "CORREL", "formula": f"=CORREL({rx},{ry})", "cells": {**cells_x, **cells_y}, "expected": mp.nstr(sxy / sqrt(ss * syy), 30), "note": f"data={vals}"})

# ---------- elementary ----------
for x in ["0", "0.5", "2", "9", "1e-10", "12345.678", "1e300"]:
    add("SQRT", [x], sqrt(D(x)))
    add("LN", [x], log(D(x)) if D(x) > 0 else "#NUM!")
for x in ["-745", "-30", "-1", "0", "0.5", "1", "10", "50", "700"]:
    add("EXP", [x], exp(D(x)))
for b, e in [("2", "10"), ("9", "0.5"), ("-8", "3"), ("1.0001", "10000"), ("10", "-3"), ("2.5", "2.5"), ("7", "0")]:
    add("POWER", [b, e], D(b) ** D(e))
for x in ["-5.5", "0", "3.25"]:
    add("ABS", [x], fabs(D(x)))

json.dump(out, open(sys.argv[1], "w"))
print(len(out), "cases in", round(time.time() - t0, 1), "s")
