/* */
(function () {
    'use strict';

    var ua = navigator.userAgent || '';
    var maxTouch = navigator.maxTouchPoints || 0;
    /* */
    var isIOS = /iP(hone|ad|od)/.test(ua) ||
        (/Macintosh|MacIntel/.test(ua) && maxTouch > 1) ||
        /MicroMessenger/.test(ua) && /iP(hone|ad|od)/.test(ua);
    var isAndroid = /Android/i.test(ua);
    /* Android WebView / in-app browsers (Via, WeChat, UC, QQ ...) have no
       download manager behind <a download> for blob: and data: URLs, so a tap
       is silently dropped. Standard Android Chrome exposes navigator.share. */
    var webViewUA = /;\s*wv\)/i.test(ua) ||
        /Via\/|VIA |MicroMessenger|QQBrowser|UCBrowser|Quark|Sogou|Baidu|Miui|HeyTap|Vivo|Oppo|SamsungBrowser|Crosswalk/i.test(ua) ||
        !/Chrome\//.test(ua);
    var needsPanel = isIOS || (isAndroid && (webViewUA || !navigator.share));
    window.__dlPanelReason = isIOS ? 'ios' : (needsPanel ? 'webview' : 'none');
    window.__downloadMode = needsPanel ? 'panel' : 'direct';

    var IMG_RE = /^image\/(png|jpeg|jpg|webp|gif|bmp|avif|heic|heif|svg\+xml)$/i;

    function isZh() {
        if (window.PSLang && typeof PSLang.get === 'function') return PSLang.get() === 'zh';
        var l = document.documentElement.getAttribute('data-lang') || document.documentElement.lang || '';
        return /^zh/i.test(l);
    }

    function t(zh, en) { return isZh() ? zh : en; }

    /* */
    function normalize(src, mime, quality) {
        return new Promise(function (resolve, reject) {
            if (!src) { reject(new Error('empty source')); return; }

            if (typeof Blob !== 'undefined' && src instanceof Blob) {
                resolve({ blob: src, mime: mime || src.type || 'image/png' });
                return;
            }

            if (typeof src === 'string') {
                var dm = /^data:([^;,]+)[;,]/.exec(src);
                var detected = dm ? dm[1] : '';
                fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
                    resolve({ blob: b, mime: mime || detected || b.type || 'image/png' });
                }).catch(function () {
                    /* */
                    resolve({ blob: null, url: src, mime: mime || detected || 'image/png' });
                });
                return;
            }

            if (typeof src.toBlob === 'function') {
                var want = mime || 'image/png';
                try {
                    src.toBlob(function (b) {
                        if (b) resolve({ blob: b, mime: want });
                        else reject(new Error('toBlob failed'));
                    }, want, quality == null ? 0.92 : quality);
                    return;
                } catch (e) { /* */ }
            }

            if (typeof src.toDataURL === 'function') {
                try {
                    var du = src.toDataURL(mime || 'image/png', quality == null ? 0.92 : quality);
                    fetch(du).then(function (r) { return r.blob(); }).then(function (b) {
                        resolve({ blob: b, mime: mime || b.type || 'image/png' });
                    }).catch(function (e2) { reject(e2); });
                    return;
                } catch (e3) { /* */ }
            }

            reject(new Error('unsupported source'));
        });
    }

    var panel = null;
    var lastUrl = null;

    function buildPanel() {
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = '__dlPanel';
        panel.style.cssText = 'position:fixed;inset:0;z-index:99999;display:none;' +
            'align-items:center;justify-content:center;background:rgba(2,6,23,.94);padding:20px;' +
            '-webkit-touch-callout:default !important;user-select:auto !important;' +
            '-webkit-user-select:auto !important;pointer-events:auto !important';
        panel.innerHTML =
            '<div style="max-width:100%;max-height:100%;overflow:auto;text-align:center;' +
            '-webkit-touch-callout:default;user-select:auto;-webkit-user-select:auto">' +
            '<div id="__dlTitle" style="color:#f1f5f9;font-size:1rem;font-weight:600;margin-bottom:8px;line-height:1.6"></div>' +
            '<div id="__dlHint" style="background:#fde047;color:#0f172a;border:2px solid #f59e0b;border-radius:10px;padding:12px 14px;margin:0 0 14px;font-size:.88rem;line-height:1.75;font-weight:600;text-align:left;box-shadow:0 0 0 4px rgba(253,224,71,.12)"></div>' +
            '<img id="__dlImg" alt="result" style="max-width:100%;max-height:58vh;border-radius:10px;' +
            'box-shadow:0 8px 30px rgba(0,0,0,.5);display:block;margin:0 auto;' +
            '-webkit-touch-callout:default !important;-webkit-user-drag:auto !important;' +
            'user-select:auto !important;-webkit-user-select:auto !important;pointer-events:auto !important">' +
            '<div id="__dlFileName" style="display:none;color:#e2e8f0;font-size:1.1rem;font-weight:600;' +
            'padding:26px 10px;word-break:break-all"></div>' +
            '<div style="margin-top:16px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
            '<button id="__dlShare" style="padding:11px 18px;border-radius:8px;border:0;' +
            'background:#4f46e5;color:#fff;font-size:.9rem;font-weight:600">Share & Save</button>' +
            '<button id="__dlOpen" style="padding:11px 18px;border-radius:8px;border:1px solid #475569;' +
            'background:#1e293b;color:#e2e8f0;font-size:.9rem">Open in new tab</button>' +
            '<button id="__dlDirect" style="padding:11px 18px;border-radius:8px;border:1px solid #475569;' +
            'background:#1e293b;color:#e2e8f0;font-size:.9rem">Download</button>' +
            '<button id="__dlClose" style="padding:11px 18px;border-radius:8px;border:1px solid #475569;' +
            'background:#1e293b;color:#e2e8f0;font-size:.9rem">Close</button>' +
            '</div></div>';
        document.body.appendChild(panel);
        panel.querySelector('#__dlClose').onclick = hide;
        panel.addEventListener('click', function (e) { if (e.target === panel) hide(); });
        return panel;
    }

    function hide() {
        if (panel) panel.style.display = 'none';
    }

    function blobToDataURL(blob) {
        return new Promise(function (resolve, reject) {
            try {
                var fr = new FileReader();
                fr.onload = function () { resolve(String(fr.result || '')); };
                fr.onerror = function () { reject(fr.error || new Error('read failed')); };
                fr.readAsDataURL(blob);
            } catch (e) { reject(e); }
        });
    }

    /* A non-image result (.ico, .pdf ...) cannot be drawn in <img>.  Use the
       PNG result preview already rendered on the page as a long-pressable
       visual, so the save panel never degenerates into a bare filename. */
    function pagePreviewDataURL() {
        return new Promise(function (resolve) {
            var img = document.getElementById('processedPreview');
            if (!img) {
                var all = document.querySelectorAll('img[id]');
                for (var i = 0; i < all.length; i++) {
                    if (/processed|result|output|out/i.test(all[i].id)) { img = all[i]; break; }
                }
            }
            var src = img ? (img.currentSrc || img.getAttribute('src') || '') : '';
            if (!src || src === '/' || !/^(data:|blob:)/.test(src)) { resolve(''); return; }
            if (/^data:image\//i.test(src)) { resolve(src); return; }
            fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
                if (!b || !IMG_RE.test(b.type || '')) { resolve(''); return; }
                return blobToDataURL(b);
            }).then(function (du) { resolve(du || ''); }).catch(function () { resolve(''); });
        });
    }

    function showPanel(blob, dataUrl, filename, mime, reason, previewDu) {
        var p = buildPanel();
        var zh = isZh();
        var isImg = IMG_RE.test(mime || '');
        var img = p.querySelector('#__dlImg');
        var fileBox = p.querySelector('#__dlFileName');
        var shareBtn = p.querySelector('#__dlShare');
        var openBtn = p.querySelector('#__dlOpen');
        var directBtn = p.querySelector('#__dlDirect');
        var url = dataUrl || '';
        var chip = 'background:#0f172a;color:#fde047;padding:2px 7px;border-radius:5px;font-weight:800';

        p.querySelector('#__dlTitle').textContent = zh ? '保存结果' : 'Save your result';
        var hint = p.querySelector('#__dlHint');
        if (isImg) {
            if (reason === 'ios') {
                hint.innerHTML = zh
                    ? '① <b>长按下面的图片 → 存储到「照片」</b>。<br/>② <span style="' + chip + '">⚠️ iOS 不弹「已保存」提示</span>，请打开照片 App 确认；也可用「系统分享保存」存到「文件」。'
                    : '① <b>Long-press the image below → Save to Photos</b>.<br/>② <span style="' + chip + '">⚠️ iOS shows NO "Saved" confirmation</span> — check the Photos app, or use Share below to save to Files.';
            } else {
                hint.innerHTML = zh
                    ? '① <b>长按下面的图片 → 保存图片</b>；部分安卓浏览器会拦掉下载按钮，长按最稳。<br/>② 若仍不行，用「系统分享保存」或「在新标签打开」，也可再点「直接下载」试一次。'
                    : '① <b>Long-press the image below → Save image</b>; some Android browsers silently block download buttons.<br/>② If that fails, use Share, Open in new tab, or tap Download again.';
            }
        } else if (previewDu) {
            var iosNote = reason === 'ios'
                ? (zh ? '<br/>③ iOS 不弹「已保存」提示，请到照片 App 确认。'
                      : '<br/>③ iOS shows NO "Saved" confirmation — check the Photos app.')
                : '';
            hint.innerHTML = zh
                ? '① 下面是这张结果的 <b>PNG 预览图</b>，<b>长按即可保存为 PNG</b>。<br/>② 要原始文件 <b>' + String(filename).replace(/[<>&"]/g, '') + '</b>，点「直接下载」；若浏览器没反应，用「系统分享保存」或「在新标签打开」。' + iosNote
                : '① <b>Long-press the PNG preview below to save it</b>.<br/>② For the original <b>' + String(filename).replace(/[<>&"]/g, '') + '</b>, tap Download; if nothing happens, use Share or Open in new tab.' + iosNote;
        } else {
            hint.innerHTML = zh
                ? '该文件不是图片，网页里没有可长按的预览图。点「直接下载」保存文件；若浏览器没反应，用「系统分享保存」或「在新标签打开」。'
                : 'This file is not an image, so there is no long-press preview. Tap Download to save it; if nothing happens, use Share or Open in new tab.';
        }
        p.querySelector('#__dlClose').textContent = zh ? '关闭' : 'Close';
        shareBtn.textContent = zh ? '系统分享保存' : 'Share / Save';
        openBtn.textContent = zh ? '在新标签打开' : 'Open in new tab';
        directBtn.textContent = zh ? '直接下载' : 'Download';

        var shownUrl = (isImg && url) ? url : (previewDu || '');
        if (shownUrl) {
            img.style.display = 'block';
            img.src = shownUrl;
            if (isImg) {
                fileBox.style.display = 'none';
                fileBox.textContent = '';
            } else {
                /* Non-image result: keep the real filename as a small caption
                   under the PNG preview instead of a big empty text block. */
                fileBox.style.cssText = 'display:block;color:#94a3b8;font-size:12px;' +
                    'padding:8px 0 0;word-break:break-all;font-weight:400';
                fileBox.textContent = t('原文件：', 'File: ') + filename;
            }
        } else {
            img.style.display = 'none';
            img.removeAttribute('src');
            fileBox.style.cssText = 'display:block;color:#e2e8f0;font-size:1.1rem;font-weight:600;' +
                'padding:26px 10px;word-break:break-all';
            fileBox.textContent = filename;
        }

        var canShare = false;
        try {
            canShare = !!(navigator.share && navigator.canShare && blob && typeof File !== 'undefined' &&
                navigator.canShare({ files: [new File([blob], filename, { type: mime || 'application/octet-stream' })] }));
        } catch (e) { canShare = false; }
        shareBtn.style.display = canShare ? '' : 'none';
        shareBtn.onclick = function () {
            if (!canShare) return;
            var f = new File([blob], filename, { type: mime || 'application/octet-stream' });
            navigator.share({ files: [f], title: filename }).catch(function () {});
        };

        openBtn.onclick = function () {
            if (!url) return;
            /* Non-image files (ICO/PDF) must be handed to the browser as-is;
               writing them into an <img> would just render a broken image. */
            if (!isImg) { try { window.open(url, '_blank'); } catch (e0) {} return; }
            var w = window.open('', '_blank');
            if (!w) { window.open(url, '_blank'); return; }
            var safe = String(filename).replace(/[<>&"]/g, '');
            try {
                w.document.write('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">' +
                    '<title>' + safe + '</title>' +
                    '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a">' +
                    '<img src="' + url + '" alt="' + safe + '" style="max-width:92vw;max-height:92vh"></body>');
                w.document.close();
            } catch (e2) { try { w.location.href = url; } catch (e3) {} }
        };

        directBtn.onclick = function () {
            if (!url) return;
            var a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            if (a.parentNode) a.parentNode.removeChild(a);
        };

        p.style.display = 'flex';
    }

    window.__download = function (src, filename, mime, quality) {
        filename = filename || 'picstudio.png';
        normalize(src, mime, quality).then(function (r) {
            var blob = r.blob;
            var ftype = r.mime || 'image/png';

            if (!needsPanel) {
                var url = blob ? URL.createObjectURL(blob) : r.url;
                var a = document.createElement('a');
                a.download = filename;
                a.href = url;
                document.body.appendChild(a);
                a.click();
                setTimeout(function () {
                    if (a.parentNode) a.parentNode.removeChild(a);
                    if (blob) { try { URL.revokeObjectURL(url); } catch (e) {} }
                }, 30000);
                return;
            }

            var reason = window.__dlPanelReason || 'none';
            var previewReady = IMG_RE.test(ftype || '')
                ? Promise.resolve('') : pagePreviewDataURL();
            previewReady.then(function (pv) {
                if (blob) {
                    blobToDataURL(blob).then(function (du) {
                        showPanel(blob, du || r.url || '', filename, ftype, reason, pv);
                    }).catch(function () {
                        showPanel(blob, r.url || '', filename, ftype, reason, pv);
                    });
                } else {
                    showPanel(null, r.url || '', filename, ftype, reason, pv);
                }
            });
        }).catch(function (err) {
            console.error('[download]', err);
            alert(t('Could not create the file, please try again', 'Could not create the file. Please try again.'));
        });
    };

    window.__dlNeedsLongPress = function () { return needsPanel; };

    /* ============================================================
     * Result-preview save fallback
     * ------------------------------------------------------------
     * Some Android browsers with built-in ad filtering refuse to save
     * blob: image URLs from the long-press menu ("Image url is blacklisted").
     * That is a browser-side menu block; the page cannot intercept it.
     * Inject an in-page button under each result preview instead, using the
     * normal __download channel (direct download on Android, save panel on iOS).
     * The button only appears after a real result image has loaded, so the
     * empty state stays completely blank.
     * ============================================================ */
    function isResultImg(img) {
        return !!(img && img.tagName === 'IMG' && img.id &&
            /processed|result|output|out/i.test(img.id));
    }

    function savePreviewName() {
        var slug = (location.pathname.split('/').pop() || 'preview').replace(/\.html?$/i, '');
        slug = slug.replace(/[^a-zA-Z0-9_-]/g, '-') || 'preview';
        return 'picstudio-' + slug + '-preview.png';
    }

    function savePreview(img) {
        var src = img.currentSrc || img.getAttribute('src') || '';
        if (!src || src === '/') return;
        fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
            if (!b || !b.size) return;
            if (window.__download) window.__download(b, savePreviewName(), b.type || 'image/png');
        }).catch(function () {
            var a = document.createElement('a');
            a.href = src; a.download = savePreviewName();
            document.body.appendChild(a); a.click();
            if (a.parentNode) a.parentNode.removeChild(a);
        });
    }

    function setBtnText(btn, hint) {
        btn.textContent = t('⬇️ 保存预览图', '⬇️ Save preview image');
        hint.textContent = t('长按保存被拦截时，点上方按钮打开保存面板',
                     'If long-press save is blocked, tap the button above to open the save panel');
    }

    function ensureSaveBtn(img) {
        if (!img.parentElement) return;
        var btn = img.__psSaveBtn, hint = img.__psSaveHint;
        if (!btn) {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = '__psSaveBtn';
            btn.style.cssText = 'display:none;margin:10px auto 0;padding:9px 16px;border-radius:8px;' +
                'border:1px solid #475569;background:#1e293b;color:#e2e8f0;font-size:13px;' +
                'font-weight:600;cursor:pointer';
            hint = document.createElement('div');
            hint.className = '__psSaveHint';
            hint.style.cssText = 'display:none;margin:6px 0 0;font-size:12px;color:#94a3b8;text-align:center';
            btn.addEventListener('click', function () { savePreview(img); });
            img.insertAdjacentElement('afterend', btn);
            btn.insertAdjacentElement('afterend', hint);
            img.__psSaveBtn = btn;
            img.__psSaveHint = hint;
        }
        setBtnText(btn, hint);
        btn.style.display = '';
        hint.style.display = '';
    }

    function hideSaveBtn(img) {
        if (img.__psSaveBtn) img.__psSaveBtn.style.display = 'none';
        if (img.__psSaveHint) img.__psSaveHint.style.display = 'none';
    }

    document.addEventListener('load', function (e) {
        var img = e.target;
        if (isResultImg(img) && img.naturalWidth > 0) ensureSaveBtn(img);
    }, true);
    document.addEventListener('error', function (e) {
        if (isResultImg(e.target)) hideSaveBtn(e.target);
    }, true);
    window.addEventListener('ps:langchange', function () {
        var imgs = document.querySelectorAll('img[id]');
        for (var i = 0; i < imgs.length; i++) {
            if (imgs[i].__psSaveBtn && imgs[i].__psSaveHint) setBtnText(imgs[i].__psSaveBtn, imgs[i].__psSaveHint);
        }
    });
    (function scanExisting() {
        var imgs = document.querySelectorAll('img[id]');
        for (var i = 0; i < imgs.length; i++) {
            if (isResultImg(imgs[i]) && imgs[i].naturalWidth > 0) ensureSaveBtn(imgs[i]);
        }
    })();
})();
