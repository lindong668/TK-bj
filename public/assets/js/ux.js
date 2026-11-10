/* */
(function () {
  'use strict';

  function isZh() {
    if (window.PSLang && typeof PSLang.get === 'function') return PSLang.get() === 'zh';
    return document.documentElement.getAttribute('data-lang') === 'zh';
  }
  function tr(zh, en) { return isZh() ? zh : en; }
  var path = location.pathname;
  var up = (path.indexOf('/tools/') > -1 || path.indexOf('/guides/') > -1) ? '../' : '';

  /* */
  var CHOICE_SEL = [
    'button.btn:not(.btn-primary):not(.btn-lg):not(.menu-btn):not(.lang-toggle)',
    'button.crop-mode', 'button.crop-reset',
    '.type-tab',
    '.radio-option > label',
    'label.radio-option', 'label.check-option', 'label.chip-option',
    'button[data-rot]', 'button[data-flip]', 'button[data-tool]', 'button[data-mode]',
    '.sw-hex'
  ].join(',');

  function isCheckedChoice(el) {
    if (el.tagName === 'LABEL') {
      var inp = el.querySelector('input[type="checkbox"], input[type="radio"]');
      if (inp) return !!inp.checked;
      var prev = el.previousElementSibling;
      if (prev && prev.matches && prev.matches('input[type="checkbox"], input[type="radio"]'))
        return !!prev.checked;
      return false;
    }
    
    
    return el.classList.contains('is-active') ||
           el.classList.contains('active') ||
           el.classList.contains('selected');
  }

  function syncChecks() {
    var els = Array.prototype.slice.call(document.querySelectorAll(CHOICE_SEL));
    
    var labels = document.querySelectorAll('label');
    for (var n = 0; n < labels.length; n++) {
      if (labels[n].querySelector('input[type="checkbox"], input[type="radio"]') &&
          els.indexOf(labels[n]) === -1) els.push(labels[n]);
    }
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.classList.contains('ps-choice')) el.classList.add('ps-choice');
      var on = isCheckedChoice(el);
      el.classList.toggle('is-selected', on);
      if (el.tagName === 'BUTTON') {
        var want = on ? 'true' : 'false';
        if (el.getAttribute('aria-pressed') !== want) el.setAttribute('aria-pressed', want);
      }
    }
    
    var mini = document.querySelectorAll('button.thumb-btn');
    for (var k = 0; k < mini.length; k++) mini[k].style.cursor = 'pointer';
  }

  var choiceTimer = null;
  function watchChoices() {
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function (muts) {
      var added = false;
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) { added = true; break; }
      }
      if (!added) return;                     
      clearTimeout(choiceTimer);
      choiceTimer = setTimeout(syncChecks, 30);
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener('change', function () { requestAnimationFrame(syncChecks); }, true);
  document.addEventListener('click', function () { requestAnimationFrame(syncChecks); }, true);

  /* */
  function applyTitle() {
    
    if (/\/index\.html$/.test(path) || path === '/' || path === '') return;
    if (path.indexOf('/tools/') === -1 && path.indexOf('/guides/') === -1) return;
    var h1 = document.querySelector('h1');
    if (!h1) return;
    var z = h1.querySelector('[data-lang-block="zh"]');
    var e = h1.querySelector('[data-lang-block="en"]');
    var txt = isZh() ? (z ? z.textContent : '') : (e ? e.textContent : '');
    if (!txt) txt = h1.textContent;
    txt = txt.replace(/^[\s\u2190-\u2BFF\uFE0F\u2700-\u27BF]+/, '').trim();
    if (!txt || txt.length > 90) return;
    var full = txt + ' | PicStudio';
    document.title = full;
    var og = document.querySelector('meta[property="og:title"]');
    if (og) og.setAttribute('content', full);
    var tw = document.querySelector('meta[name="twitter:title"]');
    if (tw) tw.setAttribute('content', full);
  }

  /* */
  document.addEventListener('paste', function (ev) {
    var items = ev.clipboardData && ev.clipboardData.files;
    if (!items || !items.length) return;
    var inp = document.getElementById('fileInput') ||
              document.querySelector('input[type="file"]');
    if (!inp) return;
    var dt;
    try { dt = new DataTransfer(); } catch (err) { return; }
    for (var i = 0; i < items.length; i++) {
      if (items[i] && items[i].type && items[i].type.indexOf('image/') === 0) dt.items.add(items[i]);
    }
    if (!dt.files.length) return;
    ev.preventDefault();
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    showInfo(dt.files[0]);
  });

  /* */
  function showInfo(file) {
    if (!file) return;
    var box = document.getElementById('uxFileInfo');
    if (!box) {
      var ua = document.getElementById('uploadArea');
      if (!ua) return;
      box = document.createElement('div');
      box.id = 'uxFileInfo';
      box.className = 'ux-fileinfo';
      ua.parentNode.insertBefore(box, ua.nextSibling);
    }
    var kb = file.size > 1048576
      ? (file.size / 1048576).toFixed(2) + ' MB'
      : Math.max(1, Math.round(file.size / 1024)) + ' KB';
    box.textContent = tr('Selected: ', 'Selected: ') + file.name + ' · ' + kb;
    var img = new Image();
    var url = URL.createObjectURL(file);
    img.onload = function () {
      box.textContent += ' · ' + img.naturalWidth + ' × ' + img.naturalHeight + ' px';
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { URL.revokeObjectURL(url); };
    img.src = url;
  }
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.type === 'file' && ev.target.files && ev.target.files[0])
      showInfo(ev.target.files[0]);
  });
  document.addEventListener('drop', function (ev) {
    var f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
    if (f) setTimeout(function () { showInfo(f); }, 60);
  }, true);

  /* */
  function addReset() {
    var ua = document.getElementById('uploadArea');
    if (!ua || ua.querySelector('.ux-reset')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ux-reset';
    btn.textContent = tr('↺ Clear / change image', '↺ Clear / choose another');
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var inp = document.getElementById('fileInput');
      if (inp) inp.value = '';
      ['previewArea', 'controls', 'downloadSection', 'resultBox'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('active');
      });
      ['processedPreview', 'originalPreview', 'previewB', 'resultImg'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) { el.removeAttribute('src'); }
      });
      var fi = document.getElementById('uxFileInfo'); if (fi) fi.textContent = '';
      var cv = document.getElementById('compareCanvas'); if (cv) cv.style.display = 'none';
      var wrap = document.getElementById('compareWrap'); if (wrap) wrap.classList.remove('active');
      try { window.dispatchEvent(new CustomEvent('ps:reset')); } catch (e) {}
    });
    ua.appendChild(btn);
  }

  /* */
  function ensurePS(cb) {
    if (window.PSImage) { cb(); return; }
    var sc = document.createElement('script');
    sc.src = up + 'assets/js/tools.js?v=20261108b';
    sc.onload = cb;
    sc.onerror = function () { cb(); };
    document.head.appendChild(sc);
  }
  function magic(f) {
    return f.slice(0, 12).arrayBuffer().then(function (b) {
      var u = new Uint8Array(b);
      if (u.length < 12 || String.fromCharCode(u[4], u[5], u[6], u[7]) !== 'ftyp') return false;
      var brand = String.fromCharCode(u[8], u[9], u[10], u[11]);
      return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis', 'hevm', 'hevs'].indexOf(brand) > -1;
    }).catch(function () { return false; });
  }
  function nativeOk(f) {
    if (typeof createImageBitmap !== 'function') return Promise.resolve(false);
    return createImageBitmap(f).then(function (bm) {
      if (bm.close) bm.close();
      return true;
    }).catch(function () { return false; });
  }
  function reemit(inp, files) {
    inp.dataset.uxHeifDone = '1';
    if (files) {
      var dt = new DataTransfer();
      for (var i = 0; i < files.length; i++) dt.items.add(files[i]);
      inp.files = dt.files;
    }
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(function () { delete inp.dataset.uxHeifDone; }, 0);
  }
  document.addEventListener('change', function (ev) {
    var inp = ev.target;
    if (!inp || inp.tagName !== 'INPUT' || inp.type !== 'file' || inp.dataset.uxHeifDone) return;
    var f = inp.files && inp.files[0];
    if (!f) return;
    
    var suspect = /\.(heic|heif)$/i.test(f.name) || /heic|heif/i.test(f.type) || f.type === '';
    if (!suspect) return;
    ev.stopImmediatePropagation();
    ev.preventDefault();
    magic(f).then(function (isHeif) {
      if (!isHeif) { reemit(inp, null); return; }
      return nativeOk(f).then(function (ok) {
        if (ok) { reemit(inp, null); return; }
        ensurePS(function () {
          if (!window.PSImage) { reemit(inp, null); return; }
          PSImage.load(f).then(function (loaded) {
            return fetch(loaded.src).then(function (r) { return r.blob(); });
          }).then(function (blob) {
            var nf = new File([blob], f.name.replace(/\.(heic|heif)$/i, '') + '.png', { type: 'image/png' });
            reemit(inp, [nf]);
            showInfo(nf);
          }).catch(function () { reemit(inp, null); });
        });
      });
    }).catch(function () { reemit(inp, null); });
  }, true);

  /* */
  function unlockButtons() {
    var b = document.getElementById('processBtn');
    if (!b) return;
    b.addEventListener('click', function () {
      var self = this;
      setTimeout(function () { self.disabled = false; }, 2500);
    });
    var ov = document.getElementById('loadingOverlay');
    if (ov && window.MutationObserver) {
      new MutationObserver(function () {
        if (!ov.classList.contains('active')) b.disabled = false;
      }).observe(ov, { attributes: true, attributeFilter: ['class'] });
    }
  }

  /* */
  function lockCanvas() {
    var ids = ['annoCanvas', 'compareCanvas', 'cropCanvas', 'mosaicCanvas'];
    ids.forEach(function (id) {
      var cv = document.getElementById(id);
      if (!cv) return;
      cv.style.touchAction = 'none';
      cv.addEventListener('pointerdown', function (e) {
        if (e.cancelable) e.preventDefault();
        try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      }, { passive: false });
      cv.addEventListener('pointermove', function (e) {
        if (e.cancelable && e.buttons) e.preventDefault();
      }, { passive: false });
    });
  }

  function boot() {
    syncChecks();
    watchChoices();
    applyTitle();
    addReset();
    unlockButtons();
    lockCanvas();
    document.querySelectorAll('.state-bar').forEach(function (el) {
      el.setAttribute('aria-live', 'polite');
    });
  }
  window.addEventListener('ps:langchange', function () {
    requestAnimationFrame(function () { syncChecks(); applyTitle(); });
    var b = document.querySelector('.ux-reset');
    if (b) b.textContent = tr('↺ Clear / change image', '↺ Clear / choose another');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.PSUX = { sync: syncChecks, title: applyTitle, info: showInfo };
})();

/* ===== V52 空态预览：业务代码给 img 赋 src 时自动显现 ===== */
(function(){
  function ok(v){return !!v && v!=='/' && v!=='about:blank';}
  function show(img){ if(ok(img.getAttribute('src'))) img.removeAttribute('data-ph'); else img.setAttribute('data-ph','1'); }
  function init(){
    document.querySelectorAll('img[data-ph]').forEach(show);
    if(window.__v52ph) return; window.__v52ph=1;
    new MutationObserver(function(muts){
      muts.forEach(function(mu){
        if(mu.type==='attributes' && mu.attributeName==='src' && mu.target.tagName==='IMG') show(mu.target);
      });
    }).observe(document.documentElement,{attributes:true,attributeFilter:['src'],subtree:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
