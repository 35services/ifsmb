#!/usr/bin/env python3
"""Erzeugt ifsmb-schriftzug.scad aus dem Pfad in ../institut/ifsmb-logo-badge.svg.

Koordinaten bleiben SVG-Einheiten, nur Y wird gespiegelt (OpenSCAD: Y nach oben).
Quadratische Bezier-Kurven (Q) werden in Liniensegmente zerlegt.
Aufruf: python3 schriftzug-aus-svg.py
"""
import os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = os.path.join(HERE, "..", "institut", "ifsmb-logo-badge.svg")
OUT = os.path.join(HERE, "ifsmb-schriftzug.scad")
STEPS = 8  # Segmente pro Kurve

d = re.search(r'<path fill="#16161d" d="([^"]+)"', open(SVG).read()).group(1)
tokens = re.findall(r"[MLHVQZ]|-?\d*\.?\d+", d)

contours, cur, i, cmd = [], [], 0, None
x = y = 0.0
def num():
    global i
    v = float(tokens[i]); i += 1; return v
while i < len(tokens):
    if re.match(r"[A-Z]", tokens[i]):
        cmd = tokens[i]; i += 1
    if cmd == "M":
        if cur: contours.append(cur)
        x, y = num(), num(); cur = [(x, y)]; cmd = "L"
    elif cmd == "L":
        x, y = num(), num(); cur.append((x, y))
    elif cmd == "H":
        x = num(); cur.append((x, y))
    elif cmd == "V":
        y = num(); cur.append((x, y))
    elif cmd == "Q":
        cx, cy, ex, ey = num(), num(), num(), num()
        for k in range(1, STEPS + 1):
            t = k / STEPS
            cur.append(((1-t)**2*x + 2*(1-t)*t*cx + t*t*ex,
                        (1-t)**2*y + 2*(1-t)*t*cy + t*t*ey))
        x, y = ex, ey
    elif cmd == "Z":
        if cur: contours.append(cur); cur = []
        cmd = None
if cur: contours.append(cur)

pts, paths = [], []
for c in contours:
    if c[0] == c[-1]: c = c[:-1]
    paths.append(list(range(len(pts), len(pts) + len(c))))
    pts += c

with open(OUT, "w") as f:
    f.write("// Automatisch erzeugt von schriftzug-aus-svg.py aus ../institut/ifsmb-logo-badge.svg – nicht von Hand bearbeiten.\n")
    f.write("// Schriftzug „IfsMB“ in SVG-Einheiten, Y gespiegelt (SVG-Punkt (x, y) -> (x, -y)).\n")
    f.write("module ifsmb_schriftzug() polygon(points = [\n")
    f.write(",\n".join(f"  [{px:.2f}, {-py:.2f}]" for px, py in pts))
    f.write("\n], paths = [\n")
    f.write(",\n".join("  [" + ", ".join(map(str, p)) + "]" for p in paths))
    f.write("\n]);\n")
print(f"{len(contours)} Konturen, {len(pts)} Punkte -> {OUT}")
