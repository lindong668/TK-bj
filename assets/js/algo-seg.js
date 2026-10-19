/* ============================================================
 * PicStudio 图像分割库 —— GrabCut / Alpha Matting / 景深虚化
 * 纯浏览器实现，无任何外部依赖
 * ============================================================ */
(function (global) {
'use strict';

/* ---------- 可重复随机 ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ---------- k-means（3 通道） ---------- */
function kmeans3d(pts, k, iters, rnd) {
  var n = pts.length / 3;
  if (n === 0) return null;
  k = Math.min(k, n);
  rnd = rnd || mulberry32(20261019);

  // 用分位采样初始化中心，比纯随机稳
  var idx = [];
  for (var i = 0; i < n; i++) idx.push(i);
  for (var s = idx.length - 1; s > 0; s--) {
    var j = Math.floor(rnd() * (s + 1)); var t = idx[s]; idx[s] = idx[j]; idx[j] = t;
  }
  var centers = new Float64Array(k * 3);
  for (var c = 0; c < k; c++) {
    var p = idx[c] * 3;
    centers[c*3] = pts[p]; centers[c*3+1] = pts[p+1]; centers[c*3+2] = pts[p+2];
  }

  var assign = new Int32Array(n);
  var counts = new Int32Array(k);

  for (var it = 0; it < iters; it++) {
    counts.fill(0);
    var sums = new Float64Array(k * 3);
    var moved = 0;
    for (var i2 = 0; i2 < n; i2++) {
      var r = pts[i2*3], g = pts[i2*3+1], b = pts[i2*3+2];
      var best = 0, bestD = Infinity;
      for (var c2 = 0; c2 < k; c2++) {
        var dr = r - centers[c2*3], dg = g - centers[c2*3+1], db = b - centers[c2*3+2];
        var d = dr*dr + dg*dg + db*db;
        if (d < bestD) { bestD = d; best = c2; }
      }
      if (assign[i2] !== best) { assign[i2] = best; moved++; }
      counts[best]++;
      sums[best*3] += r; sums[best*3+1] += g; sums[best*3+2] += b;
    }
    for (var c3 = 0; c3 < k; c3++) {
      if (counts[c3] === 0) { // 空簇：重新丢一个随机点
        var rp = Math.floor(rnd() * n) * 3;
        centers[c3*3] = pts[rp]; centers[c3*3+1] = pts[rp+1]; centers[c3*3+2] = pts[rp+2];
      } else {
        centers[c3*3]   = sums[c3*3]   / counts[c3];
        centers[c3*3+1] = sums[c3*3+1] / counts[c3];
        centers[c3*3+2] = sums[c3*3+2] / counts[c3];
      }
    }
    if (moved === 0 && it > 2) break;
  }
  return { centers: centers, assign: assign, counts: counts, k: k, n: n };
}

/* ---------- 由 k-means 结果构建 GMM（对角协方差） ---------- */
function buildGMM(pts, k) {
  var km = kmeans3d(pts, k, 14);
  if (!km) return null;
  var kk = km.k;
  var means = new Float64Array(kk * 3);
  var covs  = new Float64Array(kk * 3);   // 对角方差
  var weights = new Float64Array(kk);
  var n = km.n;

  var sums = new Float64Array(kk * 3);
  var sq   = new Float64Array(kk * 3);
  var cnt  = new Int32Array(kk);
  for (var i = 0; i < n; i++) {
    var c = km.assign[i];
    for (var ch = 0; ch < 3; ch++) {
      var v = pts[i*3+ch];
      sums[c*3+ch] += v;
      sq[c*3+ch]   += v * v;
    }
    cnt[c]++;
  }
  for (var c2 = 0; c2 < kk; c2++) {
    if (cnt[c2] === 0) { weights[c2] = 0; covs[c2*3]=covs[c2*3+1]=covs[c2*3+2]=1; continue; }
    for (var ch2 = 0; ch2 < 3; ch2++) {
      var m = sums[c2*3+ch2] / cnt[c2];
      means[c2*3+ch2] = m;
      var va = sq[c2*3+ch2] / cnt[c2] - m * m;
      covs[c2*3+ch2] = Math.max(va, 9.0); // 方差下限，防退化
    }
    weights[c2] = cnt[c2] / n;
  }
  return { means: means, covs: covs, weights: weights, k: kk };
}

/* ---------- GMM 负对数似然（作为颜色能量） ---------- */
function gmmNLL(gmm, r, g, b) {
  var k = gmm.k, best = 1e12;
  for (var c = 0; c < k; c++) {
    if (gmm.weights[c] <= 0) continue;
    var s = 0;
    for (var ch = 0; ch < 3; ch++) {
      var m = gmm.means[c*3+ch];
      var v = gmm.covs[c*3+ch];
      var d = (ch === 0 ? r : ch === 1 ? g : b) - m;
      s += Math.log(v) + (d * d) / v;
    }
    s = 0.5 * s - Math.log(gmm.weights[c]);
    if (s < best) best = s;
  }
  return best; // 越小越像该类
}

/**
 * GrabCut 简化实现（GMM + ICM 迭代）
 * @param {Uint8ClampedArray} data  RGBA
 * @param {number} W, H
 * @param {object} opts { fgSeeds:Uint8Array, bgSeeds:Uint8Array, iters, lambda }
 * @returns {Uint8Array} mask 0=背景 1=前景
 */
function grabcut(data, W, H, opts) {
  opts = opts || {};
  var iters = opts.iters || 5;
  var lambda = opts.lambda || 35;
  var K = opts.K || 5;
  var N = W * H;
  var mask = new Uint8Array(N);          // 当前标签 0/1
  var locked = new Uint8Array(N);        // 1=用户锁定，不会被 ICM 改变
  var fgSeed = opts.fgSeeds;             // 锁定前景（用户绿笔）
  var bgSeed = opts.bgSeeds;             // 锁定背景（外圈 + 用户红笔）
  var initFg = opts.initFg;              // 初始前景区域（不锁定，可被纠正）

  // ---- 初始化：只有真正的种子才锁定 ----
  for (var i = 0; i < N; i++) {
    if (bgSeed && bgSeed[i])      { mask[i] = 0; locked[i] = 1; }
    else if (fgSeed && fgSeed[i]) { mask[i] = 1; locked[i] = 1; }
    else if (initFg && initFg[i]) { mask[i] = 1; locked[i] = 0; }
    else                          { mask[i] = 0; locked[i] = 0; }
  }

  // ---- 平滑系数 beta：邻域色差期望 ----
  var beta = 0, cnt = 0;
  var step = Math.max(1, Math.floor(Math.sqrt(N) / 80));
  for (var y = 0; y < H - 1; y += step) {
    for (var x = 0; x < W - 1; x += step) {
      var p = (y * W + x) * 4, q = (y * W + x + 1) * 4;
      var dr = data[p] - data[q], dg = data[p+1] - data[q+1], db = data[p+2] - data[q+2];
      beta += dr*dr + dg*dg + db*db; cnt++;
    }
  }
  beta = cnt ? (beta / cnt) : 900;
  if (beta < 1) beta = 1;
  var gamma = 1 / (2 * beta);

  function smoothCost(pi, qi) {
    var a = pi * 4, b = qi * 4;
    var dr = data[a] - data[b], dg = data[a+1] - data[b+1], db = data[a+2] - data[b+2];
    return lambda * Math.exp(-gamma * (dr*dr + dg*dg + db*db));
  }

  // ---- 迭代 ----
  for (var it = 0; it < iters; it++) {
    // 采样建 GMM（大图抽样，控制耗时）
    var maxSample = 60000;
    var stride = Math.max(1, Math.floor(N / maxSample));
    var fgPts = [], bgPts = [];
    for (var i2 = 0; i2 < N; i2 += stride) {
      var o = i2 * 4;
      if (mask[i2] === 1) fgPts.push(data[o], data[o+1], data[o+2]);
      else                bgPts.push(data[o], data[o+1], data[o+2]);
    }
    var gmmF = buildGMM(new Float64Array(fgPts), K);
    var gmmB = buildGMM(new Float64Array(bgPts), K);
    if (!gmmF || !gmmB) break;

    // 预计算颜色能量（只算一次）
    var eF = new Float32Array(N), eB = new Float32Array(N);
    for (var i3 = 0; i3 < N; i3++) {
      var o3 = i3 * 4;
      eF[i3] = gmmNLL(gmmF, data[o3], data[o3+1], data[o3+2]);
      eB[i3] = gmmNLL(gmmB, data[o3], data[o3+1], data[o3+2]);
    }

    // ICM：逐像素取能量更小的标签（全图遍历，越界邻居跳过）
    var changed = 0;
    for (var yy = 0; yy < H; yy++) {
      for (var xx = 0; xx < W; xx++) {
        var p2 = yy * W + xx;
        if (locked[p2]) continue;
        var e0 = eB[p2], e1 = eF[p2];
        // 四邻域平滑（内联，避免块级函数声明带来的作用域问题）
        var nb0 = xx > 0 ? p2 - 1 : -1;
        var nb1 = xx < W - 1 ? p2 + 1 : -1;
        var nb2 = yy > 0 ? p2 - W : -1;
        var nb3 = yy < H - 1 ? p2 + W : -1;
        if (nb0 >= 0) { if (mask[nb0] === 0) e1 += smoothCost(p2, nb0); else e0 += smoothCost(p2, nb0); }
        if (nb1 >= 0) { if (mask[nb1] === 0) e1 += smoothCost(p2, nb1); else e0 += smoothCost(p2, nb1); }
        if (nb2 >= 0) { if (mask[nb2] === 0) e1 += smoothCost(p2, nb2); else e0 += smoothCost(p2, nb2); }
        if (nb3 >= 0) { if (mask[nb3] === 0) e1 += smoothCost(p2, nb3); else e0 += smoothCost(p2, nb3); }
        var nv = e1 < e0 ? 1 : 0;
        if (nv !== mask[p2]) { mask[p2] = nv; changed++; }
      }
    }
    if (changed < N * 0.0005) break;
  }

  // 还原锁定区
  for (var i4 = 0; i4 < N; i4++) {
    if (bgSeed && bgSeed[i4]) mask[i4] = 0;
    else if (fgSeed && fgSeed[i4]) mask[i4] = 1;
  }
  return mask;
}

/**
 * Alpha Matting：对 mask 边界做亚像素细化
 * 对边界像素，取邻域内确定的前景色 F 与背景色 B，解 alpha=(I-B)/(F-B)
 */
function refineAlpha(data, W, H, mask, radius) {
  radius = radius || 3;
  var N = W * H;
  var alpha = new Float32Array(N);
  var i, p;
  for (i = 0; i < N; i++) alpha[i] = mask[i] ? 1 : 0;

  // 标记边界像素（邻域存在异类）
  var border = new Uint8Array(N);
  for (var y = 1; y < H-1; y++) {
    for (var x = 1; x < W-1; x++) {
      p = y*W + x;
      var m = mask[p];
      if (mask[p-1]!==m || mask[p+1]!==m || mask[p-W]!==m || mask[p+W]!==m) border[p] = 1;
    }
  }

  for (var y2 = radius; y2 < H-radius; y2++) {
    for (var x2 = radius; x2 < W-radius; x2++) {
      p = y2*W + x2;
      if (!border[p]) continue;
      var fr=0,fg=0,fb=0,fn=0, br=0,bg2=0,bb=0,bn=0;
      for (var dy=-radius; dy<=radius; dy++) {
        for (var dx=-radius; dx<=radius; dx++) {
          var q = (y2+dy)*W + (x2+dx);
          var o = q*4;
          if (mask[q] === 1 && !border[q]) { fr+=data[o];fg+=data[o+1];fb+=data[o+2];fn++; }
          else if (mask[q] === 0 && !border[q]) { br+=data[o];bg2+=data[o+1];bb+=data[o+2];bn++; }
        }
      }
      if (fn === 0 || bn === 0) continue;
      fr/=fn; fg/=fn; fb/=fn; br/=bn; bg2/=bn; bb/=bn;
      var io = p*4;
      var I = [data[io], data[io+1], data[io+2]];
      var F = [fr,fg,fb], B = [br,bg2,bb];
      var num=0, den=0;
      for (var ch=0; ch<3; ch++) {
        var d = I[ch] - B[ch];
        num += d * (F[ch] - B[ch]);
        den += (F[ch] - B[ch]) * (F[ch] - B[ch]);
      }
      var a = den > 1e-6 ? num/den : (mask[p] ? 1 : 0);
      alpha[p] = Math.max(0, Math.min(1, a));
    }
  }
  return alpha;
}

/**
 * 景深虚化：按 mask 分层模糊，越远离主体越模糊（模拟真实光圈）
 */
function depthBlur(canvas, mask, opts) {
  opts = opts || {};
  var maxRadius = opts.maxRadius || 18;
  var layers = opts.layers || 4;
  var W = canvas.width, H = canvas.height;

  // 1) 生成"距离场"：背景像素到最近前景的距离（简易 BFS 近似）
  var N = W*H;
  var dist = new Float32Array(N);
  for (var i=0;i<N;i++) dist[i] = mask[i] ? 0 : Infinity;
  // 多轮松弛近似距离（比精确 EDT 快，效果够用）
  for (var pass=0; pass<3; pass++) {
    for (var y=1;y<H-1;y++){
      for (var x=1;x<W-1;x++){
        var p=y*W+x;
        if (mask[p]) continue;
        var m = Math.min(dist[p-1], dist[p+1], dist[p-W], dist[p+W]);
        if (m + 1 < dist[p]) dist[p] = m + 1;
      }
    }
    for (var y2=H-2;y2>0;y2--){
      for (var x2=W-2;x2>0;x2--){
        var p2=y2*W+x2;
        if (mask[p2]) continue;
        var m2 = Math.min(dist[p2-1], dist[p2+1], dist[p2-W], dist[p2+W]);
        if (m2 + 1 < dist[p2]) dist[p2] = m2 + 1;
      }
    }
  }
  // 归一化
  var maxD = 0;
  for (var i2=0;i2<N;i2++) if (dist[i2]!==Infinity && dist[i2]>maxD) maxD = dist[i2];
  if (maxD === 0) maxD = 1;

  // 2) 预生成不同强度的模糊层
  var blurred = [];
  for (var L=0; L<layers; L++) {
    var r = Math.max(1, Math.round(maxRadius * (L+1) / layers));
    blurred.push(boxBlur(canvas, r));
  }

  // 3) 按距离选层 + 层间融合
  var src = canvas.getContext('2d').getImageData(0,0,W,H).data;
  var out = new ImageData(W,H);
  var od = out.data;
  var layersData = blurred.map(function(c){ return c.getContext('2d').getImageData(0,0,W,H).data; });

  for (var p3=0; p3<N; p3++) {
    var o = p3*4;
    var t;
    if (mask[p3]) { t = -1; }                       // 主体清晰
    else {
      var d = dist[p3];
      t = d === Infinity ? 1 : Math.min(1, d / (maxD * 0.6));
    }
    if (t < 0) {
      od[o]=src[o]; od[o+1]=src[o+1]; od[o+2]=src[o+2]; od[o+3]=src[o+3];
    } else {
      var fpos = t * (layers - 1);
      var L0 = Math.floor(fpos), L1 = Math.min(layers-1, L0+1), w = fpos - L0;
      var d0 = layersData[L0], d1 = layersData[L1];
      for (var ch2=0; ch2<3; ch2++) {
        od[o+ch2] = d0[o+ch2] * (1-w) + d1[o+ch2] * w;
      }
      od[o+3] = src[o+3];
    }
  }
  var res = document.createElement('canvas');
  res.width = W; res.height = H;
  res.getContext('2d').putImageData(out, 0, 0);
  return res;
}

/* 方框模糊：先缩小再放大，快且平滑 */
function boxBlur(canvas, radius) {
  var W = canvas.width, H = canvas.height;
  var shrink = Math.max(1, Math.round(radius / 2));
  var sw = Math.max(1, Math.floor(W / shrink)), sh = Math.max(1, Math.floor(H / shrink));
  var small = document.createElement('canvas');
  small.width = sw; small.height = sh;
  var sctx = small.getContext('2d');
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(canvas, 0, 0, sw, sh);

  // 在小图上做两遍方框模糊逼近高斯
  var id = sctx.getImageData(0,0,sw,sh);
  var d = id.data;
  var tmp = new Uint8ClampedArray(d.length);
  var passes = 2;
  for (var t=0; t<passes; t++) {
    blurH(d, tmp, sw, sh, 2);
    blurV(tmp, d, sw, sh, 2);
  }
  sctx.putImageData(id, 0, 0);

  var res = document.createElement('canvas');
  res.width = W; res.height = H;
  var rctx = res.getContext('2d');
  rctx.imageSmoothingEnabled = true;
  rctx.imageSmoothingQuality = 'high';
  rctx.drawImage(small, 0, 0, W, H);
  return res;
}
function blurH(s, o, w, h, r) {
  for (var y=0;y<h;y++) for (var x=0;x<w;x++) {
    var r0=0,g0=0,b0=0,n=0;
    for (var k=-r;k<=r;k++){
      var xx=x+k; if(xx<0||xx>=w) continue;
      var p=(y*w+xx)*4; r0+=s[p];g0+=s[p+1];b0+=s[p+2];n++;
    }
    var q=(y*w+x)*4; o[q]=r0/n;o[q+1]=g0/n;o[q+2]=b0/n;o[q+3]=s[q+3];
  }
}
function blurV(s, o, w, h, r) {
  for (var x=0;x<w;x++) for (var y=0;y<h;y++) {
    var r0=0,g0=0,b0=0,n=0;
    for (var k=-r;k<=r;k++){
      var yy=y+k; if(yy<0||yy>=h) continue;
      var p=(yy*w+x)*4; r0+=s[p];g0+=s[p+1];b0+=s[p+2];n++;
    }
    var q=(y*w+x)*4; o[q]=r0/n;o[q+1]=g0/n;o[q+2]=b0/n;o[q+3]=s[q+3];
  }
}

/**
 * 边界洪水填充：从四条边出发，标记所有「与边界连通且颜色接近」的像素为背景
 * 这是初始化准确的关键 —— 连通性保证主体内部的同色区域不会被误判
 */
function floodFillBackground(data, W, H, tolerance) {
  tolerance = tolerance == null ? 32 : tolerance;
  var N = W*H;
  var isBg = new Uint8Array(N);
  var visited = new Uint8Array(N);

  // 边框颜色中位数（抗噪）
  var rs=[], gs=[], bs=[];
  var st = Math.max(1, Math.floor(Math.min(W,H)/80));
  function px(x,y){ var o=(y*W+x)*4; rs.push(data[o]); gs.push(data[o+1]); bs.push(data[o+2]); }
  for (var x1=0;x1<W;x1+=st){ px(x1,0); px(x1,H-1); }
  for (var y1=0;y1<H;y1+=st){ px(0,y1); px(W-1,y1); }
  function med(a){ if(!a.length) return 0; a=a.slice().sort(function(m,n){return m-n;}); return a[a.length>>1]; }
  var bR=med(rs), bG=med(gs), bB=med(bs);

  // 双阈值：与「来源像素」比（小，允许沿渐变生长）+ 与「全局背景色」比（大，防漂移）
  var tolLocal  = Math.max(4, Math.round(tolerance * 0.55));
  var tolGlobal = Math.round(tolerance * 2.2);
  var tl2 = tolLocal*tolLocal, tg2 = tolGlobal*tolGlobal;

  function nearGlobal(p){
    var o=p*4;
    var dr=data[o]-bR, dg=data[o+1]-bG, db=data[o+2]-bB;
    return (dr*dr+dg*dg+db*db) <= tg2;
  }
  function nearLocal(p, src){
    var o=p*4, q=src*4;
    var dr=data[o]-data[q], dg=data[o+1]-data[q+1], db=data[o+2]-data[q+2];
    return (dr*dr+dg*dg+db*db) <= tl2;
  }

  var queue = new Int32Array(N), head=0, tail=0;
  function seed(x,y){
    var p=y*W+x;
    if (visited[p]) return;
    visited[p]=1;
    if (nearGlobal(p)) { isBg[p]=1; queue[tail++]=p; }
  }
  for (var x2=0;x2<W;x2++){ seed(x2,0); seed(x2,H-1); }
  for (var y2=0;y2<H;y2++){ seed(0,y2); seed(W-1,y2); }

  while (head < tail) {
    var p2 = queue[head++];
    var x3 = p2 % W, y3 = (p2 / W) | 0;
    if (x3 > 0)     tryPush(p2-1, p2);
    if (x3 < W - 1) tryPush(p2+1, p2);
    if (y3 > 0)     tryPush(p2-W, p2);
    if (y3 < H - 1) tryPush(p2+W, p2);
  }
  function tryPush(np, src){
    if (visited[np]) return;
    visited[np]=1;
    if (nearLocal(np, src) && nearGlobal(np)) { isBg[np]=1; queue[tail++]=np; }
  }

  // 安全网：若几乎全图被判为背景（纯色图），只保留最外一圈
  var cnt=0; for (var i=0;i<N;i++) if (isBg[i]) cnt++;
  if (cnt > N * 0.97) {
    isBg.fill(0);
    var bw = Math.max(1, Math.round(Math.min(W,H)*0.02));
    for (var y4=0;y4<H;y4++) for (var x4=0;x4<W;x4++) {
      if (x4<bw||y4<bw||x4>=W-bw||y4>=H-bw) isBg[y4*W+x4]=1;
    }
  }
  return isBg;
}

/**
 * 生成初始化：
 *  bgSeed = 洪水填充得到的连通背景（锁定，不被 ICM 改变）
 *  initFg = 非背景区域（初始前景，可被纠正）
 * 这样前景 GMM 一开始就是纯的，避免"背景色污染前景模型"
 */
function defaultSeeds(W, H, data, tolerance) {
  var N = W*H;
  var bg = floodFillBackground(data, W, H, tolerance);
  var init = new Uint8Array(N);
  for (var i=0;i<N;i++) init[i] = bg[i] ? 0 : 1;
  // 若前景过小（说明填充吞太多），退回中心矩形
  var fgc=0; for (var j=0;j<N;j++) if (init[j]) fgc++;
  if (fgc < N * 0.02) {
    init.fill(0);
    var rx0=Math.round(W*0.15), ry0=Math.round(H*0.15);
    var rx1=Math.round(W*0.85), ry1=Math.round(H*0.85);
    for (var y5=ry0;y5<ry1;y5++) for (var x5=rx0;x5<rx1;x5++) if(!bg[y5*W+x5]) init[y5*W+x5]=1;
  }
  return { initFg: init, bg: bg, floodBg: bg };
}

/* ---------- 降采样 / 上采样：大图先在低分辨率分割，再还原 ---------- */
function downsampleImageData(data, W, H, maxSide) {
  var scale = Math.min(1, maxSide / Math.max(W, H));
  if (scale >= 1) return { data: data, W: W, H: H, scale: 1 };
  var sw = Math.max(2, Math.round(W*scale)), sh = Math.max(2, Math.round(H*scale));
  var out = new Uint8ClampedArray(sw*sh*4);
  for (var y=0; y<sh; y++) {
    for (var x=0; x<sw; x++) {
      var sx = Math.floor(x/scale), sy = Math.floor(y/scale);
      var so = (sy*W+sx)*4, dofs = (y*sw+x)*4;
      out[dofs]=data[so]; out[dofs+1]=data[so+1];
      out[dofs+2]=data[so+2]; out[dofs+3]=255;
    }
  }
  return { data: out, W: sw, H: sh, scale: scale };
}

function upsampleMask(mask, sw, sh, W, H) {
  if (sw === W && sh === H) return mask;
  var out = new Uint8Array(W*H);
  var xr = W/sw, yr = H/sh;
  for (var y=0;y<H;y++) for (var x=0;x<W;x++) {
    var sx = Math.min(sw-1, Math.floor(x/xr)), sy = Math.min(sh-1, Math.floor(y/yr));
    out[y*W+x] = mask[sy*sw+sx];
  }
  return out;
}

/**
 * 完整抠图流程（推荐入口）
 * 低分辨率分割 → 上采样 → 原图 alpha matting 细化
 * @returns {Float32Array} alpha 0..1，长度 W*H
 */
function segmentAlpha(data, W, H, opts) {
  opts = opts || {};
  var maxSide = opts.maxSide || 800;      // 分割工作分辨率
  var small = downsampleImageData(data, W, H, maxSide);

  var seeds = opts.seeds || defaultSeeds(small.W, small.H, small.data, opts.tolerance);
  var sm = grabcut(small.data, small.W, small.H, {
    bgSeeds: seeds.bg, fgSeeds: seeds.fg, initFg: seeds.initFg,
    iters: opts.iters || 5, lambda: opts.lambda || 35
  });

  var maskFull = upsampleMask(sm, small.W, small.H, W, H);

  // 边缘细化（在原分辨率上做，半径按缩放补偿）
  var radius = Math.max(2, Math.round(3 / Math.max(0.15, small.scale)));
  var alpha = refineAlpha(data, W, H, maskFull, radius);

  // 锁定区强制生效
  if (opts.fgSeeds) for (var i=0;i<W*H;i++) if (opts.fgSeeds[i]) alpha[i] = 1;
  if (opts.bgSeeds) for (var j=0;j<W*H;j++) if (opts.bgSeeds[j]) alpha[j] = 0;

  return alpha;
}

global.PicSeg = {
  segmentAlpha: segmentAlpha,
  downsampleImageData: downsampleImageData,
  upsampleMask: upsampleMask,
  grabcut: grabcut,
  refineAlpha: refineAlpha,
  floodFillBackground: floodFillBackground,
  depthBlur: depthBlur,
  boxBlur: boxBlur,
  defaultSeeds: defaultSeeds,
  kmeans3d: kmeans3d
};
})(window);
