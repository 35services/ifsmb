// IfsMB-Badge für den 3D-Druck mit nur EINEM Farbwechsel
//
// Aufbau (von unten nach oben):
//   gelb    – Grundplatte in der Umrissform von Badge + Schatten   (0 … base_h)
//   schwarz – Rand, Schriftzug und Schatten stehen darauf erhaben   (base_h … base_h + relief_h)
// Der Farbwechsel liegt also genau bei Z = base_h. Ein Drucker ohne Mehrfarb-System
// braucht nur eine Pause/einen Filamentwechsel auf dieser Höhe.
//
// Mit name = "" entsteht genau das Logo „Logo (Badge) als SVG“ (../institut/ifsmb-logo-badge.svg).
// Mit einem Namen wird der Schatten unten zu einem schwarzen Band verlängert; die Buchstaben
// des Namens sind dort ausgespart, das Gelb der Grundplatte scheint durch.
//
// Export (siehe README.md):
//   openscad -o ifsmb-badge.stl                       ifsmb-badge.scad
//   openscad -D 'name="Falko"' -o ifsmb-badge-falko.stl ifsmb-badge.scad
//   openscad -D 'part="gelb"'    -o …-gelb.stl    ifsmb-badge.scad   (für AMS/MMU: zwei Teile)
//   openscad -D 'part="schwarz"' -o …-schwarz.stl ifsmb-badge.scad

include <ifsmb-schriftzug.scad>   // Schriftzug „IfsMB“ als Polygon aus dem SVG (keine Schrift nötig)

// Schrift nur für den Namen: SF Mono Heavy wie im Logo (liegt im Terminal-Programm von macOS).
// Auf anderen Systemen name_font auf eine andere fette Schrift stellen, z. B. "DejaVu Sans Mono:style=Bold".
use </System/Applications/Utilities/Terminal.app/Contents/Resources/Fonts/SF-Mono-Heavy.otf>

/* [Allgemein] */
part      = "alles";  // ["alles", "gelb", "schwarz"] alles = ein Körper für Farbwechsel per Pause
breite    = 50;       // Breite des Badges in mm (Außenkante des Rands, ohne Schatten)
tilt      = -3;       // Drehung wie im Logo (Grad, im Uhrzeigersinn negativ), 0 = gerade

/* [Höhen] */
base_h    = 1.4;      // gelbe Grundplatte (mm) = Höhe des Farbwechsels
relief_h  = 0.6;      // schwarze Teile stehen so weit über dem Gelb (mm)

/* [Name] */
name      = "";       // leer = nur Logo, sonst z. B. "Falko"
name_band = 9;        // sichtbare Höhe des schwarzen Bandes unter dem Badge (mm)
name_size = 6;        // gewünschte Schrifthöhe (mm); lange Namen werden automatisch kleiner
name_font = "SF Mono:style=Heavy";
name_advance = 0.83;  // Zeichenbreite / Schriftgröße der Monospace-Schrift (für die Auto-Verkleinerung)

/* [Rückseite] */
// Aussparung für eine Anstecknadel zum Einkleben, [0,0,0] = keine
pin_slot  = [26, 4.2, 0.6];

$fn = 64;

// ---------------------------------------------------------------------------
// Geometrie in SVG-Einheiten (aus ifsmb-logo-badge.svg), Y gespiegelt.
// ---------------------------------------------------------------------------
stroke   = 15;                       // Randbreite im SVG
badge    = [40, 45, 734.4, 275, 40]; // x, y, w, h, rx  (Rand mittig auf dieser Kante)
shadow   = [66.5, 71.5, 749.4, 290, 47.5];

s        = breite / (badge[2] + stroke);   // mm pro SVG-Einheit
outer_bottom = badge[1] + badge[3] + stroke / 2;

// Schatten nach unten verlängern, wenn ein Name drauf soll
shadow_h = name == "" ? shadow[3]
                      : outer_bottom + name_band / s - shadow[1];

// SVG-Rechteck mit runden Ecken (x, y oben links, Y nach unten) -> OpenSCAD
module svg_rect(x, y, w, h, r)
  translate([x, -y - h]) offset(r) offset(-r) square([w, h]);

module outer2d()  offset(stroke / 2)  svg_rect(badge[0], badge[1], badge[2], badge[3], badge[4]);
module inner2d()  offset(-stroke / 2) svg_rect(badge[0], badge[1], badge[2], badge[3], badge[4]);
module shadow2d() svg_rect(shadow[0], shadow[1], shadow[2], shadow_h, shadow[4]);

// Name im sichtbaren Teil des Bandes zentrieren; zu lange Namen passend verkleinern
band_w    = shadow[2] - 2 * shadow[4];                   // nutzbare Breite (SVG-Einheiten)
band_top  = outer_bottom;
band_bot  = shadow[1] + shadow_h;
name_fit  = min(name_size / s, band_w / max(1, len(name) * name_advance));
module name2d()
  translate([shadow[0] + shadow[2] / 2, -(band_top + band_bot) / 2])
    text(name, size = name_fit, font = name_font, halign = "center", valign = "center");

module yellow2d() union() { outer2d(); shadow2d(); }

module black2d() {
  difference() { outer2d(); inner2d(); }               // Rand
  ifsmb_schriftzug();                                  // IfsMB
  difference() {                                       // Schatten (bzw. Namensband)
    shadow2d();
    outer2d();
    if (name != "") name2d();
  }
}

// SVG-Einheiten -> mm, Mittelpunkt des Badges in den Ursprung (gedreht wird danach um diesen Punkt)
module flat() scale([s, s]) translate(-[badge[0] + badge[2] / 2, -(badge[1] + badge[3] / 2)]) children();

module yellow() {
  difference() {
    linear_extrude(base_h) rotate(tilt) flat() yellow2d();
    if (pin_slot[0] > 0)
      translate([0, 0, -0.01]) linear_extrude(pin_slot[2] + 0.01)
        square([pin_slot[0], pin_slot[1]], center = true);
  }
}
module black() translate([0, 0, base_h]) linear_extrude(relief_h) rotate(tilt) flat() black2d();

if (part == "gelb")    color("#ffcc00") yellow();
if (part == "schwarz") color("#16161d") black();
if (part == "alles")   { color("#ffcc00") yellow(); color("#16161d") black(); }
