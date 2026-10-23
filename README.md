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
