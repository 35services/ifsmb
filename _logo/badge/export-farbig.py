#!/usr/bin/env python3
"""Exportiert das Badge als 3MF und OBJ mit zwei getrennten, eingefärbten Objekten („gelb“ und „schwarz“).

Im Slicer muss man dann nur noch jedem Objekt ein Filament zuweisen (oder es ist schon richtig eingefärbt).

Aufruf:
  python3 export-farbig.py                 -> ifsmb-badge.3mf / .obj
  python3 export-farbig.py Falko           -> ifsmb-badge-falko.3mf / .obj
"""
import os, re, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
SCAD = os.path.join(HERE, "ifsmb-badge.scad")
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
write_3mf(os.path.join(HERE, stem + ".3mf"), meshes)
write_obj(os.path.join(HERE, stem + ".obj"), meshes)
for (n, _), (v, t) in zip(PARTS, meshes):
    print(f"{stem}: {n} {len(v)} Punkte, {len(t)} Dreiecke")
