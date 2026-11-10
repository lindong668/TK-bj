/* Home scroll restore: one invisible, instant step. No jump to top, no smooth slide. */
(function () {
  'use strict';
  var KEY = 'ps_home_scroll_v1';
  var root = document.documentElement;

  function homeKey(p) {
    p = p.replace(/\/index\.html$/, '/');
    return p === '' ? '/' : p;
  }
  function isHome(p) { return p === '/' || p === '/zh/'; }
  var key = homeKey(location.pathname);
  if (!isHome(key)) return;

  function read() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write(y) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ y: y, path: key })); } catch (e) {}
  }
  function clear() {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  }
  function instantTo(y) {
    var h = Math.max(document.documentElement.scrollHeight || 0, document.body ? document.body.scrollHeight : 0);
    var top = Math.max(0, Math.min(y, Math.max(0, h - window.innerHeight)));
    var prev = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    try { window.scrollTo({ top: top, left: 0, behavior: 'instant' }); }
    catch (e) { window.scrollTo(0, top); }
    root.style.scrollBehavior = prev;
  }
  function reveal() { root.classList.remove('ps-restore-pending'); }

  var saved = read();
  if (saved && typeof saved.y === 'number' && saved.y > 0 && saved.path === key) {
    var target = saved.y;
    clear();
    root.classList.add('ps-restore-pending');
    if ('scrollRestoration' in history) { try { history.scrollRestoration = 'manual'; } catch (e) {} }
    // The fold script above this file has already sized the page, so the target is reachable now.
    instantTo(target);
    requestAnimationFrame(function () {
      instantTo(target);
      setTimeout(function () {
        instantTo(target);
        reveal();
      }, 50);
    });
    // Late layout tweaks are corrected instantly, never animated.
    window.addEventListener('load', function () {
      if (Math.abs((window.scrollY || 0) - target) > 8) instantTo(target);
    });
    setTimeout(reveal, 500); // fail-safe: never leave the page hidden
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target;
    while (el && el.tagName !== 'A') el = el.parentNode;
    if (!el) return;
    var href = el.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return;
    if (/^(https?:|mailto:|javascript:|tel:)/i.test(href)) return;
    write(window.scrollY || window.pageYOffset || 0);
  }, true);
})();
