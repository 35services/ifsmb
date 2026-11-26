// "♻️ PR recycling" in the ➕/✏️ forms: with the box ticked, a change goes as another commit into the newest open pull
// request of the connected person (same repository) instead of a new pull request.
"use strict";
const { test, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startEnv, editPage, ROOT } = require("./lib/helpers.js");

let env;
before(async () => { env = await startEnv(); });
after(() => env.close());
beforeEach(() => env.reset());
afterEach(async (t) => { if (!t.passed) env.logs().forEach((l) => console.log(l)); await env.closePeople(); });

// an open pull request of `login` that adds one file → its branch and the first commit
function seedPull(login, branch, file, title) {
  const sha = env.control.commit({ branch, from: "main", files: { [file]: "erste Datei\n" }, login, message: title }).sha;
  env.control.openPull({ head: branch, title, login });
  return sha;
}

async function recycleBox(person) {
  await person.page.waitFor(() => { const b = document.querySelector("#neu-dialog .form-recycle"); return b && !b.hidden; }, [], { message: "♻️-Haken fehlt" });
  return person.page.text("#neu-dialog .form-recycle");
}
async function tick(person, on) {
  await person.page.evaluate((v) => { const c = document.querySelector("#neu-dialog [data-recycle]"); if (c.checked !== v) c.click(); }, on);
}

test("♻️ angehakt: neuer Beitrag landet als Commit in Alices letztem offenen PR", async () => {
  seedPull("alice", "web/alice-alt", "_posts/2026-11-01-alt.md", "Alter PR von Alice");
  const newest = seedPull("alice", "web/alice-neu", "_posts/2026-11-02-neu.md", "Neuester PR von Alice");
  seedPull("bob", "web/bob-x", "_posts/2026-11-03-bob.md", "PR von Bob"); // newer, but not hers
  const alice = await env.person("token-alice");
  await alice.openNew("/news/", "beitrag");
  assert.match(await recycleBox(alice), /♻️.*#2 Neuester PR von Alice/s); // label text from _data/i18n (form.recycle)
  assert.equal(await alice.page.evaluate(() => document.querySelector("#neu-dialog [data-recycle]").checked), false, "aus, bis man es anhakt");
  await tick(alice, true);
  await alice.page.waitFor(() => /♻️ An #2 anhängen/.test(document.querySelector("#neu-dialog [data-submit]").textContent));

  await alice.fill({ title: "E2E Recycling", text: "Noch was.\n" });
  await alice.submit();
  await alice.waitStatus(/Pull Request #2.*ergänzt/, { timeout: 20000 });

  const st = env.control.state();
  assert.equal(st.pulls.length, 3, "kein neuer Pull Request");
  const [head] = env.control.log({ ref: "web/alice-neu", limit: 1 });
  assert.deepEqual(head.parents, [newest], "Commit sitzt auf dem PR-Branch");
  const files = st.pulls.find((p) => p.number === 2).files.map((f) => f.filename).sort();
  assert.equal(files.length, 2, JSON.stringify(files));
  assert.ok(files.some((f) => /^_posts\/\d{4}-\d{2}-\d{2}-e2e-recycling\.md$/.test(f)), JSON.stringify(files));
  assert.equal(await alice.page.text("#neu-dialog [data-submit]"), "🚀 In #2 speichern", "danach im PR weiter");
  // the choice is remembered for the next form
  await alice.page.evaluate(() => document.querySelector("#neu-dialog").close());
  await alice.openNew("/news/", "beitrag");
  await recycleBox(alice);
  assert.equal(await alice.page.evaluate(() => document.querySelector("#neu-dialog [data-recycle]").checked), true);
});

test("♻️ angehakt beim Bearbeiten einer anderen Seite: Änderung kommt in den eigenen PR", async () => {
  const page = editPage("beitrag");
  env.seedSource([page.path]);
  const original = fs.readFileSync(path.join(ROOT, page.path), "utf8");
  seedPull("alice", "web/alice-neu", "_posts/2026-11-02-neu.md", "Neuester PR von Alice");
  const alice = await env.person("token-alice");
  await alice.openEdit(page.url);
  await recycleBox(alice);
  await tick(alice, true);
  await alice.fill({ title: "E2E recycelter Titel" });
  await alice.submit();
  await alice.waitStatus(/Pull Request #1.*ergänzt/, { timeout: 20000 });
  assert.equal(env.control.state().pulls.length, 1);
  const text = env.control.readFile({ ref: "web/alice-neu", path: page.path }).text;
  assert.match(text, /^title: "?E2E recycelter Titel"?$/m);
  assert.equal(text.split("\n").length, original.split("\n").length, "nur die Titelzeile geändert");
  assert.equal(env.control.readFile({ path: page.path }).text, original, "main bleibt unverändert");
});

test("♻️ nicht angehakt → eigener PR wie bisher; PR inzwischen gemergt → neuer PR mit Hinweis", async () => {
  seedPull("alice", "web/alice-neu", "_posts/2026-11-02-neu.md", "Neuester PR von Alice");
  const alice = await env.person("token-alice");
  await alice.openNew("/news/", "beitrag");
  await recycleBox(alice);
  await alice.fill({ title: "E2E ohne Recycling", text: "Text.\n" });
  await alice.submit();
  await alice.waitStatus(/Pull Request #2.*angelegt/, { timeout: 20000 });
  assert.equal(env.control.state().pulls.length, 2);

  await alice.page.evaluate(() => document.querySelector("#neu-dialog").close());
  await alice.openNew("/news/", "beitrag");
  await recycleBox(alice);
  await tick(alice, true);
  env.control.mergePull({ number: 2 });
  await alice.fill({ title: "E2E nach dem Schließen", text: "Text.\n" });
  await alice.submit();
  await alice.waitStatus(/Pull Request #3.*angelegt/, { timeout: 20000 });
  assert.equal(env.control.state().pulls.length, 3);
});

test("♻️ kein eigener offener PR → kein Haken", async () => {
  seedPull("bob", "web/bob-x", "_posts/2026-11-03-bob.md", "PR von Bob");
  const alice = await env.person("token-alice");
  await alice.openNew("/news/", "beitrag");
  await new Promise((r) => setTimeout(r, 1500)); // the lookup is asynchronous
  assert.equal(await alice.page.evaluate(() => document.querySelector("#neu-dialog .form-recycle").hidden), true);
});
