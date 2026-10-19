/* ============================================================
 * lab.js — PicStudio 图像处理算法库
 * 供各工具页调用，纯浏览器端，无依赖
 * ============================================================ */

(function (global) {
    'use strict';

    var LAB = {};

    /* ---------- 通用：canvas 构造 ---------- */
    function makeCanvas(w, h) {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        return c;
    }
    LAB.makeCanvas = makeCanvas;

    function drawTo(src, w, h) {
        var c = makeCanvas(w, h);
        var x = c.getContext('2d');
        if (typeof src === 'string') { x.fillStyle = src; x.fillRect(0, 0, w, h); }
        else x.drawImage(src, 0, 0, w, h);
        return c;
    }
    LAB.drawTo = drawTo;

    /** 单边上限内缩放，防止大图卡死 */
    LAB.fitSide = function (img, maxSide) {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var s = Math.min(1, maxSide / Math.max(w, h));
        if (s >= 1) return { canvas: drawTo(img, w, h), ratio: 1 };
        return { canvas: drawTo(img, Math.round(w * s), Math.round(h * s)), ratio: s };
    };

    /* ============================================================
     * 1. 调色增强  亮度 / 对比度 / 饱和度 / 色温 / 锐化 / 暗角 / 黑白
     * ============================================================ */
    LAB.adjust = function (srcCanvas, p) {
        var w = srcCanvas.width, h = srcCanvas.height;
        var ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
        var im = ctx.getImageData(0, 0, w, h);
        var d = im.data;

        var bright = (p.brightness || 0) * 2.55;      // -100..100
        var contra = p.contrast || 0;                 // -100..100
        var sat = p.saturation || 0;                  // -100..100
        var temp = p.temperature || 0;                // -100..100
        var gamma = p.gamma || 1;
        var bw = !!p.grayscale;
        var sepia = !!p.sepia;
        var invert = !!p.invert;

        // 对比度系数
        var cf = (259 * (contra + 255)) / (255 * (259 - contra));
        // 饱和度系数
        var sf = sat >= 0 ? 1 + sat / 100 * 2 : 1 + sat / 100;
        // 色温
        var tr = temp > 0 ? temp * 1.2 : 0, tb = temp < 0 ? -temp * 1.2 : 0;

        // gamma LUT
        var glut = new Uint8ClampedArray(256);
        for (var g = 0; g < 256; g++) {
            glut[g] = Math.max(0, Math.min(255, Math.pow(g / 255, 1 / gamma) * 255));
        }

        for (var i = 0; i < d.length; i += 4) {
            var r = d[i], gg = d[i + 1], b = d[i + 2];

            if (bright) { r += bright; gg += bright; b += bright; }
            if (contra) {
                r = cf * (r - 128) + 128;
                gg = cf * (gg - 128) + 128;
                b = cf * (b - 128) + 128;
            }
            if (temp) { r += tr; b += tb; }
            if (gamma !== 1) { r = glut[clamp255(r)]; gg = glut[clamp255(gg)]; b = glut[clamp255(b)]; }

            if (sat) {
                var lum = 0.299 * r + 0.587 * gg + 0.114 * b;
                r = lum + (r - lum) * sf;
                gg = lum + (gg - lum) * sf;
                b = lum + (b - lum) * sf;
            }
            if (bw) {
                var L = 0.299 * r + 0.587 * gg + 0.114 * b;
                r = gg = b = L;
            }
            if (sepia) {
                var nr = 0.393 * r + 0.769 * gg + 0.189 * b;
                var ng = 0.349 * r + 0.686 * gg + 0.168 * b;
                var nb = 0.272 * r + 0.534 * gg + 0.131 * b;
                r = nr; gg = ng; b = nb;
            }
            if (invert) { r = 255 - r; gg = 255 - gg; b = 255 - b; }

            d[i] = clamp255(r); d[i + 1] = clamp255(gg); d[i + 2] = clamp255(b);
        }
        ctx.putImageData(im, 0, 0);

        // 锐化（USM）
        if (p.sharpen > 0) LAB.unsharpMask(srcCanvas, p.sharpen / 100);
        // 暗角
        if (p.vignette > 0) LAB.vignette(srcCanvas, p.vignette / 100);

        return srcCanvas;
    };

    function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
    LAB.clamp255 = clamp255;

    /** USM 锐化 */
    LAB.unsharpMask = function (cv, amount, radius) {
        amount = amount || 0.5; radius = radius || 1;
        var w = cv.width, h = cv.height;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        var src = ctx.getImageData(0, 0, w, h).data;
        var blurCv = makeCanvas(w, h);
        blurCv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(src), w, h), 0, 0);
        boxBlurRGB(blurCv, radius);
        var bd = blurCv.getContext('2d').getImageData(0, 0, w, h).data;
        var out = ctx.getImageData(0, 0, w, h);
        var od = out.data;
        for (var i = 0; i < od.length; i += 4) {
            od[i] = clamp255(src[i] + (src[i] - bd[i]) * amount * 2);
            od[i + 1] = clamp255(src[i + 1] + (src[i + 1] - bd[i + 1]) * amount * 2);
            od[i + 2] = clamp255(src[i + 2] + (src[i + 2] - bd[i + 2]) * amount * 2);
        }
        ctx.putImageData(out, 0, 0);
        return cv;
    };

    /** 暗角 */
    LAB.vignette = function (cv, strength) {
        var w = cv.width, h = cv.height;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        var im = ctx.getImageData(0, 0, w, h), d = im.data;
        var cx = w / 2, cy = h / 2;
        var maxD = Math.sqrt(cx * cx + cy * cy);
        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var dx = x - cx, dy = y - cy;
                var dist = Math.sqrt(dx * dx + dy * dy) / maxD;
                var f = 1 - strength * Math.pow(Math.max(0, dist - 0.25) / 0.75, 1.6);
                var i = (y * w + x) * 4;
                d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
            }
        }
        ctx.putImageData(im, 0, 0);
        return cv;
    };

    /** 快速盒式模糊（RGB） */
    function boxBlurRGB(cv, radius) {
        radius = Math.max(1, Math.round(radius));
        var w = cv.width, h = cv.height;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        var im = ctx.getImageData(0, 0, w, h), d = im.data;
        var tmp = new Uint8ClampedArray(d.length);
        // 水平
        for (var y = 0; y < h; y++) {
            for (var c = 0; c < 3; c++) {
                var sum = 0, cnt = 0;
                for (var x = -radius; x <= radius; x++) {
                    var xx = Math.min(w - 1, Math.max(0, x));
                    sum += d[(y * w + xx) * 4 + c]; cnt++;
                }
                for (var x2 = 0; x2 < w; x2++) {
                    tmp[(y * w + x2) * 4 + c] = sum / cnt;
                    var add = Math.min(w - 1, x2 + radius + 1);
                    var sub = Math.max(0, x2 - radius);
                    sum += d[(y * w + add) * 4 + c] - d[(y * w + sub) * 4 + c];
                }
            }
        }
        // 垂直
        for (var x3 = 0; x3 < w; x3++) {
            for (var c2 = 0; c2 < 3; c2++) {
                var s2 = 0;
                for (var y2 = -radius; y2 <= radius; y2++) {
                    var yy = Math.min(h - 1, Math.max(0, y2));
                    s2 += tmp[(yy * w + x3) * 4 + c2];
                }
                var n = radius * 2 + 1;
                for (var y3 = 0; y3 < h; y3++) {
                    d[(y3 * w + x3) * 4 + c2] = s2 / n;
                    var a = Math.min(h - 1, y3 + radius + 1);
                    var b = Math.max(0, y3 - radius);
                    s2 += tmp[(a * w + x3) * 4 + c2] - tmp[(b * w + x3) * 4 + c2];
                }
            }
        }
        ctx.putImageData(im, 0, 0);
    }
    LAB.boxBlurRGB = boxBlurRGB;

    /* ============================================================
     * 2. 水印
     * ============================================================ */
    LAB.watermark = function (srcCanvas, o) {
        var w = srcCanvas.width, h = srcCanvas.height;
        var cv = makeCanvas(w, h);
        var ctx = cv.getContext('2d');
        ctx.drawImage(srcCanvas, 0, 0);

        o = o || {};
        var mode = o.mode || 'text';       // text | image
        var opacity = o.opacity == null ? 0.35 : o.opacity;
        var pos = o.position || 'tile';    // tile | center | tl | tr | bl | br
        var scale = o.scale || 1;

        ctx.save();
        ctx.globalAlpha = opacity;

        if (mode === 'image' && o.image) {
            var iw = o.image.width * scale, ih = o.image.height * scale;
            if (pos === 'tile') {
                var gapX = Math.max(iw + 40, 160), gapY = Math.max(ih + 40, 140);
                ctx.translate(w / 2, h / 2);
                ctx.rotate((o.rotate || -30) * Math.PI / 180);
                ctx.translate(-w, -h);
                for (var ty = 0; ty < h * 2.2; ty += gapY) {
                    for (var tx = 0; tx < w * 2.2; tx += gapX) {
                        ctx.drawImage(o.image, tx, ty, iw, ih);
                    }
                }
            } else {
                var pt = anchorPoint(pos, w, h, iw, ih, 24);
                ctx.drawImage(o.image, pt.x, pt.y, iw, ih);
            }
        } else {
            var text = o.text || 'PicStudio';
            var fs = Math.max(12, Math.round(Math.min(w, h) / 18 * scale));
            ctx.font = (o.bold ? 'bold ' : '') + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
            ctx.fillStyle = o.color || '#ffffff';
            ctx.textBaseline = 'middle';

            if (pos === 'tile') {
                ctx.translate(w / 2, h / 2);
                ctx.rotate((o.rotate || -30) * Math.PI / 180);
                ctx.translate(-w, -h);
                var tw = ctx.measureText(text).width;
                var stepX = tw + fs * 1.6, stepY = fs * 3;
                for (var y4 = 0; y4 < h * 2.2; y4 += stepY) {
                    for (var x4 = 0; x4 < w * 2.2; x4 += stepX) {
                        ctx.fillText(text, x4, y4);
                    }
                }
            } else {
                var tw2 = ctx.measureText(text).width;
                var p2 = anchorPoint(pos, w, h, tw2, fs, 24);
                ctx.fillText(text, p2.x, p2.y + fs / 2);
            }
        }
        ctx.restore();
        return cv;
    };

    function anchorPoint(pos, w, h, iw, ih, pad) {
        switch (pos) {
            case 'tl': return { x: pad, y: pad };
            case 'tr': return { x: w - iw - pad, y: pad };
            case 'bl': return { x: pad, y: h - ih - pad };
            case 'br': return { x: w - iw - pad, y: h - ih - pad };
            default: return { x: (w - iw) / 2, y: (h - ih) / 2 };
        }
    }
    LAB.anchorPoint = anchorPoint;

    /* ============================================================
     * 3. 裁剪（含社交平台预设）
     * ============================================================ */
    LAB.PRESETS = [
        { id: 'wechat-avatar', name: '微信头像', w: 640, h: 640, ratio: 1 },
        { id: 'wechat-moment', name: '朋友圈', w: 1080, h: 1080, ratio: 1 },
        { id: 'xhs', name: '小红书', w: 1080, h: 1440, ratio: 0.75 },
        { id: 'xhs-cover', name: '小红书封面', w: 1080, h: 1440, ratio: 0.75 },
        { id: 'douyin', name: '抖音封面', w: 1080, h: 1260, ratio: 0.857 },
        { id: 'taobao', name: '淘宝主图', w: 800, h: 800, ratio: 1 },
        { id: 'youtube', name: 'YouTube 缩略图', w: 1280, h: 720, ratio: 16 / 9 },
        { id: 'instagram', name: 'Instagram 方形', w: 1080, h: 1080, ratio: 1 },
        { id: 'story', name: '竖屏故事 9:16', w: 1080, h: 1920, ratio: 9 / 16 },
        { id: 'wallpaper', name: '手机壁纸 9:19.5', w: 1080, h: 2340, ratio: 1080 / 2340 },
        { id: 'id1', name: '一寸照 (295×413)', w: 295, h: 413, ratio: 295 / 413 },
        { id: 'id2', name: '二寸照 (413×579)', w: 413, h: 579, ratio: 413 / 579 },
        { id: 'a4', name: 'A4 横向 300dpi', w: 2480, h: 3508, ratio: 2480 / 3508 },
        { id: 'banner', name: '横幅 16:9', w: 1920, h: 1080, ratio: 16 / 9 }
    ];

    /** 居中裁剪到目标比例 */
    LAB.cropRatio = function (src, ratio) {
        var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
        var cur = w / h;
        var cw, ch;
        if (cur > ratio) { ch = h; cw = Math.round(h * ratio); }
        else { cw = w; ch = Math.round(w / ratio); }
        var sx = Math.round((w - cw) / 2), sy = Math.round((h - ch) / 2);
        var cv = makeCanvas(cw, ch);
        cv.getContext('2d').drawImage(src, sx, sy, cw, ch, 0, 0, cw, ch);
        return cv;
    };

    /** 裁剪 + 缩放到指定尺寸（可选填充白底，避免变形） */
    LAB.cropTo = function (src, tw, th, pad) {
        var ratio = tw / th;
        var c = LAB.cropRatio(src, ratio);
        if (pad) {
            // 等比缩放后留白，不裁掉内容
            var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
            var s = Math.min(tw / w, th / h);
            var dw = Math.round(w * s), dh = Math.round(h * s);
            var cv = makeCanvas(tw, th);
            var ctx = cv.getContext('2d');
            ctx.fillStyle = pad === true ? '#ffffff' : pad;
            ctx.fillRect(0, 0, tw, th);
            ctx.drawImage(src, Math.round((tw - dw) / 2), Math.round((th - dh) / 2), dw, dh);
            return cv;
        }
        return drawTo(c, tw, th);
    };

    /* ============================================================
     * 4. 拼接
     * ============================================================ */
    LAB.stitch = function (imgs, o) {
        o = o || {};
        var dir = o.direction || 'h';      // h | v | grid
        var gap = o.gap || 0;
        var bg = o.bg || '#ffffff';
        var align = o.align || 'center';   // start | center | end
        var cols = o.cols || Math.ceil(Math.sqrt(imgs.length));

        if (!imgs.length) return makeCanvas(1, 1);

        var sizes = imgs.map(function (im) {
            return { w: im.naturalWidth || im.width, h: im.naturalHeight || im.height };
        });

        var W, H, positions = [];

        if (dir === 'h') {
            var maxH = Math.max.apply(null, sizes.map(function (s) { return s.h; }));
            W = sizes.reduce(function (a, s) { return a + s.w; }, 0) + gap * (imgs.length - 1);
            H = maxH;
            var x = 0;
            sizes.forEach(function (s) {
                positions.push({ x: x, y: align === 'start' ? 0 : align === 'end' ? maxH - s.h : (maxH - s.h) / 2, w: s.w, h: s.h });
                x += s.w + gap;
            });
        } else if (dir === 'v') {
            var maxW = Math.max.apply(null, sizes.map(function (s) { return s.w; }));
            H = sizes.reduce(function (a, s) { return a + s.h; }, 0) + gap * (imgs.length - 1);
            W = maxW;
            var y = 0;
            sizes.forEach(function (s) {
                positions.push({ x: align === 'start' ? 0 : align === 'end' ? maxW - s.w : (maxW - s.w) / 2, y: y, w: s.w, h: s.h });
                y += s.h + gap;
            });
        } else {
            // 网格：每格统一为该列最大宽、该行最大高
            var rows = Math.ceil(imgs.length / cols);
            var colW = [], rowH = [];
            for (var c = 0; c < cols; c++) colW[c] = 0;
            for (var r = 0; r < rows; r++) rowH[r] = 0;
            sizes.forEach(function (s, i) {
                var cc = i % cols, rr = Math.floor(i / cols);
                if (s.w > colW[cc]) colW[cc] = s.w;
                if (s.h > rowH[rr]) rowH[rr] = s.h;
            });
            W = colW.reduce(function (a, b) { return a + b; }, 0) + gap * (cols - 1);
            H = rowH.reduce(function (a, b) { return a + b; }, 0) + gap * (rows - 1);
            sizes.forEach(function (s, i) {
                var cc = i % cols, rr = Math.floor(i / cols);
                var ox = 0; for (var k = 0; k < cc; k++) ox += colW[k] + gap;
                var oy = 0; for (var k2 = 0; k2 < rr; k2++) oy += rowH[k2] + gap;
                positions.push({
                    x: align === 'start' ? ox : align === 'end' ? ox + colW[cc] - s.w : ox + (colW[cc] - s.w) / 2,
                    y: align === 'start' ? oy : align === 'end' ? oy + rowH[rr] - s.h : oy + (rowH[rr] - s.h) / 2,
                    w: s.w, h: s.h
                });
            });
        }

        var cv = makeCanvas(Math.max(1, W), Math.max(1, H));
        var ctx = cv.getContext('2d');
        if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
        imgs.forEach(function (im, i) {
            var p = positions[i];
            ctx.drawImage(im, p.x, p.y, p.w, p.h);
        });
        return cv;
    };

    /* ============================================================
     * 5. 长图分割
     * ============================================================ */
    LAB.split = function (src, o) {
        o = o || {};
        var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
        var mode = o.mode || 'count';
        var n = mode === 'count' ? Math.max(2, o.count || 2)
            : Math.max(2, Math.ceil(h / Math.max(1, o.sliceHeight || 1000)));
        var ph = Math.ceil(h / n);
        var out = [];
        for (var i = 0; i < n; i++) {
            var sy = i * ph;
            var sh = Math.min(ph, h - sy);
            if (sh <= 0) break;
            var cv = makeCanvas(w, sh);
            cv.getContext('2d').drawImage(src, 0, sy, w, sh, 0, 0, w, sh);
            out.push(cv);
        }
        return out;
    };

    /* ============================================================
     * 6. 马赛克 / 打码
     * ============================================================ */
    LAB.mosaic = function (srcCanvas, o) {
        o = o || {};
        var w = srcCanvas.width, h = srcCanvas.height;
        var ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
        var im = ctx.getImageData(0, 0, w, h), d = im.data;
        var block = Math.max(2, o.block || 12);
        var regions = o.regions || null;   // [{x,y,w,h}] 归一化 0-1
        var full = !regions || !regions.length;

        function inRegion(px, py) {
            if (full) return true;
            for (var i = 0; i < regions.length; i++) {
                var r = regions[i];
                if (px >= r.x * w && px <= (r.x + r.w) * w && py >= r.y * h && py <= (r.y + r.h) * h) return true;
            }
            return false;
        }

        for (var by = 0; by < h; by += block) {
            for (var bx = 0; bx < w; bx += block) {
                var cx = bx + block / 2, cy = by + block / 2;
                if (!inRegion(cx, cy)) continue;
                // 取块内均值
                var sr = 0, sg = 0, sb = 0, sa = 0, cnt = 0;
                var ey = Math.min(by + block, h), ex = Math.min(bx + block, w);
                for (var y = by; y < ey; y++) {
                    for (var x = bx; x < ex; x++) {
                        var i4 = (y * w + x) * 4;
                        sr += d[i4]; sg += d[i4 + 1]; sb += d[i4 + 2]; sa += d[i4 + 3]; cnt++;
                    }
                }
                var ar = sr / cnt, ag = sg / cnt, ab = sb / cnt, aa = sa / cnt;
                for (var y2 = by; y2 < ey; y2++) {
                    for (var x2 = bx; x2 < ex; x2++) {
                        var i5 = (y2 * w + x2) * 4;
                        d[i5] = ar; d[i5 + 1] = ag; d[i5 + 2] = ab; d[i5 + 3] = aa;
                    }
                }
            }
        }
        ctx.putImageData(im, 0, 0);
        return srcCanvas;
    };

    /* ============================================================
     * 7. 去噪（保边：双边滤波近似）
     * ============================================================ */
    LAB.denoise = function (srcCanvas, strength) {
        strength = strength == null ? 3 : strength;
        var w = srcCanvas.width, h = srcCanvas.height;
        var ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
        var im = ctx.getImageData(0, 0, w, h), d = im.data;
        var src = new Uint8ClampedArray(d);
        var r = 1;
        var sigmaC = 30 + strength * 12;

        for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
                var idx = (y * w + x) * 4;
                var sumR = 0, sumG = 0, sumB = 0, wsum = 0;
                for (var dy = -r; dy <= r; dy++) {
                    for (var dx = -r; dx <= r; dx++) {
                        var nx = x + dx, ny = y + dy;
                        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
                        var nidx = (ny * w + nx) * 4;
                        var diff = Math.abs(src[nidx] - src[idx]) +
                            Math.abs(src[nidx + 1] - src[idx + 1]) +
                            Math.abs(src[nidx + 2] - src[idx + 2]);
                        var wc = Math.exp(-(diff * diff) / (2 * sigmaC * sigmaC));
                        var ww = wc / (1 + Math.abs(dx) + Math.abs(dy));
                        sumR += src[nidx] * ww; sumG += src[nidx + 1] * ww; sumB += src[nidx + 2] * ww;
                        wsum += ww;
                    }
                }
                if (wsum > 0) {
                    d[idx] = sumR / wsum; d[idx + 1] = sumG / wsum; d[idx + 2] = sumB / wsum;
                }
            }
        }
        ctx.putImageData(im, 0, 0);
        return srcCanvas;
    };

    /* ============================================================
     * 8. 老照片修复：自动色阶 + 去噪 + 轻微锐化
     * ============================================================ */
    LAB.restore = function (srcCanvas, o) {
        o = o || {};
        var w = srcCanvas.width, h = srcCanvas.height;
        var ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
        var im = ctx.getImageData(0, 0, w, h), d = im.data;

        // 自动色阶：按通道做 0.5% 裁剪拉伸
        if (o.autoLevel !== false) {
            for (var c = 0; c < 3; c++) {
                var hist = new Array(256).fill(0);
                for (var i = c; i < d.length; i += 4) hist[d[i]]++;
                var total = w * h, cut = total * 0.005, acc = 0, lo = 0, hi = 255;
                for (var v = 0; v < 256; v++) { acc += hist[v]; if (acc > cut) { lo = v; break; } }
                acc = 0;
                for (var v2 = 255; v2 >= 0; v2--) { acc += hist[v2]; if (acc > cut) { hi = v2; break; } }
                if (hi <= lo) continue;
                var span = hi - lo;
                for (var j = c; j < d.length; j += 4) {
                    d[j] = clamp255((d[j] - lo) * 255 / span);
                }
            }
            ctx.putImageData(im, 0, 0);
        }
        if (o.denoise) LAB.denoise(srcCanvas, o.denoise);
        if (o.sharpen) LAB.unsharpMask(srcCanvas, o.sharpen / 100);
        return srcCanvas;
    };

    /* ============================================================
     * 9. 高质量放大（Lanczos3）
     * ============================================================ */
    LAB.upscale = function (src, factor) {
        var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
        var nw = Math.round(w * factor), nh = Math.round(h * factor);
        var sctx = drawTo(src, w, h).getContext('2d', { willReadFrequently: true });
        var sd = sctx.getImageData(0, 0, w, h).data;
        var out = makeCanvas(nw, nh);
        var octx = out.getContext('2d', { willReadFrequently: true });
        var oim = octx.createImageData(nw, nh), od = oim.data;

        function lanczos(t, a) {
            if (t === 0) return 1;
            if (Math.abs(t) >= a) return 0;
            var pt = Math.PI * t;
            return a * Math.sin(pt) * Math.sin(pt / a) / (pt * pt);
        }
        var A = 3;
        var xScale = nw / w, yScale = nh / h;

        for (var y = 0; y < nh; y++) {
            var sy = (y + 0.5) / yScale - 0.5;
            var syi = Math.floor(sy);
            for (var x = 0; x < nw; x++) {
                var sx = (x + 0.5) / xScale - 0.5;
                var sxi = Math.floor(sx);
                var r = 0, g = 0, b = 0, a = 0, wsum = 0;
                for (var dy = -A + 1; dy <= A; dy++) {
                    var py = Math.min(h - 1, Math.max(0, syi + dy));
                    var wy = lanczos(sy - (syi + dy), A);
                    if (wy === 0) continue;
                    for (var dx = -A + 1; dx <= A; dx++) {
                        var px = Math.min(w - 1, Math.max(0, sxi + dx));
                        var wx = lanczos(sx - (sxi + dx), A);
                        if (wx === 0) continue;
                        var ww = wx * wy;
                        var i4 = (py * w + px) * 4;
                        r += sd[i4] * ww; g += sd[i4 + 1] * ww; b += sd[i4 + 2] * ww; a += sd[i4 + 3] * ww;
                        wsum += ww;
                    }
                }
                var oi = (y * nw + x) * 4;
                if (wsum > 0) {
                    od[oi] = clamp255(r / wsum);
                    od[oi + 1] = clamp255(g / wsum);
                    od[oi + 2] = clamp255(b / wsum);
                    od[oi + 3] = clamp255(a / wsum);
                } else { od[oi + 3] = 255; }
            }
        }
        octx.putImageData(oim, 0, 0);
        return out;
    };

    /* ============================================================
     * 10. 颜色提取（k-means）
     * ============================================================ */
    LAB.palette = function (srcCanvas, n) {
        n = n || 8;
        var w = srcCanvas.width, h = srcCanvas.height;
        var ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
        var d = ctx.getImageData(0, 0, w, h).data;
        var pts = [];
        var step = Math.max(1, Math.floor(Math.sqrt(w * h / 4000)));
        for (var y = 0; y < h; y += step) {
            for (var x = 0; x < w; x += step) {
                var i = (y * w + x) * 4;
                if (d[i + 3] < 128) continue;
                pts.push([d[i], d[i + 1], d[i + 2]]);
            }
        }
        if (!pts.length) return [];
        var cents = [];
        for (var k = 0; k < n; k++) cents.push(pts[Math.floor(Math.random() * pts.length)].slice());
        for (var it = 0; it < 12; it++) {
            var acc = cents.map(function () { return [0, 0, 0, 0]; });
            for (var p = 0; p < pts.length; p++) {
                var best = 0, bd = Infinity;
                for (var c = 0; c < n; c++) {
                    var dr = pts[p][0] - cents[c][0], dg = pts[p][1] - cents[c][1], db = pts[p][2] - cents[c][2];
                    var dd = dr * dr + dg * dg + db * db;
                    if (dd < bd) { bd = dd; best = c; }
                }
                acc[best][0] += pts[p][0]; acc[best][1] += pts[p][1]; acc[best][2] += pts[p][2]; acc[best][3]++;
            }
            for (var c2 = 0; c2 < n; c2++) {
                if (acc[c2][3]) cents[c2] = [acc[c2][0] / acc[c2][3], acc[c2][1] / acc[c2][3], acc[c2][2] / acc[c2][3]];
            }
        }
        // 按亮度排序
        return cents.map(function (c) {
            return {
                r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]),
                hex: rgb2hex(c[0], c[1], c[2])
            };
        }).sort(function (a, b) {
            return (0.299 * a.r + 0.587 * a.g + 0.114 * a.b) - (0.299 * b.r + 0.587 * b.g + 0.114 * b.b);
        });
    };

    function rgb2hex(r, g, b) {
        return '#' + [r, g, b].map(function (v) {
            var s = Math.round(v).toString(16);
            return s.length === 1 ? '0' + s : s;
        }).join('');
    }
    LAB.rgb2hex = rgb2hex;

    /* ============================================================
     * 11. EXIF 解析（只读关键字段 + 清除）
     * ============================================================ */
    LAB.parseExif = function (arrayBuffer) {
        var view = new DataView(arrayBuffer);
        if (view.byteLength < 4) return null;
        var offset = 0;
        if (view.getUint16(0) !== 0xFFD8) return null; // 仅 JPEG
        offset = 2;
        while (offset < view.byteLength) {
            if (view.getUint8(offset) !== 0xFF) { offset++; continue; }
            var marker = view.getUint8(offset + 1);
            if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { offset += 2; continue; }
            var size = view.getUint16(offset + 2);
            if (marker === 0xE1) {
                var str = '';
                for (var i = 0; i < 4; i++) str += String.fromCharCode(view.getUint8(offset + 4 + i));
                if (str === 'Exif') return parseTiff(view, offset + 10, size - 10);
            }
            if (marker === 0xDA) break;
            offset += 2 + size;
        }
        return null;
    };

    function parseTiff(view, start, len) {
        var result = {};
        try {
            var bo = view.getUint16(start);
            var le = bo === 0x4949;
            if (!le && bo !== 0x4D4D) return null;
            if (view.getUint16(start + 2, le) !== 0x002A) return null;
            var ifd = start + view.getUint32(start + 4, le);
            readIFD(view, ifd, start, le, result, 0);
        } catch (e) { return null; }
        return result;
    }

    var TAGS = {
        0x010F: '相机品牌', 0x0110: '相机型号', 0x0112: '方向', 0x011A: 'X分辨率',
        0x011B: 'Y分辨率', 0x0131: '软件', 0x0132: '拍摄时间', 0x013B: '作者',
        0x8298: '版权', 0x829A: '曝光时间', 0x829D: 'F值', 0x8822: '曝光程序',
        0x8827: 'ISO', 0x9003: '原始时间', 0x920A: '焦距', 0xA402: '曝光模式',
        0xA403: '白平衡', 0xA406: '场景类型', 0xA432: '镜头信息',
        0x8825: 'GPS', 0x9286: '用户注释'
    };

    function readIFD(view, ifd, tiffStart, le, out, depth) {
        if (depth > 3) return;
        var n = view.getUint16(ifd, le);
        for (var i = 0; i < n; i++) {
            var entry = ifd + 2 + i * 12;
            if (entry + 12 > view.byteLength) break;
            var tag = view.getUint16(entry, le);
            var type = view.getUint16(entry + 2, le);
            var count = view.getUint32(entry + 4, le);
            var name = TAGS[tag];
            if (!name) continue;
            var valOff = entry + 8;
            var val;
            try {
                if (type === 2) {
                    var s = '';
                    var base = count > 4 ? tiffStart + view.getUint32(valOff, le) : valOff;
                    for (var c = 0; c < count && c < 64; c++) {
                        var ch = view.getUint8(base + c);
                        if (ch === 0) break;
                        s += String.fromCharCode(ch);
                    }
                    val = s.trim();
                } else if (type === 3 && count === 1) val = view.getUint16(valOff, le);
                else if (type === 4 && count === 1) val = view.getUint32(valOff, le);
                else if (type === 5 && count === 1) {
                    var off = tiffStart + view.getUint32(valOff, le);
                    val = view.getUint32(off, le) + '/' + view.getUint32(off + 4, le);
                } else continue;
            } catch (e) { continue; }
            if (val !== '' && val != null) out[name] = val;
        }
        // GPS 子 IFD
        var nxt = view.getUint32(ifd + 2 + n * 12, le);
        if (nxt && depth < 2) readIFD(view, tiffStart + nxt, tiffStart, le, out, depth + 1);
    }

    /** 清除 EXIF：重绘到 canvas 再导出即可（canvas 导出天然不带 EXIF） */
    LAB.stripExif = function (src) {
        var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
        return drawTo(src, w, h);
    };

    /* ============================================================
     * 12. 极简 PDF 生成（嵌入 JPEG，无需依赖）
     * ============================================================ */
    LAB.toPDF = function (pages, o) {
        o = o || {};
        var pageW = o.width || 595.28, pageH = o.height || 841.89; // A4 pt
        var out = [];
        var header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
        out.push(header);

        var offsets = {};
        var pos = header.length;
        function pushObj(id, body) {
            offsets[id] = pos;
            var s = id + ' 0 obj\n' + body + '\nendobj\n';
            out.push(s);
            pos += s.length;
        }

        pushObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
        var kids = pages.map(function (_, i) { return (4 + i * 2) + ' 0 R'; }).join(' ');
        pushObj(2, '<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>');
        pushObj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

        pages.forEach(function (cv, i) {
            var pid = 4 + i * 2, iid = 5 + i * 2;
            // 等比适配页面
            var s = Math.min(pageW / cv.width, pageH / cv.height);
            var dw = cv.width * s, dh = cv.height * s;
            var dx = (pageW - dw) / 2, dy = (pageH - dh) / 2;
            pushObj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pageW.toFixed(2) + ' ' + pageH.toFixed(2) + ']' +
                ' /Resources << /XObject << /Im' + i + ' ' + iid + ' 0 R >> >>' +
                ' /Contents ' + (pid + 1) + ' 0 R >>');
            var content = 'q ' + dw.toFixed(2) + ' 0 0 ' + dh.toFixed(2) + ' ' + dx.toFixed(2) + ' ' + dy.toFixed(2) + ' cm /Im' + i + ' Do Q\n';
            pushObj(pid + 1, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
        });

        pages.forEach(function (cv, i) {
            var iid = 5 + i * 2;
            var jpeg = cv.toDataURL('image/jpeg', o.quality || 0.85);
            var bin = atob(jpeg.split(',')[1]);
            offsets[iid] = pos;
            var head = iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + cv.width +
                ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8' +
                ' /Filter /DCTDecode /Length ' + bin.length + ' >>\nstream\n';
            out.push(head);
            pos += head.length;
            // 分批转换：一次性 apply 整个数组在大图上会触发栈溢出
            var bytes = new Uint8Array(bin.length);
            for (var b = 0; b < bin.length; b++) bytes[b] = bin.charCodeAt(b);
            var CHUNK = 8192;
            for (var off = 0; off < bytes.length; off += CHUNK) {
                var slice = bytes.subarray(off, Math.min(off + CHUNK, bytes.length));
                out.push(String.fromCharCode.apply(null, slice));
            }
            pos += bin.length;
            var tail = '\nendstream\nendobj\n';
            out.push(tail);
            pos += tail.length;
        });

        var maxId = 4 + pages.length * 2 + 1;
        var xrefPos = pos;
        var xref = 'xref\n0 ' + (maxId) + '\n0000000000 65535 f \n';
        for (var id = 1; id < maxId; id++) {
            var off = offsets[id];
            xref += (off != null ? String(off).padStart(10, '0') : '0000000000') + ' 00000 n \n';
        }
        out.push(xref); pos += xref.length;
        var trailer = 'trailer\n<< /Size ' + maxId + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n';
        out.push(trailer); pos += trailer.length;

        // 生成 Blob（latin1 安全）
        var buf = new Uint8Array(pos);
        var p2 = 0;
        for (var ci = 0; ci < out.length; ci++) {
            var chunk = out[ci];
            for (var i = 0; i < chunk.length; i++) buf[p2++] = chunk.charCodeAt(i) & 0xFF;
        }
        return new Blob([buf.subarray(0, p2)], { type: 'application/pdf' });
    };

    /* ============================================================
     * 13. Base64
     * ============================================================ */
    LAB.toBase64 = function (cv, format, quality) {
        return cv.toDataURL('image/' + (format || 'png'), quality == null ? 0.92 : quality);
    };
    LAB.fromBase64 = function (dataUrl) {
        return new Promise(function (res, rej) {
            var im = new Image();
            im.onload = function () { res(im); };
            im.onerror = function () { rej(new Error('Base64 解析失败')); };
            im.src = dataUrl;
        });
    };

    /* ============================================================
     * 14. 下载
     * ============================================================ */
    LAB.downloadCanvas = function (cv, filename, format, quality) {
        return new Promise(function (res) {
            cv.toBlob(function (blob) {
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = filename;
                document.body.appendChild(a); a.click();
                document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                res();
            }, 'image/' + (format || 'png'), quality == null ? 0.92 : quality);
        });
    };

    LAB.downloadBlob = function (blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };

    global.Lab = LAB;
})(window);
