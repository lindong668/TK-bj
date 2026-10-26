/**
 * PicStudio 静态资源服务
 * 负责把 /public 下的文件吐出去，补安全与 SEO 响应头。
 *
 * 新增（本次）：无后缀 URL 自动补 .html
 *   例：/tools/palette  →  /tools/palette.html （301）
 *   作用：Google 已收录过一批不带 .html 的 URL，
 *        直接放开会变成 404 并被逐步移出索引，
 *        这样可以把旧收录的权重和平转移到正式 URL。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* ★★ V25：www → apex 的 301 重定向（全路径跳转，无任何例外）
     *
     * 位置：放在【所有拦截之前】，因此 www 的任意路径
     *   /ads.txt、/robots.txt、/sitemap.xml、/ ……
     *   全部 301 到 apex，不设特例 —— 行为完全一致，逻辑最简单。
     *
     * apex（piccalc.com）不匹配本段，继续往下走：
     *   ads.txt / 验证文件 / robots.txt / sitemap.xml 拦截 → 200
     *   其余 → 静态资源兜底
     */
    if (url.hostname === 'www.piccalc.com') {
      return Response.redirect('https://piccalc.com' + url.pathname + url.search, 301);
    }

    /* ★★ ads.txt 拦截（V22 修复，V25 说明更新）
     *
     * V25 起，www 的 301 已提到本段【之前】，
     *   因此 www 形态的 /ads.txt 会 301 到 apex，
     *   由 apex 走本段返回 200（AdSense 抓取器会跟随 301）。
     * 本段现在只对 apex（piccalc.com）生效，返回 200。
     *
     * 两个不变的关键点：
     *   1. Content-Type 用纯 text/plain（不带 charset），
     *      消除严格字符串匹配场景下的失败风险。
     *   2. nosniff 防止被二次猜测 MIME。
     */
    if (url.pathname === '/ads.txt' || url.pathname === '/Ads.txt') {
      return new Response(
        'google.com, pub-8915931557404979, DIRECT, f08c47fec0942fa0\n',
        { status: 200, headers: {
            'content-type': 'text/plain',
            'X-Content-Type-Options': 'nosniff',
            'cache-control': 'public, max-age=86400'
        } }
      );
    }

    /* ★ V24 更正：V23 曾把 www→apex 挪到 CF 规则，这是错的，已回归 Worker 内实现。
     *
     * 为什么不能用 CF 规则：
     *   CF 的「批量重定向 / Redirect Rules」在 CDN 层执行，==早于 Worker==，
     *   会把 /ads.txt、/robots.txt、/sitemap.xml 一起 301 掉，
     *   导致 AdSense 判「未找到」、Google robots.txt 提取失败。
     *
     * V24 的正确位置：见下方第 139 行，
     *   位于 ads.txt / 验证文件 / robots.txt / sitemap.xml 四个拦截【之后】，
     *   → 这些特例路径天然不被跳转，由代码顺序保证，不依赖外部规则。
     *
     * （V23 那句"前提是该请求能到达 Worker"正是踩坑点：
     *    CF 规则在更早的层就把请求截走，根本到不了 Worker。）
     */

    let pathname = url.pathname;


    /* ★ 谷歌站长验证文件硬拦截
     * 同理：直接返回固定内容 + text/html，并禁用缓存，
     * 保证 Google 每次来复查都能立刻拿到最新内容。 */
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
     *
     * 背景：与 ads.txt / robots.txt 完全同类的隐患。
     * Google 的 sitemap 抓取器对 Content-Type 极其严格 ——
     * 必须是 application/xml（或 text/xml）。
     * 一旦被 Assets 猜成 text/html 或 application/octet-stream，
     * GSC 就会报「无法抓取 / 类型未知 / 0 个网址」，
     * sitemap 提交失败，收录链路直接断掉。
     *
     * 实证：4号（haiwai-dao-hang）此前正是踩了这个坑 ——
     *   静态返回时被判「类型未知、0 个网址」，
     *   改成 Worker 读取后强制改写 Content-Type 才恢复正常。
     * 本站原先只靠 public/_headers 声明，而 _headers 在部分
     * Workers Assets 版本下不一定生效（本站自己的注释已写明）。
     * 所以这里补上与 4号 相同的 Worker 层接管，堵死这个隐患。
     *
     * 做法：从 ASSETS 读取真实文件内容，强制改写 Content-Type 后吐出。
     * 不写死内容，保证 sitemap.xml 后续更新能自动生效。 */
    if (pathname === '/sitemap.xml') {
      const src = await env.ASSETS.fetch(new Request(url.origin + '/sitemap.xml', request.clone()));
      const body = await src.text();
      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/xml; charset=utf-8',
          'cache-control': 'public, max-age=3600',
        },
      });
    }

    // 形如 /tools/palette、/about 这类无扩展名路径，尝试补 .html
    //
    // ⚠️ 只对 GET/HEAD 做补后缀探测。
    // 原因：new Request(url, request) 会复用原请求的 body 流，
    // 之后再 env.ASSETS.fetch(request) 就会抛
    //   "Cannot reconstruct a Request with a used body."
    // （日志里 POST /wp-json/batch/v1 的 error 就是这么来的。）
    // 补后缀本身就是为页面导航服务的，POST 没有补的必要，直接跳过。
    const noExt = !/\.[a-zA-Z0-9]+$/.test(pathname);
    const isNav = request.method === 'GET' || request.method === 'HEAD';
    if (isNav && noExt && pathname !== '/' && !pathname.endsWith('/')) {
      // 用 clone 探测，确保原 request 的 body 完好无损
      const probe = new Request(url.origin + pathname + '.html', request.clone());
      const probeRes = await env.ASSETS.fetch(probe);
      if (probeRes.status === 200) {
        // 301 永久重定向，把旧收录权重转移到带 .html 的正式地址
        return Response.redirect(url.origin + pathname + '.html' + url.search, 301);
      }
    }

    // 目录根显式指向 index.html，避免部分版本下 /guides/ 落到兜底 404
    if (pathname === '/guides' || pathname === '/guides/') {
      const idx = await env.ASSETS.fetch(new Request(url.origin + '/guides/index.html', request.clone()));
      if (idx.status === 200) return idx;
    }

    const res = await env.ASSETS.fetch(request);

    /* ★★ V26 新增：/guides/ 旧路径 → /tools/ 真身的 301 迁移跳转
     *
     * 背景（实测发现，非推测）：
     *   GSC「未找到 (404)」列表里的 7 个地址全部形如：
     *     /guides/resize.html   /guides/crop.html    /guides/mosaic.html
     *     /guides/compress.html /guides/id-photo.html
     *     /guides/exif.html     /guides/remove-bg.html
     *   但 public/guides/ 下根本没有这些文件 —— 它们是早期收录的旧路径。
     *
     *   真身全部在 /tools/ 下（已逐个核对存在）：
     *     /tools/resize.html  /tools/crop.html  /tools/mosaic.html
     *     /tools/compress.html /tools/id-photo.html
     *     /tools/exif.html    /tools/remove-bg.html
     *   即站点经历过 guides → tools 的路径迁移，但从未补跳转，
     *   于是这些旧地址一直 404，被 GSC 持续判为「未找到」。
     *
     * 为什么写成"404 时才探测"而不是预先写死一张映射表：
     *   ① 零成本：正常页面不触发，只在真 404 时多一次探测
     *   ② 不写死：以后再出现同类迁移，自动兜住，不用回来改代码
     *   ③ 安全：只有确认 /tools/ 下真有 200 的页面才跳，
     *      绝不把 404 跳成另一个 404
     */
    if (res.status === 404 && pathname.startsWith('/guides/')) {
      const base = pathname.slice('/guides/'.length);
      if (base && base !== 'index.html') {
        const alt = new Request(url.origin + '/tools/' + base, request.clone());
        const altRes = await env.ASSETS.fetch(alt);
        if (altRes.status === 200) {
          // 301 永久重定向：把旧收录的权重转移到 /tools/ 正式地址
          return Response.redirect(url.origin + '/tools/' + base + url.search, 301);
        }
      }
    }

    // 404 兜底：给一个最简单的提示页，而不是空白
    if (res.status === 404) {
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>页面不存在 · PicStudio</title>' +
        '<div style="font-family:system-ui;max-width:560px;margin:15vh auto;text-align:center">' +
        '<h1 style="font-size:22px">页面不存在</h1>' +
        '<p style="color:#64748b">你访问的页面已移动或从未存在。</p>' +
        '<a href="/" style="color:#6366f1">返回 PicStudio 首页</a></div>',
        { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }
      );
    }

    return res;
  }
};
