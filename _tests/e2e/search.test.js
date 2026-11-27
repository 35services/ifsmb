// /search/#Begriff: the search starts right away, typing keeps the term in the address (#…), changing #… searches
// again. Needs the Pagefind index (_site/pagefind/, `npx -y pagefind@1.5.2 --site _site`) – skipped without it.
"use strict";
const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startEnv, SITE } = require("./lib/helpers.js");

let env;
before(async () => { env = await startEnv(); });
after(() => env.close());
afterEach(async (t) => { if (!t.passed) env.logs().forEach((l) => console.log(l)); await env.closePeople(); });

const hasIndex = () => fs.existsSync(path.join(SITE, "pagefind", "pagefind-ui.js"));
// a word that is on the site for sure: the title of the newest post
function someWord() {
  const posts = fs.readdirSync(path.join(SITE, "..", "_posts")).filter((f) => f.endsWith(".md")).sort().reverse();
  for (const f of posts) {
    const src = fs.readFileSync(path.join(SITE, "..", "_posts", f), "utf8");
    if (/^encrypted: true$/m.test(src) || /^personal: true$/m.test(src)) continue;
    const m = src.match(/^title:\s*"?([^"\n]+)/m);
    const w = m && m[1].split(/[^A-Za-zÄÖÜäöüß]+/).find((x) => x.length >= 6);
    if (w) return w;
  }
  return "Makespace";
}

test("🔎 /search/#Begriff sucht sofort, Tippen schreibt #… in die Adresse, geändertes #… sucht neu", async (t) => {
  if (!hasIndex()) { t.skip("kein Pagefind-Index in _site/pagefind/"); return; }
  const word = someWord();
  const alice = await env.person(null);
  await alice.open("/search/#" + encodeURIComponent(word));
  await alice.page.waitFor(() => document.querySelectorAll(".pagefind-ui__result").length > 0, [], { timeout: 15000, message: "keine Treffer für " + word });
  assert.equal(await alice.page.evaluate(() => document.querySelector(".pagefind-ui__search-input").value), word);

  await alice.page.evaluate(() => { const i = document.querySelector(".pagefind-ui__search-input"); i.value = "Makespace Werkstatt"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  await alice.page.waitFor(() => location.hash === "#Makespace+Werkstatt", [], { message: "Adresse nicht aktualisiert" });

  await alice.page.evaluate((w) => { location.hash = "#" + w; }, word);
  await alice.page.waitFor((w) => document.querySelector(".pagefind-ui__search-input").value === w, [word]);
});
