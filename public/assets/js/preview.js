/* */
(function () {
    'use strict';

    /* */
    var PREVIEW_MAX = 1200;
    /* */
    var SHRINK_THRESHOLD = 1200 * 1200;

    /* */
    function shrinkToURL(src, sw, sh, cb) {
        try {
            var sc = Math.min(1, PREVIEW_MAX / Math.max(sw, sh));
            var c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(sw * sc));
            c.height = Math.max(1, Math.round(sh * sc));
            c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
            if (!c.toBlob) { cb(null); return; }
            c.toBlob(function (blob) {
                if (!blob) { cb(null); return; }
                try { cb(URL.createObjectURL(blob)); } catch (e) { cb(null); }
            }, 'image/jpeg', 0.9);
        } catch (e) { cb(null); }
    }

    window.__setPreview = function (imgEl, file, onOk, onFail) {
        if (!imgEl || !file) return;
        var steps = [];
        var settled = false;

        /* */
        window.__lastPreviewFile = file;

        function finish(ok, url, how) {
            if (settled) return; settled = true;
            if (ok) { if (onOk) onOk(url, how); }
            else { if (onFail) onFail(steps); }
        }
        function note(t) { steps.push(t); }

        /* */
        function deliver(okUrl, probe, how) {
            var sw = probe.naturalWidth || probe.width;
            var sh = probe.naturalHeight || probe.height;
            if (sw * sh > SHRINK_THRESHOLD && sw > 0 && sh > 0) {
                shrinkToURL(probe, sw, sh, function (smallUrl) {
                    /* */
                    imgEl.src = smallUrl || okUrl;
                    note((smallUrl ? 'Downscale ok' : 'Downscale failed, using original') + ':' + how);
                    finish(true, imgEl.src, how);
                });
            } else {
                imgEl.src = okUrl; note('Small image direct: ' + how);
                finish(true, okUrl, how);
            }
        }

        /* */
        function tryObjectURL() {
            var url;
            try { url = URL.createObjectURL(file); }
            catch (e) { note('objectURL creation failed: ' + e.message); return tryBitmap(); }
            var im = new Image();
            var t = setTimeout(function () {
                note('objectURL timed out (8s)'); tryBitmap();
            }, 8000);
            im.onload = function () {
                clearTimeout(t);
                if (im.naturalWidth > 0 && im.naturalHeight > 0) {
                    note('objectURL decode ok');
                    deliver(url, im, 'objectURL');
                } else { note('objectURL decoded zero size'); tryBitmap(); }
            };
            im.onerror = function () { clearTimeout(t); note('objectURL onerror'); tryBitmap(); };
            im.src = url;
        }

        /* */
        function tryBitmap() {
            if (typeof createImageBitmap !== 'function') { note('no createImageBitmap'); return tryDataURL(); }
            var t = setTimeout(function () { note('bitmap timed out (10s)'); tryDataURL(); }, 10000);
            createImageBitmap(file).then(function (bm) {
                clearTimeout(t);
                try {
                    var sc = Math.min(1, PREVIEW_MAX / Math.max(bm.width, bm.height));
                    var c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(bm.width * sc));
                    c.height = Math.max(1, Math.round(bm.height * sc));
                    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
                    if (!c.toBlob) { note('no toBlob'); return tryDataURL(); }
                    c.toBlob(function (blob) {
                        if (!blob) { note('bitmap to blob failed'); return tryDataURL(); }
                        var u = URL.createObjectURL(blob);
                        imgEl.src = u; note('bitmap downscale ok');
                        finish(true, u, 'bitmap');
                    }, 'image/jpeg', 0.9);
                } catch (e) { note('bitmap error: ' + e.message); tryDataURL(); }
            }).catch(function (e) { clearTimeout(t); note('bitmap failed: ' + e.message); tryDataURL(); });
        }

        /* */
        function tryDataURL() {
            var r = new FileReader();
            r.onload = function (ev) {
                var im = new Image();
                im.onload = function () {
                    if (im.naturalWidth > 0) {
                        imgEl.src = ev.target.result; note('dataURL ok');
                        finish(true, ev.target.result, 'dataURL');
                    } else { note('dataURL returned zero size'); finish(false); }
                };
                im.onerror = function () { note('dataURL onerror'); finish(false); };
                im.src = ev.target.result;
            };
            r.onerror = function () { note('readAsDataURL failed'); finish(false); };
            r.readAsDataURL(file);
        }

        tryObjectURL();
    };

    /* */
    /* */
    function markHadSrc(img) {
        try {
            var v = img.getAttribute('src');
            if (v && v.replace(/\s/g, '')) img.__pvHadSrc = true;
        } catch (e) {}
    }

    window.__clearPreviewMsg = function (imgEl) {
        var scope = imgEl ? imgEl.parentElement : document;
        if (!scope) return;
        var ms = scope.querySelectorAll('.__pvmsg');
        for (var i = 0; i < ms.length; i++) { if (ms[i].parentElement) ms[i].parentElement.removeChild(ms[i]); }
    };

    /* */
    function showMsg(t, text, tone) {
        var box = t.parentElement; if (!box) return;
        var old = box.querySelector('.__pvmsg'); if (old) old.remove();
        var d = document.createElement('div');
        d.className = '__pvmsg';
        var bg = (tone === 'warn') ? '#7f1d1d' : 'rgba(51,65,85,0.94)';
        var fg = (tone === 'warn') ? '#fee2e2' : '#cbd5e1';
        var bd = (tone === 'warn') ? '#b91c1c' : '#475569';
        d.style.cssText = 'position:absolute;left:8px;right:8px;top:50%;transform:translateY(-50%);' +
            'background:' + bg + ';color:' + fg + ';padding:10px 12px;border-radius:8px;font-size:12px;' +
            'line-height:1.6;text-align:center;z-index:5;border:1px solid ' + bd;
        d.textContent = text;
        if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
        box.appendChild(d);
    }

    /* */
    function onImgOK(t) {
        if (t.naturalWidth > 0) {
            markHadSrc(t);
            if (t.dataset) { delete t.dataset.__pvFail; delete t.dataset.__pvBusy; }
            window.__clearPreviewMsg(t);
        }
    }

    window.addEventListener('load', function (e) {
        var t = e.target;
        if (!(t && t.tagName === 'IMG' && t.id && /Preview|preview/.test(t.id))) return;
        onImgOK(t);
    }, true);

    /* */
    (function sweep() {
        var n = 0;
        var timer = setInterval(function () {
            n++;
            try {
                var imgs = document.querySelectorAll('img[id]');
                for (var i = 0; i < imgs.length; i++) {
                    var im = imgs[i];
                    if (!/Preview|preview/.test(im.id)) continue;
                    if (im.naturalWidth > 0) {
                        markHadSrc(im);
                        var box = im.parentElement;
                        if (box && box.querySelector('.__pvmsg')) window.__clearPreviewMsg(im);
                    }
                }
            } catch (e) {}
            if (n > 24) clearInterval(timer);
        }, 500);
    })();

    /* */
    window.addEventListener('error', function (e) {
        var t = e.target;
        if (!(t && t.tagName === 'IMG' && t.id && /Preview|preview/.test(t.id))) return;
        if (t.dataset && t.dataset.__pvFail) return;

        /* */
        var rawSrc = t.getAttribute('src');
        if (!rawSrc || !rawSrc.replace(/\s/g, '')) {
            window.__clearPreviewMsg(t);
            return;
        }

        /* */
        var idl = (t.id || '').toLowerCase();
        var isResult = /processed|result|output|out/.test(idl);
        if (isResult && !t.__pvHadSrc) {
            window.__clearPreviewMsg(t);
            return;
        }

        var file = window.__lastPreviewFile;

        /* */
        if (!file) {
            try {
                var ins = document.querySelectorAll('input[type=file]');
                for (var ii = 0; ii < ins.length; ii++) {
                    if (ins[ii].files && ins[ii].files[0]) { file = ins[ii].files[0]; break; }
                }
            } catch (e) { file = null; }
        }

        /* */
        setTimeout(function () {
            if (t.naturalWidth > 0) { window.__clearPreviewMsg(t); if (t.dataset) delete t.dataset.__pvFail; return; }
            if (document.body.contains(t) === false) return;
            realFail();
        }, 1200);
        return;

        function realFail() {
        if (!file) { if (t.dataset) t.dataset.__pvFail = '1'; showMsg(t, 'Preview unavailable (large or unusual format). Processing below still works — just press the button.'); return; }

        /* */
        if (t.dataset) t.dataset.__pvBusy = '1';

        var r = new FileReader();
        r.onload = function (ev) {
            var probe = new Image();
            probe.onload = function () {
                if (probe.naturalWidth > 0) {
                    /* */
                    var sc = Math.min(1, 1200 / Math.max(probe.naturalWidth, probe.naturalHeight));
                    try {
                        var c = document.createElement('canvas');
                        c.width = Math.max(1, Math.round(probe.naturalWidth * sc));
                        c.height = Math.max(1, Math.round(probe.naturalHeight * sc));
                        c.getContext('2d').drawImage(probe, 0, 0, c.width, c.height);
                        c.toBlob(function (blob) {
                            if (blob) {
                                t.src = URL.createObjectURL(blob);
                                window.__clearPreviewMsg(t);
                                if (t.dataset) { delete t.dataset.__pvBusy; }
                                return;
                            }
                            if (t.dataset) t.dataset.__pvFail = '1';
                            showMsg(t, 'Preview unavailable: this format may not be supported (e.g. HEIC). Processing may be limited too — export as JPG first.', 'warn');
                        }, 'image/jpeg', 0.9);
                    } catch (err) {
                        if (t.dataset) t.dataset.__pvFail = '1';
                        showMsg(t, 'Preview unavailable. Processing below still works — just press the button.');
                    }
                } else {
                    if (t.dataset) t.dataset.__pvFail = '1';
                    showMsg(t, 'Preview unavailable: this format may not be supported (e.g. HEIC). Export as JPG and try again.', 'warn');
                }
            };
            probe.onerror = function () {
                if (t.dataset) t.dataset.__pvFail = '1';
                showMsg(t, 'Preview unavailable: this format may not be supported (e.g. HEIC). Export as JPG and try again.', 'warn');
            };
            probe.src = ev.target.result;
        };
        r.onerror = function () {
            if (t.dataset) t.dataset.__pvFail = '1';
            showMsg(t, 'Preview unavailable. Processing below still works — just press the button.');
        };
        r.readAsDataURL(file);
        }
    }, true);
})();
