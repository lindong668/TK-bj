/**
 * PicStudio 静态资源服务
 * 仅负责把 /public 下的文件吐出去，顺便补几个安全与 SEO 响应头。
 * 没有任何业务逻辑，也没有 KV / 密钥依赖。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 统一走 https + 主域名，避免 piccalc.com 与 www 双份索引
    if (url.hostname === 'www.piccalc.com') {
      return Response.redirect('https://piccalc.com' + url.pathname + url.search, 301);
    }

    const res = await env.ASSETS.fetch(request);

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
