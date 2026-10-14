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
    constructor(config) {
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

    handleFile(file) {
        if (!file.type.startsWith('image/')) {
            alert('请选择图片文件！');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                this.originalImage = img;
                this.showPreview(img);
                this.showControls();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    showPreview(img) {
        // Show original
        this.originalPreview.src = img.src;

        // Create original canvas
        this.originalCanvas = document.createElement('canvas');
        this.originalCanvas.width = img.naturalWidth;
        this.originalCanvas.height = img.naturalHeight;
        const ctx = this.originalCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // Show preview area
        this.previewArea.classList.add('active');
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
            alert('处理失败：' + err.message);
        } finally {
            this.isProcessing = false;
            this.showLoading(false);
        }
    }

    download() {
        const opts = this.config.downloadOptions || {};
        const format = opts.format || 'png';
        const quality = opts.quality || 0.92;
        const filename = opts.filename || 'picstudio-result';

        if (!this.processedCanvas) return;

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
     * Resize canvas to specific dimensions
     */
    resizeCanvas(canvas, width, height) {
        const result = document.createElement('canvas');
        result.width = width;
        result.height = height;
        const ctx = result.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, width, height);
        return result;
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
