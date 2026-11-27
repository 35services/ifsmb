// assets/js/safe-markdown.js
// Minimal, safe Markdown renderer (0 dependencies).
// Escapes raw HTML to prevent XSS, resolves decrypted attachment blobs, and renders {: .gallery} blocks and tables.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.SafeMarkdown = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function resolveAttachment(path, attachments) {
    if (!attachments) return path;
    if (attachments[path]) return attachments[path];
    var clean = path.replace(/^\.\//, "");
    if (attachments[clean]) return attachments[clean];
    var base = clean.split("/").pop();
    if (base && attachments[base]) return attachments[base];
    return path;
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
      var resolved = resolveAttachment(src, attachments);
      if (!/^(https?:\/\/|blob:|\/)/.test(resolved)) return "";
      return '<img src="' + resolved + '" alt="' + alt + '" loading="lazy">';
    });

    // Links: [text](url)
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, label, href) {
      href = href.trim();
      var resolved = resolveAttachment(href, attachments);
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

  // Splits a table row "| a | b \\| c | `x|y` |" into cells. Like kramdown: "\\|" is a literal pipe, and a pipe inside
  // a code span doesn't split either.
  function splitRow(line) {
    var t = line.trim().replace(/^\|/, "");
    if (/\|$/.test(t) && !/\\\|$/.test(t)) t = t.slice(0, -1);
    var cells = [], cur = "", inCode = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (ch === "\\" && t[i + 1] === "|") { cur += "|"; i++; continue; }
      if (ch === "`") inCode = !inCode;
      if (ch === "|" && !inCode) { cells.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  // Separator row "|---|:--:|--:|" → ["", "center", "right"]; null if the line isn't one.
  function parseSeparator(line) {
    var cells = splitRow(line);
    if (!cells.every(function (c) { return /^:?-+:?$/.test(c); })) return null;
    return cells.map(function (c) {
      var l = c[0] === ":", r = c[c.length - 1] === ":";
      return l && r ? "center" : r ? "right" : l ? "left" : "";
    });
  }

  // Markdown table (lines starting with "|") as kramdown renders it: the row before a separator row is the header,
  // the separator sets the alignment. Without a separator all rows are body rows.
  function renderTable(rows, attachments) {
    var align = [], head = null, body = [];
    if (rows.length > 1 && parseSeparator(rows[1])) {
      head = splitRow(rows[0]);
      align = parseSeparator(rows[1]);
      rows = rows.slice(2);
    }
    rows.forEach(function (r) { if (!parseSeparator(r)) body.push(splitRow(r)); });
    function cell(tag, text, i) {
      var a = align[i] ? ' style="text-align: ' + align[i] + '"' : "";
      return "<" + tag + a + ">" + renderInline(text, attachments) + "</" + tag + ">";
    }
    var out = ["<table>"];
    if (head) out.push("<thead>\n<tr>" + head.map(function (c, i) { return cell("th", c, i); }).join("") + "</tr>\n</thead>");
    if (body.length) {
      out.push("<tbody>");
      body.forEach(function (r) { out.push("<tr>" + r.map(function (c, i) { return cell("td", c, i); }).join("") + "</tr>"); });
      out.push("</tbody>");
    }
    out.push("</table>");
    return out.join("\n");
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

      // Kramdown block IAL {: .gallery ...}: turn preceding consecutive image paragraphs into <div class="gallery">
      var ialMatch = trimmed.match(/^\{\:\s*([^}]+)\}$/);
      if (ialMatch) {
        closeList();
        var classes = (ialMatch[1].match(/\.[a-zA-Z0-9_-]+/g) || []).map(function (c) { return c.slice(1); });
        if (classes.indexOf("gallery") >= 0) {
          var imgs = [];
          while (html.length && /^<p>(<img\s[^>]+>)<\/p>$/.test(html[html.length - 1])) {
            imgs.unshift(html.pop().replace(/^<p>|<\/p>$/g, ""));
          }
          if (imgs.length) {
            if (imgs.length === 1 && classes.indexOf("gallery-small") < 0 && classes.indexOf("gallery-single") < 0) {
              classes.push("gallery-single");
            }
            var links = imgs.map(function (imgTag) {
              var srcMatch = imgTag.match(/\bsrc="([^"]*)"/);
              var href = srcMatch ? srcMatch[1] : "";
              return '  <a class="lightbox" href="' + href + '">' + imgTag + "</a>";
            });
            html.push('<div class="' + classes.join(" ") + '">\n' + links.join("\n") + "\n</div>");
          }
        }
        continue;
      }

      // Tables: consecutive lines starting with "|"
      if (/^\|/.test(trimmed)) {
        closeList();
        var rows = [];
        while (i < lines.length && /^\|/.test(lines[i].trim())) rows.push(lines[i++]);
        i--;
        html.push(renderTable(rows, attachments));
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
