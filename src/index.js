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

    /* ★★ 统一跳转收敛（合体版 · 重定向专项）
     * 入口形态很多：http/https × www/apex × 带 .html/无扩展名 × 大写扩展名 ×
     * 尾斜杠 × 带 query × /index.html × 旧 /guides 短名 × /tools/remove-bg。
     * 旧实现是「www 先跳一次，.html 再跳一次」，www/about.html 会走两跳
     * （GSC 里表现为「自动重定向」堆积）。这里改为：
     *   先由 canonicalPath() 算出唯一终态路径，再把
     *   http→https、www→apex、剥扩展名、旧名映射合并进【同一次 301】。
     *
     * 机器文件（ads.txt / robots.txt / sitemap.xml / 站长验证文件）例外：
     * 在 www 上也【直接 200】，不参与任何跳转。AdSense / GSC 抓取器对
     * 跨主机 301 容忍度低，一旦 www 上只返回跳转就可能报「找不到 ads.txt」。
     */
    const MACHINE_PATHS = new Set([
      '/ads.txt', '/Ads.txt', '/robots.txt', '/sitemap.xml',
      '/google6474e28bb6098302.html',
      '/2e63d291b36d4ca8a6b1f2bf2c17fa2e.txt'
    ]);

    /* 真实存在 index.html 的目录根：保留尾斜杠，不做剥离 */
    const DIR_ROOTS = new Set(['/', '/zh/', '/guides/', '/zh/guides/']);

    /* 旧指南短名 → 现存真身（全部指向已核实存在的页面，见报告「历史 URL 收敛表」）
     * 键一律无扩展名：/guides/exif、/guides/exif.html、/guides/exif/ 都命中。
     * 中文站同构，一并映射到 /zh/tools/<name>。 */
    const GUIDES_LEGACY_MAP = {
      '/guides/resize':    '/tools/resize',
      '/guides/remove-bg': '/tools/icon-maker',
      '/guides/crop':      '/tools/crop',
      '/guides/compress':  '/tools/compress',
      '/guides/id-photo':  '/tools/id-photo',
      '/guides/mosaic':    '/tools/mosaic',
      '/guides/exif':      '/tools/exif',
      '/guides/upscale':   '/tools/upscale',
      '/guides/convert':   '/tools/convert',
    };
    const ZH_GUIDES_LEGACY_MAP = {};
    for (const [k, v] of Object.entries(GUIDES_LEGACY_MAP)) {
      ZH_GUIDES_LEGACY_MAP['/zh' + k] = '/zh' + v;
    }

    /* /tools/remove-bg 的 slug 与内容不符（实为 ICO 工具），内容已并入 icon-maker */
    const LEGACY_SLUG_MAP = {
      '/tools/remove-bg':    '/tools/icon-maker',
      '/zh/tools/remove-bg': '/zh/tools/icon-maker',
    };

    /* public/tools/ 与 public/zh/tools/ 下没有 index.html，目录根跳首页工具锚点 */
    const TOOLS_DIR_MAP = {
      '/tools':     '/#tools',
      '/tools/':    '/#tools',
      '/zh/tools':  '/zh/#tools',
      '/zh/tools/': '/zh/#tools',
    };

    /* 返回该请求应 301 到的终态路径；null 表示无需跳转。
     * 顺序：目录别名 → 去尾斜杠 → 剥扩展名（大小写不敏感）→ 旧名映射 → index 归目录根 */
    function canonicalPath(p) {
      if (TOOLS_DIR_MAP[p]) return TOOLS_DIR_MAP[p];

      let path = p;
      if (path.length > 1 && path.endsWith('/') && !DIR_ROOTS.has(path)) {
        path = path.slice(0, -1);
      }

      const lower = path.toLowerCase();
      const hasHtml = lower.endsWith('.html');
      const hasHtm = !hasHtml && lower.endsWith('.htm');
      let clean = path;
      if (hasHtml) clean = path.slice(0, -5);
      else if (hasHtm) clean = path.slice(0, -4);

      if (GUIDES_LEGACY_MAP[clean]) return GUIDES_LEGACY_MAP[clean];
      if (ZH_GUIDES_LEGACY_MAP[clean]) return ZH_GUIDES_LEGACY_MAP[clean];
      if (LEGACY_SLUG_MAP[clean]) return LEGACY_SLUG_MAP[clean];

      if (clean === '/index') return '/';
      if (clean.endsWith('/index')) return clean.slice(0, -6) + '/';

      if (clean !== path) return clean;   // 剥过扩展名（含 .HTML / .HTM）
      if (path !== p) return path;        // 剥过尾斜杠
      return null;
    }

    /* 404 兜底页（带 noindex）：跳转目标不存在时直接用它，
     * 不再「301 到一个 404」或让 CF  Assets 的 307 混进链路。 */
    function notFound(p) {
      const isZh = p.startsWith('/zh/');
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

    const isMachine = MACHINE_PATHS.has(url.pathname);
    const targetPath = isMachine ? null : canonicalPath(url.pathname);

    /* ① 协议 / 主机收敛：http 与 www 合并进同一次 301，Location 直接给终态路径。
     * 目标不存在时直接 404（www 上不制造 301→404 的空链）。 */
    if (!isMachine && (url.protocol === 'http:' || url.hostname === 'www.piccalc.com')) {
      const dest = targetPath || url.pathname;
      const probe = await env.ASSETS.fetch(new Request(url.origin + dest));
      if (probe.status !== 200) return notFound(url.pathname);
      return Response.redirect('https://piccalc.com' + dest + url.search, 301);
    }

    /* ② 路径收敛：只有终态真实存在才 301，避免 301 → 404 的空跳（GSC：「重定向错误」） */
    if (targetPath) {
      const probe = await env.ASSETS.fetch(new Request(url.origin + targetPath));
      if (probe.status !== 200) return notFound(url.pathname);
      return Response.redirect(url.origin + targetPath + url.search, 301);
    }

    /* ★★ ads.txt 拦截（V22 修复，V25 说明更新）
     * 两个不变的关键点：
     *   1. Content-Type 用纯 text/plain（不带 charset）
     *   2. nosniff 防止被二次猜测 MIME
     * AdSense 抓取器跟随 301 后在 apex 拿到 200。
     */
    if (url.pathname === '/ads.txt' || url.pathname === '/Ads.txt') {
      return new Response(
        'google.com, pub-8915931557404979, DIRECT, f08c47fec0942fa0\n',
        { status: 200, headers: {
            'content-type': 'text/plain',
            'X-Content-Type-Options': 'nosniff',
            'cache-control': 'public, max-age=3600'
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

    /* 说明：/guides 旧短名、/tools/remove-bg、/tools 目录根、.html 剥离
     * 全部已上移到入口处的 canonicalPath()，一次性 301 到终态，
     * 不再在 ASSETS 之前逐个分支跳转（避免「先跳一次再跳一次」的两跳）。 */

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
    if (res.status === 404) return notFound(pathname);

    return res;
  }
};
