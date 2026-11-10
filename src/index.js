/**
 * PicStudio 静态资源服务（V70）
 * 负责把 /public 下的文件吐出去，补安全与 SEO 响应头。
 *
 * ★ V70 URL 形态统一（2026-11-10）· r2 补无扩展名本地兜底
 *   线上实测：无扩展名地址 200（最终页）。
 *   ★ V70.4：带 .html 的请求改为 Worker 直接 301 到无扩展名（原来由 CF Assets 307 收敛），
 *     307 是临时跳、Google 跟随但不做权重归一，日志里 248 条 307 / 23 页两套 URL 并存。
 *   全站 canonical / hreflang / og:url / sitemap / 内链 / 语言切换已统一为无扩展名。
 *
 *   【本版删掉了旧「无后缀 URL 自动补 .html 的 301」逻辑】
 *   旧代码对 /about 探测 /about.html，若 200 就 301 到 /about.html。
 *   但线上 /about.html 实际返回 307（不是 200），所以这段永远是死代码；
 *   一旦 CF 的 html_handling 行为变化让探测拿到 200，就会形成
 *     /about → 301 → /about.html → 307 → /about 的循环。
 *   现改为：无扩展名请求直接交给 ASSETS（200），带 .html 的由 Worker 301 归一，
 *   两套方向相反的规则不再并存。
 *
 *   【目录根 /guides/ /zh/ 等也不再手工 fetch index.html】
 *   CF Assets 原生支持目录根映射到 index.html，交给它处理即可，
 *   避免内部请求带 .html 又被 307 造成分支失效。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ★★ www → apex 的 301 重定向（页面路径一律跳转）
     * V70 终版例外：机器文件（ads.txt / robots.txt / sitemap.xml / 站长验证文件）
     * 在 www 上也【直接 200】，不经过 301。
     * 原因：AdSense 的 ads.txt 抓取器、GSC 验证器对「跨主机 301」容忍度低，
     *       一旦 www 上只返回跳转、文件只在 apex 才有，就可能报「找不到 ads.txt」。
     *       这 4 类都是纯文本/机器文件，不产生重复内容，直接 200 最稳。
     * 其余所有页面路径仍 301 到 apex，避免 www/apex 双份内容。
     */
    const MACHINE_PATHS = new Set([
      '/ads.txt', '/Ads.txt', '/robots.txt', '/sitemap.xml',
      '/google6474e28bb6098302.html',
      '/2e63d291b36d4ca8a6b1f2bf2c17fa2e.txt'
    ]);
    if (url.hostname === 'www.piccalc.com' && !MACHINE_PATHS.has(url.pathname)) {
      return Response.redirect('https://piccalc.com' + url.pathname + url.search, 301);
    }

    /* ★★ ads.txt 拦截（V22 修复，V25 说明更新）
     * 两个不变的关键点：
     *   1. Content-Type 用纯 text/plain（不带 charset）
     *   2. nosniff 防止被二次猜测 MIME
     * AdSense 抓取器跟随 301 后在 apex 拿到 200。
     */
    if (url.pathname === '/ads.txt' || url.pathname === '/Ads.txt') {
      return new Response(
        'google.com, pub-8915931557404979, DIRECT, f08c47fe0942fa0\n',
        { status: 200, headers: {
            'content-type': 'text/plain',
            'X-Content-Type-Options': 'nosniff',
            'cache-control': 'public, max-age=86400'
        } }
      );
    }

    /* ★ V24 更正：V23 曾把 www→apex 挪到 CF 规则，这是错的，已回归 Worker 内实现。
     * CF 的「批量重定向 / Redirect Rules」在 CDN 层执行，==早于 Worker==，
     * 会把 /ads.txt、/robots.txt、/sitemap.xml 一起 301 掉，
     * 导致 AdSense 判「未找到」、Google robots.txt 提取失败。
     */
    let pathname = url.pathname;

    /* ★ 谷歌站长验证文件硬拦截
     * 直接返回固定内容 + text/html，并禁用缓存，
     * 保证 Google 每次来复查都能立刻拿到最新内容。
     * ⚠️ 这个路径必须保留 .html 后缀，不能参与 URL 形态统一。
     */
    if (pathname === '/google6474e28bb6098302.html') {
      return new Response(
        'google-site-verification: google6474e28bb6098302.html\n',
        { status: 200, headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-cache, must-revalidate'
        } }
      );
    }

    if (pathname === '/robots.txt') {
      return new Response(
        'User-agent: Mediapartners-Google\nAllow: /\n\nUser-agent: Googlebot\nAllow: /\n\nUser-agent: Bingbot\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: https://piccalc.com/sitemap.xml\n',
        { status: 200, headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=3600'
        } }
      );
    }

    /* ★ sitemap.xml 硬拦截（双保险）—— 2026-10-23 新增
     * Google 的 sitemap 抓取器对 Content-Type 极其严格，必须是 application/xml。
     * 从 ASSETS 读取真实文件内容后强制改写 Content-Type，不写死内容，
     * 保证 sitemap.xml 后续更新能自动生效（V70 已把其中 URL 统一为无扩展名）。
     */
    if (pathname === '/sitemap.xml') {
      // 直接用原始请求取静态文件；原先 new Request(url, request.clone()) 的第二个参数
      // 不是合法 init 字典，会静默丢掉请求头，这里改为规范写法并保留非 200 原样透传。
      const src = await env.ASSETS.fetch(request);
      if (src.status !== 200) return src;
      const body = await src.text();
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        },
      });
    }

    /* ★★ V27：/guides/ 废弃旧短名 → /tools/ 正式地址【写死映射】301
     * 背景（拆包实测）：public/guides/ 下真实存在的 10 个文件用【长名】，
     * 而 GSC「未找到(404)」里的 7 个是【旧短名】，真身全部在 /tools/ 下。
     * V27 改成写死映射，在 env.ASSETS.fetch 之前直接 return，100% 生效。
     *
     * ★ V70：映射键与跳转目标一律用【无扩展名】。
     *   先把请求路径的 .html 后缀剥掉再查表，这样
     *   /guides/resize.html 与 /guides/resize 两种入口都直接 301 到 /tools/resize（200），
     *   不再出现「301 到 .html 又被 307」的双跳。
     * ★ 只映射这 7 个废弃短名，【绝不】无条件跳 /guides/* ！
     */
    const cleanPath = pathname.replace(/\.html$/, '');
    const GUIDES_LEGACY_MAP = {
      '/guides/resize':    '/tools/resize',
      '/guides/remove-bg': '/tools/remove-bg',
      '/guides/crop':      '/tools/crop',
      '/guides/compress':  '/tools/compress',
      '/guides/id-photo':  '/tools/id-photo',
      '/guides/mosaic':    '/tools/mosaic',
      '/guides/exif':      '/tools/exif',
    };
    if (GUIDES_LEGACY_MAP[cleanPath]) {
      return Response.redirect(url.origin + GUIDES_LEGACY_MAP[cleanPath] + url.search, 301);
    }

    /* ★ V70.2 复审修复：public/tools/ 与 public/zh/tools/ 下没有 index.html，
     * 而 404 兜底页原本链了「工具列表 / All tools」到这两个目录根 —— 点进去又是 404，
     * Google 抓目录根同样吃 404。统一 301 到首页工具锚点：不新增页面、不产生重复内容，
     * 精确匹配这四个路径，绝不误伤 /tools/xxx 具体工具页。 */
    const TOOLS_DIR_MAP = {
      '/tools':     '/#tools',
      '/tools/':    '/#tools',
      '/zh/tools':  '/zh/#tools',
      '/zh/tools/': '/zh/#tools',
    };
    const toolsDir = TOOLS_DIR_MAP[pathname] || TOOLS_DIR_MAP[cleanPath];
    if (toolsDir) {
      return Response.redirect(url.origin + toolsDir + url.search, 301);
    }

    /* ★ V70.4：带 .html 的请求 → 301 到无扩展名（取代 CF Assets 的 307）
     * 依据：CF 抓取日志 248 条 307、23 个页面两套 URL 并存；307 是临时跳，
     *       Google 跟随但不合并权重，是「几百页只收几页」在抓取层的实因。
     * 顺序：放在 legacy map / toolsDir 之后，命中旧短名的直接跳终态，不产生双跳。
     * 例外：验证文件 google6474e28bb6098302.html 在前面已硬拦截返回 200；
     *       /index.html、/zh/index.html、/guides/index.html 归到目录根。
     */
    if (pathname.endsWith('.html') && !MACHINE_PATHS.has(pathname)) {
      const clean = pathname.replace(/\.html$/, '');
      let target;
      if (clean === '/index' || clean === '') target = '/';
      else if (clean.endsWith('/index')) target = clean.slice(0, -6) + '/';
      else target = clean;
      return Response.redirect(url.origin + target + url.search, 301);
    }

    // 无扩展名请求直接交给 ASSETS：线上这些路径就是最终 200 页面。
    // 目录根（/guides/、/zh/、/zh/guides/）由 CF Assets 原生映射到 index.html，不再手工 fetch。
    let res = await env.ASSETS.fetch(request);

    /* ★ V70-r2：无扩展名 → 内部补取同名 .html（仅 ASSETS 返回 404 时）
     * 为什么：CF Assets 原生把 /about 映射到 about.html（200），但本地预览台 /
     * 纯静态 ASSETS 没有这层映射，会把全站无扩展名链接判成 404，
     * 于是「页面不存在」兜底页冒出来（2026-11-10 实测 /zh/guides/compress-to-size）。
     * 做法：内部 fetch 一次 path+'.html'，命中 200 就直接拿它当响应。
     *   · 不是 301/307，浏览器地址仍是无扩展名 → 不会形成重定向循环
     *   · 线上 CF 首取就是 200，此分支永不触发，零行为变化
     *   · 真 404 的路径补 .html 仍是 404，照常走下面的 noindex 兜底
     */
    if (res.status === 404 && !pathname.endsWith('.html') && !pathname.endsWith('/')) {
      try {
        const alt = await env.ASSETS.fetch(new Request(url.origin + pathname + '.html'));
        if (alt.status === 200) res = alt;
      } catch (e) { /* 保持原 404 */ }
    }

    /* ★★ V26：/guides/ 旧路径 → /tools/ 真身的 301 迁移跳转（404 时才探测）
     * ① 零成本：正常页面不触发，只在真 404 时多一次探测
     * ② 不写死：以后再出现同类迁移自动兜住
     * ③ 安全：只有确认 /tools/ 下真有 200 的页面才跳，绝不把 404 跳成另一个 404
     * ★ V70：base 剥掉 .html，探测地址与跳转目标都用无扩展名。
     */
    if (res.status === 404 && pathname.startsWith('/guides/')) {
      const base = pathname.slice('/guides/'.length).replace(/\.html$/, '');
      if (base && base !== 'index' && base !== 'index.html') {
        const alt = new Request(url.origin + '/tools/' + base);
        const altRes = await env.ASSETS.fetch(alt);
        if (altRes.status === 200) {
          return Response.redirect(url.origin + '/tools/' + base + url.search, 301);
        }
      }
    }

    // 404 兜底：带 noindex，避免软 404 被收录；给可走的导航而不是空白页。
    if (res.status === 404) {
      const isZh = pathname.startsWith('/zh/');
      const body = isZh
        ? '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
          '<meta name="robots" content="noindex,follow"><title>页面不存在 · PicStudio</title></head>' +
          '<body style="font-family:system-ui;max-width:560px;margin:15vh auto;text-align:center;line-height:1.8">' +
          '<h1 style="font-size:22px">页面不存在</h1>' +
          '<p style="color:#64748b">你访问的页面已移动或从未存在。</p>' +
          '<p><a href="/zh/" style="color:#6366f1">返回中文首页</a> · ' +
          '<a href="/zh/#tools" style="color:#6366f1">工具列表</a> · ' +
          '<a href="/zh/guides/" style="color:#6366f1">使用指南</a></p></body></html>'
        : '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
          '<meta name="robots" content="noindex,follow"><title>Page not found | PicStudio</title></head>' +
          '<body style="font-family:system-ui;max-width:560px;margin:15vh auto;text-align:center;line-height:1.8">' +
          '<h1 style="font-size:22px">Page not found</h1>' +
          '<p style="color:#64748b">This page has moved or never existed.</p>' +
          '<p><a href="/" style="color:#6366f1">Back to PicStudio</a> · ' +
          '<a href="/#tools" style="color:#6366f1">All tools</a> · ' +
          '<a href="/guides/" style="color:#6366f1">Guides</a></p></body></html>';
      return new Response(body,
        { status: 404, headers: {
            'content-type': 'text/html; charset=utf-8',
            'X-Content-Type-Options': 'nosniff'
        } }
      );
    }

    return res;
  }
};
