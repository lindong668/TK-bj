/* HEIC / HEIF 解码 Worker —— 只在浏览器原生解不了时才被创建
 * libheif (LGPL-3.0) 的 WASM 构建，本地文件，不联网、不上传 */
importScripts('/assets/js/vendor/libheif-bundle.js');

let heifMod = null;

async function getModule() {
    if (heifMod) return heifMod;
    const factory = self.libheif;
    if (!factory) throw new Error('HEIF decoder not available');
    heifMod = (typeof factory === 'function') ? await factory() : factory;
    if (!heifMod || !heifMod.HeifDecoder) throw new Error('HEIF decoder init failed');
    return heifMod;
}

self.onmessage = async function (e) {
    try {
        const u8 = new Uint8Array(e.data.buf);
        const mod = await getModule();
        const decoder = new mod.HeifDecoder();
        const images = decoder.decode(u8);
        if (!images || !images.length) throw new Error('No HEIF image found in this file');
        const im = images[0];
        const w = im.get_width(), h = im.get_height();
        if (!w || !h) throw new Error('Invalid HEIF dimensions');
        const data = new Uint8ClampedArray(w * h * 4);
        await new Promise((resolve, reject) => {
            let done = false;
            im.display({ data: data, width: w, height: h }, (d) => {
                if (done) return;
                done = true;
                if (!d) reject(new Error('HEIF decode failed'));
                else resolve();
            });
            setTimeout(() => { if (!done) { done = true; reject(new Error('HEIF decode timeout')); } }, 60000);
        });
        self.postMessage({ w: w, h: h, data: data.buffer }, [data.buffer]);
    } catch (err) {
        self.postMessage({ error: String(err && err.message ? err.message : err) });
    }
};
