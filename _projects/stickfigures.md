---
title: "Stickfigures – steht die Hüfte?"
summary: Falko baut eine Strichmännchen-Erkennung, die beim Training warnt, wenn die Hüfte nicht ruhig bleibt – zuerst auf einem Raspberry Pi 5 mit KI-Beschleuniger, jetzt auch direkt auf dem Handy.
status: aktuell
personal: true
start: 2026-11-14
period: seit November 2026
event_tag: stickfigures
tags: [pose-erkennung, raspberry-pi, android]
team:
  - falko-richter
updates:
  - date: 2026-11-26
    text: |-
      **Läuft jetzt auch auf Android:** Ein erster Prototyp bringt die Erkennung auf ein Pixel-Handy. Die Kamera-Bilder gehen dort an MediaPipe, das auf der Grafikeinheit des Handys rechnet. Das Handy spielt dabei einfach den Raspberry Pi: dieselben Adressen, dasselbe Datenformat und **dieselbe Weboberfläche**, ohne eine Zeile Änderung an der Hüft-Auswertung. Im Emulator läuft die ganze Kette; der Test auf dem echten Pixel 10 Pro mit einem echten Menschen vor der Kamera kommt als Nächstes.

      ![Die Stickfigures-App im Android-Emulator: oben die Anzeigen „camera“ und „AI on (MediaPipe CPU)“, darunter das Kamerabild einer gepixelten Testszene, unten die Hüftwerte mit „no person“](/assets/images/projekte/stickfigures/01.jpg)
      {: .gallery}
uuid: 48065dad-1cca-4d53-80ad-fed331deda49
---

Bei vielen Übungen soll die **Hüfte ruhig bleiben** – sie soll nicht kippen, nicht zur Seite wandern und nicht wackeln. Das merkt man selbst oft nicht. Falko baut deshalb eine Kamera, die ein **Strichmännchen** über den Menschen legt und warnt (auf Wunsch mit Piepton), sobald die Hüfte unruhig wird.

## Wie es funktioniert
{: #funktionsweise}

1. Eine Kamera filmt die Übung.
2. Ein KI-Modell findet in jedem Bild **17 Körperpunkte** – Schultern, Ellbogen, Hüften, Knie, Füße …
3. Die Weboberfläche zeichnet daraus das Strichmännchen und rechnet für die Hüfte drei Werte aus: **Neigung**, **seitliches Wandern** und **Wackeln** in der letzten Sekunde. Vor der Übung kalibriert man kurz im Stillstand.

Alles läuft **lokal** – kein Bild verlässt das Gerät. Anschauen kann man das Ganze im Browser, auch vom Laptop aus.

## Zwei Geräte, eine Oberfläche
{: #geraete}

- **Raspberry Pi 5 mit Hailo-8L**: Der KI-Beschleuniger rechnet das Modell *YOLOv8s-Pose*, das Ganze läuft in einem Docker-Container. Kamera und Hüft-Warnung sind noch in Arbeit.
- **Android-Handy (Pixel 10 Pro)**: Das Handy hat seine eigene KI-Hardware schon eingebaut. Der Prototyp nutzt MediaPipe auf der Grafikeinheit; als Nächstes soll dasselbe Modell wie auf dem Pi auf dem KI-Chip des Handys laufen, damit beide Geräte gleich gut erkennen.

Der Trick dabei: Beide Geräte sprechen **dieselbe Sprache**. Die Weboberfläche mit der Hüft-Auswertung gibt es nur einmal, und sie merkt nicht, ob sie mit dem Pi oder mit dem Handy redet.

## Stand

Der Code ist noch privat. Die Software ist ein Prototyp, kein Medizinprodukt – sie ersetzt keine Trainerin und keinen Physiotherapeuten.
