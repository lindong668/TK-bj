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
