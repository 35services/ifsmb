/* Shrinks videos for the ➕/✏️ forms (assets/js/neu.js, "📎 Datei") in the browser, without a library:
 * the video plays once, hidden and silent, each frame is drawn onto a canvas of at most 1080p (shorter side) and
 * recorded with MediaRecorder as MP4 (H.264 + AAC), the sound through an AudioContext that is not connected to the
 * speakers. That takes as long as the video runs; the tab has to stay open (background tabs get fewer frames).
 *
 *   VideoVerkleinern.check(file) → Promise<{ width, height, duration, needed: bool, reason }>
 *   VideoVerkleinern.shrink(file, { maxBytes, onProgress(fraction), start }) → Promise<Blob (video/mp4)>
 *
 * needed is always true: even a small MP4 is recorded again, because phones store the location (GPS) in videos and
 * nothing with location data may be published (CLAUDE.md). The new file has no metadata at all.
 * Browsers that can't record MP4 (older Firefox) get an error with what to do instead.
 * start: optional function(go) – called when the browser wants a tap before playing with sound (Safari);
 * call go() from a click handler.
 */
(function () {
  "use strict";
  var MAX_SHORT_SIDE = 1080, VIDEO_BPS = 5000000, MIN_VIDEO_BPS = 1500000, AUDIO_BPS = 128000;
  var TYPES = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1.4d0028,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"];

  function mp4Type() {
    if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return null;
    for (var i = 0; i < TYPES.length; i++) if (MediaRecorder.isTypeSupported(TYPES[i])) return TYPES[i];
    return null;
  }

  // target size: shorter side at most 1080, both even (H.264)
  function targetSize(w, h) {
    var k = Math.min(1, MAX_SHORT_SIDE / Math.min(w, h));
    return { width: Math.round(w * k / 2) * 2, height: Math.round(h * k / 2) * 2 };
  }

  function metadata(file) {
    return new Promise(function (ok, fail) {
      var v = document.createElement("video"), url = URL.createObjectURL(file);
      v.preload = "metadata"; v.muted = true; v.playsInline = true;
      v.onloadedmetadata = function () { ok({ video: v, url: url, width: v.videoWidth, height: v.videoHeight, duration: v.duration }); };
      v.onerror = function () { URL.revokeObjectURL(url); fail(new Error("Das Video lässt sich in diesem Browser nicht öffnen (" + (file.type || file.name) + ").")); };
      v.src = url;
    });
  }

  function check(file, maxBytes) {
    return metadata(file).then(function (m) {
      URL.revokeObjectURL(m.url);
      var isMp4 = /^video\/mp4$/i.test(file.type) || /\.(mp4|m4v)$/i.test(file.name);
      var big = Math.min(m.width, m.height) > MAX_SHORT_SIDE;
      var reason = big ? "größer als 1080p (" + m.width + "×" + m.height + ")" : !isMp4 ? "kein MP4" : maxBytes && file.size > maxBytes ? "zu groß" : "Metadaten (z. B. Standort) entfernen";
      return { width: m.width, height: m.height, duration: m.duration, needed: true, reason: reason };
    });
  }

  function shrink(file, opts) {
    opts = opts || {};
    var type = mp4Type();
    if (!type) return Promise.reject(new Error("Dieser Browser kann Videos nicht als MP4 verkleinern. Bitte Chrome, Edge oder Safari nehmen – oder das Video vorher auf 1080p verkleinern."));
    return metadata(file).then(function (m) {
      var size = targetSize(m.width, m.height), duration = m.duration || 1;
      // bit rate: 5 Mbit/s at 1080p, lower for long videos so the file stays under maxBytes
      var bps = VIDEO_BPS * (size.width * size.height) / (1920 * 1080);
      if (opts.maxBytes) bps = Math.min(bps, (opts.maxBytes * 0.92 * 8) / duration - AUDIO_BPS);
      if (bps < MIN_VIDEO_BPS) {
        URL.revokeObjectURL(m.url);
        var minutes = Math.floor((opts.maxBytes * 0.92 * 8) / (MIN_VIDEO_BPS + AUDIO_BPS) / 60);
        return Promise.reject(new Error("Das Video ist zu lang für den Upload (höchstens etwa " + minutes + " Minuten). Bitte kürzen oder als Link einfügen."));
      }
      var v = m.video, canvas = document.createElement("canvas");
      canvas.width = size.width; canvas.height = size.height;
      var ctx2d = canvas.getContext("2d");
      var stream = canvas.captureStream(30);
      var AC = window.AudioContext || window.webkitAudioContext, audio = null;
      try {
        audio = new AC();
        var src = audio.createMediaElementSource(v), dest = audio.createMediaStreamDestination();
        src.connect(dest); // not to audio.destination: nothing is heard
        dest.stream.getAudioTracks().forEach(function (tr) { stream.addTrack(tr); });
      } catch (e) { audio = null; } // no sound track then
      v.muted = !audio; // with an AudioContext the element must not be muted, else the recording is silent
      var rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.round(bps), audioBitsPerSecond: AUDIO_BPS });
      var chunks = [];
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

      return new Promise(function (ok, fail) {
        var done = false;
        function finish(err) {
          if (done) return; done = true;
          try { v.pause(); } catch (e) { /* gone */ }
          URL.revokeObjectURL(m.url);
          if (audio) audio.close().catch(function () {});
          stream.getTracks().forEach(function (tr) { tr.stop(); });
          if (err) fail(err);
        }
        function drawFrame() {
          if (done) return;
          ctx2d.drawImage(v, 0, 0, size.width, size.height);
          if (opts.onProgress) opts.onProgress(Math.min(v.currentTime / duration, 1));
          if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(drawFrame); else requestAnimationFrame(drawFrame);
        }
        rec.onstop = function () {
          if (done) return;
          var blob = new Blob(chunks, { type: "video/mp4" });
          finish();
          if (!blob.size) fail(new Error("Beim Verkleinern ist kein Video entstanden.")); else ok(blob);
        };
        rec.onerror = function (e) { finish(new Error("Fehler beim Verkleinern: " + ((e.error && e.error.message) || "unbekannt"))); };
        v.onended = function () { if (rec.state !== "inactive") rec.stop(); };
        v.onerror = function () { finish(new Error("Das Video ließ sich nicht abspielen.")); };
        function go() {
          var p = (audio && audio.state === "suspended" ? audio.resume() : Promise.resolve()).then(function () { return v.play(); });
          return p.then(function () {
            rec.start(1000);
            drawFrame();
          });
        }
        go().catch(function (err) {
          // Safari: playing with sound needs a tap – ask for one, then start from there
          if (err && err.name === "NotAllowedError" && opts.start) opts.start(function () { go().catch(finish); });
          else finish(err);
        });
      });
    });
  }

  window.VideoVerkleinern = { check: check, shrink: shrink, targetSize: targetSize, mp4Type: mp4Type };
})();
