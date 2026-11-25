{%- comment -%}
  Template for a plain page outside the collections (e.g. partners/<name>/index.md, angebot/index.md).
  The ✏️ form "seite" (assets/js/neu.js) edits these fields; the file lives at <ordner>/index.md.
{%- endcomment -%}
---
layout: page
title: "Titel der Seite"
lead:   # ein Satz unter dem Titel
linked: []   # weitere Seiten, z. B. [/partners/…/] – erscheinen unten bei „Verbindungen“, wenn die Seite sie einbindet
links:   # externe Links: Liste aus title, url und category (equipment, person, partner, event, post, project, challenge, press, link = beliebiger Link wie ein Instagram-Beitrag) – erscheinen unten bei „Verbindungen“ in der passenden Gruppe
theme:   # Aussehen der Seite, leer = wie die ganze Website; ifsmb, offene-werkstaetten, rfflabs oder slop (Liste: _data/themes.yml) – Besucher*innen können unten auf der Seite selbst wählen
social_media_preview_image:   # Vorschaubild beim Teilen (1200×630 px, ohne Metadaten), z. B. /assets/images/og-….jpg
encrypted: false   # true = Inhalt der Seite im Browser mit Passwort verschlüsseln
uuid: UUID-NEU   # zufällige Kennung für die Gelesen-Markierung – wird beim Klick erzeugt, nicht ändern
---

Text der Seite in Markdown.
