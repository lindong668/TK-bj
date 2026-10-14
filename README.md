# PicStudio - 免费在线图片处理工具

一个纯前端实现的在线图片处理工具站，提供 AI 抠图、背景虚化、格式转换、尺寸调整、图标制作等功能。

## ✨ 功能列表

| 工具 | 说明 |
|------|------|
| ✂️ AI 智能抠图 | 一键去除图片背景，支持透明/白色/自定义背景 |
| 🌫️ 背景虚化 | 中心清晰、全局虚化、边缘虚化三种模式 |
| 🔄 格式转换 | PNG/JPG/WebP/BMP 互转 |
| 📐 尺寸调整 | 按比例/像素/预设尺寸三种模式 |
| 🎯 图标制作 | 生成 App 图标，支持圆角、背景色 |
| 🗜️ 图片压缩 | 智能压缩，实时显示压缩率 |
| 🌈 滤镜美化 | 黑白、复古、冷调、暖调等 9 种滤镜 |
| ⬜ 圆角裁剪 | 圆角矩形、圆形、心形遮罩 |

## 🛠️ 技术栈

- **纯前端**：HTML + CSS + JavaScript（无后端）
- **Canvas API**：所有图片处理在浏览器本地完成
- **零依赖**：无需安装任何库，打开即用

## 🚀 部署到 Cloudflare Pages

### 方式一：通过 GitHub（推荐）

1. **创建 GitHub 仓库**
   - 登录 GitHub，点击右上角 "+" → "New repository"
   - 仓库名填 `picstudio`，选择 Public，点击 Create

2. **上传代码**
   ```bash
   # 在 picstudio 文件夹内执行
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/你的用户名/picstudio.git
   git push -u origin main
   ```

3. **连接 Cloudflare Pages**
   - 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
   - 进入 "Pages" → "Create a project" → "Connect to Git"
   - 授权 GitHub，选择 picstudio 仓库
   - 构建配置：
     - Framework preset: `None`
     - Build command: 留空
     - Build output directory: `/`
   - 点击 "Save and Deploy"

4. **等待部署完成**
   - 约 1-2 分钟，部署完成后会给你一个 `xxx.pages.dev` 的域名
   - 以后每次 push 代码到 GitHub，CF 会自动重新部署

### 方式二：直接上传（不用 Git）

1. 登录 Cloudflare Dashboard → Pages → "Create a project"
2. 选择 "Upload assets"（直接上传文件）
3. 把整个 picstudio 文件夹压缩成 zip
4. 上传 zip 文件
5. 项目名填 `picstudio`，点击部署

## 🌐 绑定自定义域名

1. 在 Cloudflare Pages 项目页面 → "Custom domains"
2. 点击 "Set up a custom domain"
3. 输入你的域名（如 `img.yourdomain.com`）
4. 按提示到你的域名 DNS 服务商处添加 CNAME 记录：
   ```
   类型: CNAME
   名称: img（或你的子域名前缀）
   目标: picstudio.pages.dev
   ```
5. 等待 DNS 生效（通常几分钟到几小时）
6. Cloudflare 会自动帮你配置 HTTPS 证书

## 📁 项目结构

```
picstudio/
├── index.html              # 首页
├── _headers                # Cloudflare 缓存和安全头配置
├── assets/
│   ├── css/
│   │   └── style.css       # 全局样式
│   └── js/
│       ├── main.js         # 首页交互逻辑
│       └── tools.js        # 工具通用类和图片处理函数
└── tools/
    ├── remove-bg.html      # AI 抠图
    ├── blur.html           # 背景虚化
    ├── convert.html        # 格式转换
    ├── resize.html         # 尺寸调整
    ├── icon-maker.html     # 图标制作
    ├── compress.html       # 图片压缩
    ├── filter.html         # 滤镜美化
    └── rounded.html        # 圆角裁剪
```

## 🔒 隐私说明

所有图片处理均在浏览器本地完成，图片**不会上传到任何服务器**，请放心使用。

## 📝 License

MIT License - 可自由使用、修改、分发
