// assets/js/crypto-page.js
// Client-side decryption for encrypted Markdown posts and .blob attachments.
// Passwords cached per page in localStorage ("ifsmb-crypto:<uuid>").
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(root);
  else root.CryptoPage = factory(root);
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  var activeObjectUrls = [];

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
          // If relative, resolve against basePath
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
    var subtle = getSubtle();
    var enc = new TextEncoder();
    var salt = (typeof crypto !== "undefined" && crypto.getRandomValues)
      ? crypto.getRandomValues(new Uint8Array(16))
      : new Uint8Array(16);
    var iterations = 600000;

    return deriveKey(password, salt, iterations).then(function (key) {
      var iv = crypto.getRandomValues(new Uint8Array(12));
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
          // att: { name: "foto.jpg", data: ArrayBuffer | Uint8Array, mime: "image/jpeg" }
          var attIv = crypto.getRandomValues(new Uint8Array(12));
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
    var basePath = container.getAttribute("data-base-path") || location.pathname;
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

    var storageKey = "ifsmb-crypto:" + (uuid || location.pathname);

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
      if (lockBtn) lockBtn.hidden = false;
      if (errorEl) errorEl.hidden = true;
    }

    function tryUnlock(password, remember) {
      if (!password) return Promise.reject(new Error("Kein Passwort angegeben"));
      return decryptPage(payload, password, basePath)
        .then(function (res) {
          if (remember) {
            try { localStorage.setItem(storageKey, password); } catch (e) {}
          }
          var mdRenderer = (root && root.SafeMarkdown) || (typeof window !== "undefined" && window.SafeMarkdown);
          var html = mdRenderer ? mdRenderer.render(res.markdown, res.attachments) : res.markdown;
          showUnlocked(html);
        })
        .catch(function (err) {
          console.error("CryptoPage unlock error:", err);
          try { localStorage.removeItem(storageKey); } catch (e) {}
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
        try { localStorage.removeItem(storageKey); } catch (e) {}
        showLocked();
      });
    }

    // Auto-unlock if password is cached in localStorage
    var savedPw = null;
    try { savedPw = localStorage.getItem(storageKey); } catch (e) {}
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
    init: init,
    initContainer: initContainer,
    base64ToBytes: base64ToBytes,
    bytesToBase64: bytesToBase64
  };
});
