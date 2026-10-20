/* ============================================================
 * preview.js —— 图片预览健壮化（独立，不依赖任何库）
 * ------------------------------------------------------------
 * 为什么需要它：
 *   objectURL 在部分手机浏览器 / 无痕模式 / HEIC 格式下会失败，
 *   失败时 <img> 露出底层棋盘格背景，深色主题下看着就是「一片黑」。
 *   旧实现只设 onerror 弹 alert，不会换别的加载方式，
 *   更糟的是 _previewURL 一旦赋值就非空，导致 dataURL 永远顶不上来。
 * 用法：window.__setPreview(imgEl, file, onOk, onFail)
 * ============================================================ */
(function(){
'use strict';
window.__setPreview = function (imgEl, file, onOk, onFail) {
    if (!imgEl || !file) return;
    var steps = [];
    var settled = false;

    function finish(ok, url, how) {
        if (settled) return; settled = true;
        if (ok) { if (onOk) onOk(url, how); }
        else { if (onFail) onFail(steps); }
    }
    function note(t) { steps.push(t); }

    /* --- 方式1: objectURL --- */
    function tryObjectURL() {
        var url;
        try { url = URL.createObjectURL(file); }
        catch (e) { note('objectURL创建失败:' + e.message); return tryBitmap(); }
        var im = new Image();
        var t = setTimeout(function () {
            note('objectURL超时8s'); tryBitmap();
        }, 8000);
        im.onload = function () {
            clearTimeout(t);
            if (im.naturalWidth > 0 && im.naturalHeight > 0) {
                imgEl.src = url; note('objectURL成功');
                finish(true, url, 'objectURL');
            } else { note('objectURL解码尺寸为0'); tryBitmap(); }
        };
        im.onerror = function () { clearTimeout(t); note('objectURL onerror'); tryBitmap(); };
        im.src = url;
    }

    /* --- 方式2: createImageBitmap 降采样后转 blob URL --- */
    function tryBitmap() {
        if (typeof createImageBitmap !== 'function') { note('无createImageBitmap'); return tryDataURL(); }
        var t = setTimeout(function () { note('bitmap超时10s'); tryDataURL(); }, 10000);
        createImageBitmap(file).then(function (bm) {
            clearTimeout(t);
            try {
                var c = document.createElement('canvas');
                var MAX = 1600;
                var sc = Math.min(1, MAX / Math.max(bm.width, bm.height));
                c.width = Math.round(bm.width * sc); c.height = Math.round(bm.height * sc);
                c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
                if (c.toBlob) {
                    c.toBlob(function (blob) {
                        if (!blob) { note('bitmap转blob失败'); return tryDataURL(); }
                        var u = URL.createObjectURL(blob);
                        imgEl.src = u; note('bitmap成功');
                        finish(true, u, 'bitmap');
                    }, 'image/jpeg', 0.9);
                } else { note('无toBlob'); tryDataURL(); }
            } catch (e) { note('bitmap异常:' + e.message); tryDataURL(); }
        }).catch(function (e) { clearTimeout(t); note('bitmap失败:' + e.message); tryDataURL(); });
    }

    /* --- 方式3: dataURL（慢但兼容性最好） --- */
    function tryDataURL() {
        var r = new FileReader();
        r.onload = function (ev) {
            var im = new Image();
            im.onload = function () {
                if (im.naturalWidth > 0) { imgEl.src = ev.target.result; note('dataURL成功'); finish(true, ev.target.result, 'dataURL'); }
                else { note('dataURL尺寸为0'); finish(false); }
            };
            im.onerror = function () { note('dataURL onerror'); finish(false); };
            im.src = ev.target.result;
        };
        r.onerror = function () { note('readAsDataURL失败'); finish(false); };
        r.readAsDataURL(file);
    }

    tryObjectURL();
};

/* 全局兜底：任何页面的 <img> 加载失败都不再静默留黑格 */
window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.id && /Preview|preview/.test(t.id)) {
        if (t.dataset && t.dataset.__pvFail) return;
        if (t.dataset) t.dataset.__pvFail = '1';
        var box = t.parentElement;
        if (box && !box.querySelector('.__pvmsg')) {
            var d = document.createElement('div');
            d.className = '__pvmsg';
            d.style.cssText = 'position:absolute;left:8px;right:8px;top:50%;transform:translateY(-50%);' +
                'background:#7f1d1d;color:#fee2e2;padding:10px 12px;border-radius:8px;font-size:12px;' +
                'line-height:1.6;text-align:center;z-index:5';
            d.textContent = '图片预览失败：该格式可能不受此浏览器支持（如 iPhone 的 HEIC）。' +
                '请在相册里导出为 JPG 后再试。';
            if (getComputedStyle(box).position === 'static') box.style.position = 'relative';
            box.appendChild(d);
        }
    }
}, true);


})();
