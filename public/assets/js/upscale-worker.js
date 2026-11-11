/* PicStudio V70.5 — 后台分块 Lanczos3 重采样
 * 不占用主线程：计算在 Worker 内进行，按输出行分块，块间让出事件循环，
 * 因此页面始终可响应、可显示进度、可取消；中间缓存只保留一个行块。
 * 中英文站共用这一份文件，避免再出现「只改一边」的不同步。
 */
'use strict';

var A = 3, TAP = 2 * A;
var MAX_PIXELS = 40000000;   /* 输出硬上限 4000 万像素（约 160MB RGBA） */
var job = null;

function lanczos(t, a) {
    if (t === 0) return 1;
    if (Math.abs(t) >= a) return 0;
    var pt = Math.PI * t;
    return a * Math.sin(pt) * Math.sin(pt / a) / (pt * pt);
}
function clampIdx(v, hi) { return v < 0 ? 0 : (v > hi ? hi : v); }

self.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.type === 'cancel') {
        if (job) job.cancelled = true;
        return;
    }
    if (m.type !== 'start') return;
    try { start(m); }
    catch (e) { self.postMessage({ type: 'error', message: String(e && e.message || e) }); }
};

function start(m) {
    var w = m.w, h = m.h, nw = m.nw, nh = m.nh;
    if (!(w > 0 && h > 0 && nw > 0 && nh > 0)) throw new Error('INVALID_SIZE');
    if (nw * nh > MAX_PIXELS) throw new Error('OUT_TOO_LARGE');

    var sd = new Uint8ClampedArray(m.buffer);
    var xScale = nw / w, yScale = nh / h;

    /* 水平 / 垂直权重各预计算一次 */
    var hW = new Float32Array(nw * TAP), hI = new Int32Array(nw * TAP), hS = new Float32Array(nw);
    var vW = new Float32Array(nh * TAP), vI = new Int32Array(nh * TAP), vS = new Float32Array(nh);
    var x, y, k;
    for (x = 0; x < nw; x++) {
        var sx = (x + 0.5) / xScale - 0.5, sxi = Math.floor(sx), s = 0;
        for (k = 0; k < TAP; k++) {
            var dx = -A + 1 + k, wx = lanczos(sx - (sxi + dx), A);
            hW[x * TAP + k] = wx; hI[x * TAP + k] = clampIdx(sxi + dx, w - 1); s += wx;
        }
        hS[x] = s;
    }
    for (y = 0; y < nh; y++) {
        var sy = (y + 0.5) / yScale - 0.5, syi = Math.floor(sy), s2 = 0;
        for (k = 0; k < TAP; k++) {
            var dy = -A + 1 + k, wy = lanczos(sy - (syi + dy), A);
            vW[y * TAP + k] = wy; vI[y * TAP + k] = clampIdx(syi + dy, h - 1); s2 += wy;
        }
        vS[y] = s2;
    }

    /* 每块约 40 万输出像素，中间缓存只占几 MB */
    var tileRows = Math.max(8, Math.min(64, Math.floor(400000 / nw) || 8));

    job = {
        w: w, h: h, nw: nw, nh: nh, sd: sd, yScale: yScale,
        hW: hW, hI: hI, hS: hS, vW: vW, vI: vI, vS: vS,
        out: new Uint8ClampedArray(nw * nh * 4),
        tileRows: tileRows, y: 0, cancelled: false
    };
    step();
}

function step() {
    var j = job;
    if (!j || j.cancelled) return;
    var y0 = j.y, y1 = Math.min(j.nh, y0 + j.tileRows);

    /* 本块输出行所需的源行范围：syi + (-A+1 .. A) */
    var syFirst = (y0 + 0.5) / j.yScale - 0.5;
    var syLast = (y1 - 1 + 0.5) / j.yScale - 0.5;
    var srcMin = Math.max(0, Math.floor(syFirst) - A + 1);
    var srcMax = Math.min(j.h - 1, Math.floor(syLast) + A);
    var rows = srcMax - srcMin + 1;

    /* 第一趟：仅对这块源行做水平重采样 */
    var tmp = new Float32Array(rows * j.nw * 4);
    for (var ry = 0; ry < rows; ry++) {
        var srow = (srcMin + ry) * j.w * 4, trow = ry * j.nw * 4;
        for (var x = 0; x < j.nw; x++) {
            var ws = j.hS[x], o = trow + x * 4;
            if (ws > 0) {
                var r = 0, g = 0, b = 0, aa = 0;
                for (var k = 0; k < TAP; k++) {
                    var wt = j.hW[x * TAP + k];
                    if (wt === 0) continue;
                    var si = srow + j.hI[x * TAP + k] * 4;
                    r += j.sd[si] * wt; g += j.sd[si + 1] * wt; b += j.sd[si + 2] * wt; aa += j.sd[si + 3] * wt;
                }
                tmp[o] = r / ws; tmp[o + 1] = g / ws; tmp[o + 2] = b / ws; tmp[o + 3] = aa / ws;
            } else { tmp[o + 3] = 255; }
        }
    }

    /* 第二趟：块内输出行做垂直重采样，直接写入最终结果 */
    for (var y = y0; y < y1; y++) {
        var ws2 = j.vS[y], orow = y * j.nw * 4;
        for (var x2 = 0; x2 < j.nw; x2++) {
            var oi = orow + x2 * 4;
            if (ws2 > 0) {
                var r2 = 0, g2 = 0, b2 = 0, a2 = 0;
                for (var k2 = 0; k2 < TAP; k2++) {
                    var wt2 = j.vW[y * TAP + k2];
                    if (wt2 === 0) continue;
                    var ri = j.vI[y * TAP + k2] - srcMin;
                    if (ri < 0 || ri >= rows) continue;
                    var ti = ri * j.nw * 4 + x2 * 4;
                    r2 += tmp[ti] * wt2; g2 += tmp[ti + 1] * wt2; b2 += tmp[ti + 2] * wt2; a2 += tmp[ti + 3] * wt2;
                }
                j.out[oi] = r2 / ws2; j.out[oi + 1] = g2 / ws2; j.out[oi + 2] = b2 / ws2; j.out[oi + 3] = a2 / ws2;
            } else { j.out[oi + 3] = 255; }
        }
    }

    j.y = y1;
    self.postMessage({ type: 'progress', pct: Math.round(y1 / j.nh * 100) });

    if (y1 < j.nh) {
        setTimeout(step, 0);          /* 让出，使 cancel 消息能被处理 */
    } else {
        self.postMessage({ type: 'done', buffer: j.out.buffer, nw: j.nw, nh: j.nh }, [j.out.buffer]);
        job = null;
    }
}
