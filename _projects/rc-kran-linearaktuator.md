---
title: "RC-Kran mit Schrittmotor-Linearaktuatoren"
summary: "Falko baut einen Kran für ein RC-Modellfahrzeug: zwei kleine Schrittmotor-Linearaktuatoren heben den Ausleger und fahren das Teleskop aus, gesteuert von einem ESP32 direkt an den Kanälen des RC-Empfängers – mit eigener Platine und 3D-gedruckten Teilen aus OpenSCAD."
status: aktuell
personal: true
start: 2026-11-26
period: seit November 2026
event_tag: rc-kran-linearaktuator
tags: [rc-modellbau, 3d-drucker]
related: [rc-tractor-professorboots, recherche-ki-tools-cad-openscad]
team: [falko-richter]
links:
  - title: "linear-actuator-crane auf GitHub"
    url: https://github.com/falkorichter/linear-actuator-crane
    category: link
  - title: "„I'm tired of this cheap crap. I'll build it myself.“ (It's Triggy!, YouTube)"
    url: https://www.youtube.com/watch?v=0mxvOj2w-Uw
    category: link
updates:
  - date: 2026-11-26
    text: |-
      **Video zum Studieren:** [„I'm tired of this cheap crap. I'll build it myself.“](https://www.youtube.com/watch?v=0mxvOj2w-Uw) von *It's Triggy!* – das will Falko sich genau ansehen und mit dem eigenen Aktuator-Aufbau vergleichen.

      <a class="video-link" href="https://www.youtube.com/watch?v=0mxvOj2w-Uw" target="_blank" rel="noopener">
        <img src="/assets/images/projekte/rc-kran-linearaktuator/youtube-triggy.jpg" alt="Vorschaubild des YouTube-Videos „I'm tired of this cheap crap. I'll build it myself.“ von It's Triggy!" loading="lazy">
        <span class="video-play">▶ Video auf YouTube ansehen</span>
      </a>
uuid: 9da9f091-74ca-4603-bc82-f18b3d47bef3
---

Falko baut einen **Kran für ein RC-Modellfahrzeug**. Zwei kleine **Schrittmotor-Linearaktuatoren** (2-phasig, 4 Kabel, Gewindespindel mit Schlitten) übernehmen die Bewegungen:

- **Ausleger heben:** Aktuator 1 hebt und senkt den Ausleger.
- **Teleskop:** Aktuator 2 liegt oben auf dem Ausleger und fährt den inneren Teil aus.

Gesteuert wird alles von einem **ESP32**, der das normale Servo-Signal (1000–2000 µs) je eines Empfänger-Kanals liest. Endschalter braucht es nicht: Beim Einschalten fahren die Aktuatoren mit **sensorlosem Homing** (TMC2209 StallGuard) in ihre Ausgangsstellung. Weil die Spindeln selbsthemmend sind, werden die Treiber im Stillstand abgeschaltet – das schont den Akku, und die Last bleibt trotzdem stehen.

Zum Projekt gehören eigene **Platinen** (eine Version zum Selbstlöten, eine SMD-Version zum Bestücken lassen und ein größeres Board mit ESP32-S3), die **Firmware** und alle **3D-Modelle in OpenSCAD** – dazu weitere Einsatzideen wie Stützbeine (Outrigger), die über einen Bowdenzug bewegt werden.

Alles liegt offen auf GitHub: [falkorichter/linear-actuator-crane](https://github.com/falkorichter/linear-actuator-crane).
