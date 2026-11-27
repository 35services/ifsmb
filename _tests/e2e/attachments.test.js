// "📎 Datei" in the ➕/✏️ forms: STL, 3MF, MP3 and MP4 go into assets/dateien/<area>/<slug>/, the embed lands at the
// cursor as its own paragraph, and the files go up with the pull request. Videos bigger than 1080p are shrunk in the
// browser (assets/js/video-verkleinern.js) – that test needs ffmpeg locally and a Chrome that records MP4.
"use strict";
const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { startEnv, editPage, ROOT } = require("./lib/helpers.js");

let env;
before(async () => { env = await startEnv(); });
after(() => env.close());
beforeEach(() => env.reset());
afterEach(async (t) => { if (!t.passed) env.logs().forEach((l) => console.log(l)); await env.closePeople(); });

const STL = "solid wuerfel\n facet normal 0 0 1\n  outer loop\n   vertex 0 0 0\n   vertex 1 0 0\n   vertex 0 1 0\n  endloop\n endfacet\nendsolid wuerfel\n";

// put the cursor at the end of `after` in the text field (like a click there)
async function cursorAfter(person, after) {
  await person.page.evaluate((a) => {
    const ta = document.querySelector('#neu-dialog [name="text"]');
    const pos = ta.value.indexOf(a) + a.length;
    ta.focus(); ta.setSelectionRange(pos, pos);
    ta.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }, after);
}

async function attach(person, files) {
  person.page.queueFiles(files);
  await person.page.click("#neu-dialog [data-files]");
}

test("📎 STL und MP3 → an der Cursor-Position eingebettet, in assets/dateien/ hochgeladen", async () => {
  const stl = path.join(env.tmp, "Würfel Test.stl"), mp3 = path.join(env.tmp, "ton.mp3");
  fs.writeFileSync(stl, STL);
  fs.writeFileSync(mp3, Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]));
  const alice = await env.person("token-alice");
  await alice.openNew("/news/", "beitrag");
  await alice.fill({ title: "E2E Anhänge", text: "Erster Absatz.\n\nZweiter Absatz.\n" });
  await alice.page.waitFor(() => !document.querySelector("#neu-dialog [data-files]").hidden, [], { message: "📎-Knopf fehlt" });

  await cursorAfter(alice, "Erster Abs"); // mid-line: the embed goes after this line
  await attach(alice, [stl]);
  await alice.page.waitFor(() => /wurfel-test\.stl\)/.test(document.querySelector('#neu-dialog [name="text"]').value));
  await cursorAfter(alice, "Zweiter Absatz.");
  await attach(alice, [mp3]);
  await alice.page.waitFor(() => /ton\.mp3\)/.test(document.querySelector('#neu-dialog [name="text"]').value));

  const text = await alice.value("text");
  const m = text.match(/\(\/(assets\/dateien\/news\/[^/]+\/)wurfel-test\.stl\)/);
  assert.ok(m, text);
  const dir = m[1];
  assert.equal(text, "Erster Absatz.\n\n![Würfel Test](/" + dir + "wurfel-test.stl)\n\nZweiter Absatz.\n\n![ton](/" + dir + "ton.mp3)\n");

  await alice.submit();
  await alice.waitStatus(/Pull Request #1.*angelegt/, { timeout: 20000 });
  const pr = env.control.state().pulls[0];
  const post = pr.files.find((f) => f.filename.startsWith("_posts/")).filename;
  assert.equal(dir, "assets/dateien/news/" + post.replace(/^_posts\/\d{4}-\d{2}-\d{2}-|\.md$/g, "") + "/");
  assert.deepEqual(pr.files.map((f) => f.filename).sort(), [post, dir + "ton.mp3", dir + "wurfel-test.stl"].sort());
  const bytes = (p) => Buffer.from(env.control.readFile({ ref: pr.head.ref, path: p }).base64, "base64");
  assert.ok(bytes(dir + "wurfel-test.stl").equals(fs.readFileSync(stl)), "STL unverändert");
  assert.ok(bytes(dir + "ton.mp3").equals(fs.readFileSync(mp3)), "MP3 unverändert");
  assert.match(pr.body, /\*\*Dateien:\*\* `wurfel-test\.stl`/);
});

test("📎 Datei wieder aus dem Text gelöscht → wird nicht hochgeladen", async () => {
  const stl = path.join(env.tmp, "weg.stl");
  fs.writeFileSync(stl, STL);
  const alice = await env.person("token-alice");
  await alice.openNew("/news/", "beitrag");
  await alice.fill({ title: "E2E Anhang weg", text: "Text.\n" });
  await attach(alice, [stl]);
  await alice.page.waitForSelector("#neu-dialog [data-file-remove]");
  await alice.page.click("#neu-dialog [data-file-remove]");
  await alice.page.waitFor(() => !/weg\.stl/.test(document.querySelector('#neu-dialog [name="text"]').value));
  await alice.submit();
  await alice.waitStatus(/Pull Request #1.*angelegt/, { timeout: 20000 });
  const pr = env.control.state().pulls[0];
  assert.equal(pr.files.length, 1, JSON.stringify(pr.files.map((f) => f.filename)));
});

function hasFfmpeg() { try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); return true; } catch (e) { return false; } }

test("📎 4K-Video mit Standort → im Browser als 1080p-MP4 ohne Metadaten neu aufgenommen", async (t) => {
  if (!hasFfmpeg()) { t.skip("ffmpeg fehlt"); return; }
  const alice = await env.person("token-alice");
  await alice.openNew("/news/", "beitrag");
  const canRecord = await alice.page.evaluate(() => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("video/mp4"));
  if (!canRecord) { t.skip("Chrome nimmt hier kein MP4 auf"); return; }
  const src = path.join(env.tmp, "clip-4k.mov");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=3840x2160:rate=30:duration=2",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-metadata", "location=+52.5200+013.4050/", src]);
  assert.match(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags", "-of", "default", src]).toString(), /location/i, "Testvideo hat Standort");
  await alice.fill({ title: "E2E Video", text: "Video:\n" });
  await attach(alice, [src]);
  await alice.page.waitFor(() => /clip-4k\.mp4\)/.test(document.querySelector('#neu-dialog [name="text"]').value), [], { timeout: 30000, message: "Video nicht eingefügt" });
  await alice.submit();
  await alice.waitStatus(/Pull Request #1.*angelegt/, { timeout: 20000 });
  const pr = env.control.state().pulls[0];
  const file = pr.files.find((f) => /clip-4k\.mp4$/.test(f.filename));
  assert.ok(file, JSON.stringify(pr.files.map((f) => f.filename)));
  const out = path.join(env.tmp, "out.mp4");
  fs.writeFileSync(out, Buffer.from(env.control.readFile({ ref: pr.head.ref, path: file.filename }).base64, "base64"));
  const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name", "-of", "csv=p=0", out]).toString().trim();
  assert.match(probe, /^h264,1920,1080$/, probe);
  const audio = execFileSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", out]).toString().trim();
  assert.equal(audio, "aac", "Ton bleibt erhalten");
  const tags = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags", "-of", "default", out]).toString();
  assert.doesNotMatch(tags, /location|52\.52/i, "Standort ist entfernt: " + tags);
});

// ✏️ a page that already has attachments: the panel lists them, ✕ removes the embed and deletes the file in the PR,
// "Zurückholen" brings it back. Uses a real post as the page, with its source replaced for this test.
test("✏️ vorhandene Dateien: ✕ entfernt Einbettung und löscht die Datei im Pull Request, ↩︎ holt sie zurück", async () => {
  const page = editPage("beitrag");
  const slug = page.path.replace(/^_posts\/\d{4}-\d{2}-\d{2}-|\.md$/g, "");
  const dir = "assets/dateien/news/" + slug + "/";
  const original = fs.readFileSync(path.join(ROOT, page.path), "utf8");
  const fm = original.match(/^---\n[\s\S]*?\n---\n/)[0];
  const seeded = fm + "\nText.\n\n![Erstes Modell](/" + dir + "erstes.3mf)\n\n![Zweites Modell](/" + dir + "zweites.stl)\n\n![Fremd](/assets/dateien/news/anderer-beitrag/fremd.stl)\n\nEnde.\n";
  env.control.seed({ files: { [page.path]: seeded, [dir + "erstes.3mf"]: { base64: "UEsDBA==" }, [dir + "zweites.stl"]: STL, "assets/dateien/news/anderer-beitrag/fremd.stl": STL } });
  const sitePath = path.join(ROOT, "_site/source", page.path);
  const before = fs.readFileSync(sitePath, "utf8");
  fs.writeFileSync(sitePath, seeded);
  try {
    const alice = await env.person("token-alice");
    await alice.openEdit(page.url);
    await alice.page.waitFor(() => document.querySelectorAll("#neu-dialog [data-existing-file]").length === 3, [], { message: "vorhandene Dateien fehlen" });
    const removeBtn = (name) => alice.page.evaluate((n) => { [...document.querySelectorAll("#neu-dialog [data-existing-file]")].find((li) => li.getAttribute("data-existing-file") === n).querySelector("button").click(); }, name);

    await removeBtn("erstes.3mf");
    await alice.page.waitFor(() => !/erstes\.3mf/.test(document.querySelector('#neu-dialog [name="text"]').value));
    assert.match(await alice.page.text('#neu-dialog [data-existing-file="erstes.3mf"]'), /wird mit dem Pull Request gelöscht/);
    assert.equal(await alice.page.evaluate(() => document.querySelector("#neu-dialog [data-submit]").disabled), false, "nur gelöscht ist auch eine Änderung");
    await removeBtn("zweites.stl");
    await removeBtn("zweites.stl"); // ↩︎ Zurückholen
    await alice.page.waitFor(() => /zweites\.stl/.test(document.querySelector('#neu-dialog [name="text"]').value));
    await removeBtn("fremd.stl");  // not in this page's folder: only the embed goes
    assert.match(await alice.page.text('#neu-dialog [data-existing-file="fremd.stl"]'), /Datei bleibt/);

    await alice.submit();
    await alice.waitStatus(/Pull Request #1.*angelegt/, { timeout: 20000 });
    const pr = env.control.state().pulls[0];
    assert.deepEqual(pr.files.map((f) => [f.filename, f.status]).sort(), [[dir + "erstes.3mf", "removed"], [page.path, "modified"]].sort());
    const text = env.control.readFile({ ref: pr.head.ref, path: page.path }).text;
    assert.ok(!/erstes\.3mf|fremd\.stl/.test(text), text);
    assert.match(text, /!\[Zweites Modell\]\(\/assets\/dateien\/news\/[^)]+\/zweites\.stl\)/);
    assert.match(pr.body, /\*\*Gelöschte Dateien:\*\* `erstes\.3mf`/);
  } finally {
    fs.writeFileSync(sitePath, before);
  }
});
