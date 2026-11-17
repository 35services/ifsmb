// "➕ new" forms: one pop-up per resource type, built from the schemas in TYPEN with the building blocks of
// assets/js/formular.js (chip fields with autocomplete, dialog, YAML). Loaded on the first click on a ➕ link
// (_includes/neu-buttons.html). Each link carries data-neu = { typ, label, hinweis, werte } – werte is the connection
// to the current page (author, team, tags, projekte …). Without JS the link opens GitHub with the full template.
// The form writes the new file (front matter + Markdown, or plain YAML), shows it live, keeps a draft in
// localStorage and creates it through GitHub's "new file" editor (→ pull request).
// NeuFormular.datei(typ, werte) builds a file without DOM – used by the tests (_scripts/test_formulare.rb).
//
// "✏️ Bearbeiten" (_includes/bearbeiten-knopf.html) opens the same form for an existing page: NeuFormular.bearbeiten(link)
// loads the unprocessed source from /quelltext/<pfad> (_plugins/quelltexte.rb), fills the fields and writes back only
// what was changed – every other line (unknown fields, comments, galleries, formatting) stays byte for byte.
// GitHub's edit page can't be prefilled, so saving copies the file and opens the editor to paste it.
// NeuFormular.bearbeitet(typ, quelle, aenderungen) does the same without DOM (tests).
var NeuFormular = (function () {
  "use strict";
  var F = typeof Formular !== "undefined" ? Formular : require("./formular.js");
  var esc = F.esc;

  // ---------- field factories ----------
  // Field: { typ, name, label, pflicht, platzhalter, hilfe, standard (value or function), folgt(w) (derived value until
  // the field is edited), mehr (under "Weitere Felder"), optionen, quelle, einzeln, liste (datalist from the index),
  // ausgabe(v, w) (value written to the file), intern (not written to the front matter) }.
  // An array of fields is one row.
  function feld(typ, name, label, extra) { return Object.assign({ typ: typ, name: name, label: label }, extra); }
  function text(name, label, x) { return feld("text", name, label, x); }
  function adresse(name, label, x) { return feld("adresse", name, label, Object.assign({ platzhalter: "https://…" }, x)); }
  function datum(name, label, x) { return feld("datum", name, label, x); }
  function zeit(name, label, x) { return feld("zeit", name, label, x); }
  function zahl(name, label, x) { return feld("zahl", name, label, Object.assign({ ausgabe: function (v) { return v === "" ? "" : Number(v); } }, x)); }
  function haken(name, label, x) { return feld("haken", name, label, x); }
  function auswahl(name, label, optionen, x) { return feld("auswahl", name, label, Object.assign({ optionen: optionen, standard: optionen[0][0] }, x)); }
  function chips(name, label, quelle, x) { return feld("chips", name, label, Object.assign({ quelle: quelle }, x)); }
  function titel(platzhalter, x) { return text("title", "Titel", Object.assign({ pflicht: true, platzhalter: platzhalter, klasse: "form-feld-titel" }, x)); }
  function inhalt(platzhalter, x) { return feld("langtext", "text", "Text (Markdown)", Object.assign({ intern: true, markdown: true, zeilen: 10, platzhalter: platzhalter }, x)); }

  // fields that many types share
  var stichworte = function (x) { return chips("tags", "🏷️ Stichworte", "stichworte", Object.assign({ platzhalter: "Stichwort suchen oder neu …" }, x)); };
  var verlinkt = function () { return chips("verlinkt", "🔗 Verknüpft (Termine, Beiträge, Geräte, Seiten …)", "seiten", { platzhalter: "Seite suchen oder /adresse/ …" }); };
  var leute = function (name, label, x) { return chips(name, label, "personen", Object.assign({ platzhalter: "Name aus dem Team …" }, x)); };
  var partner = function (name, label, x) { return chips(name, label, "partner", Object.assign({ platzhalter: "Partner suchen …" }, x)); };
  var projekte = function (name, label, x) { return chips(name, label, "projekte", Object.assign({ platzhalter: "Projekt suchen …" }, x)); };
  var persoenlich = function (hilfe) { return haken("persoenlich", "Persönlich", { hilfe: hilfe }); };
  var socialBild = function () { return text("social_media_preview_image", "Social-Media-Vorschaubild (1200×630 px)", { mehr: true, platzhalter: "/assets/images/og-….jpg – leer = erstes Bild oder Standard" }); };

  // ---------- values ----------
  function jetzt(stunde) {
    var d = new Date();
    return F.heute() + "T" + (stunde == null ? F.zwei(d.getHours()) + ":" + F.zwei(d.getMinutes()) : F.zwei(stunde) + ":00");
  }
  function lokal(d) { return d.getFullYear() + "-" + F.zwei(d.getMonth() + 1) + "-" + F.zwei(d.getDate()) + "T" + F.zwei(d.getHours()) + ":" + F.zwei(d.getMinutes()); }
  function plusStunden(v, h) { var d = new Date(v); if (!v || isNaN(d)) return ""; d.setHours(d.getHours() + h); return lokal(d); }
  // "2026-11-13T14:05" → "2026-11-13 14:05:00 +0100" (UTC offset of that day)
  function mitZone(v) {
    if (!v) return "";
    var off = -new Date(v).getTimezoneOffset();
    return v.replace("T", " ").slice(0, 16) + ":00 " + (off >= 0 ? "+" : "-") + F.zwei(Math.floor(Math.abs(off) / 60)) + F.zwei(Math.abs(off) % 60);
  }
  function ohneT(v) { return v ? v.replace("T", " ").slice(0, 16) : ""; }
  function tag(v) { return String(v || "").slice(0, 10); }
  // one value as a plain scalar, several as a list (author, standort_partner – single-value fields in .pages.yml)
  function einerOderListe(v) { return v && v.length === 1 ? v[0] : v; }
  // free text into a list (owner_name is `list: true` in .pages.yml)
  function alsEintrag(v) { return v ? [v] : ""; }
  // "a, b" / "[a, b]" / '"Name"' / array (prefills from _includes/neu-button.html) → array
  function alsListe(v) {
    if (Array.isArray(v)) return v.map(String);
    return String(v == null ? "" : v).replace(/^\s*\[|\]\s*$/g, "").split(",")
      .map(function (s) { return s.trim().replace(/^["']|["']$/g, ""); }).filter(Boolean);
  }

  // ---------- schemas ----------
  var STATUS_PROJEKT = [["aktuell", "🛠️ Aktuell"], ["idee", "💡 Idee"], ["anfrage", "📨 Anfrage"], ["abgeschlossen", "✅ Abgeschlossen (Archiv)"]];
  function projektFelder() {
    return [
      titel("Name des Projekts"),
      text("summary", "Kurzbeschreibung (Projektkarte)", { platzhalter: "Ein bis zwei Sätze, worum es geht" }),
      [auswahl("status", "Status", STATUS_PROJEKT), datum("start", "Start", { pflicht: true, standard: F.heute, hilfe: "wird zum Sortieren genutzt" }),
        text("zeitraum", "Zeitraum", { platzhalter: "z. B. Herbst 2026", folgt: function (w) { return w.status === "abgeschlossen" || !w.start ? "" : "seit " + w.start.slice(0, 4); } })],
      [text("ort", "Ort", { platzhalter: "z. B. Kurt-Tucholsky-Grundschule, Moabit – keine Wohnadressen" }),
        text("event_tag", "Eigenes Stichwort (event_tag)", { folgt: function (w) { return F.slugify(w.title); }, hilfe: "Beiträge und Termine mit diesem Stichwort erscheinen auf der Projektseite – nie ein allgemeines wie 35services" })],
      leute("team", "👥 Beteiligte"),
      partner("partners", "🤝 Partner"),
      projekte("teil_von", "🧩 Teil von", { hilfe: "Nur für Teilprojekte – erscheinen dann nicht in den Übersichten" }),
      projekte("verwandt", "↔️ Verwandte Projekte", { mehr: true }),
      verlinkt(),
      persoenlich("Privates Projekt aus dem Team: nur im Teamprofil, nicht in den Listen des Instituts"),
      inhalt("Ziel, Stand, was gebraucht wird …"),
      text("image", "Titelbild", { mehr: true, platzhalter: "/assets/images/projekte/<name>/01.jpg – ohne Metadaten" }),
      socialBild()
    ];
  }
  var TYPEN = {
    beitrag: {
      titel: "Beitrag", ordner: "_posts",
      datei: function (w) { return tag(w.date) + "-" + F.slugify(w.title, "titel-des-beitrags") + ".md"; },
      felder: [
        titel("Titel des Beitrags"),
        [zeit("date", "Datum & Uhrzeit", { pflicht: true, standard: function () { return jetzt(); }, ausgabe: mitZone }),
          persoenlich("Persönliches Update: nicht unter Neuigkeiten, sondern im Teamprofil")],
        leute("author", "✍️ Autor*in", { pflicht: true, standard: ["falko-richter"], ausgabe: einerOderListe }),
        stichworte({ hilfe: "Das event_tag eines Projekts zeigt den Beitrag auf der Projektseite" }),
        verlinkt(),
        inhalt("Text in Markdown. Fotos als Galerie: ![Was zu sehen ist](/assets/images/news/<dateiname>/01.jpg) und darunter {: .gallery}"),
        adresse("original_url", "Original-Adresse", { mehr: true, hilfe: "nur bei übernommenen Beiträgen" }),
        text("original_site", "Original-Website", { mehr: true, platzhalter: "z. B. 35services.de" }),
        socialBild()
      ]
    },
    termin: {
      titel: "Termin", ordner: "_events",
      datei: function (w) { return tag(w.start) + "-" + F.slugify(w.title, "name-des-termins") + ".md"; },
      felder: [
        titel("Name des Termins"),
        [zeit("start", "Beginn", { pflicht: true, standard: function () { return jetzt(16); }, ausgabe: ohneT }),
          zeit("end", "Ende", { folgt: function (w) { return plusStunden(w.start, 2); }, ausgabe: ohneT }),
          haken("all_day", "Ganztägig")],
        [text("location", "Ort", { platzhalter: "Ort, Straße (keine Wohnadressen)" }), adresse("location_url", "Link zum Ort")],
        text("summary", "Kurzbeschreibung (Terminliste & iCal)"),
        leute("team", "👥 Dabei", { hilfe: "nur wer wirklich da ist/war" }),
        projekte("projekte", "🔧 Projekte"),
        stichworte(),
        partner("partners", "🤝 Partner"),
        verlinkt(),
        [persoenlich("Privater Termin aus dem Team (braucht „Dabei“): nur im Teamprofil"),
          haken("nur_projekt", "Nur auf der Projektseite", { hilfe: "interner Termin: vorher nicht im Kalender, danach normal" })],
        inhalt("Was passiert, wer kann kommen, was mitbringen …"),
        text("date_label", "Text statt Datum", { mehr: true, platzhalter: "z. B. „Januar 2027 – genauer Termin folgt“" }),
        socialBild()
      ]
    },
    projekt: {
      titel: "Projekt", ordner: "_projects",
      datei: function (w) { return F.slugify(w.title, "name-des-projekts") + ".md"; },
      felder: projektFelder()
    },
    "projekt-vergangen": {
      titel: "Vergangenes Projekt", ordner: "_projects",
      datei: function (w) { return F.slugify(w.title, "name-des-projekts") + ".md"; },
      felder: projektFelder(),
      standard: {
        status: "abgeschlossen", start: "",
        text: "**Worum ging es?**\n\nFür wen war das Projekt, was war das Ziel?\n\n**Was wir gemacht haben:**\n\n- Erster Schritt\n- Zweiter Schritt\n\n**Was daraus geworden ist:**\n\nErgebnis, was wir gelernt haben, wie es weitergeht."
      }
    },
    geraet: {
      titel: "Gerät", ordner: "_equipment",
      datei: function (w) { return F.slugify(w.title, "hersteller-modell") + ".md"; },
      felder: [
        titel("Hersteller Modell"),
        [text("kategorie", "Kategorie", { liste: "kategorien", platzhalter: "z. B. 3D-Drucker" }),
          auswahl("status", "Status", [["", "Im Einsatz"], ["in-aussicht", "🔭 In Aussicht"], ["im-test", "🧪 Im Test"], ["in-reparatur", "🔧 In Reparatur"]])],
        text("summary", "Kurzbeschreibung", { platzhalter: "Was das Gerät kann und wofür wir es nutzen" }),
        leute("owner_team", "🔑 Gehört (Team)"),
        partner("owner_partner", "🔑 Gehört (Partner)"),
        text("owner_name", "🔑 Gehört (andere)", { platzhalter: "freier Name", ausgabe: alsEintrag }),
        [text("standort", "Standort", { platzhalter: "z. B. KTG, Raum 101" }),
          partner("standort_partner", "📍 Steht bei Partner", { einzeln: true, ausgabe: einerOderListe })],
        stichworte({ hilfe: "Gerät, Gerätetyp, Besitzer*in, z. B. bambu-lab-a1-mini, 3d-drucker" }),
        verlinkt(),
        inhalt("Was das Gerät kann, Erfahrungen, Tipps …"),
        text("image", "Foto", { mehr: true, platzhalter: "eigenes Foto ohne Metadaten – keine Hersteller- oder Shopfotos" }),
        text("image_alt", "Beschreibung des Fotos", { mehr: true }),
        haken("image_is_illustration", "Foto ist eine eigene SVG-Illustration", { mehr: true }),
        socialBild()
      ],
      pruefe: function (w) {
        if (!(w.owner_team || []).length && !(w.owner_partner || []).length && !w.owner_name) return "Wem gehört das Gerät? Bitte mindestens eine Besitzer*in eintragen – das Institut besitzt selbst nichts.";
      }
    },
    herausforderung: {
      titel: "Herausforderung", ordner: "_herausforderungen",
      datei: function (w) { return F.slugify(w.title, "kurzer-name") + ".md"; },
      felder: [
        titel("Was ist die Herausforderung? (kurz, gern als Frage)"),
        text("summary", "Kurz (ein Satz für die Karte)"),
        [auswahl("art", "Art", [["frage", "❓ Frage"], ["aufgabe", "📋 Aufgabe"], ["problem", "⚠️ Problem"]]),
          auswahl("status", "Status", [["offen", "Offen"], ["in-arbeit", "In Arbeit"], ["geloest", "Gelöst"]]),
          datum("seit", "Seit", { standard: F.heute })],
        [haken("wichtig", "Wichtig", { hilfe: "allein 📌 einplanen, mit dringend 🔥 sofort" }),
          haken("dringend", "Dringend", { hilfe: "allein 🤝 abgeben, keins von beiden 💤 später" })],
        leute("team", "👥 Zuständig"),
        projekte("projekte", "🔧 Projekte"),
        stichworte(),
        verlinkt(),
        persoenlich("Aus einem privaten Projekt im Team"),
        inhalt("Was ist das Problem, was wurde schon probiert, was wird gebraucht?"),
        datum("geloest_am", "Gelöst am", { mehr: true }),
        feld("langtext", "loesung", "Lösung (Markdown)", { mehr: true, markdown: true, zeilen: 4 }),
        socialBild()
      ]
    },
    team: {
      titel: "Teamprofil", ordner: "_team",
      datei: function (w) { return F.slugify(w.title, "vorname-nachname") + ".md"; },
      felder: [
        text("title", "Name", { pflicht: true, platzhalter: "Vorname Nachname", klasse: "form-feld-titel", hilfe: "Der Dateiname wird das Team-Kürzel für team, author, owner_team" }),
        [text("role", "Rolle", { platzhalter: "z. B. hilft in der KTG-AG" }), zahl("order", "Reihenfolge", { standard: "50", hilfe: "kleiner = weiter vorne" })],
        verlinkt(),
        haken("nicht_im_team", "Nicht auf /team/ auflisten (nur eigene Seite zum Verlinken)"),
        inhalt("Was die Person macht und womit sie im Makespace hilft – keine Wohnadresse, keine privaten E-Mail-Adressen"),
        text("photo", "Foto", { mehr: true, platzhalter: "/assets/images/team/<kürzel>-480w.jpg – nur mit Erlaubnis" }),
        text("photo_credit", "Bildnachweis", { mehr: true, hilfe: "Pflicht bei Fremdfotos (Presse, Agentur)" }),
        socialBild()
      ]
    },
    presse: {
      titel: "Pressemitteilung", ordner: "_press",
      datei: function (w) { return tag(w.date) + "-" + F.slugify(w.title, "titel-der-mitteilung") + ".md"; },
      felder: [
        titel("Überschrift der Pressemitteilung"),
        [text("subtitle", "Unterzeile"), datum("date", "Datum", { pflicht: true, standard: F.heute })],
        stichworte(),
        verlinkt(),
        inhalt("**Berlin, Datum** – Erster Absatz mit dem Wichtigsten: wer, was, wann, wo, warum."),
        text("contact_name", "Pressekontakt", { mehr: true, hilfe: "leer = Pressekontakt aus _data/presse.yml" }),
        socialBild()
      ]
    },
    partner: {
      titel: "Partner", ordner: "_data/partner", format: "yaml",
      datei: function (w) { return F.slugify(w.name, "name-des-partners") + ".yml"; },
      felder: [
        text("name", "Name", { pflicht: true, klasse: "form-feld-titel", hilfe: "genau so, wie andere Seiten ihn unter partners: nennen" }),
        adresse("url", "Website", { pflicht: true }),
        text("description", "Beschreibung", { platzhalter: "Wer der Partner ist und wie wir zusammenarbeiten" }),
        adresse("instagram", "Instagram", { mehr: true }),
        text("logo", "Logo", { mehr: true, platzhalter: "/assets/images/partner/<name>.png" }),
        haken("logo_dark", "Logo hat helle Elemente (dunkler Hintergrund)", { mehr: true }),
        text("page", "Eigene Partnerseite", { mehr: true, platzhalter: "/partner/<name>/" })
      ]
    },
    pressebericht: {
      titel: "Wir in der Presse", ordner: "_data/pressebericht", format: "yaml",
      datei: function (w) { return (w.datum ? w.datum + "-" : "") + F.slugify(w.medium, "medium") + ".yml"; },
      felder: [
        text("titel", "Überschrift des Berichts", { pflicht: true, klasse: "form-feld-titel" }),
        [text("medium", "Medium", { pflicht: true, platzhalter: "Zeitung, Website oder Kanal" }), datum("datum", "Erschienen am", { standard: F.heute })],
        adresse("url", "Link zum Bericht", { pflicht: true, hilfe: "ohne Tracking-Parameter (?si=, utm_ …)" }),
        chips("anlass", "🔗 Anlass (eigene Seite)", "seiten", { einzeln: true, ausgabe: einerOderListe, platzhalter: "Termin oder Beitrag suchen …" }),
        text("hinweis", "Hinweis", { platzhalter: "erscheint in Klammern hinter dem Eintrag" })
      ]
    }
  };

  // ---------- state ----------
  var STORE = "ifsmb-neu:";
  var d = null, form, links, mehrBox, vorschau, socialBox, socialImg, socialTitel, socialBeschr, dateiInput, ordnerEl, status, hinweisEl, vorlageLink;
  var aktiv = null; // { typ, schema, w (values), beruehrt (edited by hand), schluessel, gesendet, felder, bearbeiten }
  var schritteEl, verwerfenBtn, sendenBtn;

  function alleFelder(schema) {
    return schema.felder.reduce(function (a, z) { return a.concat(z); }, []).concat([{ name: "datei", intern: true, folgt: schema.datei }]);
  }
  // Values of a new form: field defaults, then the type's defaults, then the prefill from the page (vorgabe).
  function anfangswerte(schema, vorgabe) {
    var felder = alleFelder(schema), w = {};
    felder.forEach(function (f) {
      var s = typeof f.standard === "function" ? f.standard() : f.standard;
      w[f.name] = f.typ === "chips" ? alsListe(s) : f.typ === "haken" ? !!s : s == null ? "" : String(s);
    });
    Object.assign(w, schema.standard);
    Object.keys(vorgabe || {}).forEach(function (k) {
      var v = vorgabe[k], f = felder.filter(function (x) { return x.name === k; })[0];
      if (!f || v == null || v === "") return;
      w[k] = f.typ === "chips" ? alsListe(v) : f.typ === "haken" ? v === true || v === "true" : String(v);
    });
    return w;
  }
  // Derived fields (file name, event_tag, end …) follow the others until edited by hand. Returns the changed names.
  function folgeWerte(felder, w, beruehrt) {
    return felder.filter(function (f) {
      if (!f.folgt || beruehrt[f.name]) return false;
      var v = f.folgt(w);
      if (v === w[f.name]) return false;
      w[f.name] = v;
      return true;
    }).map(function (f) { return f.name; });
  }
  function speichereEntwurf() {
    try { localStorage.setItem(aktiv.schluessel, JSON.stringify({ w: aktiv.w, beruehrt: aktiv.beruehrt, quelle: aktiv.bearbeiten && aktiv.bearbeiten.quelle })); } catch (e) { /* storage blocked */ }
  }
  function ladeEntwurf() {
    try { return JSON.parse(localStorage.getItem(aktiv.schluessel) || "null"); } catch (e) { return null; }
  }
  function loescheEntwurf() { try { localStorage.removeItem(aktiv.schluessel); } catch (e) { /* storage blocked */ } }

  // ---------- file ----------
  // random v4 UUID for the "read" marker (assets/js/gelesen.js); crypto.randomUUID needs a secure context
  function neueUuid() {
    var c = typeof crypto !== "undefined" ? crypto : null;
    if (c && c.randomUUID) return c.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (z) {
      var r = Math.random() * 16 | 0;
      return (z === "x" ? r : (r & 3 | 8)).toString(16);
    });
  }
  function dateiText(schema, w) {
    var paare = alleFelder(schema).filter(function (f) { return !f.intern; }).map(function (f) {
      return [f.name, f.ausgabe ? f.ausgabe(w[f.name], w) : w[f.name]];
    });
    // pages get a uuid (kept in the draft, so it stays the same while editing); _data/*.yml entries don't
    if (schema.format !== "yaml") {
      if (!w.uuid) w.uuid = neueUuid();
      paare.push(["uuid", w.uuid]);
    }
    return schema.format === "yaml" ? F.yaml(paare) + "\n" : F.frontMatter(paare, w.text);
  }
  function dateiInhalt() { return aktiv.bearbeiten ? bearbeiteterText(aktiv.schema, aktiv.bearbeiten, aktiv.w) : dateiText(aktiv.schema, aktiv.w); }

  // ---------- editing an existing file ----------
  function gleich(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  // value from the file → value of the form field
  function alsFeldwert(f, v) {
    if (f.typ === "chips") return Array.isArray(v) ? v.map(String) : F.leer(v) ? [] : [String(v)];
    if (f.typ === "haken") return v === true || v === "true";
    if (Array.isArray(v) || typeof v === "boolean") return undefined;
    v = String(v);
    if (f.typ === "zeit") { var m = v.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/); return m ? m[1] + "T" + (m[2] || "00:00") : v; }
    if (f.typ === "datum") return v.slice(0, 10);
    if (f.typ === "langtext" || f.typ === "text" || f.typ === "adresse") return v.replace(/\n$/, "");
    return v;
  }
  // Reads a source file for a type. → { quelle, z (blocks), w0 (values as loaded), roh ({ name: true } for fields the
  // form can't show, e.g. lists of objects) } or null if the file has no front matter.
  function liesQuelle(schema, quelle, pfad) {
    var z = F.zerlegeDatei(quelle);
    if (!z) return null;
    var felder = alleFelder(schema), w = anfangswerte(schema), roh = {};
    felder.forEach(function (f) { if (f.typ) w[f.name] = f.typ === "chips" ? [] : f.typ === "haken" ? false : ""; });
    z.bloecke.forEach(function (b) {
      var f = b.key && felder.filter(function (x) { return x.name === b.key && x.typ && !x.intern; })[0];
      if (!f) return;
      var v = F.yamlWert(b.raw), fw = v === undefined ? undefined : alsFeldwert(f, v);
      if (fw === undefined) roh[f.name] = true; else w[f.name] = fw;
      if (b.key === "uuid") w.uuid = v;
    });
    z.bloecke.forEach(function (b) { if (b.key === "uuid") w.uuid = F.yamlWert(b.raw); });
    w.text = z.rest.replace(/^\n+/, "").replace(/\s+$/, "");
    w.datei = pfad ? pfad.split("/").pop() : "";
    return { quelle: quelle, z: z, w0: JSON.parse(JSON.stringify(w)), roh: roh };
  }
  // The file with the changed fields: unchanged blocks stay as they were, changed ones are written anew (or removed
  // when emptied), new fields go to the end of the front matter. The body only changes when the text was edited.
  function bearbeiteterText(schema, b, w) {
    var felder = alleFelder(schema).filter(function (f) { return f.typ && !f.intern; }), gesehen = {};
    function zeile(f) { return F.yaml([[f.name, f.ausgabe ? f.ausgabe(w[f.name], w) : w[f.name]]]); }
    var bloecke = [];
    b.z.bloecke.forEach(function (bl) {
      var f = bl.key && felder.filter(function (x) { return x.name === bl.key; })[0];
      if (f) gesehen[f.name] = true;
      if (!f || b.roh[f.name] || gleich(w[f.name], b.w0[f.name])) { bloecke.push(bl.raw); return; }
      var neu = zeile(f), leerzeilen = (bl.raw.match(/(\n\s*)*$/) || [""])[0];
      // keep a trailing comment of a one-line value ("status: offen   # offen, in-arbeit oder geloest")
      var erste = bl.raw.split("\n")[0], ohne = erste.replace(/\s+#[^"'\n]*$/, "");
      if (neu && neu.indexOf("\n") < 0 && ohne !== erste && gleich(F.yamlWert(ohne), F.yamlWert(erste))) neu += erste.slice(ohne.length);
      if (neu) bloecke.push(neu + leerzeilen); else if (leerzeilen.length > 1) bloecke.push(leerzeilen.slice(1));
    });
    felder.forEach(function (f) {
      if (gesehen[f.name] || gleich(w[f.name], b.w0[f.name])) return;
      var neu = zeile(f);
      if (!neu) return;
      var i = bloecke.length; // before a trailing uuid
      if (b.z.bloecke.length && b.z.bloecke[b.z.bloecke.length - 1].key === "uuid") i = bloecke.length - 1;
      bloecke.splice(i, 0, neu);
    });
    var rest = w.text === b.w0.text ? b.z.rest : "\n" + (String(w.text).trim() ? "\n" + String(w.text).trim() + "\n" : "");
    return F.setzeDatei(b.z, bloecke, rest);
  }
  // Without DOM: the file after changing some values (tests). → { inhalt, roh, werte }
  function bearbeitet(typ, quelle, aenderungen, pfad) {
    var schema = TYPEN[typ], b = liesQuelle(schema, quelle, pfad);
    if (!b) return null;
    var w = Object.assign(JSON.parse(JSON.stringify(b.w0)), aenderungen || {});
    return { inhalt: bearbeiteterText(schema, b, w), roh: Object.keys(b.roh), werte: b.w0 };
  }
  // Lines of neu that are not in alt (longest common subsequence) → array of booleans
  function geaenderteZeilen(alt, neu) {
    var a = alt.split("\n"), n = neu.split("\n"), L = [];
    for (var i = a.length; i >= 0; i--) { L[i] = []; for (var j = n.length; j >= 0; j--) L[i][j] = i === a.length || j === n.length ? 0 : a[i] === n[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]); }
    var r = n.map(function () { return true; }), x = 0, y = 0;
    while (x < a.length && y < n.length) {
      if (a[x] === n[y]) { r[y] = false; x++; y++; } else if (L[x + 1][y] >= L[x][y + 1]) x++; else y++;
    }
    return r;
  }
  // Without DOM: the file a form of this type would create from these values (as if typed in by hand).
  function datei(typ, werte) {
    var schema = TYPEN[typ], w = anfangswerte(schema), beruehrt = {};
    Object.keys(werte || {}).forEach(function (k) { w[k] = werte[k]; beruehrt[k] = werte[k] !== ""; });
    folgeWerte(alleFelder(schema), w, beruehrt);
    return { ordner: schema.ordner, datei: w.datei, inhalt: dateiText(schema, w), format: schema.format || "markdown", werte: w };
  }

  // ---------- dialog ----------
  function baueDialog() {
    d = F.dialog({ id: "neu-dialog", klasse: "neu-dialog", kopf: '<a class="neu-vorlage small" data-vorlage target="_blank" rel="noopener">Vorlage mit allen Feldern ↗</a>' });
    d.insertAdjacentHTML("beforeend",
      '<form class="neu-form" autocomplete="off">'
      + '<div class="neu-spalten"><div class="neu-links"><p class="neu-hinweis muted small"></p><div class="neu-felder"></div>'
      + '<details class="neu-mehr"><summary>Weitere Felder</summary><div class="neu-felder"></div></details></div>'
      + '<aside class="neu-rechts"><label class="form-feld"><span>Neue Datei</span><span class="neu-pfad"><code></code><input name="datei" type="text" required spellcheck="false"></span></label>'
      + '<pre class="neu-vorschau" aria-label="Vorschau der Datei"></pre>'
      + '<details class="neu-social" open><summary>Social-Media-Vorschau (WhatsApp, Signal, X …)</summary>'
      + '<div class="neu-social-karte"><img class="neu-social-bild" src="/assets/images/og-preview.jpg" alt="" loading="lazy">'
      + '<div class="neu-social-text"><span class="neu-social-domain">ifsmb.de</span><strong class="neu-social-titel"></strong><span class="neu-social-beschr"></span></div></div></details>'
      + '<ol class="neu-schritte small"></ol></aside></div>'
      + '<div class="form-fuss"><button type="button" class="btn btn-small btn-ghost" data-verwerfen></button>'
      + '<span class="muted small" data-status aria-live="polite"></span>'
      + '<button type="submit" class="btn" data-senden></button></div></form>');
    form = d.querySelector("form");
    links = d.querySelector(".neu-links > .neu-felder");
    mehrBox = d.querySelector(".neu-mehr");
    vorschau = d.querySelector(".neu-vorschau");
    socialBox = d.querySelector(".neu-social");
    socialImg = d.querySelector(".neu-social-bild");
    socialTitel = d.querySelector(".neu-social-titel");
    socialBeschr = d.querySelector(".neu-social-beschr");
    dateiInput = form.elements.datei;
    ordnerEl = d.querySelector(".neu-pfad code");
    status = d.querySelector("[data-status]");
    hinweisEl = d.querySelector(".neu-hinweis");
    vorlageLink = d.querySelector(".neu-vorlage");
    schritteEl = d.querySelector(".neu-schritte");
    verwerfenBtn = d.querySelector("[data-verwerfen]");
    sendenBtn = d.querySelector("[data-senden]");

    form.addEventListener("input", aenderung);
    form.addEventListener("change", aenderung);
    // Enter in a one-line field must not send the form
    form.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "submit") e.preventDefault(); });
    form.addEventListener("submit", function (e) { e.preventDefault(); anlegen(); });
    verwerfenBtn.addEventListener("click", function () {
      loescheEntwurf();
      if (aktiv.bearbeiten) { aktiv.w = JSON.parse(JSON.stringify(aktiv.bearbeiten.w0)); aktiv.beruehrt = alleBeruehrt(); }
      else { aktiv.w = anfangswerte(aktiv.schema, aktiv.vorgabe); aktiv.beruehrt = {}; }
      folge(); baueFelder(); zeigeVorschau();
      status.textContent = aktiv.bearbeiten ? "Änderungen verworfen." : "Neu angefangen.";
    });
    // "close" fires a moment after close(); if the dialog was opened again meanwhile, leave the new form alone
    d.addEventListener("close", function () { if (d.open) return; if (aktiv && aktiv.gesendet) loescheEntwurf(); entferneEditoren(); aktiv = null; });
  }

  // in edit mode a required field only stays required if the file had a value (old posts without date: …)
  function pflicht(f) { return f.pflicht && !(aktiv.bearbeiten && F.leer(aktiv.bearbeiten.w0[f.name])); }
  function baueFeld(f) {
    if (aktiv.bearbeiten && aktiv.bearbeiten.roh[f.name]) {
      return F.el('<label class="form-feld"><span>' + esc(f.label) + '</span><input type="text" disabled value="(in der Datei als Liste/Objekt – bitte auf GitHub bearbeiten)"></label>');
    }
    var w = aktiv.w[f.name], hilfe = f.hilfe ? '<small class="form-hilfe">' + esc(f.hilfe) + "</small>" : "";
    var label = esc(f.label) + (pflicht(f) ? ' <span class="form-pflicht" aria-hidden="true">*</span>' : "");
    if (f.typ === "chips") {
      return F.chipFeld({
        label: f.label + (pflicht(f) ? " *" : ""), quelle: f.quelle, placeholder: f.platzhalter, hilfe: f.hilfe, einzeln: f.einzeln,
        werte: function () { return aktiv.w[f.name]; },
        setze: function (a) { aktiv.w[f.name] = a; nachAenderung(); }
      });
    }
    if (f.typ === "haken") {
      return F.el('<label class="form-check"><input type="checkbox" name="' + f.name + '"' + (w ? " checked" : "") + "><span>" + label + "</span>" + hilfe + "</label>");
    }
    var attr = ' name="' + f.name + '"' + (pflicht(f) ? " required" : "") + (f.platzhalter ? ' placeholder="' + esc(f.platzhalter) + '"' : "");
    var eingabe;
    if (f.typ === "auswahl") {
      eingabe = "<select" + attr + ">" + f.optionen.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === w ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select>";
    } else if (f.typ === "langtext") {
      eingabe = "<textarea" + attr + ' rows="' + (f.zeilen || 8) + '">' + esc(w) + "</textarea>";
    } else {
      var typ = { text: "text", adresse: "url", datum: "date", zeit: "datetime-local", zahl: "number" }[f.typ];
      eingabe = '<input type="' + typ + '"' + attr + (f.liste ? ' list="neu-liste-' + f.liste + '"' : "") + ' value="' + esc(w) + '">';
    }
    return F.el('<label class="form-feld' + (f.klasse ? " " + f.klasse : "") + '"><span>' + label + "</span>" + eingabe + hilfe + "</label>");
  }

  function baueFelder() {
    entferneEditoren();
    var mehrFelder = mehrBox.querySelector(".neu-felder");
    links.innerHTML = ""; mehrFelder.innerHTML = "";
    aktiv.schema.felder.forEach(function (zeile) {
      var liste = [].concat(zeile), ziel = liste[0].mehr ? mehrFelder : links;
      var els = liste.map(baueFeld);
      if (els.length === 1) { ziel.appendChild(els[0]); return; }
      var reihe = F.el('<div class="form-reihe"></div>');
      els.forEach(function (x) { reihe.appendChild(x); });
      ziel.appendChild(reihe);
    });
    mehrBox.hidden = !mehrFelder.children.length;
    mehrBox.open = aktiv.felder.some(function (f) { return f.mehr && !F.leer(aktiv.w[f.name]); });
    dateiInput.value = aktiv.w.datei;
    aktiv.felder.forEach(function (f) { if (f.liste) fuelleListe(f.liste); });
    markdownEditoren();
  }
  function fuelleListe(key) {
    F.ladeIndex().then(function (I) {
      if (document.getElementById("neu-liste-" + key)) return;
      d.insertAdjacentHTML("beforeend", '<datalist id="neu-liste-' + key + '">' + (I[key] || []).map(function (x) { return '<option value="' + esc(x) + '">'; }).join("") + "</datalist>");
    });
  }

  // ---------- markdown editor ----------
  // Fields with markdown: true get OverType (assets/js/bibliotheken/overtype/, MIT, copied unchanged – no external files),
  // loaded on first use. Its textarea keeps the field's name, so input, preview and draft work as before; if the
  // script can't load, the plain textarea stays. The toolbar can be switched off (🛠️) – off by default on phones,
  // the choice is remembered in this browser.
  var editoren = [], WERKZEUG = "ifsmb-werkzeugleiste";
  var NAV = typeof navigator !== "undefined" ? navigator : {};
  var MAC = /Mac|iPhone|iPad/.test(NAV.platform || NAV.userAgent || "");
  var MOD = MAC ? "⌘" : "Strg+", UMSCHALT = MAC ? "⇧⌘" : "Strg+Umschalt+";
  var LABELS = {
    toolbar: "Formatierung",
    viewModes: { normal: "Bearbeiten", plain: "Nur Text", preview: "Vorschau" },
    buttons: { bold: "Fett", italic: "Kursiv", strikethrough: "Durchgestrichen (" + UMSCHALT + "X)", code: "Code", link: "Link einfügen",
      h1: "Überschrift 1", h2: "Überschrift 2", h3: "Überschrift 3", h4: "Überschrift 4", h5: "Überschrift 5", h6: "Überschrift 6",
      bulletList: "Liste", orderedList: "Nummerierte Liste", taskList: "Aufgabenliste", outdent: "Ausrücken", indent: "Einrücken",
      quote: "Zitat", upload: "Datei hochladen", viewMode: "Ansicht", underline: "Unterstrichen (" + MOD + "U)" }
  };
  // Shortcuts on top of OverType's own (⌘B, ⌘I, ⌘K, ⌘E, ⌥⌘1–3, ⇧⌘7/8/9, ⇧⌘.): ⇧⌘X strikethrough (~~ ~~),
  // ⌘U underline. Markdown has no underline – <u>…</u> is HTML that kramdown passes through. Ctrl instead of ⌘ off Mac.
  var LINIE = 'stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"';
  function unterstreichen(ta) {
    var A = "<u>", Z = "</u>", v = ta.value, s = ta.selectionStart, e = ta.selectionEnd, auswahl = v.slice(s, e), neu, start;
    if (auswahl.length >= A.length + Z.length && auswahl.indexOf(A) === 0 && auswahl.slice(-Z.length) === Z) {
      neu = auswahl.slice(A.length, -Z.length); start = s;                       // tags selected too → remove
    } else if (v.slice(s - A.length, s) === A && v.slice(e, e + Z.length) === Z) {
      ta.setSelectionRange(s - A.length, e + Z.length); neu = auswahl; start = s - A.length; // tags around → remove
    } else {
      neu = A + auswahl + Z; start = s + A.length;                               // wrap
    }
    var inhaltLaenge = neu === auswahl || neu.indexOf(A) !== 0 ? neu.length : auswahl.length;
    ta.focus();
    // insertText keeps undo (⌘Z) working; fallback for browsers without it
    if (!(document.execCommand && document.execCommand("insertText", false, neu))) {
      ta.setRangeText(neu);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    ta.setSelectionRange(start, start + inhaltLaenge);
  }
  function knoepfe() {
    var T = window.toolbarButtons, standard = (window.defaultToolbarButtons || []).slice();
    if (!T || !standard.length) return null; // OverType without exports: keep its default toolbar
    var unterstrichen = {
      name: "underline", actionId: "toggleUnderline", title: "Unterstrichen (" + MOD + "U)",
      icon: '<svg viewBox="0 0 18 18"><path ' + LINIE + ' d="M5,3v5a4,4,0,0,0,8,0V3"></path><line ' + LINIE + ' x1="4" x2="14" y1="15.5" y2="15.5"></line></svg>',
      action: function (o) { unterstreichen(o.editor.textarea); }
    };
    var i = standard.indexOf(T.italic);
    standard.splice(i < 0 ? 2 : i + 1, 0, T.strikethrough, unterstrichen);
    return standard;
  }
  function tasten(e, ed) {
    if (!(MAC ? e.metaKey : e.ctrlKey) || e.altKey) return;
    var k = (e.key || "").toLowerCase();
    if (k === "u" && !e.shiftKey) { e.preventDefault(); ed.performAction("toggleUnderline", e); }
    else if (k === "x" && e.shiftKey) { e.preventDefault(); ed.performAction("toggleStrikethrough", e); }
  }
  function werkzeugleiste(an) {
    if (an != null) { try { localStorage.setItem(WERKZEUG, an ? "1" : "0"); } catch (e) { /* storage blocked */ } return an; }
    try { var v = localStorage.getItem(WERKZEUG); if (v != null) return v === "1"; } catch (e) { /* storage blocked */ }
    return !(window.matchMedia && window.matchMedia("(max-width: 640px)").matches);
  }
  function entferneEditoren() {
    editoren.forEach(function (e) { try { e.destroy(); } catch (x) { /* already gone */ } });
    editoren = [];
  }
  function markdownEditoren() {
    var fuer = aktiv, felder = aktiv.felder.filter(function (f) { return f.markdown && form.elements[f.name]; });
    if (!felder.length || !window.ladeSkripte) return;
    window.ladeSkripte(["bibliotheken/overtype/overtype.min.js"]).then(function () {
      if (aktiv !== fuer || !window.OverType) return; // dialog closed or reopened meanwhile
      felder.forEach(function (f) { macheEditor(f, fuer); });
    }).catch(function () { /* plain textarea stays */ });
  }
  function macheEditor(f, fuer) {
    var ta = form.elements[f.name];
    if (!ta || ta.tagName !== "TEXTAREA") return;
    var alt = ta.closest(".form-feld"), an = werkzeugleiste();
    // a <div> instead of the <label>: clicks on the toolbar must not jump into the text
    var feld = F.el('<div class="form-feld form-md' + (an ? "" : " ohne-werkzeugleiste") + '"><div class="form-md-kopf"><span>'
      + esc(f.label) + '</span><button type="button" class="btn btn-ghost btn-small form-md-schalter" aria-pressed="' + an
      + '" title="Werkzeugleiste ein- oder ausblenden">🛠️ <span class="form-md-schalter-text">Werkzeugleiste</span></button></div>'
      + '<div class="form-md-editor"></div>' + (f.hilfe ? '<small class="form-hilfe">' + esc(f.hilfe) + "</small>" : "") + "</div>");
    alt.replaceWith(feld);
    var ed = new window.OverType(feld.querySelector(".form-md-editor"), {
      value: aktiv.w[f.name] || "",
      toolbar: true, toolbarButtons: knoepfe() || undefined, labels: LABELS, placeholder: f.platzhalter || "",
      onKeydown: tasten,
      fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace", fontSize: "14px", lineHeight: 1.6,
      autoResize: true, minHeight: Math.max(6, (f.zeilen || 8) * 1.6) + "em", maxHeight: "60vh",
      spellcheck: true,
      textareaProps: { name: f.name, "aria-label": f.label },
      onChange: function (v) {
        if (aktiv !== fuer || v === aktiv.w[f.name]) return;
        aktiv.w[f.name] = v;
        nachAenderung();
      }
    })[0];
    editoren.push(ed);
    var schalter = feld.querySelector(".form-md-schalter");
    schalter.addEventListener("click", function () {
      var neu = schalter.getAttribute("aria-pressed") !== "true";
      werkzeugleiste(neu);
      schalter.setAttribute("aria-pressed", String(neu));
      feld.classList.toggle("ohne-werkzeugleiste", !neu);
    });
  }

  // update derived fields and their inputs (except the one being typed in)
  function folge(ausser) {
    folgeWerte(aktiv.felder, aktiv.w, aktiv.beruehrt).forEach(function (n) {
      var input = form && form.elements[n];
      if (input && input !== ausser) input.value = aktiv.w[n];
    });
  }
  function aenderung(e) {
    var t = e.target, n = t.name;
    if (!n || !(n in aktiv.w)) return;
    var v = t.type === "checkbox" ? t.checked : t.value;
    if (v === aktiv.w[n]) return;
    aktiv.w[n] = v;
    aktiv.beruehrt[n] = v !== ""; // emptied → follows again
    folge(t);
    nachAenderung();
  }
  function nachAenderung() {
    folge();
    zeigeVorschau();
    speichereEntwurf();
    aktiv.gesendet = false;
    status.textContent = "";
  }
  function erstesMarkdownBild(md) {
    var m = String(md || "").match(/!\[[^\]]*\]\(([^)\s]+)\)/);
    return m && !/\.svg$/i.test(m[1]) ? m[1] : "";
  }
  function ersteTextzeile(md) {
    return String(md || "").replace(/!\[[^\]]*\]\([^)]*\)|\{:[^}]*\}/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[#*_>`~]/g, "").split("\n").map(function (z) { return z.trim(); }).filter(Boolean)[0] || "";
  }
  function zeigeVorschau() {
    var text = dateiInhalt();
    if (aktiv.bearbeiten) {
      var markiert = geaenderteZeilen(aktiv.bearbeiten.quelle.replace(/\r\n/g, "\n"), text), zahl = markiert.filter(Boolean).length;
      vorschau.innerHTML = text.split("\n").map(function (z, i) { return markiert[i] ? '<mark class="neu-geaendert">' + esc(z || " ") + "</mark>" : esc(z); }).join("\n");
      sendenBtn.disabled = !zahl;
      sendenBtn.title = zahl ? "" : "Noch nichts geändert";
    } else vorschau.textContent = text;
    if (!socialBox) return;
    var w = aktiv.w, istSeite = aktiv.schema.format !== "yaml";
    socialBox.hidden = !istSeite;
    if (!istSeite) return;
    var bild = w.social_media_preview_image || (!w.image_is_illustration && !/\.svg$/i.test(w.image || "") && w.image) || w.photo || erstesMarkdownBild(w.text) || "/assets/images/og-preview.jpg";
    if (socialImg.getAttribute("src") !== bild) socialImg.src = bild;
    socialTitel.textContent = w.title || aktiv.schema.titel;
    socialBeschr.textContent = (w.summary || w.subtitle || w.role || ersteTextzeile(w.text) || "Institut für spontane Makespace Buildung").slice(0, 160);
  }

  function fehlt() {
    var leer = aktiv.felder.filter(function (f) { return pflicht(f) && f.typ === "chips" && !aktiv.w[f.name].length; })[0];
    if (leer) return "Bitte „" + leer.label.replace(/^\W+\s*/, "") + "“ ausfüllen.";
    return aktiv.schema.pruefe && aktiv.schema.pruefe(aktiv.w);
  }
  function anlegen() {
    var fehler = fehlt();
    if (fehler) { status.textContent = "⚠️ " + fehler; return; }
    if (aktiv.bearbeiten) {
      var neuText = dateiInhalt();
      if (neuText === aktiv.bearbeiten.quelle) { status.textContent = "Noch nichts geändert."; return; }
      F.kopierenUndOeffnen(neuText, F.githubEdit(aktiv.pfad), status, function () { getSelection().selectAllChildren(vorschau); });
      setTimeout(function () { if (/^Kopiert/.test(status.textContent)) status.textContent = "Kopiert – im GitHub-Editor alles markieren (⌘A / Strg+A) und einfügen (⌘V / Strg+V)."; }, 50);
      aktiv.gesendet = true;
      return;
    }
    var s = aktiv.schema, inhaltText = dateiInhalt(), datei = aktiv.w.datei.trim();
    var url = F.githubNeu(s.ordner, datei, inhaltText), zuLang = url.length > 8000;
    if (zuLang) url = F.githubNeu(s.ordner, datei);
    F.kopierenUndOeffnen(inhaltText, url, status, function () { getSelection().selectAllChildren(vorschau); });
    if (zuLang) status.textContent = "Die Datei ist zu lang für die Adresse – sie ist kopiert, bitte im GitHub-Editor einfügen.";
    aktiv.gesendet = true;
  }

  var SCHRITTE_NEU = '<li>„Auf GitHub anlegen“ kopiert die Datei und öffnet GitHub mit dem fertigen Inhalt.</li>'
    + "<li>Dort „Commit changes …“ → <strong>„Create a new branch … and start a pull request“</strong>.</li>"
    + "<li>Nach dem Merge erscheint die Seite nach ein paar Minuten auf der Website.</li>";
  var SCHRITTE_BEARBEITEN = "<li>„Auf GitHub speichern“ kopiert die geänderte Datei und öffnet sie im GitHub-Editor.</li>"
    + "<li>Dort den ganzen Inhalt markieren (⌘A / Strg+A) und einfügen (⌘V / Strg+V).</li>"
    + "<li>„Commit changes …“ → <strong>„Create a new branch … and start a pull request“</strong>.</li>"
    + "<li>Nach dem Merge ist die Änderung nach ein paar Minuten auf der Website.</li>";
  function modus(bearbeiten) {
    schritteEl.innerHTML = bearbeiten ? SCHRITTE_BEARBEITEN : SCHRITTE_NEU;
    verwerfenBtn.textContent = bearbeiten ? "↩️ Änderungen verwerfen" : "🗑️ Neu anfangen";
    sendenBtn.textContent = bearbeiten ? "📋 Auf GitHub speichern" : "📋 Auf GitHub anlegen";
    sendenBtn.disabled = false; sendenBtn.title = "";
    dateiInput.readOnly = !!bearbeiten;
    d.querySelector(".neu-pfad").previousElementSibling.textContent = bearbeiten ? "Datei" : "Neue Datei";
    vorlageLink.textContent = bearbeiten ? "Auf GitHub ansehen ↗" : "Vorlage mit allen Feldern ↗";
  }
  function alleBeruehrt() { var b = {}; aktiv.felder.forEach(function (f) { b[f.name] = true; }); return b; }

  // ---------- open ----------
  // link: an a[data-neu] from _includes/neu-button.html
  function oeffnen(link) {
    var daten = JSON.parse(link.getAttribute("data-neu"));
    var schema = TYPEN[daten.typ];
    if (!schema) { window.open(link.href, "_blank", "noopener"); return; }
    if (!d) baueDialog();
    aktiv = { typ: daten.typ, schema: schema, felder: alleFelder(schema), vorgabe: daten.werte, beruehrt: {}, gesendet: false,
      schluessel: STORE + daten.typ + ":" + location.pathname };
    var entwurf = ladeEntwurf();
    aktiv.w = Object.assign(anfangswerte(schema, daten.werte), entwurf && entwurf.w);
    if (entwurf) aktiv.beruehrt = entwurf.beruehrt || {};
    folge();

    modus(false);
    d.titel("➕ " + (daten.label || schema.titel));
    hinweisEl.textContent = daten.hinweis || "";
    hinweisEl.hidden = !daten.hinweis;
    vorlageLink.href = link.href;
    ordnerEl.textContent = schema.ordner + "/";
    baueFelder();
    zeigeVorschau();
    status.textContent = entwurf ? "Entwurf wiederhergestellt." : "";
    if (!d.open) d.showModal();
    var erstes = form.querySelector(".neu-links input:not([type=checkbox]), .neu-links textarea");
    if (erstes) erstes.focus();
    F.ladeIndex();
  }

  // link: an a[data-bearbeiten] from _includes/bearbeiten-knopf.html, data = { typ, pfad, quelle }. → Promise
  function bearbeiten(link) {
    var daten = JSON.parse(link.getAttribute("data-bearbeiten")), schema = TYPEN[daten.typ];
    if (!schema) return Promise.reject(new Error("typ"));
    return fetch(daten.quelle, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }).then(function (quelle) {
      var b = liesQuelle(schema, quelle, daten.pfad);
      if (!b) throw new Error("kein Front Matter");
      if (!d) baueDialog();
      var teile = daten.pfad.split("/");
      aktiv = { typ: daten.typ, schema: schema, felder: alleFelder(schema), gesendet: false, bearbeiten: b, pfad: daten.pfad,
        schluessel: "ifsmb-bearbeiten:" + daten.pfad };
      aktiv.beruehrt = alleBeruehrt(); // nothing is derived while editing (file name, event_tag, end …)
      var entwurf = ladeEntwurf(), passt = entwurf && entwurf.quelle === quelle;
      aktiv.w = passt ? Object.assign(JSON.parse(JSON.stringify(b.w0)), entwurf.w) : JSON.parse(JSON.stringify(b.w0));
      if (entwurf && !passt) loescheEntwurf(); // the file changed on GitHub since – old draft no longer fits
      modus(true);
      d.titel("✏️ " + schema.titel + " bearbeiten");
      hinweisEl.textContent = "Änderungen an " + daten.pfad + " – nur geänderte Zeilen werden neu geschrieben, alles andere bleibt wie es ist.";
      hinweisEl.hidden = false;
      vorlageLink.href = F.githubDatei(daten.pfad);
      ordnerEl.textContent = teile.slice(0, -1).join("/") + "/";
      baueFelder();
      zeigeVorschau();
      status.textContent = passt ? "Entwurf wiederhergestellt." : "";
      if (!d.open) d.showModal();
      F.ladeIndex();
    });
  }

  return { oeffnen: oeffnen, bearbeiten: bearbeiten, datei: datei, bearbeitet: bearbeitet, TYPEN: TYPEN, alleFelder: alleFelder };
})();
if (typeof module !== "undefined") module.exports = NeuFormular;
