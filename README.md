# PicStudio (piccalc.com)

Cloudflare Workers + Assets 静态站点

## 结构
- `public/`       线上站点全部内容（wrangler.toml: [assets] directory = "./public"）
- `src/index.js`  Worker 入口（wrangler.toml: main = "src/index.js"）
- `wrangler.toml` 部署配置

## 部署
Cloudflare Workers → picstudio → 连接本仓库本分支
