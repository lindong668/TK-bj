/* PicCalc V70.10 — AdSense 初始化（本地 V70.8 × TRAE V71 合并版）
 * 全站仅 2 个广告位：英文首页 / 与中文首页 /zh/，各 1 个，位于工具网格与图片指南之间。
 *
 * 单元号唯一真相源 = HTML 里 <ins data-ad-slot="...">（Google 标准位置）。
 * 本脚本只在 HTML 未写数据时用 PS_AD_SLOTS 兜底；若 .ad-slot 上带
 * data-slot-desktop / data-slot-mobile，则按断点选单元（TRAE V71 机制，便于将来分单元）。
 * 换单元：只改两个首页 HTML 的 data-ad-slot 一处即可。
 *
 * 两态：未填充锁 桌面 90 / 手机 100（CSS，锁的是空占位）；填充后给
 * .ad-block / .ad-slot 加 .is-filled，height:auto + overflow:visible，
 * 创意多高显示多高，绝不裁切（AdSense 政策要求）。
 *
 * 融合要点：状态属性优先 + 可见 iframe 兜底 + 幂等 push（本地），
 * 清理 Google 写入的内联 height + 只观察 ins 防回环 + 有限次定时复查（TRAE）。
 */
window.PS_AD_SLOTS = { HOME_INLINE: '1784463687' };

(function () {
  'use strict';
  var CLEAN_DELAYS = [0, 120, 400, 600, 1200, 1800, 3000, 4000, 6000];
  var MAX_CLEAN = 20;

  function slotFor(ins) {
    var wrap = ins.parentElement;
    if (!wrap) return null;
    var mobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    return (mobile ? wrap.getAttribute('data-slot-mobile')
                   : wrap.getAttribute('data-slot-desktop')) || null;
  }

  /* 状态属性优先：unfilled / error 一律锁高，防 no-fill 探测元素把首页拉成一屏；
     AdSense 若不写属性，再用「可见且 >40px 的 iframe」兜底（遍历全部 iframe，
     防隐藏探针在前、真创意在后被误判）。 */
  function isFilled(ins) {
    var st = ins.getAttribute('data-ad-status');
    if (st === 'filled') return true;
    if (st === 'unfilled' || st === 'error') return false;
    var frames = ins.querySelectorAll('iframe');
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i], cs = window.getComputedStyle(f);
      var h = f.getBoundingClientRect().height || f.offsetHeight || 0;
      if (cs.display !== 'none' && cs.visibility !== 'hidden' && h > 40) return true;
    }
    return false;
  }

  /* Google 未填充时也会写内联 height，内联优先级高于样式表，会顶开 90/100 占位。
     只在未填充态清理；每个 ins 最多 20 次，避免与 Google 反复对写。 */
  function cleanInlineHeight(ins) {
    if (isFilled(ins)) return;
    var n = ins.__psCleanCount || 0;
    if (n >= MAX_CLEAN) return;
    ins.__psCleanCount = n + 1;
    var targets = [ins, ins.parentElement];
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t && t.style && t.style.getPropertyValue('height')) t.style.removeProperty('height');
    }
  }

  function sync(ins) {
    var slot = ins.closest('.ad-slot');
    var block = ins.closest('.ad-block');
    var on = isFilled(ins);
    if (slot) slot.classList.toggle('is-filled', on);
    if (block) block.classList.toggle('is-filled', on);
    if (!on) cleanInlineHeight(ins);
  }

  function watch(ins) {
    /* 只观察 ins 自身，不观察容器 style/class —— 避免「改属性→触发观察→再改属性」回环 */
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function () { sync(ins); }).observe(ins, {
        attributes: true, attributeFilter: ['data-ad-status', 'style'],
        childList: true, subtree: true
      });
    }
    CLEAN_DELAYS.forEach(function (d) {
      setTimeout(function () { sync(ins); }, d);
    });
  }

  function init() {
    var S = window.PS_AD_SLOTS || {};
    document.querySelectorAll('ins.ps-ad, .ad-slot ins.adsbygoogle').forEach(function (ins) {
      var override = slotFor(ins);
      if (override) ins.setAttribute('data-ad-slot', override);
      else if (!ins.getAttribute('data-ad-slot')) {
        var key = ins.getAttribute('data-ps-slot');
        if (key && S[key]) ins.setAttribute('data-ad-slot', S[key]);
      }
      ins.classList.add('adsbygoogle');
      /* 幂等：adsbygoogle.js 若已先扫描填充，就不再 push，避免 already have ads in them */
      var already = ins.hasAttribute('data-ad-status') || ins.querySelector('iframe, ins, div');
      if (!already) {
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      }
      watch(ins);
      sync(ins);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
