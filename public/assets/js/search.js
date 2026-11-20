/* PicCalc site search — offline, no dependencies.
   Loads window.PICCALC_SEARCH from /assets/data/search-<lang>.js */
(function () {
  'use strict';
  var DATA = window.PICCALC_SEARCH || [];
  if (!DATA.length) return;

  var ZH = (document.documentElement.lang || '').toLowerCase().indexOf('zh') === 0 ||
           location.pathname.indexOf('/zh/') === 0;
  var TXT = ZH ? {
    ph: '搜索工具与文章…', none: '没有匹配结果，试试这些常用工具：',
    tool: '工具', guide: '指南', close: '关闭搜索'
  } : {
    ph: 'Search tools & guides…', none: 'No match. Try one of these:',
    tool: 'Tool', guide: 'Guide', close: 'Close search'
  };
  var POPULAR = ZH
    ? ['/zh/tools/compress', '/zh/tools/convert', '/zh/tools/icon-maker', '/zh/tools/qrcode', '/zh/tools/crop', '/zh/tools/image-annotate']
    : ['/tools/compress', '/tools/convert', '/tools/icon-maker', '/tools/qrcode', '/tools/crop', '/tools/image-annotate'];

  var norm = function (s) { return (s || '').toLowerCase().replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim(); };
  var esc = function (s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  DATA.forEach(function (it) { it._h = norm(it.t + ' ' + it.d + ' ' + it.k); });

  function search(q) {
    q = norm(q);
    if (!q) return [];
    var tokens = q.split(' ');
    var out = [];
    DATA.forEach(function (it) {
      var ok = true;
      for (var i = 0; i < tokens.length; i++) { if (it._h.indexOf(tokens[i]) < 0) { ok = false; break; } }
      if (!ok) return;
      var s = 0;
      if (norm(it.t) === q) s += 120;
      if (norm(it.t).indexOf(q) === 0) s += 60;
      else if (norm(it.t).indexOf(q) > -1) s += 40;
      if (norm(it.k).indexOf(q) > -1) s += 25;
      if (norm(it.d).indexOf(q) > -1) s += 10;
      if (it.ty === 'tool') s += 5;
      s -= Math.min(20, it.t.length / 8);
      out.push({ it: it, s: s });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, 8).map(function (x) { return x.it; });
  }

  function popularList() {
    var map = {};
    DATA.forEach(function (it) { map[it.u] = it; });
    return POPULAR.map(function (u) { return map[u]; }).filter(Boolean);
  }

  function makeWidget(big) {
    var wrap = document.createElement('div');
    wrap.className = big ? 'site-search ss-big' : 'site-search nav-search ss-nav';
    wrap.innerHTML =
      '<div class="ss-box">' +
      '<span class="ss-icon" aria-hidden="true">⌕</span>' +
      '<input type="search" class="ss-input" autocomplete="off" spellcheck="false" placeholder="' + esc(TXT.ph) + '" aria-label="' + esc(TXT.ph) + '" role="combobox" aria-expanded="false">' +
      '</div>' +
      '<div class="ss-panel" hidden></div>';
    var input = wrap.querySelector('.ss-input');
    var panel = wrap.querySelector('.ss-panel');
    var active = -1;

    function items() { return Array.prototype.slice.call(panel.querySelectorAll('.ss-item')); }

    function go(href) { window.location.href = href; }

    function setActive(n) {
      var list = items();
      if (!list.length) { active = -1; return; }
      active = (n + list.length) % list.length;
      list.forEach(function (el, i) { el.classList.toggle('is-active', i === active); });
      var el = list[active];
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    }

    function render(list, fallback) {
      var html = '';
      if (fallback) html += '<div class="ss-head">' + esc(TXT.none) + '</div>';
      html += list.map(function (it) {
        return '<a class="ss-item" href="' + esc(it.u) + '">' +
          '<span class="ss-type ss-' + it.ty + '">' + esc(it.ty === 'tool' ? TXT.tool : TXT.guide) + '</span>' +
          '<span class="ss-text"><strong>' + esc(it.t) + '</strong><small>' + esc((it.d || '').slice(0, 96)) + '</small></span>' +
          '</a>';
      }).join('');
      panel.innerHTML = html;
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      active = -1;
    }

    function close() {
      panel.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      active = -1;
    }

    function update() {
      var q = input.value.trim();
      if (!q) { render(popularList(), false); return; }
      var r = search(q);
      if (r.length) render(r, false);
      else render(popularList(), true);
    }

    input.addEventListener('focus', update);
    input.addEventListener('input', update);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (panel.hidden) update(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') {
        var list = items();
        if (active >= 0 && list[active]) { e.preventDefault(); go(list[active].getAttribute('href')); }
        else if (list.length) { e.preventDefault(); go(list[0].getAttribute('href')); }
      } else if (e.key === 'Escape') { close(); input.blur(); }
    });
    wrap.addEventListener('focusout', function (e) {
      if (!wrap.contains(e.relatedTarget)) setTimeout(close, 120);
    });
    return { wrap: wrap, input: input, close: close };
  }

  /* 1. Inline widgets on home / guides */
  Array.prototype.forEach.call(document.querySelectorAll('[data-site-search]'), function (host) {
    var w = makeWidget(true);
    host.appendChild(w.wrap);
    host.classList.add('site-search-host');
  });

  /* 2. Navigation widget + mobile trigger */
  var nav = document.querySelector('.tool-nav');
  if (nav) {
    var sel = nav.querySelector('select');
    var w = makeWidget(false);
    nav.insertBefore(w.wrap, sel || nav.firstChild);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-search-btn';
    btn.setAttribute('aria-label', TXT.ph);
    btn.innerHTML = '⌕';
    nav.insertBefore(btn, w.wrap);

    var ov = document.createElement('div');
    ov.className = 'ss-overlay';
    ov.hidden = true;
    ov.innerHTML = '<div class="ss-overlay-card" role="dialog" aria-modal="true" aria-label="' + esc(TXT.ph) + '">' +
      '<button type="button" class="ss-close" aria-label="' + esc(TXT.close) + '">×</button><div class="ss-slot"></div></div>';
    document.body.appendChild(ov);
    var ow = makeWidget(true);
    ov.querySelector('.ss-slot').appendChild(ow.wrap);

    function openOv() { ov.hidden = false; document.body.classList.add('ss-lock'); ow.input.focus(); }
    function closeOv() { ov.hidden = true; document.body.classList.remove('ss-lock'); ow.close(); }
    btn.addEventListener('click', openOv);
    ov.querySelector('.ss-close').addEventListener('click', closeOv);
    ov.addEventListener('click', function (e) { if (e.target === ov) closeOv(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !ov.hidden) closeOv(); });
  }

  /* 3. Global shortcut: "/" focuses nav search */
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
    var input = document.querySelector('.nav-search .ss-input');
    if (input) { e.preventDefault(); input.focus(); }
  });
})();

