// assets/js/safe-markdown.js
// Minimal, safe Markdown renderer (< 120 lines, 0 dependencies).
// Escapes raw HTML to prevent XSS and resolves decrypted attachment blobs.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.SafeMarkdown = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderInline(text, attachments) {
    attachments = attachments || {};
    var out = escapeHtml(text);

    // Code spans: `code`
    out = out.replace(/`([^`]+)`/g, function (_, code) {
      return "<code>" + code + "</code>";
    });

    // Bold & italic & strikethrough
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/(^|[^\w])_([^_]+)_([^\w]|$)/g, "$1<em>$2</em>$3");
    out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");

    // Images: ![alt](url)
    out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, function (_, alt, src) {
      src = src.trim();
      var resolved = attachments[src] || src;
      if (!/^(https?:\/\/|blob:|\/)/.test(resolved)) return "";
      return '<img src="' + resolved + '" alt="' + alt + '" loading="lazy">';
    });

    // Links: [text](url)
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, href) {
      href = href.trim();
      var resolved = attachments[href] || href;
      var isBlob = resolved.startsWith("blob:");
      var downloadName = isBlob ? href.split("/").pop() : "";
      var attr = isBlob
        ? ' download="' + escapeHtml(downloadName) + '"'
        : ' target="_blank" rel="noopener"';
      if (!/^(https?:\/\/|blob:|mailto:|\/|#)/.test(resolved)) return label;
      return '<a href="' + resolved + '"' + attr + ">" + label + "</a>";
    });

    return out;
  }

  function render(md, attachments) {
    attachments = attachments || {};
    var lines = (md || "").replace(/\r\n/g, "\n").split("\n");
    var html = [], inCode = false, codeBuf = [], listType = null;

    function closeList() {
      if (listType === "ul") html.push("</ul>");
      if (listType === "ol") html.push("</ol>");
      listType = null;
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      // Fenced code blocks
      if (/^```/.test(line)) {
        if (inCode) {
          html.push("<pre><code>" + escapeHtml(codeBuf.join("\n")) + "</code></pre>");
          codeBuf = [];
          inCode = false;
        } else {
          closeList();
          inCode = true;
        }
        continue;
      }
      if (inCode) {
        codeBuf.push(line);
        continue;
      }

      var trimmed = line.trim();

      // Blank line closes list
      if (!trimmed) {
        closeList();
        continue;
      }

      // Horizontal rule
      if (/^(---|\*\*\*|___)$/.test(trimmed)) {
        closeList();
        html.push("<hr>");
        continue;
      }

      // Headings: # to ######
      var hMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (hMatch) {
        closeList();
        var level = hMatch[1].length;
        html.push("<h" + level + ">" + renderInline(hMatch[2], attachments) + "</h" + level + ">");
        continue;
      }

      // Blockquotes: > ...
      if (/^>\s?/.test(line)) {
        closeList();
        html.push("<blockquote><p>" + renderInline(line.replace(/^>\s?/, ""), attachments) + "</p></blockquote>");
        continue;
      }

      // Unordered list: - or *
      var ulMatch = line.match(/^[-*]\s+(.*)$/);
      if (ulMatch) {
        if (listType !== "ul") {
          closeList();
          html.push("<ul>");
          listType = "ul";
        }
        html.push("<li>" + renderInline(ulMatch[1], attachments) + "</li>");
        continue;
      }

      // Ordered list: 1. ...
      var olMatch = line.match(/^\d+\.\s+(.*)$/);
      if (olMatch) {
        if (listType !== "ol") {
          closeList();
          html.push("<ol>");
          listType = "ol";
        }
        html.push("<li>" + renderInline(olMatch[1], attachments) + "</li>");
        continue;
      }

      // Paragraph
      closeList();
      html.push("<p>" + renderInline(line, attachments) + "</p>");
    }

    closeList();
    if (inCode) {
      html.push("<pre><code>" + escapeHtml(codeBuf.join("\n")) + "</code></pre>");
    }

    return html.join("\n");
  }

  return { render: render, renderInline: renderInline, escapeHtml: escapeHtml };
});
