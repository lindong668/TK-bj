/* */

(function (global) {
    'use strict';

    var LAB = {};

    /* */
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

    /* */
    LAB.fitSide = function (img, maxSide) {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var s = Math.min(1, maxSide / Math.max(w, h));
        if (s >= 1) return { canvas: drawTo(img, w, h), ratio: 1 };
        return { canvas: drawTo(img, Math.round(w * s), Math.round(h * s)), ratio: s };
    };

    /* */
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

        
        var cf = (259 * (contra + 255)) / (255 * (259 - contra));
        
        var sf = sat >= 0 ? 1 + sat / 100 * 2 : 1 + sat / 100;
        
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

        
        if (p.sharpen > 0) LAB.unsharpMask(srcCanvas, p.sharpen / 100);
        
        if (p.vignette > 0) LAB.vignette(srcCanvas, p.vignette / 100);

        return srcCanvas;
    };

    function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
    LAB.clamp255 = clamp255;

    /* */
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

    /* */
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

    /* */
    function boxBlurRGB(cv, radius) {
        radius = Math.max(1, Math.round(radius));
        var w = cv.width, h = cv.height;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        var im = ctx.getImageData(0, 0, w, h), d = im.data;
        var tmp = new Uint8ClampedArray(d.length);
        
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

    /* */
    LAB.watermark = function (srcCanvas, o) {
        var w = srcCanvas.width, h = srcCanvas.height;
        var cv = makeCanvas(w, h);
        var ctx = cv.getContext('2d');
        ctx.drawImage(srcCanvas, 0, 0);

        o = o || {};
        var mode = o.mode || 'text';       // text | image
        var opacity = o.opacity == null ? 0.35 : o.opacity;
        var pos = o.position || 'tile';    // tl tc tr ml mc mr bl bc br center tile
        var scale = o.scale || 1;
        var pad = Math.max(10, Math.round(Math.min(w, h) * 0.035));

        var color = o.color || '#ffffff';
        var stroke = (o.outline === false) ? null : contrastColor(color);

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
                var pt = anchorPoint(pos, w, h, iw, ih, pad);
                if (o.rotate) {
                    ctx.translate(pt.x + iw / 2, pt.y + ih / 2);
                    ctx.rotate(o.rotate * Math.PI / 180);
                    ctx.translate(-(pt.x + iw / 2), -(pt.y + ih / 2));
                }
                ctx.drawImage(o.image, pt.x, pt.y, iw, ih);
            }
        } else {
            var text = o.text || 'PicStudio';
            var fs = Math.max(12, Math.round(Math.min(w, h) / 18 * scale));
            ctx.font = (o.bold ? 'bold ' : '') + fs + 'px "PingFang SC","Microsoft YaHei",sans-serif';
            ctx.fillStyle = color;
            ctx.textBaseline = 'middle';
            if (stroke) {
                ctx.strokeStyle = stroke;
                ctx.lineWidth = Math.max(1, Math.round(fs / 10));
                ctx.lineJoin = 'round';
                ctx.miterLimit = 2;
            }

            if (pos === 'tile') {
                ctx.translate(w / 2, h / 2);
                ctx.rotate((o.rotate || -30) * Math.PI / 180);
                ctx.translate(-w, -h);
                var tw = ctx.measureText(text).width;
                var stepX = tw + fs * 1.6, stepY = fs * 3;
                for (var y4 = 0; y4 < h * 2.2; y4 += stepY) {
                    for (var x4 = 0; x4 < w * 2.2; x4 += stepX) {
                        if (stroke) ctx.strokeText(text, x4, y4);
                        ctx.fillText(text, x4, y4);
                    }
                }
            } else {
                var tw2 = ctx.measureText(text).width;
                var p2 = anchorPoint(pos, w, h, tw2, fs, pad);
                var bx = p2.x, by = p2.y + fs / 2;
                if (o.rotate) {
                    ctx.translate(bx + tw2 / 2, by);
                    ctx.rotate(o.rotate * Math.PI / 180);
                    ctx.translate(-(bx + tw2 / 2), -by);
                }
                if (stroke) ctx.strokeText(text, bx, by);
                ctx.fillText(text, bx, by);
            }
        }
        ctx.restore();
        return cv;
    };

    /* */
    function anchorPoint(pos, w, h, iw, ih, pad) {
        var x, y;
        switch (pos) {
            case 'tl': case 'ml': case 'bl': x = pad; break;
            case 'tr': case 'mr': case 'br': x = w - iw - pad; break;
            default: x = (w - iw) / 2;
        }
        switch (pos) {
            case 'tl': case 'tc': case 'tr': y = pad; break;
            case 'bl': case 'bc': case 'br': y = h - ih - pad; break;
            default: y = (h - ih) / 2;
        }
        return { x: x, y: y };
    }
    LAB.anchorPoint = anchorPoint;

    /* */
    function contrastColor(hex) {
        var c = String(hex || '').replace('#', '').trim();
        if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
        if (!/^[0-9a-fA-F]{6}$/.test(c)) return 'rgba(0,0,0,0.6)';
        var r = parseInt(c.substr(0, 2), 16),
            g = parseInt(c.substr(2, 2), 16),
            b = parseInt(c.substr(4, 2), 16);
        var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return lum > 0.5 ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.65)';
    }
    LAB.contrastColor = contrastColor;

    /* */
    LAB.PRESETS = [
        { id: 'wechat-avatar', name: 'WeChat avatar', w: 640, h: 640, ratio: 1 },
        { id: 'wechat-moment', name: 'WeChat Moments', w: 1080, h: 1080, ratio: 1 },
        { id: 'xhs', name: 'Xiaohongshu', w: 1080, h: 1440, ratio: 0.75 },
        { id: 'xhs-cover', name: 'Xiaohongshu cover', w: 1080, h: 1440, ratio: 0.75 },
        { id: 'douyin', name: 'Douyin cover', w: 1080, h: 1260, ratio: 0.857 },
        { id: 'taobao', name: 'Taobao main image', w: 800, h: 800, ratio: 1 },
        { id: 'youtube', name: 'YouTube thumbnail', w: 1280, h: 720, ratio: 16 / 9 },
        { id: 'instagram', name: 'Instagram square', w: 1080, h: 1080, ratio: 1 },
        { id: 'story', name: 'Vertical story 9:16', w: 1080, h: 1920, ratio: 9 / 16 },
        { id: 'wallpaper', name: 'Phone wallpaper 9:19.5', w: 1080, h: 2340, ratio: 1080 / 2340 },
        { id: 'id1', name: '295×413 (25×35mm)', w: 295, h: 413, ratio: 295 / 413 },
        { id: 'id2', name: '413×579 (35×49mm)', w: 413, h: 579, ratio: 413 / 579 },
        { id: 'a4', name: 'A4 landscape 300 dpi', w: 2480, h: 3508, ratio: 2480 / 3508 },
        { id: 'banner', name: 'Banner 16:9', w: 1920, h: 1080, ratio: 16 / 9 }
    ];

    /* */
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

    /* */
    LAB.gradientCanvas = function (w, h, c1, c2) {
        var cv = makeCanvas(w, h);
        var ctx = cv.getContext('2d');
        var g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, c1);
        g.addColorStop(1, c2);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        return cv;
    };

    /* */
    LAB.composeOn = function (fg, tw, th, bgSpec) {
        var w = fg.naturalWidth || fg.width, h = fg.naturalHeight || fg.height;
        if (!w || !h) return makeCanvas(tw, th);
        var s = Math.min(tw / w, th / h);
        var dw = Math.round(w * s), dh = Math.round(h * s);

        
        var cv;
        if (typeof bgSpec === 'object' && bgSpec && bgSpec.type === 'gradient') {
            cv = LAB.gradientCanvas(tw, th, bgSpec.from, bgSpec.to);
        } else {
            cv = makeCanvas(tw, th);
            var ctx = cv.getContext('2d');
            ctx.fillStyle = (typeof bgSpec === 'string' && bgSpec) ? bgSpec : '#ffffff';
            ctx.fillRect(0, 0, tw, th);
        }
        cv.getContext('2d').drawImage(fg,
            Math.round((tw - dw) / 2), Math.round((th - dh) / 2), dw, dh);
        return cv;
    };

    /* */
    LAB.cropTo = function (src, tw, th, pad) {
        var ratio = tw / th;
        var c = LAB.cropRatio(src, ratio);
        if (pad) {
            
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

    /* */
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
            /* */
            var rows = Math.ceil(imgs.length / cols);
            var cellW = Math.max.apply(null, sizes.map(function (s) { return s.w; }));
            var cellH = Math.max.apply(null, sizes.map(function (s) { return s.h; }));
            /* */
            if (o.square) { cellW = cellH = Math.max(cellW, cellH); }

            W = cellW * cols + gap * (cols - 1);
            H = cellH * rows + gap * (rows - 1);

            sizes.forEach(function (s, i) {
                var cc = i % cols, rr = Math.floor(i / cols);
                var ox = cc * (cellW + gap);
                var oy = rr * (cellH + gap);
                /* */
                var sc = Math.max(cellW / s.w, cellH / s.h);
                var dw = s.w * sc, dh = s.h * sc;
                positions.push({
                    x: ox + (cellW - dw) / 2,
                    y: oy + (cellH - dh) / 2,
                    w: dw, h: dh,
                    /* */
                    clipX: ox, clipY: oy, clipW: cellW, clipH: cellH
                });
            });
        }

        var cv = makeCanvas(Math.max(1, W), Math.max(1, H));
        var ctx = cv.getContext('2d');
        if (bg !== 'transparent') { ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
        imgs.forEach(function (im, i) {
            var p = positions[i];
            if (p.clipW) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(p.clipX, p.clipY, p.clipW, p.clipH);
                ctx.clip();
                ctx.drawImage(im, p.x, p.y, p.w, p.h);
                ctx.restore();
            } else {
                ctx.drawImage(im, p.x, p.y, p.w, p.h);
            }
        });
        return cv;
    };

    /* */
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

    /* */
    LAB.mosaic = function (srcCanvas, o) {
        o = o || {};
        var w = srcCanvas.width, h = srcCanvas.height;
        var ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
        var im = ctx.getImageData(0, 0, w, h), d = im.data;
        var block = Math.max(2, o.block || 12);
        var regions = o.regions || null;   
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

    /* */
    /* */
    LAB.flattenForJpeg = function (cv, bgColor) {
        if (!cv || !cv.width || !cv.height) return cv;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        var w = cv.width, h = cv.height;
        
        var step = Math.max(1, Math.floor(Math.min(w, h) / 60));
        var need = false;
        try {
            var probe = ctx.getImageData(0, 0, w, h).data;
            for (var y = 0; y < h && !need; y += step) {
                for (var x = 0; x < w; x += step) {
                    if (probe[(y * w + x) * 4 + 3] < 250) { need = true; break; }
                }
            }
        } catch (e) { return cv; }
        if (!need) return cv;

        var out = makeCanvas(w, h);
        var octx = out.getContext('2d');
        octx.fillStyle = bgColor || '#ffffff';
        octx.fillRect(0, 0, w, h);
        octx.drawImage(cv, 0, 0);
        return out;
    };

    /* */
    /* */
    var DENOISE_MAX_SIDE = 1400;

    LAB.denoise = function (srcCanvas, strength) {
        strength = strength == null ? 3 : strength;
        var fullW = srcCanvas.width, fullH = srcCanvas.height;
        var work = srcCanvas, scale = 1;
        if (Math.max(fullW, fullH) > DENOISE_MAX_SIDE) {
            scale = DENOISE_MAX_SIDE / Math.max(fullW, fullH);
            var ww = Math.max(1, Math.round(fullW * scale));
            var wh = Math.max(1, Math.round(fullH * scale));
            work = makeCanvas(ww, wh);
            var wc = work.getContext('2d', { willReadFrequently: true });
            wc.imageSmoothingEnabled = true;
            wc.imageSmoothingQuality = 'high';
            wc.drawImage(srcCanvas, 0, 0, ww, wh);
        }
        var w = work.width, h = work.height;
        var ctx = work.getContext('2d', { willReadFrequently: true });
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
        if (scale < 1) {
            /* */
            var back = srcCanvas.getContext('2d', { willReadFrequently: true });
            back.imageSmoothingEnabled = true;
            back.imageSmoothingQuality = 'high';
            back.drawImage(work, 0, 0, fullW, fullH);
            work.width = 0; work.height = 0;
        }
        if (scale < 1) return srcCanvas;
        return work;
    };

    /* */
    LAB.restore = function (srcCanvas, o) {
        o = o || {};
        var w = srcCanvas.width, h = srcCanvas.height;
        var ctx = srcCanvas.getContext('2d', { willReadFrequently: true });
        var im = ctx.getImageData(0, 0, w, h), d = im.data;

        
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

    /* */
    /* V70.5：放大计算移入后台 Worker，主线程只负责 UI。
     * 中英两份 lab.js 的这一段由同一模板生成，逐字一致。 */
    var _upscaleJob = null;
    LAB.upscale = function (src, factor, onProgress) {
        var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
        var nw = Math.round(w * factor), nh = Math.round(h * factor);
        if (!(w > 0 && h > 0) || nw * nh > 40000000) {
            return Promise.reject(new Error('ERR_TOO_LARGE'));
        }
        var sctx = drawTo(src, w, h).getContext('2d', { willReadFrequently: true });
        var sd = sctx.getImageData(0, 0, w, h).data;
        return new Promise(function (resolve, reject) {
            var worker;
            try { worker = new Worker('/assets/js/upscale-worker.js?v=20261111f'); }
            catch (e) { reject(new Error('ERR_NO_WORKER')); return; }
            var settled = false;
            function cleanup() {
                if (_upscaleJob && _upscaleJob.worker === worker) _upscaleJob = null;
                try { worker.terminate(); } catch (e2) {}
            }
            _upscaleJob = {
                worker: worker,
                cancel: function () {
                    if (settled) return;
                    settled = true;
                    try { worker.postMessage({ type: 'cancel' }); } catch (e3) {}
                    cleanup();
                    reject(new Error('CANCELLED'));
                }
            };
            worker.onmessage = function (ev) {
                var m = ev.data || {};
                if (m.type === 'progress') {
                    if (onProgress) { try { onProgress(m.pct); } catch (e4) {} }
                    return;
                }
                if (m.type === 'error') {
                    if (settled) return;
                    settled = true; cleanup();
                    reject(new Error(m.message === 'OUT_TOO_LARGE' ? 'ERR_TOO_LARGE' : 'ERR_WORKER_FAIL'));
                    return;
                }
                if (m.type === 'done') {
                    if (settled) return;
                    settled = true;
                    var out = makeCanvas(m.nw, m.nh);
                    out.getContext('2d').putImageData(
                        new ImageData(new Uint8ClampedArray(m.buffer), m.nw, m.nh), 0, 0);
                    cleanup(); resolve(out);
                }
            };
            worker.onerror = function () {
                if (settled) return;
                settled = true; cleanup();
                reject(new Error('ERR_WORKER_FAIL'));
            };
            try {
                worker.postMessage(
                    { type: 'start', w: w, h: h, nw: nw, nh: nh, buffer: sd.buffer },
                    [sd.buffer]);
            } catch (e5) {
                if (settled) return;
                settled = true; cleanup();
                reject(new Error('ERR_START_FAIL'));
            }
        });
    };
    LAB.cancelUpscale = function () { if (_upscaleJob) _upscaleJob.cancel(); };
    /* */
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

    /* */
    LAB.parseExif = function (arrayBuffer) {
        var view = new DataView(arrayBuffer);
        if (view.byteLength < 4) return null;
        var offset = 0;
        if (view.getUint16(0) !== 0xFFD8) return null; 
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
        0x010F: 'Camera make', 0x0110: 'Camera model', 0x0112: 'Orientation', 0x011A: 'X resolution',
        0x011B: 'Y resolution', 0x0131: 'Software', 0x0132: 'Capture time', 0x013B: 'Author',
        0x8298: 'Copyright', 0x829A: 'Exposure time', 0x829D: 'F-number', 0x8822: 'Exposure program',
        0x8827: 'ISO', 0x9003: 'Original time', 0x920A: 'Focal length', 0xA402: 'Exposure mode',
        0xA403: 'White balance', 0xA406: 'Scene type', 0xA432: 'Lens info',
        0x8825: 'GPS', 0x9286: 'User comment'
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
        
        var nxt = view.getUint32(ifd + 2 + n * 12, le);
        if (nxt && depth < 2) readIFD(view, tiffStart + nxt, tiffStart, le, out, depth + 1);
    }

    /* */
    LAB.stripExif = function (src) {
        var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
        return drawTo(src, w, h);
    };

    /* */
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
            var jpeg = LAB.flattenForJpeg(cv).toDataURL('image/jpeg', o.quality || 0.85);
            var bin = atob(jpeg.split(',')[1]);
            offsets[iid] = pos;
            var head = iid + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + cv.width +
                ' /Height ' + cv.height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8' +
                ' /Filter /DCTDecode /Length ' + bin.length + ' >>\nstream\n';
            out.push(head);
            pos += head.length;
            
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
            im.onerror = function () { rej(new Error('Base64 decoding failed')); };
            im.src = dataUrl;
        });
    };

    /* */
    LAB.downloadCanvas = function (cv, filename, format, quality) {
        var mime = 'image/' + (format || 'png');
        if (window.__download) {
            window.__download(cv, filename, mime, quality == null ? 0.92 : quality);
            return Promise.resolve();
        }
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
        if (window.__download) {
            window.__download(blob, filename, blob.type || 'image/png');
            return;
        }
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    };

    /* */
    LAB.detectFlatBg = function (src, opts) {
        opts = opts || {};
        var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
        if (!w || !h) return null;
        var sw = Math.min(w, 160), sh = Math.round(h * (sw / w));
        var c = makeCanvas(sw, sh);
        c.getContext('2d').drawImage(src, 0, 0, sw, sh);
        var d;
        try { d = c.getContext('2d').getImageData(0, 0, sw, sh).data; }
        catch (e) { return null; }

        /* */
        var band = Math.max(2, Math.round(Math.min(sw, sh) * 0.06));
        var samples = [];
        var xi, yi, o;
        for (yi = 0; yi < sh; yi++) {
            for (xi = 0; xi < sw; xi++) {
                var edge = (xi < band || xi >= sw - band || yi < band || yi >= sh - band);
                if (!edge) continue;
                o = (yi * sw + xi) * 4;
                samples.push(d[o], d[o + 1], d[o + 2]);
            }
        }
        if (samples.length < 30) return null;

        /* */
        var km = kmeansLite(samples, 3, 6);
        var top = 0, topN = -1, i2;
        for (i2 = 0; i2 < km.k; i2++) if (km.counts[i2] > topN) { topN = km.counts[i2]; top = i2; }
        var c3 = top * 3;
        var br = km.centers[c3], bg = km.centers[c3 + 1], bb = km.centers[c3 + 2];

        var near = 0, totN = samples.length / 3;
        for (i2 = 0; i2 < samples.length; i2 += 3) {
            var dr = samples[i2] - br, dg = samples[i2 + 1] - bg, db = samples[i2 + 2] - bb;
            if (dr * dr + dg * dg + db * db < 40 * 40) near++;
        }
        var ratio = near / totN;
        /* */
        if (ratio < 0.72) return null;

        return { r: br, g: bg, b: bb, ratio: ratio };
    };

    /* */
    LAB.detectIdBg = function (src, opts) {
        opts = opts || {};
        var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
        if (!w || !h) return null;
        var sw = Math.min(w, 200), sh = Math.max(1, Math.round(h * (sw / w)));
        var c = makeCanvas(sw, sh);
        var cx = c.getContext('2d');
        cx.drawImage(src, 0, 0, sw, sh);
        var d;
        try { d = cx.getImageData(0, 0, sw, sh).data; }
        catch (e) { return null; }

        var thr2 = 0;
        var N = sw * sh;

        /* */
        function probe(sx, sy, tolOverride) {
            var tol = tolOverride || opts.tolerance || 42;
            sx = Math.min(Math.max(sx | 0, 0), sw - 1);
            sy = Math.min(Math.max(sy | 0, 0), sh - 1);
            var so = (sy * sw + sx) * 4;
            var br = d[so], bg2 = d[so + 1], bb = d[so + 2];
            thr2 = tol * tol;
            var mask = new Uint8Array(N), seen = new Uint8Array(N);
            var stack = new Int32Array(N), sp = 0;
            stack[sp++] = sy * sw + sx; seen[sy * sw + sx] = 1;
            var area = 0, touchTop = false;
            while (sp > 0) {
                var idx = stack[--sp];
                if (mask[idx]) continue;
                var o2 = idx * 4;
                var dr = d[o2] - br, dg = d[o2 + 1] - bg2, db = d[o2 + 2] - bb;
                if (dr * dr + dg * dg + db * db > thr2) continue;
                mask[idx] = 1; area++;
                var xi2 = idx % sw, yi2 = (idx / sw) | 0;
                if (yi2 <= 1) touchTop = true;
                if (xi2 > 0) { var lf = idx - 1; if (!mask[lf] && !seen[lf]) { seen[lf] = 1; stack[sp++] = lf; } }
                if (xi2 < sw - 1) { var rt = idx + 1; if (!mask[rt] && !seen[rt]) { seen[rt] = 1; stack[sp++] = rt; } }
                if (yi2 > 0) { var up = idx - sw; if (!mask[up] && !seen[up]) { seen[up] = 1; stack[sp++] = up; } }
                if (yi2 < sh - 1) { var dn = idx + sw; if (!mask[dn] && !seen[dn]) { seen[dn] = 1; stack[sp++] = dn; } }
            }
            return { area: area, top: touchTop, r: br, g: bg2, b: bb };
        }

        var m = Math.max(2, Math.round(Math.min(sw, sh) * 0.09));
        var pts = [
            [m, m], [sw - 1 - m, m],                       
            [sw >> 1, 1], [sw >> 2, 1], [(sw * 3) >> 2, 1], 
            [m, sh - 1 - m], [sw - 1 - m, sh - 1 - m]       
        ];
        var best = null, i4;
        for (i4 = 0; i4 < pts.length; i4++) {
            var r0 = probe(pts[i4][0], pts[i4][1]);
            /* */
            if (!r0.top || r0.area < N * 0.12) continue;
            if (!best || r0.area > best.area) best = r0;
        }
        if (!best) return null;
        /* */
        if (best.area < N * 0.18) {
            var best2 = null;
            for (i4 = 0; i4 < pts.length; i4++) {
                var r1 = probe(pts[i4][0], pts[i4][1], 58);
                if (!r1.top || r1.area < N * 0.12) continue;
                if (!best2 || r1.area > best2.area) best2 = r1;
            }
            if (best2 && best2.area > best.area) best = best2;
        }
        return { r: best.r, g: best.g, b: best.b, ratio: best.area / N };
    };

    /* */
    LAB.faceGuard = function (src, w, h) {
        /* */
        var iw = src.naturalWidth || src.width || w;
        var ih = src.naturalHeight || src.height || h;
        if (!iw || !ih) return null;
        var sw = Math.min(iw, 220), sh = Math.max(1, Math.round(ih * (sw / iw)));
        var c = makeCanvas(sw, sh);
        var cx = c.getContext('2d');
        cx.drawImage(src, 0, 0, sw, sh);
        var d;
        try { d = cx.getImageData(0, 0, sw, sh).data; }
        catch (e) { return null; }
        var N = sw * sh, i, o;

        /* */
        var skin = new Uint8Array(N);
        for (i = 0; i < N; i++) {
            o = i * 4;
            var r0 = d[o], g0 = d[o + 1], b0 = d[o + 2];
            var cb = 128 - 0.168736 * r0 - 0.331264 * g0 + 0.5 * b0;
            var cr = 128 + 0.5 * r0 - 0.418688 * g0 - 0.081312 * b0;
            if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) skin[i] = 1;
        }

        /* */
        var lim = Math.round(sh * 0.55);
        var seen = new Uint8Array(N);
        var bestN = 0, bestSumX = 0, bestSumY = 0, bestMinY = 1e9, bestMaxY = -1,
            bestMinX = 1e9, bestMaxX = -1;
        var queue = new Int32Array(N);
        for (i = 0; i < N; i++) {
            if (!skin[i] || seen[i]) continue;
            var yy = (i / sw) | 0;
            if (yy >= lim) continue;
            var sp = 0, cnt = 0, sx = 0, sy = 0, mny = 1e9, mxy = -1, mnx = 1e9, mxx = -1;
            queue[sp++] = i; seen[i] = 1;
            while (sp > 0) {
                var idx = queue[--sp];
                var xi = idx % sw, yi = (idx / sw) | 0;
                cnt++; sx += xi; sy += yi;
                if (yi < mny) mny = yi; if (yi > mxy) mxy = yi;
                if (xi < mnx) mnx = xi; if (xi > mxx) mxx = xi;
                if (xi > 0) { var lf = idx - 1; if (skin[lf] && !seen[lf]) { seen[lf] = 1; queue[sp++] = lf; } }
                if (xi < sw - 1) { var rt2 = idx + 1; if (skin[rt2] && !seen[rt2]) { seen[rt2] = 1; queue[sp++] = rt2; } }
                if (yi > 0) { var upv = idx - sw; if (skin[upv] && !seen[upv]) { seen[upv] = 1; queue[sp++] = upv; } }
                if (yi < lim - 1) { var dnv = idx + sw; if (skin[dnv] && !seen[dnv]) { seen[dnv] = 1; queue[sp++] = dnv; } }
            }
            if (cnt > bestN) {
                bestN = cnt; bestSumX = sx / cnt; bestSumY = sy / cnt;
                bestMinY = mny; bestMaxY = mxy; bestMinX = mnx; bestMaxX = mxx;
            }
        }
        /* */
        if (bestN < N * 0.008) return null;

        var fx = bestSumX / sw, fw = (bestMaxX - bestMinX) / sw;
        var faceTop = bestMinY / sh, faceBottom = bestMaxY / sh;
        var fh = (bestMaxY - bestMinY) / sh;
        /* */
        if (fw <= 0.05 || fh <= 0.05) return null;
        return { fx: fx, fw: fw, faceTop: faceTop, faceBottom: faceBottom, fh: fh };
    };

    /* */
    LAB.shrinkHQ = function (src, sx, sy, sw, sh, dw, dh) {
        if (!sw || !sh || !dw || !dh) return null;
        var cur = makeCanvas(sw, sh);
        var cc = cur.getContext('2d');
        cc.imageSmoothingEnabled = true; cc.imageSmoothingQuality = 'high';
        cc.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
        var cw = sw, ch = sh;
        while (cw > dw * 2 && ch > dh * 2) {
            var nw = Math.max(dw, cw >> 1), nh = Math.max(dh, ch >> 1);
            var nx = makeCanvas(nw, nh);
            var nc = nx.getContext('2d');
            nc.imageSmoothingEnabled = true; nc.imageSmoothingQuality = 'high';
            nc.drawImage(cur, 0, 0, cw, ch, 0, 0, nw, nh);
            cur = nx; cw = nw; ch = nh;
        }
        if (cw !== dw || ch !== dh) {
            var fx = makeCanvas(dw, dh);
            var fc = fx.getContext('2d');
            fc.imageSmoothingEnabled = true; fc.imageSmoothingQuality = 'high';
            fc.drawImage(cur, 0, 0, cw, ch, 0, 0, dw, dh);
            cur = fx;
        }
        return cur;
    };

    /* */
    LAB.replaceBg = function (src, bgRGB, targetSpec, opts) {
        opts = opts || {};
        var w = src.naturalWidth || src.width, h = src.naturalHeight || src.height;
        var tol = opts.tolerance || 46;
        var cv = makeCanvas(w, h);
        var ctx = cv.getContext('2d');
        ctx.drawImage(src, 0, 0);
        var img;
        try { img = ctx.getImageData(0, 0, w, h); }
        catch (e) { return cv; }
        var d = img.data, N = w * h;

        /* */
        var br = bgRGB.r, bgg = bgRGB.g, bb = bgRGB.b;
        var thr2 = tol * tol;
        var TOL_LOCAL = 30, TOL_MAX = 115;
        var thrL = TOL_LOCAL * TOL_LOCAL, thrM = TOL_MAX * TOL_MAX;
        var i3, x, y, idx;

        /* */
        var block = null;
        if (opts.guard) {
            var gf0 = opts.guard;
            block = new Uint8Array(N);
            var by0 = Math.max(0, Math.round((gf0.faceBottom - gf0.fh * 0.05) * h));
            var by1 = Math.min(h, Math.round((gf0.faceBottom + gf0.fh * 1.10) * h));
            var bcx = Math.round(gf0.fx * w);
            for (var by = by0; by < by1; by++) {
                var bgt = (by1 > by0) ? (by - by0) / (by1 - by0) : 0;
                var bhw = Math.round(gf0.fw * w * (0.62 + 0.50 * bgt) / 2);
                var bx0 = Math.max(0, bcx - bhw), bx1 = Math.min(w, bcx + bhw);
                for (var bx = bx0; bx < bx1; bx++) block[by * w + bx] = 1;
            }
        }

        var mask = new Uint8Array(N);
        var stack = new Int32Array(N);
        var sp = 0;

        /* */
        var bgR = new Float32Array(N), bgG = new Float32Array(N), bgB = new Float32Array(N);

        function pushSeed(i) {
            if (mask[i] || (block && block[i])) return;
            var o = i * 4;
            var sr = d[o] - br, sg = d[o + 1] - bgg, sb = d[o + 2] - bb;
            if (sr * sr + sg * sg + sb * sb > thr2) return;
            mask[i] = 1; stack[sp++] = i;
            bgR[i] = d[o]; bgG[i] = d[o + 1]; bgB[i] = d[o + 2];
        }
        function tryGrow(n, pr, pg, pb) {
            if (mask[n] || (block && block[n])) return;
            var o = n * 4;
            var lr = d[o] - pr, lg = d[o + 1] - pg, lb = d[o + 2] - pb;
            if (lr * lr + lg * lg + lb * lb > thrL) return;
            var gr2 = d[o] - br, gg2 = d[o + 1] - bgg, gb2 = d[o + 2] - bb;
            if (gr2 * gr2 + gg2 * gg2 + gb2 * gb2 > thrM) return;
            mask[n] = 1; stack[sp++] = n;
            bgR[n] = pr; bgG[n] = pg; bgB[n] = pb;
        }
        for (x = 0; x < w; x++) { pushSeed(x); pushSeed((h - 1) * w + x); }
        for (y = 0; y < h; y++) { pushSeed(y * w); pushSeed(y * w + (w - 1)); }

        while (sp > 0) {
            idx = stack[--sp];
            var o2 = idx * 4;
            var pr = d[o2], pg = d[o2 + 1], pb = d[o2 + 2];
            var xi2 = idx % w, yi2 = (idx / w) | 0;
            if (xi2 > 0) tryGrow(idx - 1, pr, pg, pb);
            if (xi2 < w - 1) tryGrow(idx + 1, pr, pg, pb);
            if (yi2 > 0) tryGrow(idx - w, pr, pg, pb);
            if (yi2 < h - 1) tryGrow(idx + w, pr, pg, pb);
        }

        /* */
        {
            var added = 0;
            for (y = 2; y < h - 2; y++) {
                for (x = 2; x < w - 2; x++) {
                    idx = y * w + x;
                    if (mask[idx] || (block && block[idx])) continue;
                    var nb = (mask[idx - 1] ? 1 : 0) + (mask[idx + 1] ? 1 : 0) +
                             (mask[idx - w] ? 1 : 0) + (mask[idx + w] ? 1 : 0) +
                             (mask[idx - w - 1] ? 1 : 0) + (mask[idx - w + 1] ? 1 : 0) +
                             (mask[idx + w - 1] ? 1 : 0) + (mask[idx + w + 1] ? 1 : 0);
                    if (nb < 6) continue;
                    /* */
                    var un = 0;
                    for (var uy = -2; uy <= 2; uy++) {
                        var urow = (y + uy) * w + x;
                        for (var ux = -2; ux <= 2; ux++) if (!mask[urow + ux]) un++;
                    }
                    if (un >= 10) continue;
                    var o4 = idx * 4;
                    var e1 = d[o4] - br, e2 = d[o4 + 1] - bgg, e3 = d[o4 + 2] - bb;
                    if (e1 * e1 + e2 * e2 + e3 * e3 <= thr2) {
                        mask[idx] = 1; added++;
                        bgR[idx] = d[o4]; bgG[idx] = d[o4 + 1]; bgB[idx] = d[o4 + 2];
                    }
                }
            }
        }

        /* */
        var cnt = 0;
        for (i3 = 0; i3 < N; i3++) if (mask[i3]) cnt++;
        if (cnt > N * 0.88) return null;

        /* */
        var soft = featherMask(mask, w, h, Math.max(1, Math.round(Math.min(w, h) / 220)));
        /* */
        var fRad = Math.max(2, Math.round(Math.min(w, h) / 220) * 3);
        var softR = featherField(bgR, mask, w, h, fRad, br);
        var softG = featherField(bgG, mask, w, h, fRad, bgg);
        var softB = featherField(bgB, mask, w, h, fRad, bb);

        /* */
        var bgCv = makeCanvas(w, h);
        var bx = bgCv.getContext('2d');
        /* */
        if (targetSpec && typeof targetSpec === 'object' && targetSpec.type === 'gradient') {
            var g = bx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, targetSpec.from);
            g.addColorStop(1, targetSpec.to);
            bx.fillStyle = g;
        } else if (typeof targetSpec === 'string' && targetSpec) {
            bx.fillStyle = targetSpec;
        } else {
            bx.fillStyle = (targetSpec && targetSpec.color) ? targetSpec.color : '#ffffff';
        }
        bx.fillRect(0, 0, w, h);
        var bd = bx.getImageData(0, 0, w, h).data;

        /* */
        /* */
        var skinPx = new Uint8Array(N);
        for (i3 = 0; i3 < N; i3++) {
            var so = i3 * 4, sr0 = d[so], sg0 = d[so + 1], sb0 = d[so + 2];
            var scb = 128 - 0.168736 * sr0 - 0.331264 * sg0 + 0.5 * sb0;
            var scr = 128 + 0.5 * sr0 - 0.418688 * sg0 - 0.081312 * sb0;
            if (scb >= 77 && scb <= 127 && scr >= 133 && scr <= 173) skinPx[i3] = 1;
        }

        for (i3 = 0; i3 < N; i3++) {
            var a = soft[i3];
            if (a <= 0) continue;
            if (skinPx[i3] && a > 0.12) a = 0.12;
            var o3 = i3 * 4;
            var nr = d[o3] + a * (bd[o3] - softR[i3]);
            var ng = d[o3 + 1] + a * (bd[o3 + 1] - softG[i3]);
            var nb = d[o3 + 2] + a * (bd[o3 + 2] - softB[i3]);
            d[o3] = nr < 0 ? 0 : (nr > 255 ? 255 : nr);
            d[o3 + 1] = ng < 0 ? 0 : (ng > 255 ? 255 : ng);
            d[o3 + 2] = nb < 0 ? 0 : (nb > 255 ? 255 : nb);
        }
        ctx.putImageData(img, 0, 0);

        /* */
        cv.__bgMask = soft;
        cv.__maskW = w;
        cv.__maskH = h;
        return cv;
    };

    /* */
    function featherMask(mask, w, h, r) {
        if (r <= 0) {
            var f0 = new Float32Array(w * h);
            for (var i = 0; i < w * h; i++) f0[i] = mask[i];
            return f0;
        }
        var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
        var x, y, i, sum, cnt;
        for (y = 0; y < h; y++) {
            sum = 0; cnt = 0;
            for (x = 0; x < w; x++) {
                var idx = y * w + x;
                if (mask[idx]) { sum += 1; cnt++; }
                var xo = x - r - 1;
                if (xo >= 0 && mask[y * w + xo]) { sum -= 1; cnt--; }
                tmp[idx] = cnt ? sum / cnt : 0;
            }
        }
        for (x = 0; x < w; x++) {
            sum = 0; cnt = 0;
            for (y = 0; y < h; y++) {
                var id2 = y * w + x;
                sum += tmp[id2]; cnt++;
                var yo = y - r - 1;
                if (yo >= 0) { sum -= tmp[yo * w + x]; cnt--; }
                out[id2] = cnt ? sum / cnt : 0;
            }
        }
        return out;
    }

    /* */
    function featherField(field, valid, w, h, r, fallback) {
        var out = new Float32Array(w * h);
        if (r <= 0) {
            for (var q = 0; q < w * h; q++) out[q] = valid[q] ? field[q] : fallback;
            return out;
        }
        var tmpS = new Float32Array(w * h), tmpC = new Float32Array(w * h);
        var x, y, i, idx;
        for (y = 0; y < h; y++) {
            var sum = 0, cnt = 0;
            for (x = 0; x < w; x++) {
                idx = y * w + x;
                if (valid[idx]) { sum += field[idx]; cnt++; }
                var xo = x - r - 1;
                if (xo >= 0 && valid[y * w + xo]) { sum -= field[y * w + xo]; cnt--; }
                tmpS[idx] = sum; tmpC[idx] = cnt;
            }
        }
        for (x = 0; x < w; x++) {
            var s2 = 0, c2 = 0;
            for (y = 0; y < h; y++) {
                idx = y * w + x;
                s2 += tmpS[idx]; c2 += tmpC[idx];
                var yo = y - r - 1;
                if (yo >= 0) { s2 -= tmpS[yo * w + x]; c2 -= tmpC[yo * w + x]; }
                out[idx] = c2 > 0 ? (s2 / c2) : fallback;
            }
        }
        return out;
    }
    LAB.featherField = featherField;

    /* */
    function kmeansLite(data, k, iters) {
        var n = data.length / 3;
        var centers = new Float64Array(k * 3);
        var counts = new Int32Array(k);
        var i, c;
        for (c = 0; c < k; c++) {
            var pick = Math.floor(n * (c + 0.5) / k) * 3;
            centers[c * 3] = data[pick]; centers[c * 3 + 1] = data[pick + 1]; centers[c * 3 + 2] = data[pick + 2];
        }
        var assign = new Int32Array(n);
        for (var it = 0; it < (iters || 6); it++) {
            for (i = 0; i < n; i++) {
                var o = i * 3, best = Infinity, bc = 0;
                for (c = 0; c < k; c++) {
                    var c3 = c * 3;
                    var dr = data[o] - centers[c3], dg = data[o + 1] - centers[c3 + 1], db = data[o + 2] - centers[c3 + 2];
                    var d2 = dr * dr + dg * dg + db * db;
                    if (d2 < best) { best = d2; bc = c; }
                }
                assign[i] = bc;
            }
            var sx = new Float64Array(k * 3); counts.fill(0);
            for (i = 0; i < n; i++) {
                var cc = assign[i] * 3, oo = i * 3;
                sx[cc] += data[oo]; sx[cc + 1] += data[oo + 1]; sx[cc + 2] += data[oo + 2];
                counts[assign[i]]++;
            }
            for (c = 0; c < k; c++) {
                if (counts[c]) {
                    centers[c * 3] = sx[c * 3] / counts[c];
                    centers[c * 3 + 1] = sx[c * 3 + 1] / counts[c];
                    centers[c * 3 + 2] = sx[c * 3 + 2] / counts[c];
                }
            }
        }
        return { centers: centers, counts: counts, k: k };
    }

    global.Lab = LAB;
})(window);
