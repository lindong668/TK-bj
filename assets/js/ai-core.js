/* ============================================================
 * ai-core.js — PicStudio AI 引擎
 * 真正的神经网络抠图 / 人像分割，浏览器端运行，图片不上传
 *
 * 三层降级：
 *   L1  MODNet / U2Net (Transformers.js, ONNX Runtime Web)
 *   L2  MediaPipe Selfie Segmentation
 *   L3  本地 GrabCut + 边缘细化（algo-seg.js，永不失效）
 * ============================================================ */

(function (global) {
    'use strict';

    /* ---------- 模型源配置 ----------
     * 优先使用站点自托管（国内访问最稳），失败后依次降级。
     * 自托管方法见 /models/README.md
     */
    var MODEL_SOURCES = {
        transformers: [
            'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2',
            'https://unpkg.com/@xenova/transformers@2.17.2',
            'https://fastly.jsdelivr.net/npm/@xenova/transformers@2.17.2'
        ],
        mediapipe: [
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14',
            'https://unpkg.com/@mediapipe/tasks-vision@0.10.14'
        ]
    };

    // 模型仓库（可自托管：把模型文件放到 /models/modnet/ 下）
    var MODEL_REPO = 'Xenova/modnet';

    var state = {
        transformers: null,   // 已加载的模块
        pipeline: null,       // 已实例化的分割管线
        mpSegmenter: null,    // MediaPipe 分割器
        loading: null,        // 进行中的加载 Promise
        engine: null,         // 实际使用的引擎名
        error: null,
        settled: false,       // 探测是否已结束（结束即永久缓存，不再重复尝试）
        probe: null           // 探测 Promise（全程只跑一次）
    };

    function log() {
        if (global.console && global.console.debug) {
            global.console.debug.apply(global.console, ['[ai-core]'].concat([].slice.call(arguments)));
        }
    }

    /* ---------- 工具：带超时的 Promise ---------- */
    function withTimeout(promise, ms, label) {
        return new Promise(function (resolve, reject) {
            var t = setTimeout(function () {
                reject(new Error((label || '操作') + '超时（' + Math.round(ms / 1000) + '秒）'));
            }, ms);
            promise.then(function (v) { clearTimeout(t); resolve(v); },
                function (e) { clearTimeout(t); reject(e); });
        });
    }

    /* ---------- 工具：依次尝试多个 CDN ---------- */
    function tryImport(urls, timeoutMs) {
        var i = 0;
        function next() {
            if (i >= urls.length) return Promise.reject(new Error('全部 CDN 均不可用'));
            var url = urls[i++];
            log('尝试加载', url);
            return withTimeout(
                import(/* webpackIgnore: true */ url).catch(function () {
                    return fetch(url).then(function (r) { return r.text(); })
                        .then(function (code) { return (0, eval)(code + '\n;undefined'); });
                }),
                timeoutMs, '模块加载'
            ).catch(function (e) {
                log('失败:', url, e && e.message);
                return next();
            });
        }
        return next();
    }

    /* ============================================================
     * L1  Transformers.js (MODNet)
     * ============================================================ */
    function loadTransformers(onProgress) {
        if (state.pipeline) return Promise.resolve(state.pipeline);
        if (state.loading) return state.loading;

        state.loading = tryImport(MODEL_SOURCES.transformers, 8000)
            .then(function (mod) {
                log('Transformers.js 已加载');
                if (mod.env) {
                    mod.env.allowLocalModels = false;
                    mod.env.allowRemoteModels = true;
                }
                state.transformers = mod;
                if (onProgress) onProgress('正在下载 AI 模型（首次约 5-25MB）…');
                return withTimeout(
                    mod.pipeline('image-segmentation', MODEL_REPO, {
                        progress_callback: function (p) {
                            if (onProgress && p && p.status === 'progress' && p.total) {
                                var pct = Math.round((p.loaded || 0) / p.total * 100);
                                onProgress('正在下载 AI 模型… ' + pct + '%');
                            }
                        }
                    }),
                    120000, '模型下载'
                );
            })
            .then(function (pipe) {
                state.pipeline = pipe;
                state.engine = 'modnet';
                state.loading = null;
                log('AI 模型就绪');
                return pipe;
            })
            .catch(function (e) {
                state.loading = null;
                state.error = e && e.message;
                log('Transformers.js 不可用:', e && e.message);
                throw e;
            });

        return state.loading;
    }

    /* ============================================================
     * L2  MediaPipe Selfie Segmentation
     * ============================================================ */
    function loadMediaPipe(onProgress) {
        if (state.mpSegmenter) return Promise.resolve(state.mpSegmenter);
        return tryImport(MODEL_SOURCES.mediapipe, 8000).then(function (mod) {
            if (onProgress) onProgress('正在加载轻量分割模型…');
            var fileset = mod.FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
            );
            return withTimeout(fileset, 12000, 'WASM 加载').then(function (vision) {
                return withTimeout(
                    mod.ImageSegmenter.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath:
                                'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',
                            delegate: 'GPU'
                        },
                        runningMode: 'IMAGE',
                        outputCategoryMasks: true
                    }),
                    20000, '分割器初始化'
                );
            });
        }).then(function (seg) {
            state.mpSegmenter = seg;
            state.engine = 'mediapipe';
            log('MediaPipe 就绪');
            return seg;
        }).catch(function (e) {
            log('MediaPipe 不可用:', e && e.message);
            throw e;
        });
    }

    /* ============================================================
     * 统一入口：初始化 AI（自动选引擎）
     * @returns {Promise<string>} 引擎名：'modnet' | 'mediapipe' | 'local'
     * ============================================================ */
    /**
     * 探测可用引擎。
     * 关键：无论成功还是失败，探测只跑一次并永久缓存结果。
     * 否则每次点击处理都会重新尝试加载 CDN，在网络不通时会卡满超时（表现为「点了没反应」）。
     */
    function init(onProgress) {
        if (state.settled) return Promise.resolve(state.engine || 'local');
        if (state.probe) return state.probe;

        state.probe = loadTransformers(onProgress)
            .then(function () { return 'modnet'; })
            .catch(function () {
                if (onProgress) onProgress('高级模型不可用，改用轻量人像模型…');
                return loadMediaPipe(onProgress)
                    .then(function () { return 'mediapipe'; })
                    .catch(function () {
                        if (onProgress) onProgress('AI 模型不可用，使用本地算法');
                        state.engine = 'local';
                        return 'local';
                    });
            })
            .then(function (eng) {
                state.engine = eng;
                state.settled = true;
                log('引擎确定：', eng);
                return eng;
            })
            .catch(function (e) {
                state.engine = 'local';
                state.settled = true;
                state.error = e && e.message;
                return 'local';
            });

        return state.probe;
    }

    /** 后台预热：不阻塞，失败也无所谓 */
    function warm(onProgress) {
        try { init(onProgress).catch(function () { }); }
        catch (e) { /* 忽略 */ }
    }

    /** 手动重试（用户点「重新加载 AI 模型」时用） */
    function reset() {
        state.probe = null;
        state.settled = false;
        state.engine = null;
        state.error = null;
        state.pipeline = null;
        state.mpSegmenter = null;
        state.loading = null;
    }

    /** AI 是否真的可用（modnet / mediapipe） */
    function aiAvailable() {
        return !!((state.engine === 'modnet' && state.pipeline) ||
                  (state.engine === 'mediapipe' && state.mpSegmenter));
    }

    /* ============================================================
     * 主体分割：返回 alpha mask（Uint8ClampedArray, 0=背景 255=主体）
     * ============================================================ */
    function segment(source, opts) {
        opts = opts || {};
        var onProgress = opts.onProgress || function () { };

        return init(onProgress).then(function (engine) {
            if (engine === 'modnet') return segmentByModnet(source, onProgress);
            if (engine === 'mediapipe') return segmentByMediaPipe(source, onProgress);
            return segmentLocal(source, opts);
        });
    }

    function toImageData(source) {
        // source 可以是 HTMLImageElement / HTMLCanvasElement / ImageBitmap
        var w = source.naturalWidth || source.width;
        var h = source.naturalHeight || source.height;
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(source, 0, 0);
        return ctx.getImageData(0, 0, w, h);
    }

    /* --- MODNet --- */
    function segmentByModnet(source, onProgress) {
        onProgress('AI 正在分析主体…');
        // 大图先降采样加速推理，再放大 mask
        var maxSide = 1024;
        var w = source.naturalWidth || source.width;
        var h = source.naturalHeight || source.height;
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var sw = Math.max(8, Math.round(w * scale));
        var sh = Math.max(8, Math.round(h * scale));

        var cv = document.createElement('canvas');
        cv.width = sw; cv.height = sh;
        var ctx = cv.getContext('2d');
        ctx.drawImage(source, 0, 0, sw, sh);

        return withTimeout(state.pipeline(cv.toDataURL('image/png')), 90000, 'AI 推理')
            .then(function (out) {
                var maskSmall = extractMask(out, sw, sh);
                if (!maskSmall) throw new Error('模型输出解析失败');
                // 放大回原尺寸
                return upsampleMask(maskSmall, sw, sh, w, h);
            });
    }

    function extractMask(out, w, h) {
        // transformers.js image-segmentation 输出：[{ score, label, mask }]
        if (!Array.isArray(out) || !out.length) return null;
        var m = out[0] && out[0].mask;
        if (!m) return null;
        // mask 可能是 RawImage / canvas / { data, width, height }
        if (m.data && m.width && m.height) {
            var src = m.data, mw = m.width, mh = m.height;
            var alpha = new Uint8ClampedArray(mw * mh);
            // RawImage 通常是 RGBA，取 alpha 通道或亮度
            if (src.length === mw * mh * 4) {
                for (var i = 0, j = 3; i < alpha.length; i++ , j += 4) {
                    alpha[i] = src[j] !== undefined ? src[j] : src[i * 4];
                }
            } else if (src.length === mw * mh) {
                for (var k = 0; k < alpha.length; k++) alpha[k] = src[k];
            } else {
                return null;
            }
            return { data: alpha, width: mw, height: mh };
        }
        // mask 是 canvas（部分版本）
        if (m.width && m.height && m.getContext) {
            var c2 = document.createElement('canvas');
            c2.width = w; c2.height = h;
            var x2 = c2.getContext('2d', { willReadFrequently: true });
            x2.drawImage(m, 0, 0, w, h);
            var im = x2.getImageData(0, 0, w, h);
            var a2 = new Uint8ClampedArray(w * h);
            for (var p = 0; p < a2.length; p++) a2[p] = im.data[p * 4];
            return { data: a2, width: w, height: h };
        }
        return null;
    }

    /* --- MediaPipe --- */
    function segmentByMediaPipe(source, onProgress) {
        onProgress('正在分割人像…');
        var w = source.naturalWidth || source.width;
        var h = source.naturalHeight || source.height;
        var res = state.mpSegmenter.segment(source);
        var cm = res && res.categoryMask;
        if (!cm) throw new Error('分割失败');
        var mw = cm.width, mh = cm.height;
        var vals = cm.getAsFloat32Array ? cm.getAsFloat32Array() : null;
        var alpha;
        if (vals) {
            alpha = new Uint8ClampedArray(mw * mh);
            for (var i = 0; i < alpha.length; i++) alpha[i] = vals[i] > 0.5 ? 255 : 0;
        } else {
            var cv = document.createElement('canvas');
            cv.width = mw; cv.height = mh;
            var cx = cv.getContext('2d', { willReadFrequently: true });
            cx.drawImage(cm, 0, 0);
            var im = cx.getImageData(0, 0, mw, mh);
            alpha = new Uint8ClampedArray(mw * mh);
            for (var j = 0; j < alpha.length; j++) alpha[j] = im.data[j * 4] > 128 ? 255 : 0;
        }
        return Promise.resolve(upsampleMask({ data: alpha, width: mw, height: mh }, mw, mh, w, h));
    }

    /* --- 本地降级 --- */
    function segmentLocal(source, opts) {
        var im = toImageData(source);
        if (global.AlgoSeg && global.AlgoSeg.segmentAlpha) {
            var r = global.AlgoSeg.segmentAlpha(im.data, im.width, im.height, {
                tolerance: (opts && opts.tolerance) || 45,
                feather: (opts && opts.feather) || 1
            });
            return Promise.resolve({ data: r.mask || r, width: im.width, height: im.height });
        }
        if (global.AlgoSeg && global.AlgoSeg.floodFillBackground) {
            var m2 = global.AlgoSeg.floodFillBackground(im.data, im.width, im.height,
                (opts && opts.tolerance) || 45);
            return Promise.resolve({ data: m2, width: im.width, height: im.height });
        }
        throw new Error('本地算法不可用');
    }

    /* --- mask 上采样（双线性 + 平滑） --- */
    function upsampleMask(mask, sw, sh, W, H) {
        if (sw === W && sh === H) return { data: mask.data, width: W, height: H };
        var out = new Uint8ClampedArray(W * H);
        var xr = sw / W, yr = sh / H;
        for (var y = 0; y < H; y++) {
            var sy = Math.min(sh - 1, Math.max(0, y * yr));
            var y0 = Math.floor(sy), y1 = Math.min(sh - 1, y0 + 1), fy = sy - y0;
            for (var x = 0; x < W; x++) {
                var sx = Math.min(sw - 1, Math.max(0, x * xr));
                var x0 = Math.floor(sx), x1 = Math.min(sw - 1, x0 + 1), fx = sx - x0;
                var a = mask.data[y0 * sw + x0], b = mask.data[y0 * sw + x1];
                var c = mask.data[y1 * sw + x0], d = mask.data[y1 * sw + x1];
                var v = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
                out[y * W + x] = v;
            }
        }
        return { data: out, width: W, height: H };
    }

    /* ============================================================
     * 把 mask 应用到原图 → 透明背景 canvas
     * ============================================================ */
    function applyMask(source, mask, opts) {
        opts = opts || {};
        var w = source.naturalWidth || source.width;
        var h = source.naturalHeight || source.height;
        var im = toImageData(source);
        var d = im.data, m = mask.data;
        var feather = opts.feather || 0;      // 边缘羽化半径
        var bg = opts.background;             // '#ffffff' | 'transparent' | null
        var out = new ImageData(w, h);
        var od = out.data;

        var mm = m;
        if (feather > 0 && global.AlgoSeg && global.AlgoSeg.refineAlpha) {
            mm = global.AlgoSeg.refineAlpha(d, w, h, m, feather);
        }

        for (var i = 0, p = 0; i < d.length; i += 4, p++) {
            var a = mm[p] / 255;
            od[i] = d[i]; od[i + 1] = d[i + 1]; od[i + 2] = d[i + 2];
            od[i + 3] = Math.round(a * 255);
        }

        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        if (bg && bg !== 'transparent') {
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);
        }
        ctx.putImageData(out, 0, 0);
        return cv;
    }

    /* ============================================================
     * 人像虚化：只对背景模糊
     * ============================================================ */
    function portraitBlur(source, opts) {
        opts = opts || {};
        var strength = opts.strength || 15;
        return segment(source, { onProgress: opts.onProgress })
            .then(function (mask) {
                var w = source.naturalWidth || source.width;
                var h = source.naturalHeight || source.height;
                var im = toImageData(source);

                // 背景层：整图模糊
                var bgCv = document.createElement('canvas');
                bgCv.width = w; bgCv.height = h;
                var bctx = bgCv.getContext('2d', { willReadFrequently: true });
                bctx.putImageData(im, 0, 0);
                if (global.AlgoSeg && global.AlgoSeg.boxBlur) {
                    global.AlgoSeg.boxBlur(bgCv, strength);
                } else {
                    bctx.filter = 'blur(' + (strength / 3) + 'px)';
                    bctx.drawImage(bgCv, 0, 0);
                    bctx.filter = 'none';
                }
                var bg = bctx.getImageData(0, 0, w, h);

                // 主体层：原图
                var fg = im;
                var out = new ImageData(w, h);
                var od = out.data, bd = bg.data, fd = fg.data, m = mask.data;

                var mm = m;
                if (opts.feather && global.AlgoSeg && global.AlgoSeg.refineAlpha) {
                    mm = global.AlgoSeg.refineAlpha(fd, w, h, m, opts.feather);
                }

                for (var i = 0, p = 0; i < od.length; i += 4, p++) {
                    var a = mm[p] / 255;
                    od[i] = fd[i] * a + bd[i] * (1 - a);
                    od[i + 1] = fd[i + 1] * a + bd[i + 1] * (1 - a);
                    od[i + 2] = fd[i + 2] * a + bd[i + 2] * (1 - a);
                    od[i + 3] = 255;
                }
                var cv = document.createElement('canvas');
                cv.width = w; cv.height = h;
                cv.getContext('2d').putImageData(out, 0, 0);
                return cv;
            });
    }

    global.AILab = {
        init: init,
        warm: warm,
        reset: reset,
        segment: segment,
        applyMask: applyMask,
        portraitBlur: portraitBlur,
        getEngine: function () { return state.engine || 'local'; },
        getError: function () { return state.error; },
        isSettled: function () { return state.settled; },
        aiAvailable: aiAvailable,
        MODEL_SOURCES: MODEL_SOURCES
    };
})(window);
