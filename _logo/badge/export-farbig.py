#!/usr/bin/env python3
"""Exportiert ein Badge nach assets/badge/ (dort liegen die Dateien für die Website):

  <name>.3mf        zwei getrennte, eingefärbte Objekte „gelb“ und „schwarz“ (AMS/MMU)
  <name>.obj/.mtl   dasselbe als OBJ – lädt auch der 3D-Viewer der Website (assets/js/badge3d.js)
  <name>.stl        ein Körper, Farbwechsel per Pause bei Z = base_h
  <name>-oben.png   Vorschau von oben

Aufruf:
  python3 export-farbig.py                 -> ifsmb-badge.*
  python3 export-farbig.py "Hr. Sladek"    -> ifsmb-badge-hr-sladek.*
Neue Badges auch in _data/badges.yml eintragen.
"""
import os, re, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCAD = os.path.join(HERE, "ifsmb-badge.scad")
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "assets", "badge"))
PARTS = [("gelb", "#FFCC00"), ("schwarz", "#16161D")]


def render(part, name):
    with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as f:
        out = f.name
    cmd = ["openscad", "-D", f'part="{part}"', "-D", f'name="{name}"', "-o", out, SCAD]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    text = open(out).read()
    os.unlink(out)
    verts, index, tris = [], {}, []
    for facet in re.findall(r"outer loop(.*?)endloop", text, re.S):
        tri = []
        for v in re.findall(r"vertex\s+(\S+)\s+(\S+)\s+(\S+)", facet):
            key = tuple(round(float(c), 5) for c in v)
            if key not in index:
                index[key] = len(verts)
                verts.append(key)
            tri.append(index[key])
        if len(set(tri)) == 3:
            tris.append(tri)
    return verts, tris


def write_3mf(path, meshes):
    mats = "".join(f'<base name="{n}" displaycolor="{c}"/>' for n, c in PARTS)
    objs, items = [], []
    for i, ((n, _), (verts, tris)) in enumerate(zip(PARTS, meshes)):
        oid = i + 2
        v = "".join(f'<vertex x="{x}" y="{y}" z="{z}"/>' for x, y, z in verts)
        t = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in tris)
        objs.append(f'<object id="{oid}" name="{n}" type="model" pid="1" pindex="{i}">'
                    f"<mesh><vertices>{v}</vertices><triangles>{t}</triangles></mesh></object>")
        items.append(f'<item objectid="{oid}"/>')
    model = ('<?xml version="1.0" encoding="UTF-8"?>\n'
             '<model unit="millimeter" xml:lang="de-DE" '
             'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
             '<metadata name="Title">IfsMB-Badge</metadata>'
             f'<resources><basematerials id="1">{mats}</basematerials>{"".join(objs)}</resources>'
             f'<build>{"".join(items)}</build></model>')
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml",
                   '<?xml version="1.0" encoding="UTF-8"?>\n'
                   '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                   '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                   '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
                   '</Types>')
        z.writestr("_rels/.rels",
                   '<?xml version="1.0" encoding="UTF-8"?>\n'
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
                   'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
        z.writestr("3D/3dmodel.model", model)


def write_obj(path, meshes):
    mtl = os.path.splitext(path)[0] + ".mtl"
    with open(mtl, "w") as f:
        for n, c in PARTS:
            r, g, b = (int(c[i:i + 2], 16) / 255 for i in (1, 3, 5))
            f.write(f"newmtl {n}\nKd {r:.4f} {g:.4f} {b:.4f}\n\n")
    with open(path, "w") as f:
        f.write(f"mtllib {os.path.basename(mtl)}\n")
        base = 1
        for (n, _), (verts, tris) in zip(PARTS, meshes):
            f.write(f"o {n}\nusemtl {n}\n")
            f.writelines(f"v {x} {y} {z}\n" for x, y, z in verts)
            f.writelines(f"f {a + base} {b + base} {c + base}\n" for a, b, c in tris)
            base += len(verts)


name = sys.argv[1] if len(sys.argv) > 1 else ""
slug = re.sub(r"[^a-z0-9äöüß]+", "-", name.lower()).strip("-")  # "Hr. Sladek" -> "hr-sladek"
stem = "ifsmb-badge" + (f"-{slug}" if slug else "")
meshes = [render(p, name) for p, _ in PARTS]
base = os.path.join(OUT, stem)
write_3mf(base + ".3mf", meshes)
write_obj(base + ".obj", meshes)
q = subprocess.DEVNULL
subprocess.run(["openscad", "-D", f'name="{name}"', "-o", base + ".stl", SCAD], check=True, stdout=q, stderr=q)
subprocess.run(["openscad", "--projection=o", "--camera=0,-3,0,0,0,0,110", "--imgsize=1200,800",
                "--colorscheme=Tomorrow", "-D", f'name="{name}"', "-o", base + "-oben.png", SCAD],
               check=True, stdout=q, stderr=q)
for (n, _), (v, t) in zip(PARTS, meshes):
    print(f"{stem}: {n} {len(v)} Punkte, {len(t)} Dreiecke")
