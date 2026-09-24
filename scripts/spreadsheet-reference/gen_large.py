"""Reference values for the Excel Simulator: huge parameters near the mode, 90-cell ranges,
ROUND against exact decimal arithmetic, and random arithmetic expressions.

    pip install mpmath
    python gen_large.py large.json

mpmath's own hypergeometric routines give up at parameters around 5e5, so the incomplete gamma
and beta functions here are plain power series in 50-digit arithmetic, and the t distribution is
integrated numerically from its density. ROUND follows Excel: half away from zero, applied to the
15-significant-digit decimal value. Expressions use Excel's precedence (unary minus binds tighter
than ^, and ^ is left-associative).
"""
import json, sys, random, itertools, time
from decimal import Decimal, ROUND_HALF_UP, getcontext
from mpmath import mp, mpf, sqrt, pi, betainc, gammainc, exp, log, loggamma, inf, fabs

mp.dps = 30
random.seed(7)
out = []
t0 = time.time()


def D(s):
    return mpf(float(s))


def add(fn, args, expected, note="", cells=None):
    e = {"fn": fn, "formula": f"={fn}({','.join(args)})", "expected": expected if isinstance(expected, str) else mp.nstr(expected, 28), "note": note}
    if cells:
        e["cells"] = cells
    out.append(e)


def fmt(x):  # a decimal literal that parses to (nearly) x; the reference uses the parsed double
    return repr(float(x))


def root(f, target, increasing, x0=1):
    below = (lambda x: f(x) < target) if increasing else (lambda x: f(x) > target)
    lo = hi = mpf(x0)
    if below(hi):
        while below(hi): lo = hi; hi *= 1.05 if x0 != 1 else 2
    else:
        while not below(lo): hi = lo; lo /= (1.05 if x0 != 1 else 2)
    for _ in range(300):
        mid = sqrt(lo * hi)
        if below(mid): lo = mid
        else: hi = mid
        if hi / lo - 1 < mpf(10) ** -24: break
    return sqrt(lo * hi)


# ---------- large parameters near the mode (own 50-digit series; mpmath's hypergeometrics give up at a ~ 5e5) ----------
from statistics import NormalDist
mp.dps = 50
EPS = mpf(10) ** -46

def gamma_p(a, x):
    """Regularized lower incomplete gamma by its power series."""
    if x <= 0: return mpf(0)
    term = 1 / (a + 1); s = 1 + 0; s = mpf(1); term = mpf(1)
    n = 0
    while True:
        n += 1
        term *= x / (a + n)
        s += term
        if term < EPS * s: break
    return exp(a * log(x) - x - loggamma(a + 1)) * s

def gamma_q(a, x):
    return 1 - gamma_p(a, x)

def ibeta_mp(x, a, b):
    """Regularized incomplete beta by 2F1(1, a+b; a+1; x), reflected so that x stays below the mean."""
    if x <= 0: return mpf(0)
    if x >= 1: return mpf(1)
    if x > (a + 1) / (a + b + 2):
        return 1 - ibeta_mp(1 - x, b, a)
    lnpre = a * log(x) + b * log(1 - x) - (loggamma(a) + loggamma(b) - loggamma(a + b)) - log(a)
    term = mpf(1); s = mpf(1); n = 0
    while True:
        n += 1
        term *= (a + b + n - 1) / (a + n) * x
        s += term
        if term < EPS * s: break
    return exp(lnpre) * s

def newton(F, dF, x0, target):
    """Solve F(x) = target by Newton's method; dF is the true derivative of F."""
    x = mpf(x0)
    for _ in range(60):
        step = (F(x) - target) / dF(x)
        x2 = x - step
        if x2 <= 0: x2 = x / 2
        if fabs(x2 - x) < mpf(10) ** -30 * fabs(x2):
            return x2
        x = x2
    return x

chi_cdf = lambda x, k: gamma_p(k / 2, x / 2)
chi_rt = lambda x, k: gamma_q(k / 2, x / 2)
chi_pdf = lambda x, k: exp((k / 2 - 1) * log(x) - x / 2 - (k / 2) * log(2) - loggamma(k / 2))
for k in ["1000", "100000", "1000000"]:
    kv = D(k)
    for z in [-3, -1, 0, 1, 3]:
        x = kv + z * sqrt(2 * kv)
        xs = fmt(x); xv = D(xs)
        add("CHISQ.DIST", [xs, k, "1"], chi_cdf(xv, kv), f"k={k} z={z}")
        add("CHISQ.DIST", [xs, k, "0"], chi_pdf(xv, kv), f"k={k} z={z}")
        add("CHISQ.DIST.RT", [xs, k], chi_rt(xv, kv), f"k={k} z={z}")
    for p in ["0.05", "0.5", "0.95"]:
        pv = D(p); x0 = kv + NormalDist().inv_cdf(float(pv)) * float(sqrt(2 * kv))
        add("CHISQ.INV", [p, k], newton(lambda t: chi_cdf(t, kv), lambda t: chi_pdf(t, kv), x0, pv), f"k={k}")
        add("CHISQ.INV.RT", [p, k], newton(lambda t: chi_rt(t, kv), lambda t: -chi_pdf(t, kv), kv - NormalDist().inv_cdf(float(pv)) * float(sqrt(2 * kv)), pv), f"k={k}")
print("chi done", round(time.time() - t0, 1), flush=True)

_tc = {}
def t_pdf_(x, v):
    if v not in _tc:
        _tc[v] = exp(loggamma((v + 1) / 2) - loggamma(v / 2)) / sqrt(v * pi)
    return _tc[v] * exp(-(v + 1) / 2 * mp.log1p(x * x / v))
def t_tail2(x, v):
    """P(|T| > x) by integrating the density (an independent route from the beta-function identity)."""
    x = fabs(x)
    sd = sqrt(v / (v - 2))
    pts = [x, x + sd, x + 4 * sd, x + 12 * sd, x + 40 * sd, inf]
    return 2 * mp.quad(lambda s: t_pdf_(s, v), pts)
def t_cdf(x, v):
    tt = t_tail2(x, v) / 2
    return 1 - tt if x > 0 else (tt if x < 0 else mpf(1) / 2)
t_pdf = t_pdf_
for v in ["1000", "100000", "1000000", "10000000"]:
    vv = D(v)
    for x in ["-3", "-1", "-0.2", "0.001", "0.5", "2", "6"]:
        xv = D(x)
        add("T.DIST", [x, v, "1"], t_cdf(xv, vv), f"v={v}")
        add("T.DIST", [x, v, "0"], t_pdf(xv, vv), f"v={v}")
        if xv > 0:
            add("T.DIST.2T", [x, v], t_tail2(xv, vv), f"v={v}")
    for p in ["0.025", "0.05", "0.9", "0.975"]:
        pv = D(p)
        two = 2 * min(pv, 1 - pv)
        z0 = abs(NormalDist().inv_cdf(float(two) / 2))
        t = newton(lambda tt: t_tail2(tt, vv), lambda tt: -2 * t_pdf(tt, vv), z0, two)
        add("T.INV", [p, v], t if pv > mpf("0.5") else -t, f"v={v}")
        z1 = abs(NormalDist().inv_cdf(float(pv) / 2))
        add("T.INV.2T", [p, v], newton(lambda tt: t_tail2(tt, vv), lambda tt: -2 * t_pdf(tt, vv), z1, pv), f"v={v}")
print("t done", round(time.time() - t0, 1), flush=True)

f_cdf = lambda x, a, b: ibeta_mp(a * x / (a * x + b), a / 2, b / 2)
f_rt = lambda x, a, b: ibeta_mp(b / (b + a * x), b / 2, a / 2)
f_pdf = lambda x, a, b: exp(loggamma((a + b) / 2) - loggamma(a / 2) - loggamma(b / 2) + (a / 2) * log(a / b) + (a / 2 - 1) * log(x) - ((a + b) / 2) * log(1 + a * x / b))
for a, b in [("1000", "1000"), ("10000", "10"), ("10", "10000"), ("100000", "100000")]:
    av, bv = D(a), D(b)
    for x in ["0.5", "0.9", "1", "1.1", "2", "5"]:
        xv = D(x)
        add("F.DIST", [x, a, b, "1"], f_cdf(xv, av, bv), f"{a},{b}")
        add("F.DIST.RT", [x, a, b], f_rt(xv, av, bv), f"{a},{b}")
    for p in ["0.05", "0.5", "0.95", "0.99"]:
        pv = D(p)
        add("F.INV", [p, a, b], newton(lambda t: f_cdf(t, av, bv), lambda t: f_pdf(t, av, bv), 1, pv), f"{a},{b}")
        add("F.INV.RT", [p, a, b], newton(lambda t: f_rt(t, av, bv), lambda t: -f_pdf(t, av, bv), 1, pv), f"{a},{b}")
print("F done", round(time.time() - t0, 1), flush=True)

for n in [100000, 1000000]:
    for p in ["0.3", "0.5", "0.001"]:
        pv = D(p); nv = mpf(n)
        sd = sqrt(nv * pv * (1 - pv)); mean = nv * pv
        for z in [-3, -1, 0, 1, 3]:
            k = int(mp.nint(mean + z * sd))
            add("BINOM.DIST", [str(k), str(n), p, "0"], exp(loggamma(nv + 1) - loggamma(mpf(k) + 1) - loggamma(nv - k + 1) + k * log(pv) + (n - k) * log(1 - pv)), f"n={n} p={p} z={z}")
            add("BINOM.DIST", [str(k), str(n), p, "1"], ibeta_mp(1 - pv, nv - k, mpf(k) + 1), f"n={n} p={p} z={z}")
print("binom done", round(time.time() - t0, 1), flush=True)
mp.dps = 30

# ---------- statistics over 90-cell ranges ----------
cols = "BCDEFGHIJ"
def block(gen):
    vals = [gen() for _ in range(90)]
    cells = {}
    for i, v in enumerate(vals):
        r, c = divmod(i, 9)
        cells[f"{cols[c]}{r + 1}"] = repr(v)
    return vals, cells
for kind, gen in [("uniform", lambda: round(random.uniform(-1000, 1000), 3)), ("offset", lambda: 1e7 + round(random.uniform(0, 1), 4)), ("skewed", lambda: round(random.expovariate(0.01), 2))]:
    vals, cells = block(gen)
    xs = [mpf(float(v)) for v in vals]; n = len(xs)
    mean = sum(xs) / n; ss = sum((x - mean) ** 2 for x in xs)
    srt = sorted(xs); med = (srt[n // 2 - 1] + srt[n // 2]) / 2
    rng = "B1:J10"
    for fn, val in [("SUM", sum(xs)), ("AVERAGE", mean), ("MEDIAN", med), ("VAR.S", ss / (n - 1)), ("STDEV.S", sqrt(ss / (n - 1))), ("VAR.P", ss / n), ("STDEV.P", sqrt(ss / n)), ("MIN", srt[0]), ("MAX", srt[-1]), ("COUNT", mpf(n))]:
        add(fn, [rng], val, kind, cells)
    # CORREL of two 45-cell halves (rows 1-5 vs rows 6-10)
    a = xs[:45]; b = xs[45:]
    ma, mb = sum(a) / 45, sum(b) / 45
    sab = sum((x - ma) * (y - mb) for x, y in zip(a, b)); saa = sum((x - ma) ** 2 for x in a); sbb = sum((y - mb) ** 2 for y in b)
    out.append({"fn": "CORREL", "formula": "=CORREL(B1:J5,B6:J10)", "cells": cells, "expected": mp.nstr(sab / sqrt(saa * sbb), 28), "note": kind})

# ---------- ROUND vs exact decimal (Excel rounds the 15-significant-digit value, half away from zero) ----------
getcontext().prec = 60
rows = []
for _ in range(4000):
    kind = random.random()
    if kind < 0.35:
        x = round(random.uniform(-500, 500), random.randint(1, 5))          # values that look exact in decimal
    elif kind < 0.7:
        x = random.randint(-9999, 9999) / 10 ** random.randint(0, 4) + random.choice([0, 0.5, 0.05, 0.005, 0.0005]) * random.choice([-1, 1]) / 10 ** random.randint(0, 3)
    else:
        x = random.uniform(-1e6, 1e6) * 10 ** random.randint(-8, 4)
    d = random.randint(-3, 8)
    dec = Decimal(format(x, ".15g"))
    q = Decimal(1).scaleb(-d)
    exp_val = dec.quantize(q, rounding=ROUND_HALF_UP) if dec != 0 else Decimal(0)
    rows.append({"fn": "ROUND", "formula": f"=ROUND({repr(x)},{d})", "expected": str(float(exp_val)), "note": ""})
out.extend(rows)

# ---------- random expressions vs an independent evaluator ----------
def gen_expr(depth):
    r = random.random()
    if depth == 0 or r < 0.25:
        v = round(random.uniform(0.3, 20), random.randint(0, 3))
        return ("num", v)
    if r < 0.35: return ("neg", gen_expr(depth - 1))
    if r < 0.42: return ("pct", gen_expr(depth - 1))
    if r < 0.50: return ("par", gen_expr(depth - 1))
    op = random.choice(["+", "-", "*", "/", "^", "+", "-", "*", "/"])
    right = gen_expr(depth - 1)
    if op == "^":
        right = ("num", float(random.randint(0, 4))) if random.random() < 0.8 else ("neg", ("num", float(random.randint(1, 3))))
    return ("bin", op, gen_expr(depth - 1), right)

PREC = {"+": 1, "-": 1, "*": 2, "/": 2, "^": 3}
def ev(e):
    t = e[0]
    if t == "num": return mpf(e[1])
    if t == "par": return ev(e[1])
    if t == "neg": return -ev(e[1])
    if t == "pct": return ev(e[1]) / 100
    op = e[1]; a = ev(e[2]); b = ev(e[3])
    if op == "+": return a + b
    if op == "-": return a - b
    if op == "*": return a * b
    if op == "/":
        if b == 0: raise ZeroDivisionError
        return a / b
    r = a ** b
    if isinstance(r, mp.mpc): raise ValueError
    return r

# neg / pct children: parenthesize anything that isn't atomic so the printed text has the tree's meaning
def show(e, need=0, side="l"):
    t = e[0]
    if t == "num": return repr(e[1])
    if t == "par": return "(" + show(e[1]) + ")"
    if t == "neg":
        c = e[1]
        inner = show(c, 4)
        if c[0] == "bin": inner = "(" + show(c) + ")"
        return "-" + inner
    if t == "pct":
        c = e[1]
        inner = show(c, 5)
        if c[0] in ("bin", "neg"): inner = "(" + show(c) + ")"
        return inner + "%"
    op, l, r = e[1], e[2], e[3]
    p = PREC[op]
    s = show(l, p, "l") + op + show(r, p, "r")
    return "(" + s + ")" if p < need or (p == need and side == "r") else s

count = 0
while count < 2500:
    e = gen_expr(random.randint(2, 5))
    text = show(e)
    try:
        v = ev(e)
    except Exception:
        continue
    if not mp.isfinite(v) or fabs(v) > mpf(10) ** 60 or (v != 0 and fabs(v) < mpf(10) ** -30):
        continue
    out.append({"fn": "EXPR", "formula": "=" + text, "expected": mp.nstr(v, 28), "note": ""})
    count += 1

json.dump(out, open(sys.argv[1], "w"))
print(len(out), "cases in", round(time.time() - t0, 1), "s")
