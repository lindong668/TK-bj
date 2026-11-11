# 1号 · PicStudio — https://piccalc.com（根域） · Cloudflare Workers · V70.10

> **唯一现行包：本地 V70.9-r3 × 线上 TRAE 包（GitHub `lindong668/TK-bj` main-2）合并版**
> 生成日期：2026-11-11。合并后请整包覆盖仓库并重新部署，之后只认这一份，不再换包。

## 本版做了什么

- **基线**：本地 V70.9-r3（134 文件）—— Worker 重定向一次 301 归一、`.htm` / 大小写 /
  连续双斜杠兼容、目标先探测 200 才跳、随机路径 404 + `noindex`、广告两态不裁切、
  全站仅两个首页有广告脚本与站点声明。
- **从 TRAE 包吸收**（逐文件核实，只取有用的）：
  1. `public/tools/icon-maker.html` / `public/zh/tools/icon-maker.html`：真·多尺寸 `.ico`
     （16/32/48/64/128/256 六档）、逐档 PNG、favicon HTML 代码；首页工具卡文案同步。
  2. AdSense 初始化融合 `V71` 机制：清理 Google 写在 `ins` / 容器上的内联 height、
     按断点选单元（`data-slot-desktop/mobile`）、只观察 `ins` 防回环、有限次定时复查；
     保留本地的「状态属性优先 + 可见 iframe 兜底 + 幂等 push + 两层容器同步 is-filled」。
  3. `about` / `terms` 中英 4 页：`</div></section>` 提前闭合归位，工具数 8 → 26。
  4. 4 篇英文指南 `description` / `twitter:description` 缩短到 160 字符内。
  5. `download.js` 中文分支误写英文的报错文案。
- **明确不吸收**（TRAE 相对本地是倒退）：84 个非首页重新加 `google-adsense-account` meta；
  删 `<label for>` / `<select name>`；`main.js` 删 `header` 空值保护；手机广告位改 50px
  （本站规格固定 **桌面 90 / 手机 100**）；`guides/id-photo-sizes` 66 字符长 title；
  TRAE 的旧版 Worker（缺 `.htm` / `/ADS.TXT` / 双斜杠归一，且用 `url.origin` 会跳回 http）。
- **一个字没动**：`ads.txt`（59 字节官方值）、`robots.txt`、`sitemap.xml`（86 条）、
  `wrangler.toml`、`package.json`、`_headers`、`src/index.js`（以本地 r3 为准）、
  canonical / hreflang / 内链、广告位数量（2）与 slot `1784463687`。

## 换广告单元

只改 `public/index.html` 与 `public/zh/index.html` 里 `<ins data-ad-slot="...">` 一处。
`ads-config.js` 的 `PS_AD_SLOTS` 只在 HTML 未写数据时兜底，不会覆盖 HTML。

## 部署

1. 用本包 5 个根项整个覆盖仓库 `main-2`，1 commit 1 push。
2. 构建日志认 `Found N` + `Uploaded N of N assets` + 新 Version ID。
3. 上线第一眼：`curl -sSI https://www.piccalc.com/about.html` → 单跳 301 到 `/about`；
   `curl -sS https://piccalc.com/ads.txt` → 官方值一行。
4. 后台 **自动广告保持关闭**（全站只两个首页有脚本）。

## 仍需上线后验（源码管不到）

Googlebot / GSC「测试实际网址」、真 iPhone Safari 实机、AdSense 实际出图。
GSC 里「网页会自动重定向」「备用网页（有适当的规范标记）」是正常排除状态，等重抓即可。
