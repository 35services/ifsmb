<!--
Todos von Falko Richter – wird auf /todos/ bearbeitet (Eisenhower-Matrix).
Aufbau: ## = Feld der Matrix, ### = eine Herausforderung (Reihenfolge = Priorität),
darunter ein yaml-Block mit den Feldern und danach freier Text in Markdown.
Die Person dieser Datei ist hauptzuständig; helfer = helfende Hände (Team-Kürzel).
-->

## 🔥 Sofort erledigen

### Ausflug organisieren {#ausflug-organisieren}

```yaml
status: offen
tags: [ktg]
kurz: Eine(r) muss es tun
art: aufgabe
seit: 2026-11-13
helfer: [gregor-dill]
projekte: [ktg-ag]
verlinkt: [/kalender/2027-01-04-besuch-bei-max-2027/]
```

Termin kommunizieren und organisieren für Januar
* handout bauen und ausdrucken

### Betreff: gebrauchte Hardware für iServ {#betreff-gebrauchte-hardware-fur-iserv}

```yaml
status: offen
tags: [ktg]
art: aufgabe
seit: 2026-11-13
faellig: 2026-11-17
projekte: [3d-druck-ag-ktg]
```

Es gibt evtl ca. 80  Dell OptiPlex 7440 bzw. 7450  AIO

### Würth, Pfefferwerk, {#wurth-pfefferwerk}

```yaml
status: offen
kurz: Bernd Krebs
art: aufgabe
seit: 2026-11-13
```

### Social media cards für ifsmb {#social-media-cards-fur-ifsmb}

```yaml
status: offen
tags: [software]
art: aufgabe
seit: 2026-11-14
projekte: [ifsmb-de]
verlinkt: [/projekte/ifsmb-de/]
```

Vielleicht auch nochmal vergleichen was wir beim Lastenlaufradrennen gebaut haben

### Alt makers besuchen {#alt-makers-besuchen}

```yaml
status: offen
art: aufgabe
seit: 2026-11-15
helfer: [jan]
```

https://www.alt-makers.de/das-team

## 📌 Einplanen

### Passen unsere Schrittmotoren für Mural? {#mural-schrittmotoren}

```yaml
status: offen
tags: [mural]
kurz: Mural braucht zwei NEMA-17-Motoren – im Original flache „Pancake“-Motoren. Welche haben wir da, und reichen sie?
art: frage
seit: 2026-11-12
helfer: [anton]
projekte: [mural-wandplotter]
```

- Welche Schrittmotoren haben wir da?
- Passen sie in das Gehäuse, das für flache „Pancake“-Motoren gedacht ist – oder müssen wir die Halter anpassen?
- Reicht ihre Kraft, um den Roboter an zwei Riemen über die Wand zu ziehen?
- Müssen wir einen ESP32-Controller mit FluidNC bestellen?

### Repair-Café in der NochMall anschauen {#repair-cafe-nochmall}

```yaml
status: offen
tags: [repair-cafe]
kurz: Falko und Ralf schauen sich das Repair-Café in der NochMall der BSR in Reinickendorf an und suchen Kontakt zur BSR.
art: aufgabe
seit: 2026-11-12
helfer: [ralf]
```

- Kontakt zur BSR finden
- NochMall anschauen: Wie läuft das Repair-Café, was können wir lernen?

### Mit dem QM Moabit über die Stadtteilkasse sprechen {#stadtteilkasse-moabit}

```yaml
status: offen
kurz: Bis zu 500 € aus der Stadtteilkasse für offene Aktionen in der Nachbarschaft – zum Beispiel eine Makespace-Aktion im Kiez.
art: aufgabe
seit: 2026-11-12
verlinkt: [/geld-fuer-makespaces/]
```

Mit dem Quartiersmanagement Moabit über die Stadtteilkasse sprechen.

### Platanus? Tag der offenen Tür – Sekundarstufe I/II für die Jahrgangsstufen 7 bis 13? {#platanus-tag-der-offenen-tur-sekundarstufe-i-ii-fur-die-jahr}

```yaml
status: offen
tags: [platanus]
kurz: sollen wir da mitmachen als AG?
art: frage
seit: 2026-11-13
faellig: 2027-01-27
projekte: [3d-druck-ag-platanus-schule]
verlinkt: [/projekte/3d-druck-ag-platanus-schule/, /news/2026/11/11/post-von-der-keramik-ag-und-ein-erster-schluesselanhaenger/]
```

https://www.platanus-schule.de/tag-der-offenen-tuer/

### Deckel wie bei Gustav Falke - wollen wir so etwas drucken? {#deckel-wie-bei-gustav-falke-wollen-wir-so-etwas-drucken}

```yaml
status: offen
tags: [rosalind-franklin-gym]
art: frage
seit: 2026-11-14
projekte: [3d-druck-ag-rosalind-franklin-gymnasium]
verlinkt: [/kalender/2026-11-11-besuch-gustav-falke-grundschule/]
```

[Deckel Video](https://youtu.be/MLQvEFuRu9Y?is=vqGTS-Xs0ATl15Da)

### Recherche zur hotRC {#neues-todo}

```yaml
status: offen
tags: [rc-tractor-professorboots]
kurz: Recherche zur hotRC
art: aufgabe
seit: 2026-11-15
projekte: [rc-tractor-professorboots]
```

https://youtu.be/Oes2u12HYyE?is=-JExxT82gyQGuLhL

## 🤝 Abgeben

## 💤 Später

### Fabmaker-Slicer für Mac und Web 'craften' {#fabmaker-slicer-mac-web}

```yaml
status: offen
tags: [fabmaker]
kurz: Den Windows-Slicer der Fabmaker-Drucker mit Claude Code oder OpenCode untersuchen, damit die Drucker auch vom Mac oder aus dem Browser drucken.
art: aufgabe
seit: 2026-11-13
helfer: [anton]
verlinkt: [/ausstattung/fabmaker/]
```

Unsere zwei [Fabmaker](/ausstattung/fabmaker/) lassen sich nur mit dem **Fabmaker Slicer** für Windows ansteuern (`SetupFabmakerSlicer_1.1.1.9.exe`), und den Hersteller gibt es nicht mehr. Falko und Anton wollen das Programm mit **Claude Code** oder **OpenCode** per Reverse Engineering untersuchen, damit die Drucker auch **auf dem Mac/linux oder im Browser** nutzbar werden.

- Installer und Wartungsprogramme aus [35services/fabmaker-rettung](https://github.com/35services/fabmaker-rettung) auseinandernehmen: Womit ist der Slicer gebaut, steckt ein bekannter Slicer darunter?
- Herausfinden, welches Dateiformat und welches Protokoll der Drucker erwartet (G-Code? eigenes Format? USB, Netzwerk, Speicherkarte?)
- Danach entscheiden: Reicht ein normaler Slicer mit passendem Profil (z. B. PrusaSlicer oder OrcaSlicer), oder braucht es ein kleines eigenes Werkzeug – vielleicht sogar als Web-App?
- Alles, was wir lernen, im Repository dokumentieren

### Welcher OpenScan soll es werden? {#openscan-variante}

```yaml
status: offen
tags: [openscan]
kurz: Mini oder Classic, welche Kamera – und wer macht mit?
art: frage
seit: 2026-05-23
projekte: [openscan-bauen]
```

- **Variante:** OpenScan Mini oder Classic?
- **Kamera:** Welche Kamera nehmen wir?
- **Mitmachen:** Wer baut mit?

### Non planar slicing {#non-planar-slicing}

```yaml
status: offen
tags: [35services-3d]
kurz: "Angucken "
art: frage
seit: 2026-11-13
helfer: [anton]
projekte: [35services-3d]
verlinkt: [/partner/35services/, /ausstattung/bambu-lab-a1-mini/, /ausstattung/prusa-mk3s-xhain/, /projekte/prusa-mk3s-heartlabs-flott-machen/]
```

https://youtu.be/cRSoVq_reGQ?is=4-7OQB8jc_aDTww_

## ✅ Erledigt
