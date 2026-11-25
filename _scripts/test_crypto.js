// _scripts/test_crypto.js
// Unit tests for SafeMarkdown and CryptoPage (Node.js 22+)
const assert = require("node:assert");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const SafeMarkdown = require("../assets/js/safe-markdown.js");
const CryptoPage = require("../assets/js/crypto-page.js");

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
    let data = blobStore[filename];
    if (!data) {
      const relPath = path.join(__dirname, "..", url.replace(/^\//, ""));
      if (fs.existsSync(relPath)) {
        data = fs.readFileSync(relPath);
      }
    }
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

test("NeuFormular: Encrypted editing and encrypting existing files", async () => {
  const NeuFormular = require("../assets/js/neu.js");
  const fs = require("fs");
  const path = require("path");

  // 1. readSource detects encrypted post and extracts cryptoPayload
  const encryptedPath = path.join(__dirname, "../_posts/2026-11-25-vertraulicher-bericht.md");
  const encryptedSource = fs.readFileSync(encryptedPath, "utf8");
  const schema = NeuFormular.TYPEN.beitrag;
  const loaded = NeuFormular.readSource(schema, encryptedSource, "_posts/2026-11-25-vertraulicher-bericht.md");

  assert.equal(loaded.encrypted, true, "readSource detects encrypted: true");
  assert.ok(loaded.cryptoPayload, "readSource extracts cryptoPayload");
  assert.equal(loaded.cryptoPayload.v, 1);

  // Decrypt the extracted payload with geheim123
  const dec = await CryptoPage.decryptPage(loaded.cryptoPayload, "geheim123", "");
  assert.ok(dec.markdown.includes("Streng vertraulicher Projektbericht"), "Decrypts plain text successfully");

  // 2. Encrypt an existing unencrypted page
  const plainSource = `---
title: "Bisher unverschlüsselter Beitrag"
date: 2026-03-16 10:00:00 +0100
author: falko-richter
uuid: 42a57b16-245a-4ded-8d8a-e6c0839ecb6f
---

Offener Text vor der Verschlüsselung.
`;
  const plainLoaded = NeuFormular.readSource(schema, plainSource, "test.md");
  assert.equal(plainLoaded.encrypted, false, "readSource detects unencrypted page");

  // Encrypt plain text with new password
  const newPw = "neues-geheimnis-789";
  const newText = "Neuer geheimer Inhalt!";
  const encRes = await CryptoPage.encryptPage(newText, newPw);
  const encryptedRest = "\n<script type=\"application/json\" class=\"encrypted-data\">\n" + JSON.stringify(encRes.payload, null, 2) + "\n</script>\n";

  const output = NeuFormular.editedText(schema, plainLoaded, {
    ...plainLoaded.w0,
    text: newText,
    encrypted: true,
    encryptedRest: encryptedRest
  });

  assert.ok(output.includes("encrypted: true"), "Output has encrypted: true in front matter");
  assert.ok(output.includes("search: false"), "Output has search: false in front matter");
  assert.ok(output.includes('<script type="application/json" class="encrypted-data">'), "Output contains encrypted data block");
  assert.ok(!output.includes("Neuer geheimer Inhalt!"), "Plain text is NOT in output file");

  // Verify that the resulting output file can be decrypted with newPw
  const verifyLoaded = NeuFormular.readSource(schema, output, "test.md");
  assert.equal(verifyLoaded.encrypted, true);
  const verifyDec = await CryptoPage.decryptPage(verifyLoaded.cryptoPayload, newPw, "");
  assert.equal(verifyDec.markdown, newText, "Re-decrypted text matches modified text");
});
