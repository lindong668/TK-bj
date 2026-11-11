# 1号 · PicStudio — https://piccalc.com（根域） · Cloudflare Workers · V70

> **本包为「合体版」：以 V70 整改包为底，合并 V71 的广告位实现与缺陷修复。**
>
> - 广告位：`data-ad-status` + `.is-filled`，未填充桌面 90px / 手机 50px，填充后 `height:auto`，不裁切；已铺到 80 个正式内容页（隐私政策、联系、指南索引、404 除外；remove-bg 两页已合并删除）。
> - `/tools/remove-bg` 实为 ICO 工具、与 `/tools/icon-maker` 重复：内容已并入 icon-maker，旧地址 301，sitemap 86 条。
> - 共享资源版本号：`style.css?v=20261111d`、`main.js?v=20261111m2`、`download.js?v=20261111d2`、新增 `ads.js?v=20261111ad`。
> - `ads.txt` 在 Worker 与 `_headers` 均为 `max-age=3600`。
> - **跳转收敛（2026-11-11 二轮）**：`http→https`、`www→apex`、`.html`/大写扩展名剥离、`index.html→目录根`、尾斜杠、旧指南短名**合并为同一次 301**，全站最大跳转链长 = 1；`/guides/<name>` 的 9 个旧短名（resize / remove-bg / crop / compress / id-photo / mosaic / exif / upscale / convert）均映射到现存真实页，中英同构。
> **一眼识别卡**
> | 项 | 值 |
> |---|---|
> | 站名 | **PicStudio** |
> | 域名 | **https://piccalc.com（根域）** |
> | Worker 名 | `tk-bj` |
> | 形态 | **Cloudflare Workers + Assets** |
> | 本包版本 | **V70.6** = V70 全站整改 + 后台 Worker 放大修复 |
> | 生成日期 | 2026-11-11 |
> | 关键特性 | 44 组中英独立 URL；canonical / hreflang / sitemap / 内链全部**无扩展名**；guides 旧路径 301 到 /tools/ |

---

## ★★ V70.6 现行说明（2026-11-11，优先级高于下面所有历史章节）

放大工具（`/tools/upscale`、`/zh/tools/upscale`）已改为 **Web Worker 后台分块计算**：

- 新增 `public/assets/js/upscale-worker.js`（中英共用一份）：Lanczos3 按输出行分块、回传进度、支持取消、输出上限 4000 万像素；主线程不再被计算冻结，不会再弹「页面无响应」。
- 中英两份 `lab.js` 的 `LAB.upscale` 段**逐字一致**（此前优化只改了英文那份，是中文站卡死的根因）。
- 32 个引用 `lab.js` 的 HTML 版本号统一 `?v=20261111f`。**改样式或算法必须同步升版本号**，否则 CDN 会吞旧副本（V70.2 的 Safari 拉一屏就是栽在这里）。
- 带 `.html` 的请求由 Worker **301** 到无扩展名（不再是 CF Assets 的 307 临时跳）。
- 其余资产（`ads.txt` / `robots.txt` / `sitemap.xml` / `_headers` / `src/index.js` / 配置 / 广告位 / URL）逐字节未动。

详见同目录 `1号_PicStudio_V70_一步部署说明.md` 与 `1号_PicStudio_V70_全站整改与广告位上线_复审报告.md`。

---

## ★ V70 现行说明（2026-11-10，以下历史章节如与之冲突，以本节为准）

**线上实测**：无扩展名地址 `https://piccalc.com/about` = **200**（最终页面）；
带 `.html` 的 `https://piccalc.com/about.html` = **301** 跳到无扩展名（V70.4 起由 Worker 归一，永久跳；旧的 CF Assets 307 临时跳已取代）。
整改前全站 84 页 canonical、252 条 hreflang、1576 条站内链接、sitemap 84 条 loc
全部写 `.html`，**规范地址指向的不是最终 200 页面**；同时 Worker 里还留着
「无扩展名 → 301 补 `.html`」的反向逻辑（线上因探测拿不到 200 而永不触发，属死代码，
一旦 CF 行为变化会形成 `/about → 301 → /about.html → 307 → /about` 循环）。

**V70 一次性改完**：
1. 88 个正式页的 canonical / hreflang / `og:url` / JSON-LD / `<a href>` / 语言切换
   `<option value>`、以及 `sitemap.xml` 的 loc 与 `xhtml:link`，**全部统一为无扩展名**；
   `index.html` → 目录根（`/`、`/zh/`、`/guides/`、`/zh/guides/`）。
2. 删掉 Worker 里「无后缀补 `.html`」的 301 段与三处目录根硬 fetch，
   目录根交由 CF Assets 原生映射。
3. `GUIDES_LEGACY_MAP` 与 `/guides/ → /tools/` 迁移跳统一改为无扩展名目标，
   旧短名的 `.html` 与无扩展名两种入口都直接 301。
4. 删掉 88 页重复的 `<!DOCTYPE html>`（第 1、2 行都是）。
5. 80 页重复的 `twitter:card` 去重并统一 `summary_large_image`；
   补 2 个指南页缺失的 `og:locale`。
6. `_headers` 补 `Strict-Transport-Security`；404 兜底补 `noindex` 与导航链接。
7. **未动**：`google6474e28bb6098302.html` 验证文件与 Worker 硬拦截路径、
   JS 里 `/\.html?$/` 等正则字面量、`assets/js/download.js` / `guide-nav.js` / `ux.js`
   的工具计算逻辑、页面可见文案与全部工具功能。

**部署后验收**：
```
① https://piccalc.com/about        → 200，源码 canonical = https://piccalc.com/about
② https://piccalc.com/about.html   → 307 到 /about（CF 正常行为，不是错）
③ https://piccalc.com/zh/about     → 三条 hreflang（en / zh-CN / x-default）全无 .html
④ sitemap.xml                     → 88 条 loc 全无 .html
⑤ 语言下拉切 English / 中文         → 直接落到无扩展名地址，不多跳
```

---

Cloudflare Workers + Assets 静态站点

## 结构
- `public/`       线上站点全部内容（wrangler.toml: [assets] directory = "./public"）
- `src/index.js`  Worker 入口（wrangler.toml: main = "src/index.js"）
- `wrangler.toml` 部署配置

## 部署
Cloudflare Workers → `tk-bj`（与 wrangler.toml 的 name 一致）→ 连接本仓库 `main-2` 分支

## V16 变更（2026-10-24）
1. **修复工具页莫名出现的英文文字（真实元凶）**
   - 全站 40 处占位图写成 `<img alt="Result" src="">`，src 为空时浏览器
     直接渲染 alt 文字 → 页面露出 "Result"/"Original"/"Image preview" 等
     英文字段，且点不动。
   - 新增 CSS：`img[src=""], img:not([src]) { display:none }`
     JS 赋值真实 src 后选择器自动失效，图片正常显示，未改动任何 JS。
2. **修复 .result-box 无默认隐藏**
   - style.css 此前完全无 .result-box 定义，to-pdf.html 里它是未被 JS
     使用的死代码却一直可见；新增默认隐藏 + .active 显示，
     stitch.html 的既有 active 逻辑不受影响。
3. **强化原生 file input 隐藏（双重保险）**
   - CSS 只写了老式 `clip:rect()`，iOS Safari 支持不稳定导致按钮露出；
     补齐 clip-path:inset(50%) / opacity:0 / pointer-events:none / !important。
   - main.js 增加运行时兜底（不依赖 CSS 版本缓存），pointer-events:none
     同时解决"点了没反应"（点击不再冒泡抵消）。
4. **资源版本号**：style.css → v=20261024d；main.js 首次加版本号 v=20261024d
   （此前 main.js 无版本号被长期缓存，是修完仍不生效的原因之一）

复检：空 src 图片 40/40 命中隐藏规则；23 处赋值语句不受影响；
      23 个 fileInput 均在 .upload-area 内；qrcode/watermark 的 logoInput 有意显示不受影响

## 部署加速（2026-10-24）

**根因**：仓库此前没有 package.json，CF 构建日志显示
`No dependencies detected to cache. Skipping.`
→ 每次 `npx wrangler deploy` 都要临时下载 wrangler（数十 MB + 数百个依赖包），
这是 1 号部署明显慢于 2 号的主因（2 号有 package.json，CF 会缓存依赖）。

**已新增 package.json**，声明 devDependencies.wrangler = ^4.152.0
（四个站中 1/4/5 号均使用 [assets] 静态资产，需 wrangler 4.x；2 号无 [assets]，用 3.x 即可）

**首次部署会稍慢**（CF 需要安装并缓存依赖），此后每次部署可省去 wrangler 下载时间。

其余次要因素（真实存在但非主因）：
- 61 个文件 / 1.5 MB，是四站中文件数最多、体积最大的
- i18n-dict.js 180 KB（1399 键 × 2 语言），为功能所需，非冗余
- 经核查：无 .bak/.old/~/.tmp 等冗余或备份文件

## V17 变更（2026-10-24）— 修复 i18n-dict.js 单行超长（136,774 字符）

**问题**：public/assets/js/i18n-dict.js 整个文件只有 2 行，
第 1 行是 136,774 字符的巨型单行 JSON。
与 2号 A14 修复前的 icons.js（168,949 字符单行）属同类问题：
GitHub 网页上传器/编辑器处理超长单行时容易失败或拒绝渲染。

**修法**：JSON 逐键换行（indent=1），语义完全不变。
```
文件     180 KB → 191 KB（+11K，为可读性付出的空白字符）
行数     2 行 → 2,805 行
最长行   136,774 → 503 字符
```

**等价性验证（真实逐键比对）**
```
新旧两个文件各解析为对象 → 逐键比对
实际比对 2,798 个键（en 1,399 + zh 1,399）
缺失 0    值不同 0    ✅ 100% 等价
浏览器加载：node 模拟 window 环境，PS_I18N 正常挂载 ✅
```

**影响面**：纯数据文件，无逻辑改动。31 个页面通过
`<script src="assets/js/i18n-dict.js">` 引用，变量名与结构均未变，
页面代码零改动。

**附带排查（五站统一扫描）**
```
1号 62 文件  最长行 1,671   ✅（本次已修 i18n-dict）
2号 16 文件  最长行   735   ✅
3号  2 文件  最长行   325   ✅
4号 45 文件  最长行 2,570   ✅
5号 27 文件  最长行   477   ✅
BOM / CRLF / 控制字符 / 非 UTF-8 / 可疑文件名：五站均无
```

## V18 变更（2026-10-24）— 微信分享缩略图

### 排查过程（跨站对照）
对 1/4/5 号做了逐项对照，逐条排除：
```
缓存头      1号 public max-age=3600（无 private，与 4/5 号一致）  ✅排除
OG 标签     绝对 HTTPS URL、1200×630 已声明                      ✅排除
og 标签位置 偏移 0.8 KB（比 4号 1.4KB、5号 1.6KB 更靠前）        ✅排除
图片编码    8-bit RGB non-interlaced，与 4/5 号完全一致           ✅排除
robots.txt  User-agent: * Allow: /                               ✅排除
```
未找到类似 2号 那样的确凿代码级元凶（2号 的 private 头在 1号 不存在）。

### 剩余差异（1号 独有）
```
① OG 图体积 117 KB —— 三站中最大（5号 86KB 正常、4号 110KB 正常）
② 图片 URL 自建站起从未变更 —— 若微信首次抓取失败，缓存会长期留存
```
微信缓存的 key 是图片 URL 本身，URL 不变则不会重新抓取。

### 处理（两个因素同时覆盖）
```
① og-image.png → og-v2.png  换新 URL，强制微信重新抓取
② 117 KB → 36 KB            128 色量化，尺寸仍 1200×630
③ 37 个 HTML 文件、74 处引用全部同步更新，残留 0
④ 旧 og-image.png 保留      防止已分享链接变空白
```

### 验证
```
替换 74 处 / 37 文件，残留 0 ✅
og-v2.png 回验 PNG 1200×630 ✅
src/index.js 语法通过 ✅
```

### 部署后
微信缓存通常 24 小时内更新。建议 CF 控制台 Purge 一次缓存，
并用「从未分享过的新路径」测试，勿复用旧链接。

### ⚠️ 待确认
若换名+压缩后仍无图，则原因不在图片本身，需进一步核实：
手机浏览器直接打开 https://piccalc.com/og-v2.png 是否能显示。

## V22 变更（2026-10-25）★ ads.txt 「未找到」专项修复

**背景（分离变量得出的结论）**：
```
四个站同一套 ads.txt 写法、同一 pub ID：
  658.ccwu.cc  已授权 ✅
  596.us.ci    已授权 ✅（GitHub Pages 静态）
  yok.us.ci    已授权 ✅
  piccalc.com  未找到 ❌  ← 唯一出问题的

差异不在代码、不在 Content-Type、不在账号（状态"开启"）、不在文件（一直能打开）。
★ 真正的差异：piccalc.com 加入最早（10-17），是唯一被 AdSense **重复抓取**过的；
  其余三个 10-25 才加入，只经历了首次抓取并成功。
  10-24 部署 V21b 期间若 AdSense 正好重抓，撞上部署空窗 → 记录为「未找到」。
  AdSense 不会立即重抓，所以状态一直挂着。
```

**本次改动（把 ads.txt 做成整站最稳的一环）**：
```
1. /ads.txt 提到 Worker 最最前面，★ 早于 www 重定向
   → apex 与 www 两种形态都直接 200，不产生 301
   → AdSense 对 ads.txt 的重定向极其敏感，301 可能被判「未找到」

2. Content-Type 改为纯 text/plain（去掉 ; charset=utf-8）
   → 消除严格字符串匹配场景下的失败风险

3. 新增 X-Content-Type-Options: nosniff
   → 防止被二次猜测 MIME

4. cache-control 3600 → 86400
   → 边缘缓存更稳，减少抓取时撞上瞬时空窗的概率

5. 兼容 /Ads.txt 大小写变体
```

**部署后必做**：
```
① CF → piccalc.com → 缓存 → 清除所有内容（Purge Everything）
② 浏览器验 https://piccalc.com/ads.txt         → 应显示 pub 行
③ 浏览器验 https://www.piccalc.com/ads.txt     → ★ 应直接显示 pub 行（不跳转）
④ AdSense 后台触发重新抓取，或等下一轮自动重抓
```

**未改动**：robots.txt、sitemap、页面逻辑、样式 —— 只动 ads.txt 这一处。


## V23 变更（2026-10-25）★ 移除 Worker 内 www→apex 重定向

**原因**：
```
Worker 自定义域里加 www.piccalc.com 后：
  · 浏览器访问 www 显示「不安全」
  · curl -Ik https://www.piccalc.com/ → (35) Connection was reset（TLS 握手被掐断）
  · 等待后仍未恢复
而 CF 后台的「批量重定向 / 规则」（主机名=www.piccalc.com → 301 到 apex）
  开启后**几秒钟即生效**，稳定可靠。

→ 结论：www 的跳转交给 CF 规则层处理，Worker 不再参与。
```

**本次改动**：
```
删除 src/index.js 中：
  if (url.hostname === 'www.piccalc.com') { return Response.redirect(..., 301); }

★ 保留：/ads.txt 最高优先级拦截（在本段之前，不受跳转影响）
★ 保留：其余全部逻辑（robots / sitemap / 安全头 / 无后缀补 .html）
```

**部署后**：
```
① 确保 CF 后台那条 www → apex 的 301 规则是「开启」状态
② Purge 缓存
③ 验 https://piccalc.com/ads.txt      → 200，显示 pub 行
④ 验 https://www.piccalc.com/         → 301 跳到 piccalc.com（由 CF 规则完成）
```
**注**：AdSense 提交的站点是 piccalc.com（apex）。V70 终版起，机器文件
（`/ads.txt`、`/robots.txt`、`/sitemap.xml`、站长验证文件）在 **www 与 apex 上都直接 200**，
不经过 301 —— 避免抓取器遇到「跨主机跳转」时报「找不到 ads.txt」。
其余页面仍统一 301 到 apex，杜绝 www/apex 双份内容。


## V70 本轮要点
- 线上实测 `/tools/adjust.html` → 307、`/tools/adjust` → 200，故全站 URL 统一为**无扩展名**。
- 88 页重复 DOCTYPE、og:locale / og:locale:alternate、twitter 卡片、导航重复项、README 识别信息已修。
- AdSense 广告位**真实放出，不再注释**：全站仅 2 个 —— 英文首页 1 个、中文首页 1 个，均在「工具卡片网格结束 ↔ 图片处理指南标题之前」，电脑手机同一位置。
- 已绑定 AdSense 后台「0003」横幅·自适应单元，正式 slot `1784463687`（pub id `ca-pub-8915931557404979` 未动）；HTML 内直接写真号与 `data-ad-format="auto" data-full-width-responsive="true"`，`ads-config.js` 同号，**无占位号、部署前无需再改配置**。
- 容器写死高度：桌面 728×90（高 90px）、手机 320×100（高 100px），`overflow:hidden` 锁死高度，Safari / Chrome / 安卓一致；随文档流滚动（非 fixed/sticky），不存在隐藏广告位。
- 广告 iframe 只做绝对定位（脱离文档流），**不改写其 width/height**；容器锁高 + `overflow:hidden` 负责不撑开页面，避免压缩/变形广告内容。
- **广告位周围不放任何可见内容**：无「广告」小字、无卡片、描边、底色、阴影、圆角，容器与页面深色背景融为一体。
- `https://piccalc.com/ads.txt` 必须直接返回纯文本 200（不要被 CF 缓存规则 / 安全级别拦截）。Google 报「找不到 ads.txt」根因在抓取层，跟页面有没有广告位无关，但广告位放出对审核展示有利。
- V70 终版：Worker 里机器文件改为 www/apex 双 200；修正 3 处 `new Request(url, request.clone())` 的非法 init 写法（原写法会静默丢弃请求头）。

---

## V70.2 封存复审修订（2026-11-10，最终版）

只改 4 处，均为确证问题，其余文件逐字节未动：

1. `/tools/`、`/tools`、`/zh/tools/`、`/zh/tools/` 原本没有 index.html，404 兜底页却链了「工具列表」，点进去仍是 404；现在统一 301 到首页工具锚点（`/`、`/zh/` 的 `#tools`），不新增页面、不产生重复内容。
2. 站长验证文件 `2e63d291b36d4ca8a6b1f2bf2c17fa2e.txt` 加入 www 机器文件白名单（不再跨主机 301），并在 `_headers` 声明纯文本 + 不缓存。
3. `sitemap.xml` 88 条 `lastmod` 由 2026-11-08 更新为 2026-11-10。
4. 404 兜底页两个「工具列表」链接改为直达首页锚点（双保险）。

广告位、pub id、ads.txt、页面正文、canonical / hreflang / 内链、Worker 其余逻辑一律未动。
