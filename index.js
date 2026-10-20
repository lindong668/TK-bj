export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 首页
    if (url.pathname === '/') {
      const [oilCached, goldCached, cnCached] = await Promise.all([
        env.OIL_KV.get("oil_data", "json"),
        env.OIL_KV.get("gold_data", "json"),
        env.OIL_KV.get("cn_oil_data", "json"),   // +++ 国内油价
      ]);

      const o = oilCached || await fetchAndSave(env, false);
      const g = goldCached || await fetchGoldAndSave(env);
      const cn = cnCached || await fetchCnOilAll(env);   // +++ 国内油价

      if (!o && !g && !(cn && cn.list && cn.list.length)) {
        return new Response('<h1>暂无数据</h1><p><a href="/update">点击更新</a></p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      const pricePerBarrel = o ? parseFloat(o.price) : null;
      const pricePerLiter = o ? (pricePerBarrel / 158.987).toFixed(4) : '—';
      const pricePerLiterCny = o ? (pricePerLiter * 7.2).toFixed(2) : '—';

      const oilUTC = o?.timestamp ? new Date(o.timestamp).toISOString() : '';
      const goldUTC = g?.updatedAt || '';
      const cnUTC = cn?.updatedAt || '';
      const displayUTC = oilUTC || goldUTC || cnUTC;

      const oilTag = o?.isSettlement
        ? "✅ 每日参考价（凌晨 04:00 自动抓取，结算参考）"
        : "⚡ 最新参考价（手动刷新，盘中最新）";

      const cnJson = JSON.stringify((cn && cn.list) || []);   // +++ 注入省份数据

      const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>国际原油 & 黄金 & 国内油价 · 每日参考价</title>
<meta name="description" content="布伦特原油 $${pricePerBarrel || '—'} USD/桶，国际黄金 $${g?.priceUsdPerOz || '—'} USD/盎司，国内成品油各省指导价">
</head>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 20px">
<h1>📊 国际原油 & 黄金 · 每日参考价</h1>

${o ? `
<h2 style="margin-top:32px">🛢️ 布伦特原油</h2>
<p><strong>${oilTag}</strong></p>
<table style="width:100%;border-collapse:collapse;margin:20px 0">
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">每桶价格</td><td style="padding:8px 0">$${pricePerBarrel} USD</td></tr>
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">每升价格</td><td style="padding:8px 0">$${pricePerLiter} USD（≈ ¥${pricePerLiterCny} 元/升）</td></tr>
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">数据更新地时间</td><td style="padding:8px 0">${oilUTC} <span style="font-size:12px;color:#999">(UTC)</span></td></tr>
</table>` : ''}

${g ? `
<h2 style="margin-top:32px">🪙 国际黄金（XAU/USD）</h2>
<p><strong>📅 每日参考价（延迟日更，非盘中实时）</strong></p>
<table style="width:100%;border-collapse:collapse;margin:20px 0">
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">每盎司价格</td><td style="padding:8px 0">$${g.priceUsdPerOz} USD/盎司</td></tr>
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">每克价格</td><td style="padding:8px 0">≈ ¥${g.priceCnyPerGram} / 克</td></tr>
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">数据源</td><td style="padding:8px 0">MetalpriceAPI 免费档（延迟约24h）</td></tr>
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">数据更新地时间</td><td style="padding:8px 0">${goldUTC} <span style="font-size:12px;color:#999">(UTC)</span></td></tr>
</table>` : ''}

${cn && cn.list && cn.list.length ? `
<h2 style="margin-top:32px">🇨🇳 国内成品油指导价</h2>
<p><strong>📅 各省最高零售限价（约每10个工作日随发改委窗口调整，非加油站实付价）</strong></p>
<label style="font-size:14px;color:#666">选择省份：</label>
<select id="prov" style="padding:6px 10px;font-size:16px;margin-left:8px">
${cn.list.map(r => `<option value="${r.province}" ${r.province === '福建' ? 'selected' : ''}>${r.province}</option>`).join('')}
</select>
<table style="width:100%;border-collapse:collapse;margin:20px 0">
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">92号汽油</td><td style="padding:8px 0" id="p92"></td></tr>
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">95号汽油</td><td style="padding:8px 0" id="p95"></td></tr>
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">98号汽油</td><td style="padding:8px 0" id="p98"></td></tr>
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">0号柴油</td><td style="padding:8px 0" id="p0"></td></tr>
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">数据来源</td><td style="padding:8px 0">${cn.source === 'showapi' ? '万维易源 ShowAPI' : 'Apizero 兜底'}</td></tr>
<tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#666">数据更新地时间</td><td style="padding:8px 0">${cnUTC} <span style="font-size:12px;color:#999">(UTC)</span></td></tr>
</table>` : ''}

<p style="font-size:14px;color:#666">🕐 你的本地时间：<span id="localTime"></span> <span style="font-size:12px;color:#999" id="tz"></span></p>
<p style="font-size:12px;color:#aaa">以上为国际原料与成品油参考价，非零售汽油价 / 首饰金价。黄金为延迟日更参考价，不代表实时盘中报价。</p>
<p style="font-size:12px;color:#aaa"><a href="https://metalpriceapi.com" target="_blank" rel="noopener">Data provided by MetalpriceAPI</a> · <a href="/update">手动刷新</a> · <a href="/data">原始JSON</a></p>

<script>
  var d = new Date('${displayUTC}');
  document.getElementById('localTime').innerText = isNaN(d) ? '未知' : d.toLocaleString(undefined, {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  try { document.getElementById('tz').innerText = '(' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')'; } catch(e) {}

  var cnList = ${cnJson};
  function renderCn(prov) {
    var r = cnList.find(function(x){ return x.province === prov; });
    if (!r) return;
    document.getElementById('p92').innerText = r.p92 + ' 元/升';
    document.getElementById('p95').innerText = r.p95 + ' 元/升';
    document.getElementById('p98').innerText = r.p98 + ' 元/升';
    document.getElementById('p0').innerText  = r.p0  + ' 元/升';
  }
  var sel = document.getElementById('prov');
  if (sel) { sel.onchange = function(){ renderCn(sel.value); }; renderCn(sel.value || '福建'); }
</script>
</body></html>`;

      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // /data
    if (url.pathname === '/data') {
      const [oil, gold, cn] = await Promise.all([
        env.OIL_KV.get("oil_data"), env.OIL_KV.get("gold_data"), env.OIL_KV.get("cn_oil_data"),
      ]);
      return new Response(JSON.stringify({
        oil:  oil ? JSON.parse(oil) : null,
        gold: gold ? JSON.parse(gold) : null,
        cn_oil: cn ? JSON.parse(cn) : null,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
    }

    // /update
    if (url.pathname === '/update') {
      const results = await Promise.allSettled([
        fetchAndSave(env, false),
        fetchGoldAndSave(env),
        fetchCnOilAll(env),
      ]);
      const oilOk  = results[0].status === 'fulfilled';
      const goldOk = results[1].status === 'fulfilled';
      const cnOk   = results[2].status === 'fulfilled';
      return new Response(`OK - 原油:${oilOk ? '成功' : '失败'} / 黄金:${goldOk ? '成功' : '失败'} / 国内油价:${cnOk ? '成功' : '失败'}`, { status: oilOk || goldOk || cnOk ? 200 : 500 });
    }

    return new Response('Not Found', { status: 404 });
  },

  // +++ Cron 分流：凌晨 4 点(原油+黄金) / 早 8 点(国内油价)
  async scheduled(controller, env) {
    const cron = (controller.cron || '').trim();
    if (cron === '0 20 * * *') {
      // 北京时间 04:00（UTC 20:00）→ 原油 + 黄金
      await Promise.allSettled([fetchAndSave(env, true), fetchGoldAndSave(env)]);
    } else if (cron === '0 0 * * *') {
      // 北京时间 08:00（UTC 00:00）→ 国内油价（万维易源 7-8 点已更新）
      await Promise.allSettled([fetchCnOilAll(env)]);
    }
  }
};

// ---------- 原油 ----------
async function fetchAndSave(env, isScheduled) {
  const apiKey = env.OILPRICEAPI_KEY;
  if (!apiKey) throw new Error("Missing OILPRICEAPI_KEY");
  const res = await fetch('https://api.oilpriceapi.com/v1/prices/latest?by_code=BRENT_CRUDE_USD', {
    headers: { 'Authorization': `Token ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Oil API ${res.status}`);
  const json = await res.json();
  const p = json.data;
  const result = {
    price: p.price,
    formatted: p.formatted,
    timestamp: p.created_at || p.timestamp,
    updatedLocal: new Date().toLocaleString("zh-CN", { timeZone: 'Asia/Shanghai' }),
    isSettlement: isScheduled,
  };
  await env.OIL_KV.put("oil_data", JSON.stringify(result), { expirationTtl: 86400 * 2 });
  return result;
}

// ---------- 黄金（MetalpriceAPI 免费档，延迟日更）----------
async function fetchGoldAndSave(env) {
  const apiKey = env.METALPRICEAPI_KEY;
  if (!apiKey) throw new Error("Missing METALPRICEAPI_KEY");

  const res = await fetch(
    `https://api.metalpriceapi.com/v1/latest?api_key=${apiKey}&base=USD&currencies=XAU,CNY`,
    { headers: { 'Accept': 'application/json' } }
  );
  if (!res.ok) throw new Error(`Gold API ${res.status}`);
  const j = await res.json();

  const usdPerOz = 1 / j.rates.XAU;
  const cnyPerGram = +(usdPerOz / 31.1034768 * j.rates.CNY).toFixed(2);

  const gold = {
    priceUsdPerOz: +usdPerOz.toFixed(2),
    priceCnyPerGram: cnyPerGram,
    updatedAt: j.date || new Date().toISOString(),
  };

  await env.OIL_KV.put("gold_data", JSON.stringify(gold), { expirationTtl: 86400 * 2 });
  return gold;
}

// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// +++ 国内成品油（万维易源 138-46 主源 + Apizero 兜底）+++
// ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
const SHOWAPI_URL = "https://route.showapi.com/138-46";
const APIZERO_URL = "https://v1.apizero.cn/api/oil-price";
const PROVINCES = ['北京','天津','河北','山西','内蒙古','辽宁','吉林','黑龙江','上海','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','广西','海南','重庆','四川','贵州','云南','西藏','陕西','甘肃','青海','宁夏','新疆'];

async function fetchShowAPI(env) {
  const appKey = env.SHOWAPI_APPKEY;
  if (!appKey) throw new Error("Missing SHOWAPI_APPKEY");
  const res = await fetch(`${SHOWAPI_URL}?appKey=${appKey}`, {
    headers: { 'Accept': 'application/json' },
  });
  const json = await res.json();
  if (json.showapi_res_code !== 0 || (json.showapi_res_body && json.showapi_res_body.ret_code !== 0)) {
    throw new Error(`ShowAPI ${json.showapi_res_error || json.showapi_res_body?.ret_code}`);
  }
  // 138-46 字段：prov / p92 / p95 / p98 / p0（p90/p93/p97 为空已忽略）
  return json.showapi_res_body.list.map(item => ({
    province: item.prov,
    p92: item.p92 || '—',
    p95: item.p95 || '—',
    p98: item.p98 || '—',
    p0:  item.p0  || '—',
    ct:  item.ct  || '',
  }));
}

async function fetchBackup() {
  const out = [];
  for (const p of PROVINCES) {
    try {
      const r = await fetch(APIZERO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ province: p }),
      });
      const j = await r.json();
      if (j && j.data) {
        out.push({
          province: j.data.province || p,
          p92: j.data.p92 || '—',
          p95: j.data.p95 || '—',
          p98: j.data.p98 || '—',
          p0:  j.data.p0  || '—',
        });
      }
    } catch (e) { /* 单省失败忽略 */ }
  }
  if (!out.length) throw new Error("Backup empty");
  return out;
}

async function fetchCnOilAll(env) {
  let list, source;
  try {
    list = await fetchShowAPI(env);
    source = "showapi";
  } catch (e) {
    console.log("ShowAPI failed, fallback:", e.message);
    list = await fetchBackup();
    source = "apizero";
  }
  const result = {
    list,
    source,
    updatedAt: new Date().toISOString(),
    note: "各省最高零售限价，约每10个工作日调整一次",
  };
  await env.OIL_KV.put("cn_oil_data", JSON.stringify(result), { expirationTtl: 86400 * 15 });
  return result;
}
