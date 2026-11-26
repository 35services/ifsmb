/* 3D view of STL and 3MF files in posts and pages – WebGL, no library and no external resources.
 *
 * <figure class="modell-3d" data-model="/assets/dateien/news/foo/figur.3mf" data-size="123456">
 *   <figcaption>Alt text from Markdown</figcaption>
 * </figure>
 *
 * Made by _plugins/galerie.rb from ![Beschreibung](/…/datei.3mf) or .stl in its own paragraph. Files up to AUTO_BYTES
 * load as soon as they are visible; bigger ones wait for a tap ("3D-Ansicht laden"), so phones don't download them
 * unasked. Drag to rotate, scroll/pinch to zoom.
 *
 * 3MF reading follows the viewer in https://github.com/falkorichter/2d (viewer.html, three.js + JSZip), without the
 * libraries: the ZIP is read here with the browser's DecompressionStream("deflate-raw"), meshes are drawn like
 * assets/js/badge3d.js. Like the viewer it understands
 *   - the production extension (components in other model files, p:path; Orca/Bambu/Snapmaker Orca projects),
 *   - filament colours (Metadata/project_settings.config → filament_colour) and the extruder of each object and part
 *     (Metadata/model_settings.config), with one switch per filament,
 *   - plates (several build plates → a selector),
 * and additionally plain 3MF colours (<basematerials displaycolor>) from other slicers and CAD programs.
 */
(function () {
  "use strict";
  if (window.Modell3D) return;
  window.Modell3D = true;

  var AUTO_BYTES = 8 * 1024 * 1024;
  var DEFAULT_COLOR = "#c9ccd1";
  var PNS = "http://schemas.microsoft.com/3dmanufacturing/production/2015/06";
  var REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function t(key, params, fallback) {
    if (!window.I18n) return fallback.replace(/\{(\w+)\}/g, function (m, n) { return params && params[n] != null ? params[n] : m; });
    var s = window.I18n.t("modell3d." + key, params);
    return s === "modell3d." + key ? fallback : s;
  }
  function megabytes(n) { return (n / 1024 / 1024).toLocaleString(document.documentElement.lang || "de", { maximumFractionDigits: 1 }) + " MB"; }

  // ---- ZIP (3MF is a ZIP) ------------------------------------------------------------------
  // Central directory → { name: { method, size, offset } }; data is read lazily per file.
  function readZip(buf) {
    var v = new DataView(buf), i = buf.byteLength - 22;
    while (i >= 0 && v.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error("no zip");
    var n = v.getUint16(i + 10, true), p = v.getUint32(i + 16, true), files = {};
    var dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error("bad zip");
      var method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true);
      var nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
      var local = v.getUint32(p + 42, true);
      var name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
      files[name] = { method: method, csize: csize, local: local };
      p += 46 + nameLen + extraLen + commentLen;
    }
    function bytes(name) {
      var f = files[name.replace(/^\//, "")];
      if (!f) return Promise.resolve(null);
      var start = f.local + 30 + v.getUint16(f.local + 26, true) + v.getUint16(f.local + 28, true);
      var raw = new Uint8Array(buf, start, f.csize);
      if (f.method === 0) return Promise.resolve(raw);
      if (f.method !== 8 || typeof DecompressionStream !== "function") return Promise.reject(new Error("unsupported zip"));
      return new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()
        .then(function (b) { return new Uint8Array(b); });
    }
    return {
      names: Object.keys(files),
      text: function (name) { return bytes(name).then(function (b) { return b && dec.decode(b); }); }
    };
  }

  function hexColor(s) {
    var m = /^#?([0-9a-f]{6})/i.exec(String(s || "").trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  // 3MF transform "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32" (row vectors) → column-major 4×4
  function matrix3mf(str) {
    if (!str) return identity();
    var v = str.trim().split(/\s+/).map(Number);
    return [v[0], v[1], v[2], 0, v[3], v[4], v[5], 0, v[6], v[7], v[8], 0, v[9], v[10], v[11], 1];
  }
  function identity() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }

  // ---- 3MF → parts: [{ geo: { v: Float32Array, i: Uint32Array }, m: matrix, color: key, object: id }] ---------
  function parse3mf(buf) {
    var zip = readZip(buf), xml = function (s) { return new DOMParser().parseFromString(s, "application/xml"); };
    var meta = function (el) {
      var o = {};
      Array.prototype.forEach.call(el.children, function (c) { if (c.tagName === "metadata") o[c.getAttribute("key")] = c.getAttribute("value"); });
      return o;
    };
    return Promise.all([zip.text("Metadata/project_settings.config"), zip.text("Metadata/model_settings.config")]).then(function (cfg) {
      var filaments = null;
      if (cfg[0]) try { filaments = JSON.parse(cfg[0]).filament_colour || null; } catch (e) { /* not JSON (older PrusaSlicer) */ }
      var partExtruder = {}, objExtruder = {}, plates = [];
      if (cfg[1]) {
        var doc = xml(cfg[1]);
        Array.prototype.forEach.call(doc.getElementsByTagName("object"), function (o) {
          var id = o.getAttribute("id"), om = meta(o);
          objExtruder[id] = +om.extruder || 1;
          partExtruder[id] = {};
          Array.prototype.forEach.call(o.getElementsByTagName("part"), function (p) { partExtruder[id][p.getAttribute("id")] = +meta(p).extruder || objExtruder[id]; });
        });
        Array.prototype.forEach.call(doc.getElementsByTagName("plate"), function (pl) {
          var objs = {};
          Array.prototype.forEach.call(pl.getElementsByTagName("model_instance"), function (mi) { objs[meta(mi).object_id] = true; });
          plates.push({ id: meta(pl).plater_id, objects: objs });
        });
      }
      var modelFiles = zip.names.filter(function (n) { return /\.model$/i.test(n); });
      return Promise.all(modelFiles.map(zip.text)).then(function (texts) {
        var objects = {}, materials = {};
        modelFiles.forEach(function (p, k) {
          var d = xml(texts[k]), path = "/" + p;
          Array.prototype.forEach.call(d.getElementsByTagName("object"), function (o) { objects[path + "#" + o.getAttribute("id")] = o; });
          Array.prototype.forEach.call(d.getElementsByTagName("basematerials"), function (bm) {
            materials[path + "#" + bm.getAttribute("id")] = Array.prototype.map.call(bm.getElementsByTagName("base"), function (b) { return b.getAttribute("displaycolor"); });
          });
        });
        var rootPath = "/" + (modelFiles.filter(function (p) { return /^3D\/3dmodel\.model$/i.test(p); })[0] || modelFiles[0]);
        var geoCache = {}, parts = [];
        function geometry(key, meshEl) {
          if (geoCache[key]) return geoCache[key];
          var vs = meshEl.getElementsByTagName("vertex"), ts = meshEl.getElementsByTagName("triangle");
          var v = new Float32Array(vs.length * 3), ix = new Uint32Array(ts.length * 3);
          for (var a = 0; a < vs.length; a++) { v[a * 3] = +vs[a].getAttribute("x"); v[a * 3 + 1] = +vs[a].getAttribute("y"); v[a * 3 + 2] = +vs[a].getAttribute("z"); }
          for (var b = 0; b < ts.length; b++) { ix[b * 3] = +ts[b].getAttribute("v1"); ix[b * 3 + 1] = +ts[b].getAttribute("v2"); ix[b * 3 + 2] = +ts[b].getAttribute("v3"); }
          return (geoCache[key] = { v: v, i: ix });
        }
        function colorOf(path, o, extruder) {
          if (filaments) return "f" + extruder;
          var pid = o.getAttribute("pid"), list = pid && materials[path + "#" + pid];
          return (list && list[+o.getAttribute("pindex") || 0]) || DEFAULT_COLOR;
        }
        function walk(path, id, m, extruder, top, depth) {
          var o = objects[path + "#" + id];
          if (!o || depth > 16) return;
          Array.prototype.forEach.call(o.children, function (c) {
            if (c.localName === "mesh") parts.push({ geo: geometry(path + "#" + id, c), m: m, color: colorOf(path, o, extruder), object: top });
            if (c.localName === "components") Array.prototype.forEach.call(c.children, function (comp) {
              var cid = comp.getAttribute("objectid"), cpath = comp.getAttributeNS(PNS, "path") || comp.getAttribute("p:path") || path;
              var ext = (partExtruder[top] && partExtruder[top][cid]) || extruder;
              walk(cpath, cid, mul(m, matrix3mf(comp.getAttribute("transform"))), ext, top, depth + 1);
            });
          });
        }
        var rootDoc = xml(texts[modelFiles.indexOf(rootPath.slice(1))]);
        Array.prototype.forEach.call(rootDoc.getElementsByTagName("item"), function (item) {
          var id = item.getAttribute("objectid");
          walk(rootPath, id, matrix3mf(item.getAttribute("transform")), objExtruder[id] || 1, id, 0);
        });
        if (!parts.length) throw new Error("empty 3mf");
        var colors = {};
        parts.forEach(function (p) {
          if (colors[p.color]) return;
          var n = p.color.charAt(0) === "f" ? +p.color.slice(1) : 0;
          colors[p.color] = { rgb: hexColor(n ? filaments[(n - 1) % filaments.length] : p.color) || hexColor(DEFAULT_COLOR),
            hex: n ? filaments[(n - 1) % filaments.length] : p.color, filament: n };
        });
        return { parts: parts, colors: colors, plates: plates.length > 1 ? plates : [] };
      });
    });
  }

  // ---- STL (binary or ASCII) ------------------------------------------------------------------
  function parseStl(buf) {
    var v = new DataView(buf), n = buf.byteLength >= 84 ? v.getUint32(80, true) : 0, pos;
    if (buf.byteLength === 84 + n * 50 && n > 0) {
      pos = new Float32Array(n * 9);
      for (var k = 0; k < n; k++) for (var j = 0; j < 9; j++) pos[k * 9 + j] = v.getFloat32(84 + k * 50 + 12 + j * 4, true);
    } else {
      var nums = [], re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g, m, text = new TextDecoder().decode(buf);
      while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
      if (!nums.length) throw new Error("empty stl");
      pos = new Float32Array(nums);
    }
    var ix = new Uint32Array(pos.length / 3);
    for (var a = 0; a < ix.length; a++) ix[a] = a;
    return { parts: [{ geo: { v: pos, i: ix }, m: identity(), color: DEFAULT_COLOR, object: "1" }],
      colors: (function () { var c = {}; c[DEFAULT_COLOR] = { rgb: hexColor(DEFAULT_COLOR), hex: DEFAULT_COLOR, filament: 0 }; return c; })(), plates: [] };
  }

  // ---- parts → one vertex buffer, flat normals; ranges per (object, colour) for switching parts on and off ----
  function flatten(model) {
    var total = 0;
    model.parts.forEach(function (p) { total += p.geo.i.length; });
    var pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], o = 0, ranges = [];
    model.parts.forEach(function (p) {
      var m = p.m, v = p.geo.v, ix = p.geo.i, rgb = model.colors[p.color].rgb, start = o / 3;
      for (var t = 0; t < ix.length; t += 3) {
        var q = [];
        for (var c = 0; c < 3; c++) {
          var k = ix[t + c] * 3, x = v[k], y = v[k + 1], z = v[k + 2];
          var w = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
          q.push(w);
          for (var a = 0; a < 3; a++) { if (w[a] < min[a]) min[a] = w[a]; if (w[a] > max[a]) max[a] = w[a]; }
        }
        var u = [q[1][0] - q[0][0], q[1][1] - q[0][1], q[1][2] - q[0][2]], s = [q[2][0] - q[0][0], q[2][1] - q[0][1], q[2][2] - q[0][2]];
        var n = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]], l = Math.hypot(n[0], n[1], n[2]) || 1;
        for (var e = 0; e < 3; e++) {
          pos[o] = q[e][0]; pos[o + 1] = q[e][1]; pos[o + 2] = q[e][2];
          nor[o] = n[0] / l; nor[o + 1] = n[1] / l; nor[o + 2] = n[2] / l;
          col[o] = rgb[0]; col[o + 1] = rgb[1]; col[o + 2] = rgb[2];
          o += 3;
        }
      }
      ranges.push({ start: start, count: o / 3 - start, color: p.color, object: p.object });
    });
    return { pos: pos, nor: nor, col: col, ranges: ranges };
  }

  // ---- matrices (column-major, like WebGL) ------------------------------------------------
  function mul(a, b) {
    var r = new Array(16);
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      r[i * 4 + j] = s;
    }
    return r;
  }
  function translate(x, y, z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]; }
  function rotateX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function rotateZ(a) { var c = Math.cos(a), s = Math.sin(a); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  function perspective(fov, aspect, near, far) {
    var f = 1 / Math.tan(fov / 2), d = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (near + far) * d, -1, 0, 0, 2 * near * far * d, 0];
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
    "  gl_FragColor = vec4(vc * (0.42 + 0.66 * diff) + vec3(0.25 * spec), 1.0);" +
    "}";

  function compileShader(gl, type, source) {
    var s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function attribute(gl, prog, name, data) {
    var buffer = gl.createBuffer(), location = gl.getAttribLocation(prog, name);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
  }

  function show(fig, model) {
    var mesh = flatten(model), stage = fig.querySelector(".modell-3d-stage");
    var canvas = document.createElement("canvas");
    var gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("no webgl");
    var prog = gl.createProgram();
    gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    attribute(gl, prog, "p", mesh.pos);
    attribute(gl, prog, "n", mesh.nor);
    attribute(gl, prog, "c", mesh.col);
    var uMvp = gl.getUniformLocation(prog, "mvp"), uM = gl.getUniformLocation(prog, "m");
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    var hiddenColors = {}, plate = model.plates.length ? model.plates[0] : null;
    var yaw = -0.5, pitch = 0.55, zoom = 1, center = [0, 0, 0], radius = 1, running = false, drag = null, pinch = null;
    function visibleRanges() {
      return mesh.ranges.filter(function (r) { return !hiddenColors[r.color] && (!plate || plate.objects[r.object]); });
    }
    function fit() {
      var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      visibleRanges().forEach(function (r) {
        for (var k = r.start * 3; k < (r.start + r.count) * 3; k += 3) for (var a = 0; a < 3; a++) {
          var x = mesh.pos[k + a]; if (x < min[a]) min[a] = x; if (x > max[a]) max[a] = x;
        }
      });
      if (min[0] === Infinity) return;
      center = [0, 1, 2].map(function (a) { return (min[a] + max[a]) / 2; });
      radius = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2 || 1;
      size.textContent = [0, 1, 2].map(function (a) { return (max[a] - min[a]).toLocaleString(document.documentElement.lang || "de", { maximumFractionDigits: 1 }); }).join(" × ") + " mm";
    }
    function draw() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      var aspect = w / Math.max(h, 1), FOV = 0.6;
      var d = radius / Math.sin(Math.min(FOV, 2 * Math.atan(Math.tan(FOV / 2) * aspect)) / 2) * 1.05 / zoom;
      // Z is up in 3MF/STL: rotateX(-π/2) turns it to the screen's up, then look a bit from above (pitch)
      var m = mul(rotateX(-Math.PI / 2 + pitch), mul(rotateZ(yaw), translate(-center[0], -center[1], -center[2])));
      var mvp = mul(perspective(FOV, aspect, Math.max(d - radius * 2, d / 100), d + radius * 2), mul(translate(0, 0, -d), m));
      gl.uniformMatrix4fv(uMvp, false, new Float32Array(mvp));
      gl.uniformMatrix4fv(uM, false, new Float32Array(m));
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      visibleRanges().forEach(function (r) { gl.drawArrays(gl.TRIANGLES, r.start, r.count); });
    }
    function frame() { if (!running) return; running = false; draw(); }
    function redraw() { if (!running) { running = true; requestAnimationFrame(frame); } }

    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", fig.getAttribute("data-alt") || t("label", null, "3D-Modell"));
    canvas.title = t("drag", null, "Ziehen zum Drehen, scrollen oder mit zwei Fingern zoomen");
    stage.innerHTML = "";
    stage.appendChild(canvas);
    fig.classList.add("modell-3d-active");

    var controls = document.createElement("div");
    controls.className = "modell-3d-controls small";
    var size = document.createElement("span");
    size.className = "muted modell-3d-size";
    if (model.plates.length) {
      var sel = document.createElement("select");
      sel.setAttribute("aria-label", t("plate_label", null, "Druckplatte"));
      model.plates.forEach(function (p, i) { sel.add(new Option(t("plate", { n: p.id || i + 1 }, "Platte {n}"), String(i))); });
      sel.add(new Option(t("plates_all", null, "Alle Platten"), ""));
      sel.addEventListener("change", function () { plate = sel.value === "" ? null : model.plates[+sel.value]; fit(); redraw(); });
      controls.appendChild(sel);
    }
    Object.keys(model.colors).forEach(function (key) {
      var c = model.colors[key];
      if (!c.filament && Object.keys(model.colors).length < 2) return;
      var l = document.createElement("label");
      l.className = "modell-3d-filament";
      l.innerHTML = '<input type="checkbox" checked><span class="modell-3d-swatch"></span>';
      l.querySelector(".modell-3d-swatch").style.background = c.hex;
      l.appendChild(document.createTextNode(c.filament ? t("filament", { n: c.filament }, "Filament {n}") : c.hex));
      l.querySelector("input").addEventListener("change", function (e) { hiddenColors[key] = !e.target.checked; redraw(); });
      controls.appendChild(l);
    });
    var reset = document.createElement("button");
    reset.type = "button";
    reset.className = "btn btn-small btn-ghost";
    reset.textContent = t("reset", null, "↺ Ansicht");
    reset.addEventListener("click", function () { yaw = -0.5; pitch = 0.55; zoom = 1; redraw(); });
    controls.appendChild(reset);
    controls.appendChild(size);
    stage.after(controls);

    var pointers = {};
    canvas.addEventListener("pointerdown", function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      var ids = Object.keys(pointers);
      if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, yaw: yaw, pitch: pitch };
      if (ids.length === 2) { drag = null; var a = pointers[ids[0]], b = pointers[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoom }; }
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (pinch && ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        zoom = Math.max(0.3, Math.min(8, pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / (pinch.d || 1)));
      } else if (drag) {
        yaw = drag.yaw + (e.clientX - drag.x) * 0.01;
        pitch = Math.max(-1.5, Math.min(1.5, drag.pitch + (e.clientY - drag.y) * 0.01));
      }
      redraw();
    });
    function release(e) { delete pointers[e.pointerId]; drag = null; if (Object.keys(pointers).length < 2) pinch = null; }
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault();
      zoom = Math.max(0.3, Math.min(8, zoom * Math.exp(-e.deltaY * 0.0015)));
      redraw();
    }, { passive: false });
    window.addEventListener("resize", redraw);

    // without "reduce motion": one slow turn once it is visible, then it stands still
    var turned = REDUCED_MOTION;
    if (!turned && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries, obs) {
        if (!entries[0].isIntersecting) return;
        obs.disconnect();
        var start = null, from = yaw;
        (function spin(ts) {
          if (drag || pinch) return;
          if (start == null) start = ts;
          var k = Math.min((ts - start) / 4000, 1);
          yaw = from + Math.PI * 2 * (1 - Math.pow(1 - k, 3)); // ease out
          draw();
          if (k < 1) requestAnimationFrame(spin);
        })(performance.now());
      }).observe(canvas);
    }
    fit();
    draw();
    fig.setAttribute("data-ready", "1");
  }

  function load(fig) {
    if (fig.getAttribute("data-loading")) return;
    fig.setAttribute("data-loading", "1");
    var url = fig.getAttribute("data-model"), stage = fig.querySelector(".modell-3d-stage");
    stage.innerHTML = '<span class="muted small">' + t("loading", null, "3D-Ansicht wird geladen …") + "</span>";
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (buf) { return /\.3mf$/i.test(url) ? parse3mf(buf) : parseStl(buf); })
      .then(function (model) { show(fig, model); })
      .catch(function (err) {
        if (window.console) console.warn("Modell3D:", url, err);
        stage.innerHTML = '<span class="muted small">' + t("failed", null, "Die 3D-Ansicht ließ sich nicht anzeigen – unten herunterladen.") + "</span>";
        fig.setAttribute("data-error", "1");
      });
  }

  function init() {
    var figs = document.querySelectorAll(".modell-3d[data-model]");
    var io = "IntersectionObserver" in window && new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } });
    }, { rootMargin: "200px" });
    Array.prototype.forEach.call(figs, function (fig) {
      var stage = document.createElement("div");
      stage.className = "modell-3d-stage";
      fig.insertBefore(stage, fig.firstChild);
      var bytes = +fig.getAttribute("data-size") || 0;
      if (bytes > AUTO_BYTES || !io) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "btn modell-3d-load";
        b.textContent = t("load", { size: megabytes(bytes) }, "🧊 3D-Ansicht laden ({size})");
        b.addEventListener("click", function () { load(fig); });
        stage.appendChild(b);
      } else io.observe(fig);
    });
  }
  window.Modell3DParse = { parse3mf: parse3mf, parseStl: parseStl }; // for tests
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
