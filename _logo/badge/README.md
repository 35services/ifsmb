# IfsMB-Badge zum Drucken (gelb + schwarz, ein Farbwechsel)

Das Logo „Logo (Badge) als SVG“ (`../institut/ifsmb-logo-badge.svg`) als flaches Badge, optional mit Namen.

![Badge](ifsmb-badge-oben.png) ![Badge mit Namen](ifsmb-badge-falko-oben.png)

| Datei | Inhalt |
|---|---|
| `ifsmb-badge.scad` | OpenSCAD-Quelle; Parameter oben in der Datei (auch im Customizer von OpenSCAD) |
| `ifsmb-schriftzug.scad` | Schriftzug „IfsMB“ als Polygon, erzeugt aus dem Logo-SVG – nicht von Hand bearbeiten |
| `schriftzug-aus-svg.py` | erzeugt `ifsmb-schriftzug.scad` neu, falls sich das Logo-SVG ändert |
| `ifsmb-badge.stl` | nur Logo, 52,8 × 24 × 2 mm |
| `ifsmb-badge-falko.stl` | Beispiel mit Namen „Falko“, 52,8 × 30,7 × 2 mm |
| `ifsmb-badge-oben.png`, `ifsmb-badge-falko-oben.png` | Vorschau |

## Aufbau

- **0 – 1,4 mm gelb**: Grundplatte in der Umrissform von Badge und Schatten.
- **1,4 – 2,0 mm schwarz**: Rand, Schriftzug und Schatten stehen 0,6 mm erhaben darauf.
- **Mit Namen**: der Schatten wird unten zu einem schwarzen Band verlängert; die Buchstaben des Namens sind darin ausgespart, dort scheint das Gelb durch.

Es gibt also genau **einen Farbwechsel, bei Z = 1,4 mm**. Ein normaler Drucker ohne Mehrfarb-System reicht.

## Drucken

1. STL laden, flach auf der Rückseite liegen lassen, 0,2 mm Schichthöhe.
2. Mit gelbem Filament starten.
3. Im Slicer auf der Ebene **1,4 mm** (bzw. der ersten Schicht darüber) einen Filamentwechsel / eine Pause einfügen
   (Bambu/Orca: Rechtsklick auf den Schicht-Schieber → „Pause/Filamentwechsel“, PrusaSlicer: „+“ am Schieber → „Farbwechsel (M600)“).
4. Nach dem Wechsel schwarz zu Ende drucken.

Auf der Rückseite ist eine Aussparung (26 × 4,2 × 0,6 mm) für eine Anstecknadel zum Einkleben (`pin_slot = [0,0,0]` schaltet sie ab).

Mit AMS/MMU geht es auch als zwei Teile eines Objekts (`part="gelb"` und `part="schwarz"` exportieren, beide gleichzeitig laden, gleicher Ursprung).

## Eigener Name

```bash
openscad -D 'name="Falko"' -o ifsmb-badge-falko.stl ifsmb-badge.scad
```

- Schrift ist SF Mono Heavy wie im Logo (wird aus dem Terminal-Programm von macOS geladen, liegt nicht im Repo). Auf anderen Systemen `name_font` umstellen, z. B. `-D 'name_font="DejaVu Sans Mono:style=Bold"'`.
- `name_size` (6 mm) ist die Wunschhöhe; lange Namen werden automatisch kleiner, damit sie ins Band passen. Bis 8 Zeichen bleibt es bei 6 mm, bis etwa 13 Zeichen über 4 mm.
- `name_band` (9 mm) ist die sichtbare Höhe des schwarzen Bandes.

## Neu exportieren

```bash
openscad -o ifsmb-badge.stl ifsmb-badge.scad
openscad -D 'name="Falko"' -o ifsmb-badge-falko.stl ifsmb-badge.scad
# Vorschau (farbig, von oben)
openscad --projection=o --camera=0,-3,0,0,0,0,110 --imgsize=1200,800 --colorscheme=Tomorrow -o ifsmb-badge-oben.png ifsmb-badge.scad
```
