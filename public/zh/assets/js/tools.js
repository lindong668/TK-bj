// ==================== Common Tool Functions ====================

/**
 * Initialize a tool page with upload, preview, and processing
 * @param {Object} config
 * @param {string} config.toolName - Name of the tool
 * @param {Function} config.process - Processing function (canvas) => Promise<canvas>
 * @param {Function} config.renderControls - Function to render control UI
 * @param {Object} config.downloadOptions - { filename, format, quality }
 */
class ImageTool {
    /** 本地逐像素运算的性能上限：单边最大像素数 */
    static MAX_SIDE = 3000;

    constructor(config) {
        this.originalWidth = 0;
        this.originalHeight = 0;
        this.downscaleRatio = 1;
        this.config = config;
        this.originalImage = null;
        this.originalCanvas = null;
        this.processedCanvas = null;
        this.isProcessing = false;

        this.initElements();
        this.bindEvents();
    }

    initElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.previewArea = document.getElementById('previewArea');
        this.controls = document.getElementById('controls');
        this.downloadSection = document.getElementById('downloadSection');
        this.originalPreview = document.getElementById('originalPreview');
        this.processedPreview = document.getElementById('processedPreview');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.loadingOverlay = document.getElementById('loadingOverlay');
    }

    bindEvents() {
        // Click to upload
        this.uploadArea.addEventListener('click', () => this.fileInput.click());

        // Drag and drop
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) this.handleFile(file);
        });

        // File input change
        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.handleFile(file);
        });

        // Download
        this.downloadBtn.addEventListener('click', () => this.download());
    }

    async handleFile(file) {
        try {
            const loaded = await PSImage.load(file);
            this.originalImage = loaded.source;
            this.showPreview(loaded);
            this.showControls();
            if (loaded.viaWasm && typeof this.onHeifDecoded === 'function') {
                this.onHeifDecoded(loaded);
            }
        } catch (err) {
            console.error('[PicCalc] load failed', err);
            alert((window.PSLang && PSLang.get() === 'zh')
                ? '无法读取这张图片，请确认它是图片文件（视频、RAW、损坏文件不支持）。'
                : 'Cannot read this image: ' + err.message + '\nVideos, RAW files and broken files are not supported.');
        }
    }

    showPreview(loaded) {
        // loaded: { source, src, width, height, kind, viaWasm } from PSImage.load
        const img = loaded.source;
        this.originalPreview.src = loaded.src;

        // ---- 大图保护：超过上限先降采样，避免逐像素运算把浏览器卡死 ----
        const rawW = loaded.width;
        const rawH = loaded.height;
        const w = Math.min(rawW, ImageTool.MAX_SIDE);
        const h = Math.min(rawH, ImageTool.MAX_SIDE);

        let scale = 1;
        if (rawW > w || rawH > h) {
            scale = Math.min(w / rawW, h / rawH);
        }
        this.originalWidth = rawW;
        this.originalHeight = rawH;
        this.downscaleRatio = scale;
        const canvasW = scale < 1 ? Math.round(rawW * scale) : rawW;
        const canvasH = scale < 1 ? Math.round(rawH * scale) : rawH;

        // Create original canvas
        this.originalCanvas = document.createElement('canvas');
        this.originalCanvas.width = canvasW;
        this.originalCanvas.height = canvasH;
        const ctx = this.originalCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvasW, canvasH);

        // 提示用户图片已被缩放（诚实告知，避免输出尺寸与预期不符）
        if (scale < 1 && this.downscaleNotice) {
            this.downscaleNotice(
                `图片较大，已自动缩放到 ${canvasW} × ${canvasH} 进行处理（原图 ${rawW} × ${rawH}）。` +
                `若需要原始尺寸输出，请先用「尺寸调整」工具分步处理。`
            );
        }

        // Show preview area
        this.previewArea.classList.add('active');
    }

    /**
     * 供工具页自定义提示方式（页面可在 new ImageTool({...}) 后覆盖）
     */
    downscaleNotice(msg) {
        console.info('[PicCalc] ' + msg);
    }

    showControls() {
        if (this.config.renderControls) {
            this.config.renderControls(this);
        }
        this.controls.classList.add('active');
    }

    async process() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.showLoading(true);

        try {
            const result = await this.config.process(this.originalCanvas, this);

            if (result instanceof HTMLCanvasElement) {
                this.processedCanvas = result;
                this.processedPreview.src = result.toDataURL();
            } else if (typeof result === 'string') {
                this.processedPreview.src = result;
                // Create canvas from data URL
                const img = new Image();
                img.onload = () => {
                    this.processedCanvas = document.createElement('canvas');
                    this.processedCanvas.width = img.naturalWidth;
                    this.processedCanvas.height = img.naturalHeight;
                    this.processedCanvas.getContext('2d').drawImage(img, 0, 0);
                };
                img.src = result;
            }

            this.downloadSection.classList.add('active');
        } catch (err) {
            console.error('Processing error:', err);
            alert('处理失败，请换一张图片后重试');
        } finally {
            this.isProcessing = false;
            this.showLoading(false);
        }
    }

    download() {
        const opts = this.config.downloadOptions || {};
        const format = opts.format || 'png';
        const quality = opts.quality || 0.92;
        const filename = opts.filename || 'piccalc-result';

        if (!this.processedCanvas) return;

        /* 全站统一出口：iOS 用保存面板，桌面/Android 静默下载 */
        if (window.__download) {
            const mime = 'image/' + (format === 'jpg' ? 'jpeg' : format);
            window.__download(this.processedCanvas, `${filename}.${format}`, mime, quality);
            return;
        }

        const link = document.createElement('a');
        link.download = `${filename}.${format}`;
        link.href = this.processedCanvas.toDataURL(`image/${format}`, quality);
        link.click();
    }

    showLoading(show) {
        if (show) {
            this.loadingOverlay.classList.add('active');
        } else {
            this.loadingOverlay.classList.remove('active');
        }
    }

    // Helper: get control value by id
    getValue(id) {
        const el = document.getElementById(id);
        return el ? el.value : null;
    }

    getNumberValue(id, defaultVal = 0) {
        const el = document.getElementById(id);
        if (!el) return defaultVal;
        const val = parseFloat(el.value);
        return isNaN(val) ? defaultVal : val;
    }
}

// ==================== Image Processing Utilities ====================

const ImageUtils = {
    /**
     * Get image data from canvas
     */
    getImageData(canvas) {
        return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    },

    /**
     * Put image data to canvas
     */
    putImageData(canvas, imageData) {
        canvas.getContext('2d').putImageData(imageData, 0, 0);
    },

    /**
     * Create a new canvas with same dimensions
     */
    createCanvas(width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        return canvas;
    },

    /**
     * Apply Gaussian blur to canvas
     */
    gaussianBlur(canvas, radius) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        // Downsample for performance
        const scale = Math.max(1, Math.floor(radius / 3));
        const scaledW = Math.floor(w / scale);
        const scaledH = Math.floor(h / scale);

        // Create temporary canvases
        const smallCanvas = document.createElement('canvas');
        smallCanvas.width = scaledW;
        smallCanvas.height = scaledH;
        const smallCtx = smallCanvas.getContext('2d');
        smallCtx.drawImage(canvas, 0, 0, scaledW, scaledH);

        const smallData = smallCtx.getImageData(0, 0, scaledW, scaledH);
        const smallPixels = smallData.data;

        // Apply box blur approximation
        const passes = Math.min(Math.max(Math.floor(radius / 2), 1), 5);
        for (let p = 0; p < passes; p++) {
            this.boxBlur(smallPixels, scaledW, scaledH);
        }

        smallCtx.putImageData(smallData, 0, 0);

        // Scale back up
        const result = document.createElement('canvas');
        result.width = w;
        result.height = h;
        const resultCtx = result.getContext('2d');
        resultCtx.imageSmoothingEnabled = true;
        resultCtx.imageSmoothingQuality = 'high';
        resultCtx.drawImage(smallCanvas, 0, 0, w, h);

        return result;
    },

    /**
     * Box blur implementation
     */
    boxBlur(pixels, width, height) {
        const temp = new Uint8ClampedArray(pixels.length);
        const radius = 2;

        // Horizontal pass
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let r = 0, g = 0, b = 0, a = 0, count = 0;
                for (let i = -radius; i <= radius; i++) {
                    const nx = Math.min(Math.max(x + i, 0), width - 1);
                    const idx = (y * width + nx) * 4;
                    r += pixels[idx];
                    g += pixels[idx + 1];
                    b += pixels[idx + 2];
                    a += pixels[idx + 3];
                    count++;
                }
                const idx = (y * width + x) * 4;
                temp[idx] = r / count;
                temp[idx + 1] = g / count;
                temp[idx + 2] = b / count;
                temp[idx + 3] = a / count;
            }
        }

        // Vertical pass
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                let r = 0, g = 0, b = 0, a = 0, count = 0;
                for (let i = -radius; i <= radius; i++) {
                    const ny = Math.min(Math.max(y + i, 0), height - 1);
                    const idx = (ny * width + x) * 4;
                    r += temp[idx];
                    g += temp[idx + 1];
                    b += temp[idx + 2];
                    a += temp[idx + 3];
                    count++;
                }
                const idx = (y * width + x) * 4;
                pixels[idx] = r / count;
                pixels[idx + 1] = g / count;
                pixels[idx + 2] = b / count;
                pixels[idx + 3] = a / count;
            }
        }
    },

    /**
     * 高质量缩放：大跨度缩小时逐级减半，避免一次性 drawImage 把细线条/小字抹平。
     * 放大或小幅调整仍一次完成，避免多次插值累积发虚。
     */
    smoothResize(source, width, height) {
        const sw0 = source.width || source.naturalWidth;
        const sh0 = source.height || source.naturalHeight;
        if (sw0 === width && sh0 === height) return source;
        let src = source, sw = sw0, sh = sh0;
        while (sw > width * 2 && sh > height * 2) {
            const nw = Math.max(width, Math.round(sw / 2));
            const nh = Math.max(height, Math.round(sh / 2));
            const c = document.createElement('canvas');
            c.width = nw; c.height = nh;
            const cx = c.getContext('2d');
            cx.imageSmoothingEnabled = true;
            cx.imageSmoothingQuality = 'high';
            cx.drawImage(src, 0, 0, nw, nh);
            src = c; sw = nw; sh = nh;
        }
        const out = document.createElement('canvas');
        out.width = width; out.height = height;
        const ox = out.getContext('2d');
        ox.imageSmoothingEnabled = true;
        ox.imageSmoothingQuality = 'high';
        ox.drawImage(src, 0, 0, width, height);
        return out;
    },

    /**
     * Resize canvas to specific dimensions
     */
    resizeCanvas(canvas, width, height) {
        return this.smoothResize(canvas, width, height);
    },

    /**
     * 逐像素处理（分片让出主线程，避免大图时页面假死）
     */
    applyFilterChunked(canvas, filterFn, onDone) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const total = data.length;
        const CHUNK = 400000; // 每片 10 万像素

        let i = 0;
        const step = () => {
            const end = Math.min(i + CHUNK, total);
            for (; i < end; i += 4) {
                const [r, g, b] = filterFn(data[i], data[i + 1], data[i + 2]);
                data[i] = r; data[i + 1] = g; data[i + 2] = b;
            }
            if (i < total) {
                setTimeout(step, 0);
            } else {
                ctx.putImageData(imageData, 0, 0);
                if (onDone) onDone(canvas);
            }
        };
        step();
        return canvas;
    },

    /**
     * Apply filter to canvas pixels
     */
    applyFilter(canvas, filterFn) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const [r, g, b] = filterFn(data[i], data[i + 1], data[i + 2]);
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }
};


/* ============================================================
 * PSImage — 全站统一图片加载器（改这一处，所有工具页同时生效）
 *
 * 输入支持：PNG / JPEG / WebP / GIF(首帧) / BMP / SVG / AVIF / ICO / HEIC / HEIF
 * 策略：魔数识别 → 浏览器原生解码优先 → 只有 HEIC/HEIF 在原生解不了时
 *       才懒加载本地 WASM，在 Web Worker 内解码（主线程不卡、图片不上传）
 * 说明：不依赖 file.type（iOS 分享表经常给空值），一律看文件头
 * ============================================================ */
const PSImage = {
    HINT: 'PNG · JPG · WebP · GIF · BMP · SVG · AVIF · ICO · HEIC / HEIF',
    HEIF_BRANDS: ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis', 'hevm', 'hevs'],
    MAX_PIXELS: 60000000,

    sniff(u8) {
        if (u8.length < 12) return 'unknown';
        if (u8[0] === 0x89 && u8[1] === 0x50) return 'png';
        if (u8[0] === 0xFF && u8[1] === 0xD8) return 'jpeg';
        if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return 'gif';
        if (u8[0] === 0x42 && u8[1] === 0x4D) return 'bmp';
        if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) return 'webp';
        if (u8[0] === 0x00 && u8[1] === 0x00 && u8[2] === 0x01 && u8[3] === 0x00) return 'ico';
        if (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) {
            const brand = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]);
            if (this.HEIF_BRANDS.indexOf(brand) !== -1) return 'heif';
            if (brand === 'avif' || brand === 'avis') return 'avif';
            return 'video';
        }
        const txt = String.fromCharCode.apply(null, u8.slice(0, 300)).toLowerCase();
        if (txt.indexOf('<svg') !== -1 || txt.indexOf('<?xml') !== -1) return 'svg';
        return 'unknown';
    },

    async load(file) {
        if (!(file instanceof Blob)) throw new Error('Not a file');
        const buf = await file.arrayBuffer();
        const kind = this.sniff(new Uint8Array(buf.slice(0, 512)));
        if (kind === 'video') throw new Error('This is a video file, not an image.');
        const orient = this.readOrientation(buf);

        // 1) 原生解码优先：Safari / iOS 直接解 HEIC，Chrome 解 AVIF/BMP/ICO/GIF 首帧
        if (typeof createImageBitmap === 'function') {
            try {
                const bm = await createImageBitmap(file, { imageOrientation: 'from-image' });
                return {
                    source: bm,
                    src: URL.createObjectURL(file),
                    width: bm.width, height: bm.height,
                    kind: kind, viaWasm: false
                };
            } catch (e) { /* 原生解不了，继续往下 */ }
        }

        // 2) HEIC / HEIF：懒加载本地 WASM，Worker 内解码
        if (kind === 'heif') {
            const blob = await this.decodeHeif(buf, orient);
            const src = URL.createObjectURL(blob);
            let source = null;
            if (typeof createImageBitmap === 'function') {
                try { source = await createImageBitmap(blob); } catch (e) {}
            }
            if (!source) source = await this.loadImgTag(src);
            return {
                source: source, src: src,
                width: source.width || source.naturalWidth,
                height: source.height || source.naturalHeight,
                kind: kind, viaWasm: true
            };
        }

        // 3) SVG 等：objectURL + <img>
        const src = URL.createObjectURL(file);
        const img = await this.loadImgTag(src);
        return {
            source: img, src: src,
            width: img.naturalWidth, height: img.naturalHeight,
            kind: kind, viaWasm: false
        };
    },

    loadImgTag(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('File cannot be decoded as an image.'));
            img.src = src;
        });
    },

    async decodeHeif(buf, orient) {
        const worker = new Worker('/assets/js/heic-worker.js');
        try {
            const res = await new Promise((resolve, reject) => {
                worker.onmessage = (e) => {
                    if (e.data && e.data.error) reject(new Error(e.data.error));
                    else resolve(e.data);
                };
                worker.onerror = (e) => reject(new Error(e.message || 'HEIF worker error'));
                const copy = buf.slice(0);
                worker.postMessage({ buf: copy }, [copy]);
            });
            const w = res.w, h = res.h;
            if (!w || !h || w * h > this.MAX_PIXELS) {
                throw new Error('Image is too large to decode safely (over 60 MP).');
            }
            let c = document.createElement('canvas');
            c.width = w; c.height = h;
            c.getContext('2d').putImageData(
                new ImageData(new Uint8ClampedArray(res.data), w, h), 0, 0);
            c = this.applyOrientation(c, orient);
            const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/png'));
            if (!blob) throw new Error('HEIF encode failed.');
            return blob;
        } finally {
            worker.terminate();
        }
    },

    applyOrientation(canvas, o) {
        if (!o || o === 1) return canvas;
        const w = canvas.width, h = canvas.height;
        const swap = (o >= 5 && o <= 8);
        const out = document.createElement('canvas');
        out.width = swap ? h : w;
        out.height = swap ? w : h;
        const c = out.getContext('2d');
        const M = {
            2: [-1, 0, 0, 1, w, 0],
            3: [-1, 0, 0, -1, w, h],
            4: [1, 0, 0, -1, 0, h],
            5: [0, 1, 1, 0, 0, 0],
            6: [0, 1, -1, 0, h, 0],
            7: [0, -1, -1, 0, h, w],
            8: [0, -1, 1, 0, 0, w]
        }[o];
        if (!M) return canvas;
        c.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
        c.drawImage(canvas, 0, 0);
        c.setTransform(1, 0, 0, 1, 0, 0);
        return out;
    },

    /* 从 JPEG / HEIF 内嵌的 EXIF 读取 Orientation(0x0112) */
    readOrientation(buf) {
        try {
            const u8 = new Uint8Array(buf);
            const dv = new DataView(buf);
            const limit = Math.min(u8.length - 10, 262144);
            let p = -1;
            for (let i = 0; i < limit; i++) {
                if (u8[i] === 0x45 && u8[i + 1] === 0x78 && u8[i + 2] === 0x69 &&
                    u8[i + 3] === 0x66 && u8[i + 4] === 0 && u8[i + 5] === 0) { p = i + 6; break; }
            }
            if (p < 0 || p + 8 > u8.length) return 1;
            const le = u8[p] === 0x49;
            const g16 = (q) => dv.getUint16(q, le);
            const g32 = (q) => dv.getUint32(q, le);
            if (g16(p + 2) !== 0x2A) return 1;
            const ifd = p + g32(p + 4);
            if (ifd + 2 > u8.length) return 1;
            const n = Math.min(g16(ifd), 200);
            for (let j = 0; j < n; j++) {
                const e = ifd + 2 + j * 12;
                if (e + 12 > u8.length) break;
                if (g16(e) === 0x0112) return g16(e + 8) || 1;
            }
        } catch (e) { /* 元数据坏了不影响解码 */ }
        return 1;
    }
};

/* ============================================================
 * PSIco — 真 ICO 容器编码器（纯 JS，零依赖）
 * ICONDIR + ICONDIRENTRY[] + 内嵌 PNG（Vista+ / 现代浏览器都认）
 * ============================================================ */
const PSIco = {
    SIZES: [16, 32, 48, 64, 128, 256],

    async pngBytes(source, size, bg) {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
        const sw = source.width || source.naturalWidth;
        const sh = source.height || source.naturalHeight;
        const scale = Math.min(size / sw, size / sh);
        const w = Math.max(1, Math.round(sw * scale));
        const h = Math.max(1, Math.round(sh * scale));
        // 先逐级降采样到目标尺寸，再贴合到正方形画布，避免 1000px → 16px 一步糊掉
        const scaled = (typeof ImageUtils !== 'undefined' && ImageUtils.smoothResize)
            ? ImageUtils.smoothResize(source, w, h) : source;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(scaled, (size - w) / 2, (size - h) / 2, w, h);
        const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
        return new Uint8Array(await blob.arrayBuffer());
    },

    async build(source, sizes, bg) {
        sizes = (sizes && sizes.length) ? sizes.slice() : this.SIZES.slice();
        const parts = [];
        for (const sz of sizes) {
            parts.push({ sz: sz, bytes: await this.pngBytes(source, sz, bg) });
        }
        const headLen = 6 + 16 * parts.length;
        const total = headLen + parts.reduce((a, p) => a + p.bytes.length, 0);
        const out = new Uint8Array(total);
        const dv = new DataView(out.buffer);
        dv.setUint16(0, 0, true);
        dv.setUint16(2, 1, true);   // 1 = icon
        dv.setUint16(4, parts.length, true);
        let off = headLen;
        parts.forEach((p, i) => {
            const e = 6 + 16 * i;
            out[e] = p.sz >= 256 ? 0 : p.sz;
            out[e + 1] = p.sz >= 256 ? 0 : p.sz;
            out[e + 2] = 0;  // colour count
            out[e + 3] = 0;  // reserved
            dv.setUint16(e + 4, 1, true);   // planes
            dv.setUint16(e + 6, 32, true);  // bit count
            dv.setUint32(e + 8, p.bytes.length, true);
            dv.setUint32(e + 12, off, true);
            out.set(p.bytes, off);
            off += p.bytes.length;
        });
        return new Blob([out], { type: 'image/x-icon' });
    },

    save(blob, name) {
        if (window.__download) {
            window.__download(blob, name, blob.type || 'image/x-icon');
            return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    },

    linkCode() {
        return '<link rel="icon" href="/favicon.ico" sizes="any">\n' +
               '<link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png">\n' +
               '<link rel="icon" href="/favicon-16x16.png" sizes="16x16" type="image/png">\n' +
               '<link rel="apple-touch-icon" href="/apple-touch-icon.png">';
    }
};

window.PSImage = PSImage;
window.PSIco = PSIco;
