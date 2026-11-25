/*
 * Live update of links to connected instances (federation), loaded by _layouts/default.html only when the visitor
 * switched federation on (window.IfsmbVerbund, ?verbund=1 – see /impressum/#verbund).
 * The build already resolved every link (_plugins/federation_links.rb: class fed-link, data-fed-type, data-fed-name);
 * this script fetches the linked pages again, reads their Microdata (itemscope/itemtype/itemid, itemprop name) and
 * - shows a changed name with the "scramble" effect of the homepage slogan (only "title links": data-fed-title /
 *   generated links .fed-auto – a link like "[der Drucker der AG](…)" keeps its words),
 * - marks pages that no longer exist (404/410).
 * Trust: only the Microdata of the fetched page decides the type, only known schema.org types are used, names are set
 * as text (textContent), never as HTML. Only instances listed in <body data-federation> are fetched.
 */
(function () {
  'use strict';
  var TYPES = { Product: 'equipment', Person: 'person', Organization: 'partner', Event: 'event', BlogPosting: 'post',
    Project: 'project', CreativeWork: 'challenge', NewsArticle: 'press' };
  var ICONS = { equipment: '🛠️', person: '👤', partner: '🤝', event: '📅', post: '📰', project: '🔧', challenge: '🧗', press: '🗞️' };
  var peers = [];
  try { peers = JSON.parse(document.body.getAttribute('data-federation') || '[]'); } catch (e) { peers = []; }
  var hosts = peers.map(function (u) { try { return new URL(u).host; } catch (e) { return null; } }).filter(Boolean);
  function t(key, fallback) { return window.I18n ? window.I18n.t(key) : fallback; }
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Microdata of the item described by a page (itemid = its URL, else the first item): type and top-level name
  function microdata(doc, url) {
    var items = Array.prototype.slice.call(doc.querySelectorAll('[itemscope]'));
    var norm = function (u) { return String(u || '').replace(/\/?$/, '/'); };
    var root = items.filter(function (el) { return norm(el.getAttribute('itemid')) === norm(url); })[0] || items[0];
    if (!root) return null;
    var type = TYPES[String(root.getAttribute('itemtype') || '').split(/\s+/)[0].replace(/^https?:\/\/schema\.org\//, '')] || null;
    var name = null;
    Array.prototype.forEach.call(root.querySelectorAll('[itemprop]'), function (el) {
      if (name || el.parentElement.closest('[itemscope]') !== root) return;   // only properties of this item
      if ((el.getAttribute('itemprop') || '').split(/\s+/).indexOf('name') === -1) return;
      name = el.getAttribute('content') || el.textContent;
    });
    name = name && name.replace(/\s+/g, ' ').trim();
    if (!name) {
      var og = doc.querySelector('meta[property="og:title"]');
      name = og ? og.getAttribute('content') : (doc.title || null);
    }
    return { type: type, name: name || null };
  }

  // the homepage's "scramble": letters flicker briefly as random glyphs, then the new text settles
  function scramble(el, to) {
    if (still) { el.textContent = to; return; }
    var glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+?', frame = 0, frames = 18;
    var from = el.textContent;
    (function step() {
      frame++;
      var settled = Math.floor(to.length * frame / frames), out = '';
      for (var i = 0; i < to.length; i++) {
        out += i < settled || to[i] === ' ' ? to[i] : glyphs[Math.floor(Math.random() * glyphs.length)];
      }
      el.textContent = frame >= frames ? to : out;
      if (frame < frames) requestAnimationFrame(step);
    })();
    el.setAttribute('data-fed-fallback', from);
  }

  function setText(a, name, type) {
    if (a.classList.contains('fed-auto')) {
      // generated link: <span icon> name
      var icon = a.querySelector('[aria-hidden]');
      if (icon) icon.textContent = ICONS[type] || '🌐';
      var label = a.lastChild && a.lastChild.nodeType === 3 ? a.lastChild : a.appendChild(document.createTextNode(''));
      if (label.textContent.trim() !== name) {
        var span = document.createElement('span');
        span.textContent = label.textContent.trim();
        a.replaceChild(span, label);
        a.insertBefore(document.createTextNode(' '), span);
        scramble(span, name);
      }
    } else if (a.getAttribute('data-fed-title') === '1' && a.children.length === 0 && a.textContent.trim() !== name) {
      scramble(a, name);
    }
  }

  function markMissing(a) {
    a.classList.add('fed-missing');
    var next = a.nextElementSibling;
    if (next && next.classList.contains('fed-hinweis')) return;
    var note = document.createElement('span');
    note.className = 'fed-hinweis';
    note.setAttribute('data-i18n', 'federation.missing');
    note.textContent = '(' + t('federation.missing', 'nicht mehr vorhanden') + ')';
    a.insertAdjacentText('afterend', ' ');
    a.parentNode.insertBefore(note, a.nextSibling.nextSibling);
  }

  var links = Array.prototype.slice.call(document.querySelectorAll('a[href]')).filter(function (a) {
    try { return hosts.indexOf(new URL(a.href).host) !== -1; } catch (e) { return false; }
  });
  var byUrl = {};
  links.forEach(function (a) { (byUrl[a.href] = byUrl[a.href] || []).push(a); });
  Object.keys(byUrl).forEach(function (url) {
    fetch(url, { headers: { Accept: 'text/html' } })
      .then(function (r) {
        if (r.status === 404 || r.status === 410) { byUrl[url].forEach(markMissing); return null; }
        if (!r.ok) return null;
        return r.text();
      })
      .then(function (html) {
        if (!html) return;
        var info = microdata(new DOMParser().parseFromString(html, 'text/html'), url);
        if (!info) return;
        byUrl[url].forEach(function (a) {
          a.classList.remove('fed-missing');
          if (info.type) {
            Object.keys(ICONS).forEach(function (k) { a.classList.remove('fed-' + k); });
            a.classList.add('fed-link', 'fed-' + info.type);
            a.setAttribute('data-fed-type', info.type);
          }
          if (info.name) {
            a.setAttribute('data-fed-name', info.name);
            a.title = info.name + ' – ' + new URL(url).host;
            setText(a, info.name, info.type);
          }
        });
      })
      .catch(function (err) { if (window.console) console.warn('federation: ' + url + ' not loaded', err); });
  });
})();
