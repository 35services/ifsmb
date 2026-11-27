// _scripts/test_crypto.js
// Unit tests for SafeMarkdown and CryptoPage (Node.js 22+)
const assert = require("node:assert");
const test = require("node:test");
const SafeMarkdown = require("../assets/js/safe-markdown.js");
const CryptoPage = require("../assets/js/crypto-page.js");
const NeuFormular = require("../assets/js/neu.js");

test("SafeMarkdown: HTML escaping and basic formatting", () => {
  const md = `# Titel <script>alert(1)</script>
Ein normaler Absatz mit **fett**, *kursiv* und ~~durchgestrichen~~.

> Ein Zitat mit <img src="x" onerror="alert(1)">

- Listenpunkt 1
- Listenpunkt 2

\`\`\`
<pre>code & tags</pre>
\`\`\`
`;
  const html = SafeMarkdown.render(md);
  assert.ok(!html.includes("<script>"), "script tag must be escaped");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "script tag escaped properly");
  assert.ok(!html.includes("<img src=\"x\""), "raw img tag must not be rendered as HTML");
  assert.ok(html.includes("&lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;"), "img tag escaped properly");
  assert.ok(html.includes("<h1>Titel &lt;script&gt;alert(1)&lt;/script&gt;</h1>"));
  assert.ok(html.includes("<strong>fett</strong>"));
  assert.ok(html.includes("<em>kursiv</em>"));
  assert.ok(html.includes("<del>durchgestrichen</del>"));
  assert.ok(html.includes("<blockquote><p>Ein Zitat"));
  assert.ok(html.includes("<ul>\n<li>Listenpunkt 1</li>\n<li>Listenpunkt 2</li>\n</ul>"));
  assert.ok(html.includes("<pre><code>&lt;pre&gt;code &amp; tags&lt;/pre&gt;</code></pre>"));
});

test("SafeMarkdown: Resolves attachment blob URLs for images and download links", () => {
  const md = `Hier ist das Foto:
![Schaltplan](schaltplan.png)

Und der Download:
[Projektbericht PDF](bericht.pdf)
`;
  const attachments = {
    "schaltplan.png": "blob:http://localhost:4000/1234-abcd",
    "bericht.pdf": "blob:http://localhost:4000/5678-efgh"
  };

  const html = SafeMarkdown.render(md, attachments);
  assert.ok(
    html.includes('<img src="blob:http://localhost:4000/1234-abcd" alt="Schaltplan" loading="lazy">'),
    "Image URL resolved to blob"
  );
  assert.ok(
    html.includes('<a href="blob:http://localhost:4000/5678-efgh" download="bericht.pdf">Projektbericht PDF</a>'),
    "Link resolved to blob download"
  );
});

test("CryptoPage: Encrypt and decrypt markdown + .blob attachments", async () => {
  const markdown = `## Geheime Konstruktion

Dies ist ein interner Test.

![Testbild](bauteil.png)

[Handbuch](handbuch.txt)
`;
  const password = "geheim-ifsmb-2026!";

  // Mock attachments
  const fakeImageData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]); // PNG header + bytes
  const fakeTextData = new TextEncoder().encode("Dies ist der geheime Klartext des Handbuchs.");

  const attachmentsToEncrypt = [
    { name: "bauteil.png", data: fakeImageData, mime: "image/png" },
    { name: "handbuch.txt", data: fakeTextData, mime: "text/plain" }
  ];

  // 1. Encrypt
  const encrypted = await CryptoPage.encryptPage(markdown, password, attachmentsToEncrypt);
  assert.ok(encrypted.payload.v === 1);
  assert.ok(encrypted.payload.kdf.salt);
  assert.ok(encrypted.payload.iv);
  assert.ok(encrypted.payload.data);
  assert.equal(encrypted.payload.attachments.length, 2);
  assert.equal(encrypted.payload.attachments[0].name, "bauteil.png");
  assert.equal(encrypted.payload.attachments[0].blob, "bauteil.png.blob");
  assert.equal(encrypted.blobs.length, 2);
  assert.equal(encrypted.blobs[0].filename, "bauteil.png.blob");

  // Check that .blob starts with 12-byte IV
  assert.ok(encrypted.blobs[0].data.byteLength > 12 + 16);

  // 2. Mock fetch for attachment .blob files
  const blobStore = {};
  for (const b of encrypted.blobs) {
    blobStore[b.filename] = b.data;
  }

  global.fetch = async (url) => {
    const filename = url.split("/").pop();
    const data = blobStore[filename];
    if (!data) return { ok: false, status: 404 };
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    };
  };

  // Mock URL.createObjectURL / revokeObjectURL for Node
  let objectUrlCounter = 1;
  const mockObjectUrls = new Map();
  global.URL.createObjectURL = (blob) => {
    const url = "blob:mock://" + objectUrlCounter++;
    mockObjectUrls.set(url, blob);
    return url;
  };
  global.URL.revokeObjectURL = (url) => {
    mockObjectUrls.delete(url);
  };

  // 3. Decrypt with correct password
  const decrypted = await CryptoPage.decryptPage(encrypted.payload, password, "");
  assert.equal(decrypted.markdown, markdown, "Markdown decrypted successfully");
  assert.ok(decrypted.attachments["bauteil.png"].startsWith("blob:mock://"));
  assert.ok(decrypted.attachments["handbuch.txt"].startsWith("blob:mock://"));

  // Check decrypted blob content
  const decryptedHandbuchBlob = mockObjectUrls.get(decrypted.attachments["handbuch.txt"]);
  assert.equal(decryptedHandbuchBlob.type, "text/plain");

  // 4. Render with SafeMarkdown
  const renderedHtml = SafeMarkdown.render(decrypted.markdown, decrypted.attachments);
  assert.ok(renderedHtml.includes("<img src=\"blob:mock://"));
  assert.ok(renderedHtml.includes('download="handbuch.txt"'));

  // 5. Decrypt with wrong password fails
  await assert.rejects(
    async () => {
      await CryptoPage.decryptPage(encrypted.payload, "falsches-passwort", "");
    },
    /operation failed|MAC check failed/i,
    "Wrong password must reject"
  );
});

test("NeuFormular: Encrypt an existing unencrypted page and edit its plain text when encrypted", async () => {
  const existingUnencrypted = `---
title: "Internes Werkstatt-Protokoll"
summary: "Notizen zum Aufbau"
status: aktuell
start: 2026-11-25
uuid: 550e8400-e29b-41d4-a716-446655440000
---

## Offene Punkte

- Schlüsselübergabe am Freitag
- Zugangsdaten nur vor Ort
`;
  const password = "werkstatt-passwort-2026";

  // 1. Encrypt existing unencrypted page via NeuFormular.encryptEditedFile
  const encRes = await NeuFormular.encryptEditedFile("projekt", existingUnencrypted, {}, password, "_projects/werkstatt-protokoll.md");
  assert.ok(encRes.content.includes("encrypted: true"), "Front matter must include encrypted: true");
  assert.ok(encRes.content.includes('class="encrypted-data"'), "Body must contain encrypted-data script block");
  assert.ok(!encRes.content.includes("Schlüsselübergabe"), "Plaintext must not appear in encrypted file");
  assert.ok(encRes.content.includes("uuid: 550e8400-e29b-41d4-a716-446655440000"), "Existing front matter fields stay intact");

  // 2. Decrypt the encrypted file for editing in the ✏️ form
  const decForEdit = await NeuFormular.decryptFileForEdit("projekt", encRes.content, password, "_projects/werkstatt-protokoll.md");
  assert.equal(decForEdit.values.title, "Internes Werkstatt-Protokoll");
  assert.equal(decForEdit.values.encrypted, true);
  assert.ok(decForEdit.plaintext.includes("## Offene Punkte\n\n- Schlüsselübergabe am Freitag"));

  // 3. Edit the decrypted plain text and re-encrypt (keeping KDF salt so any .blob attachments remain valid)
  const updatedPlaintext = decForEdit.plaintext + "\n- Alarmcode geändert";
  const reEncRes = await NeuFormular.encryptEditedFile(
    "projekt",
    encRes.content,
    { text: updatedPlaintext, summary: "Aktualisierte Notizen" },
    password,
    "_projects/werkstatt-protokoll.md"
  );
  assert.equal(reEncRes.payload.kdf.salt, encRes.payload.kdf.salt, "KDF salt preserved when password is unchanged");
  assert.notEqual(reEncRes.payload.iv, encRes.payload.iv, "Fresh IV generated on re-encryption");
  assert.ok(reEncRes.content.includes("summary: Aktualisierte Notizen"));
  assert.ok(!reEncRes.content.includes("Alarmcode"), "Updated plaintext must not leak in file");

  // 4. Verify decrypted updated content matches
  const decAfterEdit = await NeuFormular.decryptFileForEdit("projekt", reEncRes.content, password, "_projects/werkstatt-protokoll.md");
  assert.equal(decAfterEdit.plaintext, updatedPlaintext);
});

test("SafeMarkdown: Renders {: .gallery} blocks as <div class='gallery'> with lightbox links", () => {
  const md = `Hier sind die Fotos:

![Foto 1](/assets/images/projekte/test/01.jpg)
![Foto 2](/assets/images/projekte/test/02.jpg)
{: .gallery}
`;
  const attachments = {
    "/assets/images/projekte/test/01.jpg": "blob:mock://img1",
    "/assets/images/projekte/test/02.jpg": "blob:mock://img2"
  };
  const html = SafeMarkdown.render(md, attachments);
  assert.ok(!html.includes("{: .gallery}"), "Gallery IAL must not render as text");
  assert.ok(html.includes('<div class="gallery">'), "Gallery wrapper div rendered");
  assert.ok(html.includes('<a class="lightbox" href="blob:mock://img1"><img src="blob:mock://img1" alt="Foto 1" loading="lazy"></a>'));
  assert.ok(html.includes('<a class="lightbox" href="blob:mock://img2"><img src="blob:mock://img2" alt="Foto 2" loading="lazy"></a>'));
});

test("SafeMarkdown: Renders Markdown tables like kramdown (header, alignment, escaped pipes, HTML escaped)", () => {
  const md = "Vorher\n\n| Teil | Anzahl | Preis |\n|:-----|:-----:|------:|\n| Rahmen <b onclick=x> | `a|b` | 2 \\| 3 € |\n| **fett** | 2 | [Link](https://example.org) |\n\n| ohne | Kopf |\n| a | b |\n";
  const html = SafeMarkdown.render(md);
  assert.ok(html.includes("<p>Vorher</p>\n<table>\n<thead>"), "table starts its own block after a paragraph");
  assert.ok(html.includes('<th style="text-align: left">Teil</th><th style="text-align: center">Anzahl</th><th style="text-align: right">Preis</th>'));
  assert.ok(html.includes('<td style="text-align: left">Rahmen &lt;b onclick=x&gt;</td>'), "HTML in cells stays escaped");
  assert.ok(html.includes('<td style="text-align: center"><code>a|b</code></td>'), "pipe inside a code span doesn't split");
  assert.ok(html.includes('<td style="text-align: right">2 | 3 €</td>'), "\\| is a literal pipe");
  assert.ok(html.includes("<strong>fett</strong>") && html.includes('<a href="https://example.org"'), "inline Markdown in cells");
  assert.ok(html.includes("<table>\n<tbody>\n<tr><td>ohne</td><td>Kopf</td></tr>"), "without separator row all rows are body rows");
  assert.ok(!html.includes("<b onclick"), "no raw HTML");
});

test("SafeMarkdown: 3D-Modelle, Audio, Video als eigene Zeile + „📎 Dateien“ am Ende (entschlüsselte Anhänge)", () => {
  const md = "Text\n\n![Modell <x>](/assets/dateien/news/a/m.3mf)\n\n![Ton](/assets/dateien/news/a/t.mp3)\n\n![Clip](/assets/dateien/news/a/c.mp4)\n";
  const html = SafeMarkdown.render(md, { "/assets/dateien/news/a/m.3mf": "blob:m", "/assets/dateien/news/a/t.mp3": "blob:t", "/assets/dateien/news/a/c.mp4": "blob:c" });
  assert.ok(html.includes('<figure class="modell-3d" data-model="blob:m" data-format="3mf" data-alt="Modell &lt;x&gt;"><figcaption>Modell &lt;x&gt;</figcaption></figure>'), html);
  assert.ok(html.includes('<audio controls preload="metadata" src="blob:t" aria-label="Ton">'), html);
  assert.ok(html.includes('<video class="post-video" controls preload="metadata" playsinline src="blob:c" aria-label="Clip">'), html);
  assert.ok(html.includes('<a href="blob:m" download="m.3mf">m.3mf</a>'), html);
  assert.ok(!/<script|onerror/.test(html));
  // a javascript: URL never becomes a model or download
  const bad = SafeMarkdown.render("![x](javascript:alert(1).stl)\n");
  assert.ok(!bad.includes("javascript:"), bad);
});
