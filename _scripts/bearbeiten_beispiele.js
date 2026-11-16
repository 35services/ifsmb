// Edit forms (NeuFormular.bearbeiten in assets/js/neu.js) against every real page, for _scripts/test_formulare.rb.
// Per file: unchanged (open + save without changes must give the same bytes), fields shown as "edit on GitHub" (roh),
// and the file after changing the title, a list and the body – the test reads them as YAML.
"use strict";
const fs = require("fs");
const path = require("path");
const Neu = require(path.join(__dirname, "..", "assets", "js", "neu.js"));
const ROOT = path.join(__dirname, "..");
// collection folder → form type (same map as _includes/bearbeiten-knopf.html)
const ORDNER = { _posts: "beitrag", _events: "termin", _projects: "projekt", _equipment: "geraet",
  _herausforderungen: "herausforderung", _team: "team", _press: "presse" };

const ergebnisse = [];
Object.keys(ORDNER).forEach((ordner) => {
  const typ = ORDNER[ordner];
  fs.readdirSync(path.join(ROOT, ordner)).filter((f) => /\.(md|markdown|html)$/.test(f)).sort().forEach((datei) => {
    const pfad = ordner + "/" + datei;
    const quelle = fs.readFileSync(path.join(ROOT, pfad), "utf8");
    const leer = Neu.bearbeitet(typ, quelle, {}, pfad);
    if (!leer) { ergebnisse.push({ pfad, typ, ohne_front_matter: true }); return; }
    const felder = Neu.alleFelder(Neu.TYPEN[typ]);
    const titelFeld = felder.find((f) => f.name === "title") ? "title" : null;
    const listenFeld = felder.find((f) => f.typ === "chips" && !f.einzeln && leer.roh.indexOf(f.name) < 0);
    const aenderung = { text: "Neuer Text: mit Doppelpunkt\n\n- Punkt" };
    if (titelFeld && leer.roh.indexOf("title") < 0) aenderung.title = "Geänderter Titel: „mit“ #Raute";
    if (listenFeld) aenderung[listenFeld.name] = (leer.werte[listenFeld.name] || []).concat(["neu-eintrag"]);
    const geaendert = Neu.bearbeitet(typ, quelle, aenderung, pfad);
    ergebnisse.push({ pfad, typ, unveraendert: leer.inhalt === quelle.replace(/\r\n/g, "\n"), roh: leer.roh,
      aenderung, liste: listenFeld ? listenFeld.name : null, geaendert: geaendert.inhalt, original: quelle });
  });
});
process.stdout.write(JSON.stringify(ergebnisse));
