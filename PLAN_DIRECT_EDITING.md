# Plan: Direkt bearbeiten – Pull Requests mit Fotos aus dem Browser

Stand: 18.11.2026 · Prototyp im Branch `direkt-bearbeiten-pr`

## Ziel

So bequem wie [Pages CMS](https://app.pagescms.org), aber mit unseren eigenen Formularen (➕/✏️, OverType-Editor, Autovervollständigung, Social-Media-Vorschau):

1. Mit GitHub verbinden – einmal pro Gerät/Sitzung.
2. Beitrag, Termin, Gerät … anlegen oder ändern **und Fotos hinzufügen**.
3. Fotos im Browser vorbereiten: drehen, zuschneiden, **Gesichter/Kennzeichen/Namen unkenntlich machen**, verkleinern, Metadaten entfernen, Alt-Text.
4. Ein Klick → **Pull Request** (ein Commit mit Datei + Fotos auf neuem Branch). Gemergt wird weiter erst nach Durchsicht.

Nichts geht direkt auf `main`. Ohne Verbindung bleibt alles wie bisher (Kopieren → GitHub-Editor).

## Was der Prototyp schon kann

| Teil | Datei | Stand |
|---|---|---|
| Token verbinden/abmelden, Rechte prüfen | `assets/js/github-api.js`, Dialog in `neu.js` | ✅ (Fine-grained Token, Details unten) |
| Ein Commit mit mehreren Dateien (Text + Bilder) über die Git-Data-API, Branch `web/<login>-<datei>-<zeit>`, Pull Request mit Prüfliste | `github-api.js` | ✅ getestet gegen eine simulierte API |
| Neue Datei: prüft, dass es sie noch nicht gibt | `neu.js` | ✅ |
| Bearbeiten: warnt, wenn die Datei auf GitHub inzwischen geändert wurde | `neu.js` | ✅ |
| 📷 Fotos hinzufügen: nächste freie Nummer `NN` im Ordner (fragt GitHub), Galerie-Markdown ans Textende | `neu.js` | ✅ |
| Foto-Editor: drehen (90°), zuschneiden, Bereiche verpixeln, Alt-Text Pflicht, Export 1600 px + `-600w`, ohne Metadaten | `assets/js/photo-editor.js` | ✅ getestet (kein EXIF im Ergebnis) |
| Automatische Vorschläge: QR-/Barcodes (`BarcodeDetector`), Gesichter (`FaceDetector`) | `photo-editor.js` | ⚠️ nur wo der Browser es kann (s. u.) |
| Ändert sich der Dateiname nach dem Hinzufügen von Fotos, ziehen die Fotos mit um | `neu.js` | ✅ |

Neue Abhängigkeiten: **keine** – nur Browser-APIs (Canvas, Fetch, FileReader). Externe Anfragen gehen nur an `api.github.com` und nur nach aktivem Verbinden (im Impressum beschrieben).

## Anmeldung – Optionen

| | Wie | Server nötig? | Rechte | Bewertung |
|---|---|---|---|---|
| **A. Fine-grained Token** (Prototyp) | Token auf GitHub erstellen, einfügen | nein | nur dieses Repo, *Contents* + *Pull requests* schreiben, Laufzeit frei wählbar | sofort nutzbar, für Falko & Team ok; für Gelegenheits-Mitmachende zu umständlich |
| **B. GitHub App + Token-Tausch** (Empfehlung Phase 2) | „Mit GitHub anmelden“ → zurück auf ifsmb.de, ein kleiner Dienst tauscht den Code gegen ein Token | ja, winzig (ca. 40 Zeilen, z. B. Cloudflare Worker unter `auth.ifsmb.de`) | GitHub-App-Rechte nur für dieses Repo; Nutzer-Tokens laufen nach 8 h ab | bequem wie Pages CMS; der Dienst kennt nur das `client_secret`, speichert nichts |
| C. OAuth App + Token-Tausch | wie B | ja | Scope `public_repo` = **alle** öffentlichen Repos der Person | zu viele Rechte – nicht empfohlen |
| D. Pages CMS weiter nutzen | – | deren Server | GitHub App von Pages CMS | bleibt parallel möglich |

**Warum nicht ganz ohne Server?** GitHub unterstützt seit Juli 2025 PKCE, aber der Token-Tausch (`github.com/login/oauth/access_token`) verlangt weiter das `client_secret` und erlaubt keine Anfragen aus dem Browser (kein CORS); der Device-Flow geht aus dem Browser ebenfalls nicht. Sobald GitHub CORS für PKCE freischaltet, fällt der Dienst aus B weg – dann vorher prüfen.

Für B gilt die Regel aus `CLAUDE.md`: der Dienst ist eine Abhängigkeit → vorher in `DEPENDENCIES.md`, im Impressum beschreiben (er sieht die IP-Adresse beim Anmelden).

## Wer darf?

- **Phase 1 (Prototyp):** nur wer **Schreibrechte** auf `falkorichter/ifsmb.de` hat – der Branch entsteht im Repo selbst. Ohne Rechte zeigt der Dialog das an.
- **Phase 3:** Pull Requests aus einem **Fork** (für Leute ohne Schreibrechte): Fork anlegen, Commit dort, PR von dort. Mit einer GitHub App braucht das die App auch auf dem Fork – genauer prüfen.
- Schüler*innen ohne GitHub-Konto: nicht vorgesehen. Wenn gewünscht, später ein „Vorschlag einreichen“ über einen Bot-Account (dann mit Spam-Schutz).

## Vergleich: Was wir bisher lokal machen vs. im Browser

| Aufgabe | Bisher (Claude, Pillow, ffmpeg, Skripte) | Im Browser (Prototyp) | Lücke / Idee |
|---|---|---|---|
| GPS/EXIF/XMP entfernen | Pillow neu speichern | ✅ Canvas-Export enthält keine Metadaten | – (`check_geodaten.rb` prüft im PR weiter) |
| Ausrichtung (Hochkant-Handyfotos) | `exif_transpose` | ✅ Browser richtet beim Laden aus | – |
| Verkleinern auf 1600 px + `-600w` | Pillow | ✅ | – |
| Zuschneiden, drehen | von Hand im Skript | ✅ mit Maus/Finger | – |
| **Kindergesichter unkenntlich** | macOS-Vision + Kontrolle in voller Größe + von Hand | ✋ Rechtecke von Hand verpixeln; 🤖 `FaceDetector` nur in Chrome mit Flag | Automatische Erkennung ohne Flag bräuchte ein Modell (z. B. MediaPipe Face Detection, ~ 200 KB–1 MB, Apache-2.0) – nur als lokale Kopie nach `DEPENDENCIES.md`-Regeln, erst beim Klick laden |
| **Autokennzeichen** | von Hand gesucht und geblurrt | ✋ von Hand | Automatisch bräuchte ein eigenes Modell – vorerst von Hand + Prüfliste |
| QR-Codes, Zugangscodes | von Hand | 🤖 `BarcodeDetector` (Chrome auf macOS/Android/ChromeOS) schlägt QR-Codes vor, sonst ✋ | Handschrift/Namen: weiter von Hand |
| Straßenschilder, Wohnadressen | von Hand | ✋ von Hand + Prüfliste | – |
| Alt-Texte | Claude beschreibt das Bild | ✍️ Pflichtfeld, Mensch schreibt | KI-Vorschlag nur mit externem Dienst → Datenschutz, vorerst nicht |
| **Videos** (720p, ohne Ton, Vorschaubild) | ffmpeg | ❌ nicht möglich | ffmpeg.wasm (~30 MB) wäre zu schwer → Videos weiter über Falko/Claude |
| HEIC (iPhone) | Pillow (mit Plugin) | ✅ Safari, ❌ Chrome | Hinweis im Editor: als JPG exportieren |
| „Makespace“ statt „Makerspace“, Inhalt prüfen | Claude/Durchsicht | Prüfliste im PR | später ein Check in `pruefen.yml` |
| Screenshots für den PR (`pr_vorschau.py`) | lokal | ❌ | später Workflow, der Vorschaubilder an den PR hängt |

✋ = von Hand · 🤖 = automatischer Vorschlag (immer selbst prüfen) · Verpixelt wird grob (ca. 10 Blöcke über den Bereich) – das lässt sich nicht zurückrechnen, anders als ein leichter Weichzeichner.

## Sicherheit

- Das Token liegt im Browser: standardmäßig `sessionStorage` (weg, wenn der Tab zu ist), nur auf Wunsch `localStorage`. Gefahr ist Cross-Site-Scripting – deshalb bleibt es bei **keinen fremden Skripten** (OverType liegt als geprüfte Kopie im Repo). Idee: Content-Security-Policy per `<meta>` (`connect-src 'self' https://api.github.com`).
- Fine-grained Token mit **nur diesem Repo** und kurzer Laufzeit; GitHub-App-Tokens (Phase 2) laufen nach 8 h ab.
- **Branch-Schutz für `main`** einschalten (PR + grüne Checks Pflicht), dann kann auch ein geleaktes Token nichts direkt live schalten.
- Alle bestehenden Prüfungen laufen auf jedem PR weiter (`pruefen.yml`: Galerien, Geodaten, Formulare, uuids).

## Bekannte Lücken im Prototyp

- Fotos stehen nicht im Entwurf (localStorage) – nach Neuladen sind sie weg, nur die Zeilen im Text bleiben (Hinweis im Status).
- Fotos nur bei Typen mit Textfeld (Beitrag, Termin, Projekt, Gerät …); Titelbild/`image`/`gallery:`-Felder werden noch nicht befüllt.
- Die Galerie kommt immer ans Textende; Reihenfolge/Position ändert man im Text.
- Todo-Editor (`todos.js`) nutzt noch Kopieren → GitHub.
- Nur mit simulierter GitHub-API getestet – der erste echte Test braucht ein Token (siehe unten).

## Nächste Schritte

1. **Echter Test** mit einem Fine-grained Token (Falko): Beitrag mit 2 Fotos anlegen, Bearbeiten eines Geräts, Konflikt-Warnung.
2. Entscheidung **Anmeldung B** (GitHub App + Worker) – dann App anlegen, Worker schreiben, `DEPENDENCIES.md` + Impressum.
3. Titelbild/Galerie-Felder (`image`, `thumb`, `gallery:`) für Geräte und Termine.
4. Fotos im Entwurf (IndexedDB), damit nichts verloren geht.
5. Automatische Gesichtserkennung als optionales lokales Modell prüfen (Größe, Lizenz, Treffer bei Kindern im Profil).
6. Forks für Leute ohne Schreibrechte.
7. Branch-Schutz für `main`.
