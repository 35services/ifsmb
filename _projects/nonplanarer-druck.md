---
title: "Nonplanarer Druck"
summary: Falko und Alexander ergründen nonplanaren 3D-Druck – Alexander druckt schon zweifarbig nonplanar und hat einen eigenen Prozess entwickelt, um Bambu-G-Code nachträglich um nonplanare Deckschichten zu ergänzen.
status: aktuell
persoenlich: true
start: 2026-11-15
zeitraum: seit November 2026
event_tag: nonplanar
tags: [3d-drucker, bambu-lab-a1-mini, 35services]
verwandt:
  - impasto
team:
  - falko-richter
  - alexander-riedel
  - jan
partners:
  - 35 services e. V.
verlinkt:
  - /todos/#falko-richter/non-planar-slicing
  - /ausstattung/35services-bambu-lab-a1-mini/
updates:
  - datum: 2026-11-17
    text: |-
      **Das Werkzeug hat jetzt einen Namen:** Aus dem Arbeitstitel „Non-Planar GCoder" ist **Impasto** geworden; Version 0.4.0 liegt offen auf GitHub, mit eigener Projektseite: [Impasto – Farbe auf fertige 3D-Drucke](/projekte/impasto/).

      Neben dem Namen ist einiges dazugekommen: eine Kollisionsprüfung gegen Kopfprofile, echte Prioritätsregeln bei überlappenden Elementen, ein Wipe beim Rückzug gegen Oozing, ein Schrägen-Ausgleich und ein Warp-Ausgleich, der die Düse über einem verzogenen Bauteil nicht schleifen lässt.
  - datum: 2026-11-15
    text: |-
      **Eigener Prozess für nachträglich angepassten G-Code:** Aus verschiedenen Quellen aus dem Netz, seinen eigenen Vorlieben und den Funktionen, die er braucht, hat [Alexander](/team/alexander-riedel/) einen eigenen Prozess entwickelt, um G-Code im Nachhinein anzupassen („Non-Planar GCoder“). Damit behält man die gewohnte Qualität und den normalen Druckprozess aus Bambu Studio – plus optional eine **nonplanare Deckschicht (Top Layer)** auf der gewölbten Oberfläche.

      ![3D-Vorschau auf dem Druckbett: schwarze Brillenfassung auf Baumstützen mit weißen, gewellten nonplanaren Bahnen auf der gewölbten Oberseite](/assets/images/projekte/nonplanarer-druck/01.jpg)
      ![Nahaufnahme der gedruckten schwarzen Brillenfassung: die weißen, geschwungenen Linien folgen als nonplanare Deckschicht der Wölbung des Rahmens](/assets/images/projekte/nonplanarer-druck/02.jpg)
      {: .gallery}

      ![Bildschirmaufnahme von Alexanders Tool „Non-Planar GCoder“: Auf der geladenen Brillenfassung aus Bambu Studio werden Wellenmuster, Konturen und Text als nonplanare Deckschicht angelegt und als G-Code erzeugt](/assets/video/projekte/nonplanarer-druck/02.mp4)
image: /assets/video/projekte/nonplanarer-druck/01.jpg
uuid: 8ec30934-7816-47da-ac7e-7e7407465672
---

Ein neues privates Projekt von [Alexander Riedel]({{ '/team/alexander-riedel/' | relative_url }}) – und [Falko]({{ '/team/falko-richter/' | relative_url }}) und [Jan]({{ '/team/jan/' | relative_url }}) sind auch total interessiert. Der [Bambu Lab A1 mini]({{ '/ausstattung/35services-bambu-lab-a1-mini/' | relative_url }}) von [35services e. V.]({{ '/partner/35services/' | relative_url }}) ist ideal für dieses Experiment. Wir wollen **nonplanaren 3D-Druck** ergründen. Normalerweise druckt ein 3D-Drucker in flachen Schichten übereinander. Beim nonplanaren Druck folgen die Schichten dagegen der Form des Bauteils – gewölbte Oberflächen werden glatt statt treppenförmig.

Alexander hat das schon ausprobiert: Er druckt **zweifarbig nonplanar** und experimentiert weiter. Im Video entsteht eine Brillenfassung – der schwarze Unterbau steht auf Baumstützen, die weiße Oberfläche wird nonplanar obendrauf gedruckt und folgt der Wölbung der Brille.

![Ein Bambu-Lab-Drucker druckt eine Brillenfassung: schwarzer Unterbau auf Baumstützen, darauf eine weiße, gewölbte nonplanare Oberfläche](/assets/video/projekte/nonplanarer-druck/01.mp4)

Inspiriert durch [dieses YouTube-Video zum nonplanaren 3D-Druck](https://www.youtube.com/watch?v=cRSoVq_reGQ).
