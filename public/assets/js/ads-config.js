/* PicStudio V70.8 — AdSense 广告单元 ID（全站唯一配置，只改这一个文件）
 * 全站仅 2 个广告位：英文首页 1 个、中文首页 1 个，位于工具卡片网格与「图片处理指南」之间。
 * 正式 slot：1784463687。
 * 两态：未填充时 CSS 锁 90/100px 防 Safari 空白撑开；填充后由本脚本加 .is-filled，
 *       容器高度放开为 auto，创意完整展示、绝不裁切（AdSense 政策要求）。
 */
window.PS_AD_SLOTS = {
  HOME_INLINE: '1784463687'
};

(function () {
  /* 只设 slot 号并 push 一次；若 adsbygoogle.js 已经先扫描过该 ins，就不再 push，
     避免 "already have ads in them" 异常。 */
  function init() {
    var S = window.PS_AD_SLOTS || {};
    document.querySelectorAll('ins.ps-ad').forEach(function (el) {
      var key = el.getAttribute('data-ps-slot');
      if (S[key]) el.setAttribute('data-ad-slot', S[key]);
      el.classList.add('adsbygoogle');
      var already = el.hasAttribute('data-ad-status') || el.querySelector('iframe, ins, div');
      if (!already) {
        try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      }
      watch(el);
      sync(el);
    });
  }

  /* 判定是否真的有创意：可见且高度 > 0 的 iframe 优先；否则看 data-ad-status。
     AdSense 的无填充探针 iframe 通常 display:none 或 0 高，不会误判。 */
  function isFilled(el) {
    /* 状态属性优先：unfilled / error 一律锁高，防止 no-fill 时脚本注入的探测元素
       把首页重新撑成一屏；filled 一律放开。AdSense 若不写属性，再用
       「可见且 >40px 的 iframe」兜底（真实创意至少 50px，探测元素通常 0/1px）。 */
    var st = el.getAttribute('data-ad-status');
    if (st === 'filled') return true;
    if (st === 'unfilled' || st === 'error') return false;
    var f = el.querySelector('iframe');
    if (f) {
      var cs = window.getComputedStyle(f);
      var h = f.getBoundingClientRect().height || f.offsetHeight || 0;
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && h > 40) return true;
    }
    return false;
  }

  function sync(el) {
    var slot = el.closest('.ad-slot');
    var block = el.closest('.ad-block');
    var on = isFilled(el);
    if (slot) slot.classList.toggle('is-filled', on);
    if (block) block.classList.toggle('is-filled', on);
  }

  function watch(el) {
    var mo = new MutationObserver(function () { sync(el); });
    mo.observe(el, { attributes: true, attributeFilter: ['data-ad-status', 'style'], childList: true, subtree: true });
    /* AdSense 在 iframe 内部调整尺寸时不再触发上面的 observer，定时兜底 4 次 */
    [120, 600, 1800, 4000].forEach(function (t) {
      setTimeout(function () { sync(el); }, t);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
