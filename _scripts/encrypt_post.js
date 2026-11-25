#!/usr/bin/env node
// _scripts/encrypt_post.js
// Utility to encrypt a markdown post and its attachments into .blob files.
// Usage: node _scripts/encrypt_post.js <password> <input-markdown> [attachment1] [attachment2] ...

const fs = require("node:fs");
const path = require("node:path");
const CryptoPage = require("../assets/js/crypto-page.js");

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log("Usage: node _scripts/encrypt_post.js <password> <input-markdown> [attachment1 ...]");
    process.exit(1);
  }

  const password = args[0];
  const mdFile = args[1];
  const attachmentFiles = args.slice(2);

  const rawMd = fs.readFileSync(mdFile, "utf8");

  // Split front matter and body
  const fmMatch = rawMd.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    console.error("Fehler: Datei hat kein gültiges Front Matter (--- ... ---)");
    process.exit(1);
  }

  const frontMatter = fmMatch[1];
  const markdownBody = fmMatch[2];

  // Read attachments
  const attachments = [];
  for (const f of attachmentFiles) {
    const filename = path.basename(f);
    const buf = fs.readFileSync(f);
    let mime = "application/octet-stream";
    if (/\.jpe?g$/i.test(filename)) mime = "image/jpeg";
    else if (/\.png$/i.test(filename)) mime = "image/png";
    else if (/\.svg$/i.test(filename)) mime = "image/svg+xml";
    else if (/\.pdf$/i.test(filename)) mime = "application/pdf";
    else if (/\.txt$/i.test(filename)) mime = "text/plain";
    else if (/\.csv$/i.test(filename)) mime = "text/csv";

    attachments.push({
      name: filename,
      data: new Uint8Array(buf),
      mime: mime
    });
  }

  console.log(`Verschlüssele "${mdFile}" mit ${attachments.length} Anhang/Anhängen...`);
  const result = await CryptoPage.encryptPage(markdownBody, password, attachments);

  // Write out .blob files next to the markdown file or in same directory
  const outDir = path.dirname(mdFile);
  for (const blob of result.blobs) {
    const blobOutPath = path.join(outDir, blob.filename);
    fs.writeFileSync(blobOutPath, Buffer.from(blob.data));
    console.log(`✓ Geschrieben: ${blobOutPath} (${blob.data.byteLength} Bytes)`);
  }

  // Ensure encrypted: true and search: false in front matter
  let newFm = frontMatter;
  if (!/encrypted:\s*true/.test(newFm)) {
    newFm += "\nencrypted: true";
  }
  if (!/search:\s*false/.test(newFm)) {
    newFm += "\nsearch: false # Verschlüsselter Inhalt nicht im öffentlichen Suchindex";
  }

  // Format new post with embedded JSON payload
  const newPostContent = `---
${newFm.trim()}
---

<script type="application/json" class="encrypted-data">
${JSON.stringify(result.payload, null, 2)}
</script>
`;

  fs.writeFileSync(mdFile, newPostContent, "utf8");
  console.log(`✓ Post aktualisiert: ${mdFile}`);
  console.log(`Passwort: ${password}`);
}

main().catch((err) => {
  console.error("Fehler beim Verschlüsseln:", err);
  process.exit(1);
});
