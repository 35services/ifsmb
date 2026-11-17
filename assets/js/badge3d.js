/* 3D-Ansicht der IfsMB-Badges – WebGL, ohne Bibliothek und ohne externe Ressourcen.
 *
 * <figure class="badge-3d" data-modell="/assets/badge/ifsmb-badge-falko.obj">
 *   <img src="…-oben.png" alt="…">      Vorschaubild, bleibt ohne JS/WebGL stehen
 * </figure>
 *
 * Lädt das OBJ (Gruppen „gelb“ und „schwarz“ aus _logo/badge/export-farbig.py), dreht das Badge
 * langsam um die Hochachse und lässt sich mit Maus/Finger drehen. Läuft nur, solange es sichtbar
 * ist; bei „Bewegung reduzieren“ steht es still (Ziehen geht trotzdem).
 */
(function () {
  "use strict";
  if (window.Badge3D) return;
  window.Badge3D = true;

  var FARBEN = { gelb: [1, 0.8, 0], schwarz: [0.086, 0.086, 0.114] };
  var STANDARD = [0.6, 0.6, 0.6];
  var RUHIG = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- OBJ -> flache Dreiecke mit Normalen und Farben -----------------------------------
  function ladeObj(text) {
    var v = [], pos = [], nor = [], col = [], farbe = STANDARD;
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    text.split("\n").forEach(function (zeile) {
      var t = zeile.trim().split(/\s+/);
      if (t[0] === "v") {
        var p = [+t[1], +t[2], +t[3]];
        v.push(p);
        for (var k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
      } else if (t[0] === "o" || t[0] === "g" || t[0] === "usemtl") {
        farbe = FARBEN[t[1]] || farbe;
      } else if (t[0] === "f") {
        var ix = t.slice(1).map(function (s) { return parseInt(s, 10) - 1; });
        for (var i = 1; i + 1 < ix.length; i++) {      // Vielecke in Dreiecke zerlegen
          var a = v[ix[0]], b = v[ix[i]], c = v[ix[i + 1]];
          var u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
          var n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
          var l = Math.hypot(n[0], n[1], n[2]) || 1;
          [a, b, c].forEach(function (p) {
            pos.push(p[0], p[1], p[2]);
            nor.push(n[0] / l, n[1] / l, n[2] / l);
            col.push(farbe[0], farbe[1], farbe[2]);
          });
        }
      }
    });
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), min: min, max: max };
  }

  // ---- Matrizen (spaltenweise, wie WebGL) ------------------------------------------------
  function mul(a, b) {
    var r = new Float32Array(16);
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      r[i * 4 + j] = s;
    }
    return r;
  }
  function verschiebe(x, y, z) { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); }
  function drehX(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]); }
  function drehY(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]); }
  function perspektive(fov, asp, nah, fern) {
    var f = 1 / Math.tan(fov / 2), d = 1 / (nah - fern);
    return new Float32Array([f / asp,0,0,0, 0,f,0,0, 0,0,(nah + fern) * d,-1, 0,0,2 * nah * fern * d,0]);
  }

  var VS =
    "attribute vec3 p; attribute vec3 n; attribute vec3 c;" +
    "uniform mat4 mvp; uniform mat4 m;" +
    "varying vec3 vn; varying vec3 vc;" +
    "void main() { gl_Position = mvp * vec4(p, 1.0); vn = (m * vec4(n, 0.0)).xyz; vc = c; }";
  var FS =
    "precision mediump float; varying vec3 vn; varying vec3 vc;" +
    "void main() {" +
    "  vec3 N = normalize(vn); if (!gl_FrontFacing) N = -N;" +
    "  vec3 L = normalize(vec3(0.45, 0.65, 1.0));" +
    "  float diff = max(dot(N, L), 0.0);" +
    "  float spec = pow(max(dot(N, normalize(L + vec3(0.0, 0.0, 1.0))), 0.0), 48.0);" +
    "  gl_FragColor = vec4(vc * (0.38 + 0.7 * diff) + vec3(0.35 * spec), 1.0);" +
    "}";

  function shader(gl, typ, quelle) {
    var s = gl.createShader(typ);
    gl.shaderSource(s, quelle);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function puffer(gl, prog, name, daten) {
    var b = gl.createBuffer(), ort = gl.getAttribLocation(prog, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, daten, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(ort);
    gl.vertexAttribPointer(ort, 3, gl.FLOAT, false, 0, 0);
  }

  function starte(fig, modell) {
    var canvas = document.createElement("canvas");
    var gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return;

    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    puffer(gl, prog, "p", modell.pos);
    puffer(gl, prog, "n", modell.nor);
    puffer(gl, prog, "c", modell.col);
    var uMvp = gl.getUniformLocation(prog, "mvp"), uM = gl.getUniformLocation(prog, "m");
    var anzahl = modell.pos.length / 3;
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    var mitte = [0, 1, 2].map(function (k) { return (modell.min[k] + modell.max[k]) / 2; });
    // Abstand aus halber Breite/Höhe: beim Drehen um die Hochachse wird das Badge nie breiter als von vorn
    var halbB = (modell.max[0] - modell.min[0]) / 2, halbH = (modell.max[1] - modell.min[1]) / 2;
    var FOV = 0.5, RAND = 1.25;   // Rand, damit die vordere Kante beim Drehen (Perspektive) nicht abgeschnitten wird

    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", (fig.querySelector("img") || {}).alt || "3D-Modell des Badges");
    canvas.title = "Zum Drehen ziehen";
    fig.classList.add("badge-3d-aktiv");
    fig.appendChild(canvas);

    var winkel = RUHIG ? -0.45 : 0, neigung = -0.12, laeuft = false, sichtbar = true;
    var ziehen = null, pauseBis = 0, letzte = 0;

    function groesse() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      return w / Math.max(h, 1);
    }

    function zeichne() {
      var asp = groesse();
      var m = mul(drehX(neigung), mul(drehY(winkel), verschiebe(-mitte[0], -mitte[1], -mitte[2])));
      var d = Math.max(halbB / asp, halbH) / Math.tan(FOV / 2) * RAND;
      var mvp = mul(perspektive(FOV, asp, d / 10, d * 3), mul(verschiebe(0, 0, -d), m));
      gl.uniformMatrix4fv(uMvp, false, mvp);
      gl.uniformMatrix4fv(uM, false, m);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, anzahl);
    }

    function schritt(t) {
      if (!laeuft) return;
      var dt = letzte ? Math.min(t - letzte, 100) : 0;
      letzte = t;
      if (!RUHIG && !ziehen && t > pauseBis) winkel += dt * 0.0006;   // eine Umdrehung in ~10 s
      zeichne();
      requestAnimationFrame(schritt);
    }
    function an() { if (!laeuft && sichtbar) { laeuft = true; letzte = 0; requestAnimationFrame(schritt); } }
    function aus() { laeuft = false; }

    canvas.addEventListener("pointerdown", function (e) {
      ziehen = { x: e.clientX, y: e.clientY, w: winkel, n: neigung };
      canvas.setPointerCapture(e.pointerId);
      an();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!ziehen) return;
      winkel = ziehen.w + (e.clientX - ziehen.x) * 0.01;
      neigung = Math.max(-1.2, Math.min(1.2, ziehen.n + (e.clientY - ziehen.y) * 0.01));
      if (RUHIG) zeichne();
    });
    function loslassen() { ziehen = null; pauseBis = performance.now() + 2500; }
    canvas.addEventListener("pointerup", loslassen);
    canvas.addEventListener("pointercancel", loslassen);

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (eintraege) {
        sichtbar = eintraege[0].isIntersecting;
        if (sichtbar && !RUHIG) an(); else aus();
        if (sichtbar && RUHIG) zeichne();
      }).observe(canvas);
    }
    window.addEventListener("resize", function () { if (!laeuft) zeichne(); });
    zeichne();
    if (!RUHIG) an();
  }

  function init() {
    var figs = document.querySelectorAll(".badge-3d[data-modell]");
    Array.prototype.forEach.call(figs, function (fig) {
      fetch(fig.getAttribute("data-modell"))
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (text) { starte(fig, ladeObj(text)); })
        .catch(function () { /* Vorschaubild bleibt stehen */ });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
