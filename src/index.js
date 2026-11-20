/**
 * PicCalc 静态资源服务（V70.9 · 重定向合体归一）
 * 负责把 /public 下的文件吐出去，补机器文件响应头、404 noindex 兜底。
 *
 * ★ V70.9-r3（本轮，拆包复验 410 条入口后补的 5 个真 404）：
 *   · 路径内多余连续斜杠未归一：//guides/crop.html、///guides/crop.html、
 *     /guides//crop.html 全部 404 → ⓪-a 先压缩为单斜杠，再走原有归一。
 *   · .htm 旧式后缀 /guides/crop.htm 404 → ① 扩展名剥离兼容 (html|htm)。
 *   · /ADS.TXT 大小写变体 404 → 机器文件白名单与 4 个内容分支统一小写比较。
 *   以上 5 条都不改任何正常路径、不动 ads.txt 内容、不动 sitemap / canonical / 内链。
 *
 * ★ V70.9-r2：补两个组合场景（拆包复验实测出来的，不修就是 404）：
 *   · /guides/CROP.HTML：扩展名大小写已兼容，但短名比对原本区分大小写 → 短路名按小写比对；
 *   · /guides/crop/?utm=x：③ 的短名匹配在 ⑥ 剥尾斜杠之前，带尾斜杠的旧地址匹配不上
 *     → ⑥ 之后再查一次。两处目标一律用小写真名，且仍先探测 200 才发 301。
 *
 * ★ V70.9：把「协议 / 主机 / 剥扩展名 / 旧名映射 / 退役路径 / 目录根 / 尾斜杠」
 *   合成【一次 301】完成，取代原先分散在 5 个 if 里的多段跳转。
 *   实包基线 284 条入口矩阵：178 条不合格、最大链长 2；
 *   本版目标：https 入口最大链长 1，随机路径保持 404 + noindex。
 *
 * ★ 为什么不再分两段跳（旧版真实缺陷，拆包实测）：
 *   · www/guides/exif        → 301 apex/guides/exif → 301 /tools/exif        （2 跳）
 *   · apex/guides/upscale.html → 301 /guides/upscale → 兜底 301 /tools/upscale（2 跳）
 *   · www/tools/             → 301 apex/tools/       → 301 /#tools             （2 跳）
 *   · /guides/remove-bg      → 301 /tools/remove-bg  → 301 /tools/icon-maker   （2 跳）
 *   · .HTML 大写 / 尾斜杠 / 中文旧指南短名：直接 404，不归一
 *   · http 入口下旧代码用 url.origin 拼 Location，会跳回 http（协议未升级）
 *
 * ★ 归一目标先做一次 ASSETS 探测：只有目标确实 200 才发 301，
 *   绝不产生「301 → 404」的坏链（Google 把跳到 404 记为重定向错误）。
 *
 * ★ CF 控制台两条建议的取舍（详见复审报告）：
 *   1. 若控制台仍存在 10 月建的 www→apex 重定向规则且保留 .html，
 *      它在 Worker 之前短路执行，Worker 收不到 www 请求 → 必须停用/删除。
 *   2. 【不建议】关掉 Always Use HTTPS 交给 Worker。http→https 的 301 是
 *      Google 明确认可的标准行为（GSC 显示「网页会自动重定向」属正常排除状态），
 *      关掉后一旦 Worker 异常/回滚，http 会明文 200 并被索引成重复内容。
 *      本版 Worker 已把协议纳入一次性归一，保留边缘安全兜底即可。
 *
 * ★ V70.8：remove-bg 错页 301 归一到 icon-maker；广告填充后放开容器高度不裁切。
 * ★ V70.7：ads.txt 缓存头与 _headers 统一为 max-age=3600；ads.txt 内容一字未改。
 * ★ V70.4：带 .html 的请求改为 Worker 直接 301 到无扩展名（取代 CF Assets 的 307）。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const CANON = 'https://piccalc.com';
    /* V70.9-r3：机器文件分支也用压缩过斜杠的路径判断，避免 //ads.txt 之类
     * 在归一阶段被白名单放行、到了内容分支却因原始路径带双斜杠而落 404。 */
    const reqPath = url.pathname.replace(/\/{2,}/g, '/').toLowerCase();

    /* 机器文件：www 与 apex 都直接 200，绝不参与主机归一/跳转。
     * 原因：AdSense 的 ads.txt 抓取器、GSC 验证器对跨主机 301 容忍度低。 */
    /* V70.9-r3：集合统一小写，判断时用 pathname.toLowerCase()，
     * 让 /ADS.TXT、/Ads.txt、/ads.txt 都走同一条「直接 200 不跳」分支。 */
    const MACHINE_PATHS = new Set([
      '/ads.txt', '/robots.txt', '/sitemap.xml',
      '/google6474e28bb6098302.html',
      '/2e63d291b36d4ca8a6b1f2bf2c17fa2e.txt'
    ]);

    /* 目录根白名单：这些路径本身就是 200 终态，尾斜杠不能被剥掉。 */
    const DIR_ROOTS = new Set(['/', '/zh/', '/guides/', '/zh/guides/']);

    /* GSC「未找到(404)」里的 7 个旧短名 + 站点自身 2 个历史短名，中英同构。
     * remove-bg 直接指向 icon-maker（V70.8 已退役 /tools/remove-bg），
     * 避免「旧名 → 退役路径 → 终态」再生成一条链。 */
    const LEGACY_NAMES = [
      'exif', 'crop', 'compress', 'resize', 'upscale', 'mosaic',
      'convert', 'id-photo', 'remove-bg'
    ];
    const LEGACY_TARGET = { 'remove-bg': 'icon-maker' };

    const RETIRED_TOOLS = {
      '/tools/remove-bg': '/tools/icon-maker',
      '/zh/tools/remove-bg': '/zh/tools/icon-maker'
    };

    /**
     * 一次性算出最终 URL。返回 null = 当前请求已是终态（或为机器文件），不跳。
     * 所有 Location 一律用 CANON，不再用 url.origin（旧版 http 会跳回 http）。
     */
    function canonicalize(raw) {
      const u = new URL(raw);
      let p = u.pathname;
      let frag = '';
      let changed = false;

      /* ⓪-a V70.9-r3：压缩路径里多余的连续斜杠（拆包复验实测 3 条真 404）：
       *   /\/guides\/crop.html、/\/\/guides\/crop.html、/guides\/\/crop.html
       * 历史外链或爬虫拼错 URL 会这样写，不处理就是 404（6号站曾因 sitemap
       * 自带双斜杠整批失效）。压缩后再判机器文件白名单，纯归一、不改写正常路径。 */
      if (/\/{2,}/.test(p)) { p = p.replace(/\/{2,}/g, '/'); changed = true; }

      if (MACHINE_PATHS.has(p.toLowerCase())) return null;

      /* ⓪ V70.9-r2b：畸形组合「.HTML 大写 + 尾斜杠」先剥尾斜杠，
       * 例如 /guides/convert.HTML/ → /guides/convert.HTML，再交给 ① 剥后缀。
       * 只匹配 /\.html\/$/i，不碰目录根、不碰 /assets/、不影响机器文件。 */
      if (p.length > 1 && /\.html\/$/i.test(p)) {
        p = p.slice(0, -1);
        changed = true;
      }

      /* ① 剥 .html / .htm（大小写不敏感：.HTML / .Html / .HTM 一并处理）
       * V70.9-r3：/guides/crop.htm 这类旧式后缀在历史外链里常见，原本直接 404。 */
      if (/\.(html|htm)$/i.test(p)) {
        p = p.replace(/\.(html|htm)$/i, '');
        changed = true;
        if (p.toLowerCase() === '/index' || p === '') p = '/';
        else if (p.toLowerCase().endsWith('/index')) p = p.slice(0, -6) + '/';
      }

      /* ② 退役工具页 */
      if (RETIRED_TOOLS[p]) { p = RETIRED_TOOLS[p]; changed = true; }

      /* ③ 旧指南短名 → 工具页（中英同构；目标一律是真实存在的 200 页）
       * V70.9-r2：短名按小写比对，兼容 /guides/CROP.HTML 这类大写历史 URL；
       * 跳转目标一律用小写真名，避免拼出 /tools/CROP 这种不存在的地址。 */
      const gm = p.match(/^(\/zh)?\/guides\/([^/]+)$/);
      if (gm && LEGACY_NAMES.includes(gm[2].toLowerCase())) {
        const pre = gm[1] || '';
        const key = gm[2].toLowerCase();
        const name = LEGACY_TARGET[key] || key;
        p = pre + '/tools/' + name;
        changed = true;
      }

      /* ④ 工具目录根 → 首页工具锚点（query 必须排在 # 之前，旧版把 ?utm 塞进 fragment） */
      if (p === '/tools' || p === '/tools/') { p = '/'; frag = '#tools'; changed = true; }
      else if (p === '/zh/tools' || p === '/zh/tools/') { p = '/zh/'; frag = '#tools'; changed = true; }

      /* ⑤ 目录根缺尾斜杠 */
      if (p === '/zh') { p = '/zh/'; changed = true; }
      else if (p === '/guides') { p = '/guides/'; changed = true; }
      else if (p === '/zh/guides') { p = '/zh/guides/'; changed = true; }

      /* ⑥ 页面多余尾斜杠（目录根白名单 / assets 目录不动） */
      if (p.length > 1 && p.endsWith('/') && !DIR_ROOTS.has(p) && !p.startsWith('/assets/')) {
        p = p.replace(/\/+$/, '');
        changed = true;
      }

      /* ★ V70.9-r2：⑥ 剥掉尾斜杠之后才暴露出旧短名（如 /guides/crop/?utm=x），
       * 这里再匹配一次。③ 在 ⑥ 之前，单靠它命中不了带尾斜杠的旧地址。
       * 同样按小写比对、目标用小写真名，且后面统一探测 200 才发 301。 */
      const gm2 = p.match(/^(\/zh)?\/guides\/([^/]+)$/);
      if (gm2 && LEGACY_NAMES.includes(gm2[2].toLowerCase())) {
        const pre = gm2[1] || '';
        const key = gm2[2].toLowerCase();
        const name = LEGACY_TARGET[key] || key;
        p = pre + '/tools/' + name;
        changed = true;
      }

      /* ⑦ 协议 + 主机 */
      const need = changed || u.hostname !== 'piccalc.com' || u.protocol !== 'https:';
      if (!need) return null;
      return CANON + p + u.search + frag;
    }

    const target = canonicalize(request.url);
    if (target) {
      /* 只有目标确实是 200 才发 301，杜绝「301 → 404」坏链。
       * fragment 不参与文件查找，探测时去掉。 */
      const probe = await env.ASSETS.fetch(new Request(target.split('#')[0]));
      if (probe.status === 200) return Response.redirect(target, 301);
      /* 目标不存在：不跳，继续往下走，最终由 404 兜底给 noindex */
    }

    /* ★★ ads.txt 拦截：两个不变的关键点 text/plain（不带 charset）+ nosniff。
     * www 与 apex 都在本分支直接 200，不跳转。内容一字未改。 */
    if (reqPath === '/ads.txt') {
      return new Response(
        'google.com, pub-8915931557404979, DIRECT, f08c47fec0942fa0\n',
        { status: 200, headers: {
            'content-type': 'text/plain',
            'X-Content-Type-Options': 'nosniff',
            'cache-control': 'public, max-age=3600'
        } }
      );
    }

    /* 谷歌站长验证文件：必须保留 .html 后缀，不参与 URL 形态统一。 */
    if (reqPath === '/google6474e28bb6098302.html') {
      return new Response(
        'google-site-verification: google6474e28bb6098302.html\n',
        { status: 200, headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-cache, must-revalidate'
        } }
      );
    }

    if (reqPath === '/robots.txt') {
      return new Response(
        'User-agent: Mediapartners-Google\nAllow: /\n\nUser-agent: Googlebot\nAllow: /\n\nUser-agent: Bingbot\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: https://piccalc.com/sitemap.xml\n',
        { status: 200, headers: {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'public, max-age=3600'
        } }
      );
    }

    /* sitemap.xml 双保险：从 ASSETS 读真实文件，强制 application/xml。
     * 不写死内容，保证后续更新自动生效。 */
    if (reqPath === '/sitemap.xml') {
      const src = await env.ASSETS.fetch(new Request(CANON + reqPath));
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

    const pathname = reqPath;
    let res = await env.ASSETS.fetch(request);

    /* V70-r2：纯静态/本地预览台没有 CF Assets 的「无扩展名 → .html」映射时，
     * 内部补取一次同名 .html。不是 301/307，地址不变，不会形成循环。
     * 线上 CF 首取即 200，此分支永不触发。 */
    if (res.status === 404 && !pathname.endsWith('.html') && !pathname.endsWith('/')) {
      try {
        const alt = await env.ASSETS.fetch(new Request(CANON + pathname + '.html'));
        if (alt.status === 200) res = alt;
      } catch (e) { /* 保持原 404 */ }
    }

    /* 404 兜底：带 noindex,follow，避免软 404 被收录。
     * 随机路径保持 404，不瞎映射到 /tools/*（归一阶段的目标探测已挡住坏链）。 */
    if (res.status === 404) {
      const isZh = pathname.startsWith('/zh/');
      /* V75：优先返回带搜索、常用工具与指南入口的静态 404 页（仍是真 404，
       * 页面内自带 noindex,follow）。取不到时才退回下面的极简兜底。 */
      try {
        const page = await env.ASSETS.fetch(new Request(CANON + (isZh ? '/zh/404.html' : '/404.html')));
        if (page.status === 200) {
          const pageBody = await page.text();
          return new Response(pageBody, {
            status: 404,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'X-Content-Type-Options': 'nosniff'
            }
          });
        }
      } catch (e) { /* 保持极简兜底 */ }
      const body = isZh
        ? '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
          '<meta name="robots" content="noindex,follow"><title>页面不存在 · PicCalc</title></head>' +
          '<body style="font-family:system-ui;max-width:560px;margin:15vh auto;text-align:center;line-height:1.8">' +
          '<h1 style="font-size:22px">页面不存在</h1>' +
          '<p style="color:#64748b">你访问的页面已移动或从未存在。</p>' +
          '<p><a href="/zh/" style="color:#6366f1">返回中文首页</a> · ' +
          '<a href="/zh/#tools" style="color:#6366f1">工具列表</a> · ' +
          '<a href="/zh/guides/" style="color:#6366f1">使用指南</a></p></body></html>'
        : '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
          '<meta name="robots" content="noindex,follow"><title>Page not found | PicCalc</title></head>' +
          '<body style="font-family:system-ui;max-width:560px;margin:15vh auto;text-align:center;line-height:1.8">' +
          '<h1 style="font-size:22px">Page not found</h1>' +
          '<p style="color:#64748b">This page has moved or never existed.</p>' +
          '<p><a href="/" style="color:#6366f1">Back to PicCalc</a> · ' +
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
