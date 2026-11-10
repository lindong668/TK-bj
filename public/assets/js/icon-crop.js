/* */
(function () {
  'use strict';

  var MIN_SIDE = 28;          
  var MAX_W = 640, MAX_H = 420; 
  var HANDLE = 22;            

  var S = {
    host: null, stage: null, canvas: null, selEl: null, peek: null,
    stateEl: null, modeBtns: [], resetBtn: null,
    src: null, scale: 1, dw: 0, dh: 0,
    sel: { x: 0, y: 0, s: 0 },
    mode: 'manual', drag: null, raf: 0, mounted: false
  };

  function isZh() {
    if (window.PSLang && typeof PSLang.get === 'function') return PSLang.get() === 'zh';
    return document.documentElement.getAttribute('data-lang') === 'zh';
  }
  function tr(zh, en) { return isZh() ? zh : en; }

  function mount() {
    var host = document.getElementById('cropEditor');
    if (!host || S.mounted) return;
    S.host = host;
    host.className = 'crop-editor';
    host.innerHTML =
      '<div class="crop-top">' +
        '<div class="crop-title">' +
          '<span>Pick the square area for your icon</span>' +
          '' +
        '</div>' +
        '<div class="crop-modes">' +
          '<button type="button" class="crop-mode is-active" data-mode="manual">' +
            '<span>✥ Manual crop</span></button>' +
          '<button type="button" class="crop-mode" data-mode="full">' +
            '<span>▣ Whole image</span></button>' +
          '<button type="button" class="crop-reset" id="cropResetBtn">' +
            '<span>↺ Reset</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="crop-stage" id="cropStage">' +
        '<canvas id="cropCanvas"></canvas>' +
        '<div class="crop-sel" id="cropSel">' +
          '<div class="crop-grid"></div>' +
          '<i class="crop-h tl"></i><i class="crop-h tr"></i>' +
          '<i class="crop-h bl"></i><i class="crop-h br"></i>' +
        '</div>' +
      '</div>' +
      '<div class="crop-foot">' +
        '<div class="crop-peek-wrap"><canvas id="cropPeek" class="crop-peek checker-bg" width="96" height="96"></canvas>' +
          '<div class="crop-peek-cap">' +
            '<span>Icon content</span>' +
          '</div></div>' +
        '<div class="crop-hint">' +
          '<span>Drag the box to move it · drag a corner to resize · press on an empty spot to draw a new square. Works with tall screenshots and wide photos. On phones, gestures inside the canvas adjust the crop; the rest of the page still scrolls normally.</span>' +
          '' +
        '</div>' +
      '</div>' +
      '<div class="state-bar" id="cropState" aria-live="polite"></div>';

    S.stage = host.querySelector('#cropStage');
    S.canvas = host.querySelector('#cropCanvas');
    S.selEl = host.querySelector('#cropSel');
    S.peek = host.querySelector('#cropPeek');
    S.stateEl = host.querySelector('#cropState');
    S.modeBtns = Array.prototype.slice.call(host.querySelectorAll('.crop-mode'));
    S.resetBtn = host.querySelector('#cropResetBtn');

    
    S.canvas.style.touchAction = 'none';
    S.canvas.addEventListener('pointerdown', onDown, { passive: false });
    S.canvas.addEventListener('pointermove', onMove, { passive: false });
    S.canvas.addEventListener('pointerup', onUp);
    S.canvas.addEventListener('pointercancel', onUp);

    S.modeBtns.forEach(function (b) {
      b.addEventListener('click', function () { setMode(b.dataset.mode); });
    });
    S.resetBtn.addEventListener('click', function () { resetSel(); render(); });

    window.addEventListener('ps:langchange', function () { updateState(); });
    window.addEventListener('ps:reset', clear);
    window.addEventListener('resize', function () { if (S.src) layout(); });
    S.mounted = true;
    updateState();
  }

  function setMode(m) {
    S.mode = (m === 'full') ? 'full' : 'manual';
    S.modeBtns.forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.mode === S.mode);
      b.setAttribute('aria-pressed', b.dataset.mode === S.mode ? 'true' : 'false');
    });
    S.selEl.style.display = S.mode === 'manual' ? 'block' : 'none';
    S.peek.style.opacity = S.mode === 'manual' ? '1' : '.35';
    updateState();
    render();
  }

  function clear() {
    S.src = null; S.drag = null;
    if (S.host) S.host.classList.remove('active');
    if (S.canvas) { S.canvas.width = 0; S.canvas.height = 0; }
    if (S.peek) S.peek.getContext('2d').clearRect(0, 0, 96, 96);
    setMode('manual');
    updateState();
  }

  /* */
  function load(srcCanvas) {
    if (!srcCanvas) return;
    mount();
    S.src = srcCanvas;
    layout();
    resetSel();
    S.host.classList.add('active');
    setMode('manual');
    render();
  }

  function layout() {
    if (!S.src) return;
    var w = S.src.width, h = S.src.height;
    
    var avail = Math.min(MAX_W, Math.max(240, (S.host.clientWidth || MAX_W) - 2));
    var k = Math.min(avail / w, MAX_H / h, 1);
    
    var keep = (S.dw > 0 && S.sel.s > 0)
      ? { x: S.sel.x / S.dw, y: S.sel.y / S.dh, s: S.sel.s / Math.min(S.dw, S.dh) }
      : null;
    S.scale = k;
    S.dw = Math.max(1, Math.round(w * k));
    S.dh = Math.max(1, Math.round(h * k));
    if (keep) {
      S.sel.s = Math.max(MIN_SIDE, Math.round(keep.s * Math.min(S.dw, S.dh)));
      S.sel.x = Math.round(keep.x * S.dw);
      S.sel.y = Math.round(keep.y * S.dh);
      clamp();
    }
    S.canvas.width = S.dw;
    S.canvas.height = S.dh;
    S.canvas.style.width = S.dw + 'px';
    S.canvas.style.height = S.dh + 'px';
    S.stage.style.width = S.dw + 'px';
    S.stage.style.height = S.dh + 'px';
    var ctx = S.canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, S.dw, S.dh);
    ctx.drawImage(S.src, 0, 0, S.dw, S.dh);
  }

  function resetSel() {
    var s = Math.min(S.dw, S.dh);
    S.sel = { x: Math.round((S.dw - s) / 2), y: Math.round((S.dh - s) / 2), s: s };
  }

  function clamp() {
    var s = Math.max(MIN_SIDE, Math.min(S.sel.s, S.dw, S.dh));
    S.sel.s = s;
    S.sel.x = Math.min(Math.max(S.sel.x, 0), Math.max(0, S.dw - s));
    S.sel.y = Math.min(Math.max(S.sel.y, 0), Math.max(0, S.dh - s));
  }

  function pt(e) {
    var r = S.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitHandle(p) {
    var s = S.sel, hs = [
      { n: 'tl', x: s.x, y: s.y },
      { n: 'tr', x: s.x + s.s, y: s.y },
      { n: 'bl', x: s.x, y: s.y + s.s },
      { n: 'br', x: s.x + s.s, y: s.y + s.s }
    ];
    for (var i = 0; i < hs.length; i++) {
      if (Math.abs(p.x - hs[i].x) <= HANDLE && Math.abs(p.y - hs[i].y) <= HANDLE) return hs[i];
    }
    return null;
  }

  function onDown(e) {
    if (!S.src || S.mode !== 'manual') return;
    if (e.cancelable) e.preventDefault();
    try { S.canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var p = pt(e);
    var hd = hitHandle(p);
    if (hd) {
      
      var ax = (hd.n === 'tl' || hd.n === 'bl') ? S.sel.x + S.sel.s : S.sel.x;
      var ay = (hd.n === 'tl' || hd.n === 'tr') ? S.sel.y + S.sel.s : S.sel.y;
      S.drag = { t: 'resize', ax: ax, ay: ay };
    } else if (p.x >= S.sel.x && p.x <= S.sel.x + S.sel.s &&
               p.y >= S.sel.y && p.y <= S.sel.y + S.sel.s) {
      S.drag = { t: 'move', px: p.x, py: p.y, ox: S.sel.x, oy: S.sel.y };
    } else {
      S.drag = { t: 'new', ax: p.x, ay: p.y };
      S.sel.s = MIN_SIDE;
      S.sel.x = p.x; S.sel.y = p.y;
    }
    render();
  }

  function onMove(e) {
    if (!S.drag || !S.src) return;
    if (e.cancelable) e.preventDefault();
    var p = pt(e), d = S.drag;
    if (d.t === 'move') {
      S.sel.x = d.ox + (p.x - d.px);
      S.sel.y = d.oy + (p.y - d.py);
    } else if (d.t === 'resize') {
      var s = Math.max(Math.abs(p.x - d.ax), Math.abs(p.y - d.ay));
      S.sel.s = s;
      S.sel.x = (p.x < d.ax) ? d.ax - s : d.ax;
      S.sel.y = (p.y < d.ay) ? d.ay - s : d.ay;
    } else if (d.t === 'new') {
      var s2 = Math.max(Math.abs(p.x - d.ax), Math.abs(p.y - d.ay));
      S.sel.s = s2;
      S.sel.x = (p.x < d.ax) ? d.ax - s2 : d.ax;
      S.sel.y = (p.y < d.ay) ? d.ay - s2 : d.ay;
    }
    clamp();
    render();
  }

  function onUp() { if (S.drag) { S.drag = null; render(); } }

  function render() {
    if (!S.src || !S.selEl) return;
    var s = S.sel;
    S.selEl.style.left = s.x + 'px';
    S.selEl.style.top = s.y + 'px';
    S.selEl.style.width = s.s + 'px';
    S.selEl.style.height = s.s + 'px';
    
    if (S.raf) return;
    S.raf = requestAnimationFrame(function () {
      S.raf = 0;
      var pc = S.peek.getContext('2d');
      pc.clearRect(0, 0, 96, 96);
      var src = (S.mode === 'manual') ? cropCanvas() : S.src;
      if (!src) return;
      pc.imageSmoothingEnabled = true;
      pc.imageSmoothingQuality = 'high';
      var sw = src.width, sh = src.height, m = Math.min(sw, sh);
      pc.drawImage(src, (sw - m) / 2, (sh - m) / 2, m, m, 0, 0, 96, 96);
    });
    updateState();
  }

  function cropCanvas() {
    if (!S.src) return null;
    var k = S.scale;
    var sx = S.sel.x / k, sy = S.sel.y / k, ss = S.sel.s / k;
    sx = Math.max(0, Math.min(sx, S.src.width - 1));
    sy = Math.max(0, Math.min(sy, S.src.height - 1));
    ss = Math.max(1, Math.min(Math.round(ss), S.src.width - sx, S.src.height - sy));
    var c = document.createElement('canvas');
    c.width = ss; c.height = ss;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.src, sx, sy, ss, ss, 0, 0, ss, ss);
    return c;
  }

  /* */
  function getSource() {
    if (!S.src) return null;
    return (S.mode === 'manual') ? cropCanvas() : S.src;
  }

  function updateState() {
    if (!S.stateEl) return;
    if (!S.src) {
      S.stateEl.textContent = tr('Upload an image, drag a square over the part you want, then generate the icon.',
                                 'Upload an image, then drag a square over the area you want before generating.');
      return;
    }
    if (S.mode === 'full') {
      S.stateEl.textContent = tr('Whole image: no cropping, the full picture is fitted into a square canvas as before.',
                                 'Whole-image mode: no crop, the full picture is fitted into a square canvas.');
      return;
    }
    var ss = Math.round(S.sel.s / S.scale);
    S.stateEl.textContent = tr('✓ Cropped ' + ss + ' × ' + ss + ' px area · only this part becomes the icon (keep dragging or resizing)',
                               '✓ Selected ' + ss + ' × ' + ss + ' px · only this area becomes the icon (drag or resize anytime)');
  }

  window.PSIconCrop = { mount: mount, load: load, clear: clear, getSource: getSource, setMode: setMode };
})();
