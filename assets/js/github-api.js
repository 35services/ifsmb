// Direct pull requests from the browser (prototype).
//
// The ➕/✏️ forms can create a pull request themselves instead of "copy & open GitHub's editor": with a GitHub token
// the browser talks to api.github.com directly (no server of ours in between). All files of one change – the Markdown
// file and its photos – go into ONE commit on a new branch, then a pull request against site.branch is opened.
// Nothing is ever committed to main directly.
//
// Token: for now a fine-grained personal access token (only this repository, "Contents" and "Pull requests":
// read & write). It stays in this browser: sessionStorage by default (gone when the tab closes), localStorage only
// if "auf diesem Gerät merken" is chosen. A real "Sign in with GitHub" needs a small token-exchange service –
// see PLAN_DIRECT_EDITING.md.
//
// Only works for people with write access to the repository (branch in the same repository); forks are a later step.
var GitHubApi = (function () {
  "use strict";
  var KEY = "ifsmb-github-token", API = apiBase();

  // Tests only (_tests/e2e/): localStorage "ifsmb-github-api" points the API at a local fake GitHub. Honoured only
  // when this page runs on localhost/127.0.0.1 AND the override is a local http address – so on ifsmb.de (or with a
  // stray value) the token is never sent anywhere but api.github.com.
  function apiBase() {
    var real = "https://api.github.com";
    try {
      if (typeof location === "undefined" || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return real;
      var v = localStorage.getItem("ifsmb-github-api");
      return v && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(v) ? v : real;
    } catch (e) { return real; } // storage blocked
  }

  function cfg() { return JSON.parse(document.getElementById("formular-daten").textContent); }
  function repo() { return cfg().github.replace(/^https:\/\/github\.com\//, ""); } // "owner/name"
  function baseBranch() { return cfg().branch || "main"; }

  // ---------- token ----------
  function storage(remember) { try { return remember ? localStorage : sessionStorage; } catch (e) { return null; } }
  function token() {
    try { return sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function setToken(t, remember) {
    logout();
    var s = storage(remember);
    if (s && t) s.setItem(KEY, t.trim());
  }
  function logout() {
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
    me = null;
  }
  function connected() { return !!token(); }
  // Page that creates a fine-grained token for this repository (fields may be pre-filled; GitHub ignores unknown ones).
  function tokenUrl() {
    var owner = repo().split("/")[0];
    return "https://github.com/settings/personal-access-tokens/new?name=" + encodeURIComponent("ifsmb.de bearbeiten")
      + "&description=" + encodeURIComponent("Pull Requests direkt von ifsmb.de aus") + "&target_name=" + encodeURIComponent(owner)
      + "&expires_in=30&contents=write&pull_requests=write";
  }

  // ---------- requests ----------
  function call(method, path, body) {
    var t = token();
    if (!t) return Promise.reject(new Error("Nicht mit GitHub verbunden."));
    return fetch(API + path, {
      method: method,
      headers: { "Authorization": "Bearer " + t, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store"
    }).then(function (r) {
      return r.text().then(function (txt) {
        var data = txt ? JSON.parse(txt) : null;
        if (!r.ok) {
          var msg = (data && data.message) || r.statusText;
          if (r.status === 401) msg = "Token ungültig oder abgelaufen.";
          if (r.status === 403 || r.status === 404) msg += " (fehlt dem Token die Berechtigung für " + repo() + "?)";
          var err = new Error(msg); err.status = r.status; throw err;
        }
        return data;
      });
    });
  }

  // Who is connected and may they push to the repository? → { login, avatar, name, canPush }
  var me = null;
  function whoAmI() {
    if (me) return Promise.resolve(me);
    return Promise.all([call("GET", "/user"), call("GET", "/repos/" + repo())]).then(function (r) {
      me = { login: r[0].login, name: r[0].name || r[0].login, avatar: r[0].avatar_url,
        canPush: !!(r[1].permissions && r[1].permissions.push) };
      return me;
    });
  }

  // ---------- encoding ----------
  function blobToBase64(blob) {
    return new Promise(function (ok, fail) {
      var fr = new FileReader();
      fr.onload = function () { ok(String(fr.result).replace(/^data:[^,]*,/, "")); };
      fr.onerror = function () { fail(fr.error); };
      fr.readAsDataURL(blob);
    });
  }

  // Current text of a file on the base branch or on ref (or null if it doesn't exist) – to warn before overwriting newer changes.
  function readFile(path, ref) {
    return call("GET", "/repos/" + repo() + "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(ref || baseBranch()))
      .then(function (f) {
        var bin = atob(String(f.content).replace(/\n/g, "")), bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder().decode(bytes);
      }, function (e) { if (e.status === 404) return null; throw e; });
  }

  // File names in a folder on the base branch ([] if the folder doesn't exist yet)
  function listFolder(folder, ref) {
    var path = folder.replace(/\/$/, "").split("/").map(encodeURIComponent).join("/");
    return call("GET", "/repos/" + repo() + "/contents/" + path + "?ref=" + encodeURIComponent(ref || baseBranch()))
      .then(function (list) { return (Array.isArray(list) ? list : []).map(function (f) { return f.name; }); },
        function (e) { if (e.status === 404) return []; throw e; });
  }

  // Open pull requests that change (or create) this file – the page's Markdown file is the indicator.
  // → [{ number, title, url, branch, user, sameRepo, status }]. One request for the list + one per open PR.
  function openPullsForFile(path) {
    var r = "/repos/" + repo();
    return call("GET", r + "/pulls?state=open&per_page=50").then(function (pulls) {
      return Promise.all(pulls.slice(0, 30).map(function (pr) {
        return call("GET", r + "/pulls/" + pr.number + "/files?per_page=100").then(function (files) {
          var f = files.filter(function (x) { return x.filename === path || x.previous_filename === path; })[0];
          return f && { number: pr.number, title: pr.title, url: pr.html_url, branch: pr.head.ref, user: pr.user && pr.user.login,
            sameRepo: !!(pr.head.repo && pr.head.repo.full_name === repo()), status: f.status };
        }, function () { return null; });
      }));
    }).then(function (list) { return list.filter(Boolean); });
  }

  function branchName(hint) {
    var d = new Date(), stamp = d.toISOString().slice(0, 16).replace(/[-:T]/g, "");
    var slug = String(hint || "aenderung").toLowerCase().replace(/\.[a-z]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    return "web/" + (me ? me.login.toLowerCase() + "-" : "") + slug + "-" + stamp;
  }

  // One commit with all files on a new branch + pull request.
  // o = { title, body, files: [{ path, text } | { path, blob }], branchHint, onStep(text) }
  // With o.pr = { number, url, branch } the commit goes on top of that open pull request's branch instead (no new PR).
  // → Promise<{ url, number, branch, updated }>
  function createPullRequest(o) {
    var r = "/repos/" + repo(), step = o.onStep || function () {}, base = o.pr ? o.pr.branch : baseBranch(), branch, baseSha;
    return whoAmI().then(function (u) {
      if (!u.canPush) throw new Error("@" + u.login + " darf in " + repo() + " keine Branches anlegen (Pull Requests aus Forks kommen später).");
      branch = o.pr ? o.pr.branch : branchName(o.branchHint);
      step("Stand von " + base + " holen …");
      return call("GET", r + "/git/ref/heads/" + base.split("/").map(encodeURIComponent).join("/"));
    }).then(function (ref) {
      baseSha = ref.object.sha;
      return call("GET", r + "/git/commits/" + baseSha);
    }).then(function (commit) {
      var n = 0;
      // blobs one after another: keeps it simple and stays far below GitHub's secondary rate limits
      return o.files.reduce(function (p, f) {
        return p.then(function (list) {
          step("Datei " + (++n) + " von " + o.files.length + " hochladen …");
          var content = f.blob ? blobToBase64(f.blob).then(function (b) { return { content: b, encoding: "base64" }; })
            : Promise.resolve({ content: f.text, encoding: "utf-8" });
          return content.then(function (c) { return call("POST", r + "/git/blobs", c); })
            .then(function (b) { return list.concat([{ path: f.path, mode: "100644", type: "blob", sha: b.sha }]); });
        });
      }, Promise.resolve([])).then(function (tree) {
        step("Commit anlegen …");
        return call("POST", r + "/git/trees", { base_tree: commit.tree.sha, tree: tree });
      });
    }).then(function (tree) {
      return call("POST", r + "/git/commits", {
        message: o.title + "\n\nAngelegt über das Formular auf ifsmb.de (" + location.pathname + ").",
        tree: tree.sha, parents: [baseSha]
      });
    }).then(function (commit) {
      if (o.pr) {
        step("Pull Request #" + o.pr.number + " ergänzen …");
        // force: false – if someone pushed to the branch meanwhile, GitHub refuses instead of losing their commit
        return call("PATCH", r + "/git/refs/heads/" + branch.split("/").map(encodeURIComponent).join("/"), { sha: commit.sha, force: false })
          .then(function () { return { pr: o.pr }; });
      }
      step("Branch " + branch + " anlegen …");
      return call("POST", r + "/git/refs", { ref: "refs/heads/" + branch, sha: commit.sha });
    }).then(function (res) {
      if (res && res.pr) return { html_url: res.pr.url, number: res.pr.number, updated: true };
      step("Pull Request öffnen …");
      return call("POST", r + "/pulls", { title: o.title, head: branch, base: base, body: o.body || "", maintainer_can_modify: true });
    }).then(function (pr) { return { url: pr.html_url, number: pr.number, branch: branch, updated: !!pr.updated }; });
  }

  return {
    token: token, setToken: setToken, logout: logout, connected: connected, tokenUrl: tokenUrl, repo: repo,
    whoAmI: whoAmI, readFile: readFile, listFolder: listFolder, openPullsForFile: openPullsForFile, createPullRequest: createPullRequest
  };
})();
if (typeof module !== "undefined") module.exports = GitHubApi;
