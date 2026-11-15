---
title: "Fabmaker-Slicer für Mac und Web zurückentwickeln"
summary: Den Windows-Slicer der Fabmaker-Drucker mit Claude Code oder OpenCode untersuchen, damit die Drucker auch vom Mac oder aus dem Browser drucken.
art: aufgabe
status: in-arbeit
seit: 2026-11-13
team: [falko-richter, anton]
tags: [fabmaker]
verlinkt: [/ausstattung/fabmaker/]
---

Unsere zwei [Fabmaker]({{ '/ausstattung/fabmaker/' | relative_url }}) lassen sich nur mit dem **Fabmaker Slicer** für Windows ansteuern (`SetupFabmakerSlicer_1.1.1.9.exe`), und den Hersteller gibt es nicht mehr. Falko und Anton wollen das Programm mit **Claude Code** oder **OpenCode** per Reverse Engineering untersuchen, damit die Drucker auch **auf dem Mac oder im Browser** nutzbar werden.

- Installer und Wartungsprogramme aus [35services/fabmaker-rettung](https://github.com/35services/fabmaker-rettung) auseinandernehmen: Womit ist der Slicer gebaut, steckt ein bekannter Slicer darunter?
- Herausfinden, welches Dateiformat und welches Protokoll der Drucker erwartet (G-Code? eigenes Format? USB, Netzwerk, Speicherkarte?)
- Danach entscheiden: Reicht ein normaler Slicer mit passendem Profil (z. B. PrusaSlicer oder OrcaSlicer), oder braucht es ein kleines eigenes Werkzeug – vielleicht sogar als Web-App?
- Alles, was wir lernen, im Repository dokumentieren

### Stand: geknackt (15.11.2026)

Der Slicer ist auseinandergenommen (siehe [Beitrag]({{ '/news/2026/11/15/fabmaker-slicer-zwei-duesen-geknackt/' | relative_url }}) und die [technische Doku im Repository](https://github.com/35services/fabmaker-rettung/blob/main/research/2026-11-15_reverse-engineering-slicer.md)):

- **Kein geheimes Format** – der Drucker frisst normales serielles G-Code (115200 Baud, RepRap/Repetier-Dialekt).
- Der „Fabmaker Slicer“ ist ein **umbenanntes Repetier-Host**, die Firmware eine **Repetier-Firmware**.
- Die **zwei Düsen** werden mechanisch über einen X-Anschlag umgeschaltet (rechte Düse `X336.5`, linke `X-35.7`, danach `G92 X0`). Diese Makros sind vollständig rekonstruiert.
- Für OrcaSlicer/PrusaSlicer liegen erste **Druckerprofile** im Repository ([`slicer-profiles/`](https://github.com/35services/fabmaker-rettung/tree/main/slicer-profiles)).

**Noch offen:** die Umschalt-Positionen vorsichtig am echten Gerät prüfen (erst ohne Filament) und einen ersten Testdruck fahren.
