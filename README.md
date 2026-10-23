# PicStudio (piccalc.com)

Cloudflare Workers + Assets 静态站点

## 结构
- `public/`       线上站点全部内容（wrangler.toml: [assets] directory = "./public"）
- `src/index.js`  Worker 入口（wrangler.toml: main = "src/index.js"）
- `wrangler.toml` 部署配置

## 部署
Cloudflare Workers → picstudio → 连接本仓库本分支

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
