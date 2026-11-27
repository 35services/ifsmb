---
title: "Das Schöne an Standards ist, dass es so viele gibt, aus denen man wählen kann."
date: 2026-11-27 12:00:00 +0100
author: falko-richter
tags: [ifsmb-de]
linked: [/maschinenlesbar/, /projects/ifsmb-de/, /equipment/creality-a1-pro/, /network/]
links:
  - title: "schema.org/Product"
    url: https://schema.org/Product
    category: link
uuid: 2d24ea5f-c157-4115-a377-f54dccda20e9
---

Der Satz stammt von Andrew S. Tanenbaum, und wer schon mal Daten zwischen zwei Programmen austauschen wollte, kennt das Gefühl. Wir wollten, dass unsere Website nicht nur für Menschen lesbar ist, sondern auch für Programme – und damit für **andere Websites, die mit uns zusammenarbeiten**. Also mussten wir uns entscheiden. Wir haben uns für [schema.org](https://schema.org/) entschieden.

## Was ist schema.org?

schema.org ist ein gemeinsamer **Wortschatz**, um Dinge im Web zu beschreiben. Google, Microsoft (Bing) und Yahoo haben ihn 2011 gemeinsam gestartet, später kam Yandex dazu. Heute nutzen ihn Millionen Websites – zum Beispiel damit Suchmaschinen Rezepte, Veranstaltungen oder Produkte erkennen. Der Vorteil für uns: Wir müssen nichts Eigenes erfinden, und andere Software versteht uns schon.

Der Wortschatz besteht aus **Typen** und **Eigenschaften**:

- Ein **Typ** sagt, *was* etwas ist: `Person`, `Event`, `Organization`, `BlogPosting` – oder `Product`.
- **Eigenschaften** sagen, *wie* es ist: `name`, `description`, `image`, `startDate` …
- Die Typen bauen aufeinander auf. Ganz oben steht `Thing` (ein „Ding“) mit den Eigenschaften, die alles haben kann – Name, Beschreibung, Bild, Adresse, Kennung. Ein `Product` ist ein `Thing` und erbt all das, dazu kommen eigene Eigenschaften.

## Das Konzept am Beispiel: `Product`

[schema.org/Product](https://schema.org/Product) beschreibt laut Definition *„jedes angebotene Produkt oder jede Dienstleistung“* – ein Paar Schuhe, eine Konzertkarte, ein Mietwagen, ein Haarschnitt. Für uns ist es der passende Typ für unsere **Ausstattung**: 3D-Drucker, Laser, Scanner.

`Product` bringt viele Eigenschaften mit, zum Beispiel:

| Eigenschaft | bedeutet | geerbt von |
|---|---|---|
| `name` | Name des Geräts | `Thing` |
| `description` | Beschreibung | `Thing` |
| `image` | Foto | `Thing` |
| `url` | Adresse der Seite | `Thing` |
| `identifier` | eine eindeutige Kennung | `Thing` |
| `category` | Art des Produkts, z. B. „Laser“ | `Product` |
| `brand`, `model` | Hersteller und Modell | `Product` |
| `isRelatedTo`, `isSimilarTo` | verwandte Produkte | `Product` |
| `offers` | Angebot mit Preis, Verfügbarkeit | `Product` |

Man muss nicht alle benutzen – man nimmt die, die man hat. Ein Laser, den wir ausgeliehen haben, hat keinen Preis, aber einen Namen, ein Foto und eine Kategorie.

## So sieht das bei uns aus

Jede Geräteseite trägt unsichtbar im HTML eine Beschreibung in **Microdata** – das ist eine von drei Schreibweisen für schema.org (die anderen heißen JSON-LD und RDFa; schon wieder mehrere Standards zur Auswahl). Hier zum Beispiel unser frisch [ausgeliehener Laser]({{ '/equipment/creality-a1-pro/' | relative_url }}):

```html
<div itemscope itemtype="https://schema.org/Product"
     itemid="https://ifsmb.de/equipment/creality-a1-pro/">
  <link itemprop="url" href="https://ifsmb.de/equipment/creality-a1-pro/">
  <meta itemprop="name" content="Creality A1 Pro">
  <link itemprop="image" href="https://ifsmb.de/assets/images/ausstattung/creality-a1-pro/01.jpg">
  <meta itemprop="identifier" content="1bc50ee6-d883-454d-816b-36b7f946133e">
  <meta itemprop="category" content="Laser">
</div>
```

Zwei Zeilen sind dabei besonders wichtig:

- **`itemid`** ist die Adresse – sie sagt, **wo** das Gerät zu finden ist. Die kann sich ändern, zum Beispiel wenn eine Seite umzieht.
- **`identifier`** ist eine zufällige Kennung (eine UUID) – sie sagt, **was** es ist, und ändert sich nie. Gleiche Kennung heißt: dasselbe Ding in der echten Welt, egal auf welcher Website es steht.

Dasselbe Prinzip gilt für alles andere auf der Seite: Personen sind `Person`, Termine `Event`, Beiträge `BlogPosting`, Projekte `Project`, Partner `Organization`. Unten auf jeder dieser Seiten lässt sich unter „🤖 Maschinenlesbar“ aufklappen, was dort steht. Die ganze Erklärung gibt es auf der Seite [Maschinenlesbar]({{ '/maschinenlesbar/' | relative_url }}).

## Und wozu? Föderation!

Die eigentliche Idee: **Mehrere Makespaces, jeder mit eigener Website, die trotzdem ein gemeinsames Netz bilden.** Die erste weitere Instanz gibt es schon: [35services.ifsmb.de](https://35services.ifsmb.de/) trägt die Inhalte von 35 services e. V. – aus demselben Code, aber mit eigenen Seiten.

Jedes Ding hat **genau eine Heimat**. Der Snapmaker U1 gehört 35services, also liegt seine Seite dort. Wir kopieren sie nicht, sondern verlinken sie einfach. Und weil die Seite dort sagt, dass sie ein `Product` mit dem Namen „Snapmaker U1“ ist, versteht unsere Website den Link:

- Beim Bauen liest unsere Seite die Microdata der verlinkten Seite. Der Link bekommt das passende Symbol (🛠️ für ein Gerät) und den aktuellen Namen – benennt 35services das Gerät um, stimmt der Name bei uns beim nächsten Bauen auch.
- Gibt es die Seite nicht mehr, wird der Link durchgestrichen statt ins Leere zu führen.
- Unten bei „Verbindungen“ landet das fremde Gerät ganz normal unter „Ausstattung“ – mit dem Hinweis, auf welcher Website es zu Hause ist.
- Im [Netzwerk]({{ '/network/' | relative_url }}) und in der Suche lassen sich verbundene Instanzen per Klick dazuladen. Gleiche Kennung + gleicher Typ = ein gemeinsamer Knoten.

Das alles läuft ohne Server und ohne Datenbank – nur mit statischen Dateien. Und weil es ein offener Standard ist, muss eine andere Website nicht mal unseren Code benutzen: Wer seine Seiten mit schema.org beschreibt, kann mitmachen.

## Was als Nächstes kommt

- Mehr Eigenschaften, die schema.org schon kennt: `brand` und `model` für Geräte, `location` mit echten Orten für Termine.
- Dieselben Daten zusätzlich als **JSON-LD** – das lesen manche Programme lieber.
- **Rückverweise**: sehen, wer auf anderen Websites auf uns verlinkt.
- Und vielleicht noch weitere Standards wie ActivityPub oder Webmention. Es gibt ja genug, aus denen man wählen kann.

Du hast einen Makespace und eine Website? Sprich uns an – wir bauen das Netz gern größer.
