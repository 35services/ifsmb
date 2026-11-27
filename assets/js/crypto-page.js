// assets/js/crypto-page.js
// Client-side decryption and encryption for encrypted Markdown pages and .blob attachments.
// Passwords cached per page in localStorage ("ifsmb-crypto:<uuid>") and in memory for the current tab.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(root);
  else root.CryptoPage = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var activeObjectUrls = [];
  var unlockedPasswords = {};

  function base64ToBytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function bytesToBase64(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function getSubtle() {
    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
      return window.crypto.subtle;
    }
    if (typeof crypto !== "undefined" && crypto.subtle) {
      return crypto.subtle;
    }
    throw new Error("WebCrypto SubtleCrypto is not available in this environment.");
  }

  function randomBytes(len) {
    var arr = new Uint8Array(len);
    if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(arr);
    }
    return arr;
  }

  function deriveKey(password, saltBytes, iterations) {
    var subtle = getSubtle();
    var enc = new TextEncoder();
    return subtle
      .importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"])
      .then(function (keyMaterial) {
        return subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: saltBytes,
            iterations: iterations || 600000,
            hash: "SHA-256"
          },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
      });
  }

  function decryptData(ciphertextBytes, ivBytes, key) {
    var subtle = getSubtle();
    return subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, ciphertextBytes);
  }

  function encryptData(plaintextBytes, ivBytes, key) {
    var subtle = getSubtle();
    return subtle.encrypt({ name: "AES-GCM", iv: ivBytes }, key, plaintextBytes);
  }

  function revokeUrls() {
    while (activeObjectUrls.length) {
      var u = activeObjectUrls.pop();
      try { URL.revokeObjectURL(u); } catch (e) {}
    }
  }

  // Extract and parse <script type="application/json" class="encrypted-data">...</script> from a page body.
  function parseEncryptedBody(text) {
    var m = String(text || "").trim().match(/^<script\s+type=["']application\/json["']\s+class=["']encrypted-data["']\s*>\s*([\s\S]*?)\s*<\/script>$/i);
    if (!m) return null;
    try {
      var p = JSON.parse(m[1]);
      return p && p.kdf && p.kdf.salt && p.iv && p.data ? p : null;
    } catch (e) {
      return null;
    }
  }

  function formatEncryptedBody(payload) {
    return '<script type="application/json" class="encrypted-data">\n' + JSON.stringify(payload, null, 2) + "\n</script>";
  }

  function getUnlockedPassword(key) {
    if (!key) return null;
    if (unlockedPasswords[key]) return unlockedPasswords[key];
    try {
      var saved = localStorage.getItem("ifsmb-crypto:" + key);
      if (saved) return saved;
    } catch (e) {}
    return null;
  }

  function setUnlockedPassword(key, password, remember) {
    if (!key || !password) return;
    unlockedPasswords[key] = password;
    if (remember) {
      try { localStorage.setItem("ifsmb-crypto:" + key, password); } catch (e) {}
    }
  }

  function clearUnlockedPassword(key) {
    if (!key) return;
    delete unlockedPasswords[key];
    try { localStorage.removeItem("ifsmb-crypto:" + key); } catch (e) {}
  }

  // Decrypt only the Markdown text from a payload (without fetching .blob attachments).
  function decryptMarkdown(payload, password) {
    if (!payload || !payload.kdf || !payload.iv || !payload.data) {
      return Promise.reject(new Error("Ungültige verschlüsselte Daten."));
    }
    var salt = base64ToBytes(payload.kdf.salt);
    var iterations = payload.kdf.iterations || 600000;
    var iv = base64ToBytes(payload.iv);
    var ciphertext = base64ToBytes(payload.data);

    return deriveKey(password, salt, iterations).then(function (key) {
      return decryptData(ciphertext, iv, key).then(function (decryptedBytes) {
        return new TextDecoder("utf-8").decode(decryptedBytes);
      });
    });
  }

  // Encrypt raw binary bytes into .blob format (12-byte random IV + AES-GCM ciphertext + 16-byte auth tag).
  function encryptBytesToBlob(plainBytes, key) {
    var iv = randomBytes(12);
    var input = plainBytes instanceof Uint8Array ? plainBytes : new Uint8Array(plainBytes);
    return encryptData(input, iv, key).then(function (cipherBuf) {
      var out = new Uint8Array(12 + cipherBuf.byteLength);
      out.set(iv, 0);
      out.set(new Uint8Array(cipherBuf), 12);
      return out;
    });
  }

  // Encrypt Markdown text into an encrypted payload and <script class="encrypted-data"> block.
  // When keepKdf is true and existingPayload has kdf.salt, reuses the salt/iterations so existing .blob attachments
  // remain decryptable with the same key while generating a fresh random 12-byte IV for the Markdown ciphertext.
  // extraAttachments is an optional array of { name, blob, mime } to include in payload.attachments.
  function encryptMarkdownPayload(markdownText, password, existingPayload, keepKdf, extraAttachments) {
    var enc = new TextEncoder();
    var reuse = !!(keepKdf && existingPayload && existingPayload.kdf && existingPayload.kdf.salt);
    var salt = reuse ? base64ToBytes(existingPayload.kdf.salt) : randomBytes(16);
    var iterations = (reuse && existingPayload.kdf.iterations) ? existingPayload.kdf.iterations : 600000;

    var baseAtts = (existingPayload && Array.isArray(existingPayload.attachments)) ? existingPayload.attachments.slice() : [];
    var seenNames = {};
    var mergedAtts = [];
    baseAtts.concat(extraAttachments || []).forEach(function (a) {
      if (!a || !a.name || seenNames[a.name]) return;
      seenNames[a.name] = true;
      mergedAtts.push({
        name: a.name,
        blob: a.blob || (a.name + ".blob"),
        mime: a.mime || "application/octet-stream"
      });
    });

    return deriveKey(password, salt, iterations).then(function (key) {
      var iv = randomBytes(12);
      var plainBytes = enc.encode(markdownText || "");
      return encryptData(plainBytes, iv, key).then(function (cipherBytes) {
        var payload = {
          v: (existingPayload && existingPayload.v) || 1,
          kdf: {
            salt: bytesToBase64(salt),
            iterations: iterations
          },
          iv: bytesToBase64(iv),
          data: bytesToBase64(new Uint8Array(cipherBytes)),
          attachments: mergedAtts
        };
        return {
          payload: payload,
          block: formatEncryptedBody(payload),
          key: key
        };
      });
    });
  }

  // Decrypts a binary .blob file:
  // Blob file format: first 12 bytes = IV, followed by AES-GCM ciphertext + 16-byte auth tag.
  function decryptBlobFile(arrayBuffer, key, mime) {
    var full = new Uint8Array(arrayBuffer);
    if (full.length < 12 + 16) {
      return Promise.reject(new Error("Ungültiges Blob-Format (zu kurz)."));
    }
    var iv = full.slice(0, 12);
    var ciphertext = full.slice(12);
    return decryptData(ciphertext, iv, key).then(function (decrypted) {
      var blob = new Blob([decrypted], { type: mime || "application/octet-stream" });
      var url = URL.createObjectURL(blob);
      activeObjectUrls.push(url);
      return url;
    });
  }

  // Decrypts the main markdown payload and any associated .blob attachments.
  function decryptPage(payload, password, basePath) {
    var salt = base64ToBytes(payload.kdf.salt);
    var iterations = payload.kdf.iterations || 600000;
    var iv = base64ToBytes(payload.iv);
    var ciphertext = base64ToBytes(payload.data);

    basePath = basePath || "";
    if (basePath && !basePath.endsWith("/")) basePath += "/";

    return deriveKey(password, salt, iterations).then(function (key) {
      return decryptData(ciphertext, iv, key).then(function (decryptedBytes) {
        var dec = new TextDecoder("utf-8");
        var markdownText = dec.decode(decryptedBytes);

        var attachments = payload.attachments || [];
        var attachmentMap = {};

        var attPromises = attachments.map(function (att) {
          var blobPath = att.blob;
          if (!/^https?:\/\/|^\//.test(blobPath)) {
            blobPath = basePath + blobPath;
          }
          return fetch(blobPath)
            .then(function (resp) {
              if (!resp.ok) throw new Error("Konnte Anhang nicht laden: " + att.name + " (" + resp.status + ")");
              return resp.arrayBuffer();
            })
            .then(function (buf) {
              return decryptBlobFile(buf, key, att.mime);
            })
            .then(function (objectUrl) {
              attachmentMap[att.name] = objectUrl;
              attachmentMap["./" + att.name] = objectUrl;
              if (att.blob) attachmentMap[att.blob] = objectUrl;
              var baseName = att.name.split("/").pop();
              attachmentMap[baseName] = objectUrl;
              attachmentMap["./" + baseName] = objectUrl;
            });
        });

        return Promise.all(attPromises).then(function () {
          return {
            markdown: markdownText,
            attachments: attachmentMap
          };
        });
      });
    });
  }

  // Encrypt helper for creating encrypted payload and .blob files
  function encryptPage(markdownText, password, attachmentsToEncrypt) {
    var enc = new TextEncoder();
    var salt = randomBytes(16);
    var iterations = 600000;

    return deriveKey(password, salt, iterations).then(function (key) {
      var iv = randomBytes(12);
      var plainBytes = enc.encode(markdownText);

      return encryptData(plainBytes, iv, key).then(function (cipherBytes) {
        var payload = {
          v: 1,
          kdf: {
            salt: bytesToBase64(salt),
            iterations: iterations
          },
          iv: bytesToBase64(iv),
          data: bytesToBase64(new Uint8Array(cipherBytes)),
          attachments: []
        };

        var attPromises = (attachmentsToEncrypt || []).map(function (att) {
          var attIv = randomBytes(12);
          var attBytes = new Uint8Array(att.data);
          return encryptData(attBytes, attIv, key).then(function (attCipher) {
            var blobBytes = new Uint8Array(12 + attCipher.byteLength);
            blobBytes.set(attIv, 0);
            blobBytes.set(new Uint8Array(attCipher), 12);

            var blobFilename = att.name + ".blob";
            payload.attachments.push({
              name: att.name,
              blob: blobFilename,
              mime: att.mime || "application/octet-stream"
            });

            return {
              filename: blobFilename,
              data: blobBytes
            };
          });
        });

        return Promise.all(attPromises).then(function (encryptedBlobs) {
          return {
            payload: payload,
            blobs: encryptedBlobs
          };
        });
      });
    });
  }

  // DOM controller for pages with .encrypted-container
  function initContainer(container) {
    var uuid = container.getAttribute("data-uuid");
    var basePath = container.getAttribute("data-base-path") || (typeof location !== "undefined" ? location.pathname : "");
    var dataEl = container.querySelector(".encrypted-data");
    if (!dataEl) return;

    var payload;
    try {
      payload = JSON.parse(dataEl.textContent);
    } catch (e) {
      console.error("CryptoPage: Ungültige verschlüsselte Daten", e);
      return;
    }

    var promptBox = container.querySelector(".encrypted-prompt");
    var viewBox = container.querySelector(".encrypted-view");
    var contentBox = container.querySelector(".encrypted-content");
    var form = container.querySelector(".encrypted-form");
    var pwInput = container.querySelector(".encrypted-password");
    var rememberCheck = container.querySelector(".encrypted-remember");
    var errorEl = container.querySelector(".encrypted-error");
    var lockBtn = container.querySelector(".encrypted-lock-btn");
    var editBtn = container.querySelector(".encrypted-edit-btn");

    var pageKey = uuid || basePath;

    function showLocked(errMessage) {
      revokeUrls();
      if (viewBox) viewBox.hidden = true;
      contentBox.innerHTML = "";
      contentBox.hidden = true;
      promptBox.hidden = false;
      if (lockBtn) lockBtn.hidden = true;
      if (errorEl) {
        errorEl.textContent = errMessage || "";
        errorEl.hidden = !errMessage;
      }
      if (pwInput) pwInput.value = "";
    }

    function showUnlocked(html) {
      promptBox.hidden = true;
      if (viewBox) viewBox.hidden = false;
      contentBox.innerHTML = html;
      contentBox.hidden = false;
      // 3D models in the decrypted content: load the viewer (same as on normal pages) and start it for them
      if (contentBox.querySelector(".modell-3d") && typeof window !== "undefined") {
        var go = function () { if (window.Modell3DInit) window.Modell3DInit(contentBox); };
        if (window.Modell3DInit) go();
        else if (window.ladeSkripte) window.ladeSkripte(["model3d.js"]).then(go).catch(function () {});
      }
      if (lockBtn) lockBtn.hidden = false;
      if (errorEl) errorEl.hidden = true;
    }

    function tryUnlock(password, remember) {
      if (!password) return Promise.reject(new Error("Kein Passwort angegeben"));
      return decryptPage(payload, password, basePath)
        .then(function (res) {
          setUnlockedPassword(pageKey, password, remember);
          if (basePath && basePath !== pageKey) setUnlockedPassword(basePath, password, false);
          var mdRenderer = (root && root.SafeMarkdown) || (typeof window !== "undefined" && window.SafeMarkdown);
          var html = mdRenderer ? mdRenderer.render(res.markdown, res.attachments) : res.markdown;
          showUnlocked(html);
        })
        .catch(function (err) {
          console.error("CryptoPage unlock error:", err);
          clearUnlockedPassword(pageKey);
          var msg = (err && (err.name === "OperationError" || /mac check/i.test(err.message)))
            ? "Falsches Passwort."
            : (err && err.message) || "Fehler beim Entschlüsseln.";
          showLocked(msg);
          throw err;
        });
    }

    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var pw = pwInput.value;
        var rem = rememberCheck ? rememberCheck.checked : true;
        tryUnlock(pw, rem).catch(function () {});
      });
    }

    if (lockBtn) {
      lockBtn.addEventListener("click", function () {
        clearUnlockedPassword(pageKey);
        if (basePath) clearUnlockedPassword(basePath);
        showLocked();
      });
    }

    if (editBtn) {
      var pageEditLink = typeof document !== "undefined" ? document.querySelector("a[data-edit]") : null;
      if (!pageEditLink) {
        editBtn.hidden = true;
      } else {
        editBtn.addEventListener("click", function () {
          pageEditLink.click();
        });
      }
    }

    // Expose unlock callback on the DOM element so the ✏️ form can unlock the page view too when unlocked there
    container._cryptoTryUnlock = tryUnlock;

    // Auto-unlock if password is cached
    var savedPw = getUnlockedPassword(pageKey);
    if (savedPw) {
      tryUnlock(savedPw, true).catch(function () {
        showLocked();
      });
    } else {
      showLocked();
    }
  }

  function init() {
    var containers = document.querySelectorAll(".encrypted-container");
    for (var i = 0; i < containers.length; i++) {
      initContainer(containers[i]);
    }
  }

  return {
    deriveKey: deriveKey,
    decryptData: decryptData,
    encryptData: encryptData,
    decryptBlobFile: decryptBlobFile,
    decryptPage: decryptPage,
    encryptPage: encryptPage,
    parseEncryptedBody: parseEncryptedBody,
    formatEncryptedBody: formatEncryptedBody,
    decryptMarkdown: decryptMarkdown,
    encryptMarkdownPayload: encryptMarkdownPayload,
    encryptBytesToBlob: encryptBytesToBlob,
    getUnlockedPassword: getUnlockedPassword,
    setUnlockedPassword: setUnlockedPassword,
    clearUnlockedPassword: clearUnlockedPassword,
    init: init,
    initContainer: initContainer,
    base64ToBytes: base64ToBytes,
    bytesToBase64: bytesToBase64
  };
});
