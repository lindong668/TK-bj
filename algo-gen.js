/* ============================================================
 * PicStudio 生成器库 —— 二维码 / 条形码 / GIF / PDF / 配色
 * 全部本地实现，无任何外部依赖
 * ============================================================ */
(function (global) {
'use strict';

/* ============================================================
 * 一、QR Code 编码器（byte mode，版本 1-10）
 * ============================================================ */

/* GF(256) 本原多项式 0x11D */
var GEXP = new Uint8Array(512), GLOG = new Uint8Array(256);
(function () {
  var x = 1;
  for (var i = 0; i < 255; i++) {
    GEXP[i] = x; GLOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11D;
  }
  for (var j = 255; j < 512; j++) GEXP[j] = GEXP[j - 255];
})();
function gmul(a, b) { return (a === 0 || b === 0) ? 0 : GEXP[GLOG[a] + GLOG[b]]; }

/* 生成多项式 */
function rsGenPoly(n) {
  var poly = [1];
  for (var i = 0; i < n; i++) {
    var np = new Array(poly.length + 1).fill(0);
    for (var j = 0; j < poly.length; j++) {
      np[j] ^= poly[j];
      np[j + 1] ^= gmul(poly[j], GEXP[i]);
    }
    poly = np;
  }
  return poly;
}
/* RS 编码：返回 n 个纠错码字 */
function rsEncode(data, n) {
  var gen = rsGenPoly(n);
  var res = new Array(n).fill(0);
  // gen 长度为 n+1，首项(gen[0]=1)已在 shift 中消去，故用 gen[j+1]
  for (var i = 0; i < data.length; i++) {
    var factor = data[i] ^ res[0];
    res.shift(); res.push(0);
    if (factor !== 0) {
      for (var j = 0; j < n; j++) res[j] ^= gmul(gen[j + 1], factor);
    }
  }
  return res;
}

/* 版本 1-10 的纠错块结构： [ecPerBlock, [[blocks, dataPerBlock], ...]] */
var EC_TABLE = {
  1:  { L:[7,[[1,19]]],  M:[10,[[1,16]]], Q:[13,[[1,13]]], H:[17,[[1,9]]] },
  2:  { L:[10,[[1,34]]], M:[16,[[1,28]]], Q:[22,[[1,22]]], H:[28,[[1,16]]] },
  3:  { L:[15,[[1,55]]], M:[26,[[1,44]]], Q:[18,[[2,17]]], H:[22,[[2,13]]] },
  4:  { L:[20,[[1,80]]], M:[18,[[2,32]]], Q:[26,[[2,24]]], H:[16,[[4,9]]] },
  5:  { L:[26,[[1,108]]],M:[24,[[2,43]]], Q:[18,[[2,15],[2,16]]], H:[22,[[2,11],[2,12]]] },
  6:  { L:[18,[[2,68]]], M:[16,[[4,27]]], Q:[24,[[4,19]]], H:[28,[[4,15]]] },
  7:  { L:[20,[[2,78]]], M:[18,[[4,31]]], Q:[18,[[2,14],[4,15]]], H:[26,[[4,13],[1,14]]] },
  8:  { L:[24,[[2,97]]], M:[22,[[2,38],[2,39]]], Q:[22,[[4,18],[2,19]]], H:[26,[[4,14],[2,15]]] },
  9:  { L:[30,[[2,116]]],M:[22,[[3,36],[2,37]]], Q:[20,[[4,16],[4,17]]], H:[24,[[4,12],[4,13]]] },
  10: { L:[18,[[2,68],[2,69]]], M:[26,[[4,43],[1,44]]], Q:[24,[[6,19],[2,20]]], H:[28,[[6,15],[2,16]]] }
};

var ALIGN_POS = {
  1:[], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30],
  6:[6,34], 7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50]
};

function utf8Bytes(str) {
  var out = [];
  var s = unescape(encodeURIComponent(str));
  for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  return out;
}

/* 选择最小可用版本 */
function pickVersion(byteLen, ecl) {
  for (var v = 1; v <= 10; v++) {
    var cfg = EC_TABLE[v][ecl];
    var total = 0;
    cfg[1].forEach(function (g) { total += g[0] * g[1]; });
    var need = byteLen + (v < 10 ? 2 : 2); // 4bit mode + 8bit length + data
    var capBits = total * 8;
    var dataBits = 4 + 8 + byteLen * 8;
    if (dataBits <= capBits) return v;
  }
  return -1;
}

function qrEncode(text, ecl, minVersion) {
  ecl = ecl || 'M';
  var bytes = utf8Bytes(text);
  var ver = pickVersion(bytes.length, ecl);
  if (ver < 0) throw new Error('内容过长，请缩短文本或降低纠错等级');
  if (minVersion && ver < minVersion) ver = minVersion;

  var cfg = EC_TABLE[ver][ecl];
  var ecPerBlock = cfg[0], groups = cfg[1];
  var size = ver * 4 + 17;

  // ---- 1. 数据码字 ----
  var bits = [];
  function pushBits(val, len) {
    for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  }
  pushBits(0b0100, 4);              // byte mode
  pushBits(bytes.length, 8);
  bytes.forEach(function (b) { pushBits(b, 8); });

  var totalData = 0;
  groups.forEach(function (g) { totalData += g[0] * g[1]; });
  var capBits = totalData * 8;
  // terminator
  var rem = Math.min(4, capBits - bits.length);
  for (var t = 0; t < rem; t++) bits.push(0);
  // pad to byte
  while (bits.length % 8 !== 0) bits.push(0);
  // pad bytes
  var pads = [0xEC, 0x11];
  var pi = 0;
  while (bits.length < capBits) { pushBits(pads[pi++ % 2], 8); }

  var dataCodewords = [];
  for (var i2 = 0; i2 < bits.length; i2 += 8) {
    var v2 = 0;
    for (var b2 = 0; b2 < 8; b2++) v2 = (v2 << 1) | bits[i2 + b2];
    dataCodewords.push(v2);
  }

  // ---- 2. 分块 + RS ----
  var blocks = [], ecBlocks = [], offset = 0;
  groups.forEach(function (g) {
    for (var k = 0; k < g[0]; k++) {
      blocks.push(dataCodewords.slice(offset, offset + g[1]));
      offset += g[1];
    }
  });
  blocks.forEach(function (blk) { ecBlocks.push(rsEncode(blk, ecPerBlock)); });

  // ---- 3. 交错 ----
  var maxData = Math.max.apply(null, blocks.map(function (b) { return b.length; }));
  var final = [];
  for (var c = 0; c < maxData; c++)
    for (var bi = 0; bi < blocks.length; bi++)
      if (c < blocks[bi].length) final.push(blocks[bi][c]);
  for (var e = 0; e < ecPerBlock; e++)
    for (var bj = 0; bj < ecBlocks.length; bj++) final.push(ecBlocks[bj][e]);

  // ---- 4. 布矩阵 ----
  var m = [];
  for (var r = 0; r < size; r++) m.push(new Array(size).fill(null));
  var reserved = [];
  for (var r2 = 0; r2 < size; r2++) reserved.push(new Array(size).fill(false));

  function setFn(x, y, v) { m[y][x] = v; reserved[y][x] = true; }

  // Finder patterns (7x7) + separators
  function finder(ox, oy) {
    for (var dy = -1; dy <= 7; dy++) {
      for (var dx = -1; dx <= 7; dx++) {
        var x = ox + dx, y = oy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        var inBox = (dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6);
        var val;
        if (inBox) {
          // 定位图案：外圈(3)黑、第二圈(2)白、第三圈(1)黑、中心(0)黑
          var ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          val = (ring === 2) ? 0 : 1;
        } else val = 0;
        setFn(x, y, val);
      }
    }
  }
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);

  // Timing patterns
  for (var i3 = 8; i3 < size - 8; i3++) {
    var tv = (i3 % 2 === 0) ? 1 : 0;
    setFn(i3, 6, tv); setFn(6, i3, tv);
  }

  // Alignment patterns
  var ap = ALIGN_POS[ver] || [];
  for (var a1 = 0; a1 < ap.length; a1++) {
    for (var a2 = 0; a2 < ap.length; a2++) {
      var cx = ap[a1], cy = ap[a2];
      if ((cx === 6 && cy === 6) || (cx === 6 && cy === size - 7) || (cx === size - 7 && cy === 6)) continue;
      for (var ddy = -2; ddy <= 2; ddy++) {
        for (var ddx = -2; ddx <= 2; ddx++) {
          var ring2 = Math.max(Math.abs(ddx), Math.abs(ddy));
          setFn(cx + ddx, cy + ddy, ring2 === 1 ? 0 : 1);
        }
      }
    }
  }

  // Dark module
  setFn(8, size - 8, 1);

  // Reserve format areas
  for (var i4 = 0; i4 < 9; i4++) {
    if (m[8][i4] === null) { m[8][i4] = 0; reserved[8][i4] = true; }
    if (m[i4][8] === null) { m[i4][8] = 0; reserved[i4][8] = true; }
  }
  for (var i5 = 0; i5 < 8; i5++) {
    if (m[8][size - 1 - i5] === null) { m[8][size - 1 - i5] = 0; reserved[8][size - 1 - i5] = true; }
    if (m[size - 1 - i5][8] === null) { m[size - 1 - i5][8] = 0; reserved[size - 1 - i5][8] = true; }
  }

  // ---- 5. 填数据（蛇形） ----
  var bitIdx = 0, total = final.length * 8;
  var up = true;
  for (var col = size - 1; col >= 0; col -= 2) {
    if (col === 6) col--; // 跳过 timing 列
    for (var ri = 0; ri < size; ri++) {
      var row = up ? (size - 1 - ri) : ri;
      for (var cc = 0; cc < 2; cc++) {
        var x2 = col - cc;
        if (reserved[row][x2]) continue;
        var bit = 0;
        if (bitIdx < total) {
          bit = (final[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
          bitIdx++;
        }
        m[row][x2] = bit;
      }
    }
    up = !up;
  }

  // ---- 6. 掩码 ----
  var MASKFN = [
    function (i, j) { return (i + j) % 2 === 0; },
    function (i, j) { return i % 2 === 0; },
    function (i, j) { return j % 3 === 0; },
    function (i, j) { return (i + j) % 3 === 0; },
    function (i, j) { return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; },
    function (i, j) { return (i * j) % 2 + (i * j) % 3 === 0; },
    function (i, j) { return ((i * j) % 2 + (i * j) % 3) % 2 === 0; },
    function (i, j) { return ((i + j) % 2 + (i * j) % 3) % 2 === 0; }
  ];
  var ECL_BITS = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 };

  function applyMask(maskId) {
    var mm = m.map(function (r) { return r.slice(); });
    for (var y3 = 0; y3 < size; y3++) {
      for (var x3 = 0; x3 < size; x3++) {
        if (reserved[y3][x3]) continue;
        if (MASKFN[maskId](y3, x3)) mm[y3][x3] ^= 1;
      }
    }
    // format info
    var fdata = (ECL_BITS[ecl] << 3) | maskId;
    var rem2 = fdata;
    for (var k2 = 0; k2 < 10; k2++) rem2 = (rem2 << 1) ^ ((rem2 >>> 9) * 0x537);
    var fmt = ((fdata << 10) | rem2) ^ 0x5412;
    // 左上区域位序：MSB(bit14) 先；右上/左下区域：LSB(bit0) 先
    for (var i6 = 0; i6 < 15; i6++) {
      var bitA = (fmt >> (14 - i6)) & 1;
      var bitB = (fmt >> i6) & 1;
      if (i6 < 6)        mm[8][i6] = bitA;
      else if (i6 === 6) mm[8][7]  = bitA;
      else if (i6 === 7) mm[8][8]  = bitA;
      else if (i6 === 8) mm[7][8]  = bitA;
      else               mm[14 - i6][8] = bitA;
      if (i6 < 8) mm[8][size - 1 - i6] = bitB;
      else        mm[size - 15 + i6][8] = bitB;
    }
    return mm;
  }

  function penalty(mm) {
    var score = 0, i7, j7;
    // 规则1：连续同色
    for (i7 = 0; i7 < size; i7++) {
      var run = 1;
      for (j7 = 1; j7 < size; j7++) {
        if (mm[i7][j7] === mm[i7][j7-1]) { run++; }
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (j7 = 0; j7 < size; j7++) {
      var run2 = 1;
      for (i7 = 1; i7 < size; i7++) {
        if (mm[i7][j7] === mm[i7-1][j7]) { run2++; }
        else { if (run2 >= 5) score += 3 + (run2 - 5); run2 = 1; }
      }
      if (run2 >= 5) score += 3 + (run2 - 5);
    }
    // 规则2：2x2 同色块
    for (i7 = 0; i7 < size - 1; i7++)
      for (j7 = 0; j7 < size - 1; j7++) {
        var v3 = mm[i7][j7];
        if (v3 === mm[i7][j7+1] && v3 === mm[i7+1][j7] && v3 === mm[i7+1][j7+1]) score += 3;
      }
    // 规则4：黑白比例
    var dark = 0;
    for (i7 = 0; i7 < size; i7++) for (j7 = 0; j7 < size; j7++) if (mm[i7][j7]) dark++;
    var pct = dark * 100 / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  var best = null, bestScore = Infinity, bestMask = 0;
  for (var mi = 0; mi < 8; mi++) {
    var cand = applyMask(mi);
    var sc = penalty(cand);
    if (sc < bestScore) { bestScore = sc; best = cand; bestMask = mi; }
  }

  return { modules: best, size: size, version: ver, mask: bestMask, ecl: ecl, _raw: m, _reserved: reserved };
}

/* ============================================================
 * 二、Code128 条形码（B 集）
 * ============================================================ */
var C128B = (function () {
  var set = [];
  for (var i = 0; i < 95; i++) set.push(String.fromCharCode(32 + i));
  return set;
})();
var C128_PATTERNS = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');

function code128Encode(text) {
  var vals = [104]; // Start B
  var sum = 104;
  for (var i = 0; i < text.length; i++) {
    var idx = C128B.indexOf(text[i]);
    if (idx < 0) throw new Error('条形码仅支持可打印 ASCII 字符：' + text[i]);
    vals.push(idx);
    sum += idx * (i + 1);
  }
  var check = sum % 103;
  vals.push(check);
  vals.push(106); // Stop
  var bits = '';
  vals.forEach(function (v) { bits += C128_PATTERNS[v]; });
  return bits;
}

/* ============================================================
 * 三、GIF 编码（LZW，单帧或多帧动画）
 * ============================================================ */
function lzwEncode(minCodeSize, indices) {
  var clearCode = 1 << minCodeSize, eoiCode = clearCode + 1;
  var codeSize = minCodeSize + 1, nextCode = eoiCode + 1;
  var dict = {};
  var out = [], cur = 0, curBits = 0;
  function emit(code) {
    cur |= code << curBits; curBits += codeSize;
    while (curBits >= 8) { out.push(cur & 0xFF); cur >>= 8; curBits -= 8; }
  }
  emit(clearCode);
  var prefix = String(indices[0]);
  for (var i = 1; i < indices.length; i++) {
    var k = indices[i], key = prefix + ',' + k;
    if (dict[key] !== undefined) { prefix = key; }
    else {
      emit(prefix.indexOf(',') >= 0 ? dict[prefix] : parseInt(prefix, 10));
      dict[key] = nextCode++;
      if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      prefix = String(k);
    }
  }
  emit(prefix.indexOf(',') >= 0 ? dict[prefix] : parseInt(prefix, 10));
  emit(eoiCode);
  if (curBits > 0) out.push(cur & 0xFF);
  return out;
}

/* 中位切分量化，生成调色板（最多 256 色） */
function quantize(pixels, maxColors) {
  var boxes = [];
  var all = [];
  for (var i = 0; i < pixels.length; i += 4) all.push([pixels[i], pixels[i+1], pixels[i+2]]);
  boxes.push(all);
  while (boxes.length < maxColors) {
    boxes.sort(function (a, b) { return b.length - a.length; });
    var target = null;
    for (var b = 0; b < boxes.length; b++) if (boxes[b].length > 1) { target = boxes.splice(b, 1)[0]; break; }
    if (!target) break;
    // 找范围最大的通道
    var mn = [255,255,255], mx = [0,0,0];
    target.forEach(function (p) { for (var c = 0; c < 3; c++) { if (p[c] < mn[c]) mn[c] = p[c]; if (p[c] > mx[c]) mx[c] = p[c]; } });
    var ch = 0, best = -1;
    for (var c2 = 0; c2 < 3; c2++) if (mx[c2] - mn[c2] > best) { best = mx[c2] - mn[c2]; ch = c2; }
    target.sort(function (p, q) { return p[ch] - q[ch]; });
    var mid = target.length >> 1;
    boxes.push(target.slice(0, mid), target.slice(mid));
  }
  var palette = [];
  boxes.forEach(function (box) {
    if (!box.length) return;
    var r = 0, g = 0, b2 = 0;
    box.forEach(function (p) { r += p[0]; g += p[1]; b2 += p[2]; });
    palette.push([Math.round(r/box.length), Math.round(g/box.length), Math.round(b2/box.length)]);
  });
  return palette;
}

function gifEncode(frames, W, H, delayMs, paletteSize) {
  paletteSize = paletteSize || 128;
  var pal = quantize(frames[0], paletteSize);
  while (pal.length < 256) pal.push([0, 0, 0]);

  var bytes = [];
  function pushStr(s) { for (var i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); }
  function push16(v) { bytes.push(v & 0xFF); bytes.push((v >> 8) & 0xFF); }

  pushStr('GIF89a');
  push16(W); push16(H);
  bytes.push(0xF0 | 6);  // GCT flag, 256 colors
  bytes.push(0); bytes.push(0);
  pal.forEach(function (c) { bytes.push(c[0]); bytes.push(c[1]); bytes.push(c[2]); });

  // Netscape loop extension
  bytes.push(0x21); bytes.push(0xFF); bytes.push(11);
  pushStr('NETSCAPE2.0');
  bytes.push(3); bytes.push(1); push16(0); bytes.push(0);

  var minCode = Math.max(2, Math.ceil(Math.log2(pal.length)));

  frames.forEach(function (frameData) {
    // GCE
    bytes.push(0x21); bytes.push(0xF9); bytes.push(4);
    bytes.push(0x04);
    push16(Math.round(delayMs / 10));
    bytes.push(0); bytes.push(0);
    // Image descriptor
    bytes.push(0x2C);
    push16(0); push16(0); push16(W); push16(H);
    bytes.push(0);
    // LZW
    var indices = new Uint8Array(W * H);
    for (var i = 0, p = 0; i < frameData.length; i += 4, p++) {
      var r = frameData[i], g = frameData[i+1], b = frameData[i+2];
      var best = 0, bd = Infinity;
      for (var c = 0; c < pal.length; c++) {
        var dr = r - pal[c][0], dg = g - pal[c][1], db = b - pal[c][2];
        var d = dr*dr + dg*dg + db*db;
        if (d < bd) { bd = d; best = c; }
      }
      indices[p] = best;
    }
    bytes.push(minCode);
    var lzw = lzwEncode(minCode, indices);
    for (var s = 0; s < lzw.length; s += 255) {
      var chunk = Math.min(255, lzw.length - s);
      bytes.push(chunk);
      for (var t = 0; t < chunk; t++) bytes.push(lzw[s + t]);
    }
    bytes.push(0);
  });

  bytes.push(0x3B);
  return new Uint8Array(bytes);
}

/* ============================================================
 * 四、简易 PDF（嵌入 JPEG）
 * ============================================================ */
function pdfFromJPEGs(jpegDataUrls, pageW, pageH) {
  var objects = [];
  var out = '%PDF-1.4\n';
  var offsets = [];
  function addObj(body) {
    offsets.push(out.length);
    objects.push(objects.length + 1);
    out += (objects.length) + ' 0 obj\n' + body + '\nendobj\n';
    return objects.length;
  }
  var nPages = jpegDataUrls.length;
  var pageIds = [], imgIds = [];

  jpegDataUrls.forEach(function (url) {
    var binary = atob(url.split(',')[1]);
    var len = binary.length;
    var imgId = objects.length + 1;
    var body = '<< /Type /XObject /Subtype /Image /Width ' + pageW +
      ' /Height ' + pageH + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 ' +
      '/Filter /DCTDecode /Length ' + len + ' >>\nstream\n';
    var header = objects.length + 1;
    offsets.push(out.length);
    out += header + ' 0 obj\n' + body;
    objects.push(header);
    for (var i = 0; i < len; i++) out += binary.charAt(i);
    out += '\nendstream\nendobj\n';
    imgIds.push(header);
  });

  // Content streams + page objects
  var pagesId = objects.length + nPages + 1;
  jpegDataUrls.forEach(function (_, idx) {
    var content = 'q ' + pageW + ' 0 0 ' + pageH + ' 0 0 cm /Im' + idx + ' Do Q';
    var cId = objects.length + 1;
    offsets.push(out.length);
    out += cId + ' 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n';
    objects.push(cId);

    var pId = objects.length + 1;
    offsets.push(out.length);
    out += pId + ' 0 obj\n<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' +
      pageW + ' ' + pageH + '] /Resources << /XObject << /Im' + idx + ' ' + imgIds[idx] +
      ' 0 R >> >> /Contents ' + cId + ' 0 R >>\nendobj\n';
    objects.push(pId);
    pageIds.push(pId);
  });

  // Pages
  offsets.push(out.length);
  out += pagesId + ' 0 obj\n<< /Type /Pages /Kids [' +
    pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') +
    '] /Count ' + nPages + ' >>\nendobj\n';
  objects.push(pagesId);

  // Catalog
  var catId = objects.length + 1;
  offsets.push(out.length);
  out += catId + ' 0 obj\n<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>\nendobj\n';
  objects.push(catId);

  var total = objects.length + 1;
  var xrefPos = out.length;
  out += 'xref\n0 ' + (total) + '\n0000000000 65535 f \n';
  offsets.forEach(function (o) {
    var s = String(o);
    while (s.length < 10) s = '0' + s;
    out += s + ' 00000 n \n';
  });
  out += 'trailer\n<< /Size ' + total + ' /Root ' + catId + ' 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n';
  return out;
}

/* ============================================================
 * 五、配色提取
 * ============================================================ */
function extractPalette(pixels, count) {
  return quantize(pixels, count || 8).slice(0, count || 8);
}

global.PicGen = {
  qrEncode: qrEncode,
  code128Encode: code128Encode,
  gifEncode: gifEncode,
  pdfFromJPEGs: pdfFromJPEGs,
  quantize: quantize,
  extractPalette: extractPalette
};
})(window);
