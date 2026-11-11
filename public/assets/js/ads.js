/* PicStudio V71 — 全站唯一 AdSense 初始化
 *
 * 1) 按断点选择 slot id（数据驱动，将来切固定尺寸单元不用改结构）：
 *      .ad-slot[data-slot-mobile]   → 视口 ≤640px
 *      .ad-slot[data-slot-desktop]  → 视口 ≥641px
 *      都缺省时保留 ins 上原有的 data-ad-slot。
 * 2) 高度策略：未填充/状态未知 → 桌面 90px、手机 50px（CSS 兜底，不折叠不隐藏）；
 *      填充 → 容器加 .is-filled，CSS 放开为 auto，完全跟随广告，不裁切、无 max-height。
 * 3) 只监听 ins 的 data-ad-status，不再监听容器自身 style/class —— 避免
 *      "观察属性 → 改属性 → 再触发观察" 的同步回环把渲染进程卡死。
 *      清理内联高度放在下一个宏任务里做，并且有状态复查与去重。
 * 4) 先挂监听、后 push 请求：不改变广告请求顺序；广告代码始终保留在 HTML 中，从不注释。
 */
(function () {
  'use strict';

  var CLEAN_DELAYS = [0, 400, 1200, 3000, 6000];
  var MAX_CLEAN = 20;

  function isFilled(ins) {
    return ins.getAttribute('data-ad-status') === 'filled';
  }

  /* Google 在未填充时也会给容器写内联 height，并给 ins 写
     height:auto !important（里面是空的 728×280 iframe）。两者都是内联样式，
     优先级高于样式表，会溢出 90/50 的占位并压住正文、拦截点击。
     这里在「未填充」时清掉这两处内联高度，交给 CSS 兜底。
     清理放在独立宏任务里执行，且不监听容器自身属性，避免同步回环；
     每个 ins 最多清 20 次，防止与 Google 的重复写入形成无休止往来。 */
  function cleanInlineHeight(ins) {
    if (isFilled(ins)) return;
    var wrap = ins.parentElement;
    if (!wrap) return;
    var n = ins.__psCleanCount || 0;
    if (n >= MAX_CLEAN) return;
    ins.__psCleanCount = n + 1;
    if (wrap.style && wrap.style.getPropertyValue('height')) wrap.style.removeProperty('height');
    if (ins.style && ins.style.getPropertyValue('height')) ins.style.removeProperty('height');
  }

  function scheduleClean(ins) {
    if (ins.__psCleanTimer) return;
    ins.__psCleanTimer = setTimeout(function () {
      ins.__psCleanTimer = null;
      cleanInlineHeight(ins);
    }, 0);
  }

  function sync(ins) {
    var wrap = ins.parentElement;
    if (!wrap) return;
    if (isFilled(ins)) {
      wrap.classList.add('is-filled');
      return;
    }
    wrap.classList.remove('is-filled');
    scheduleClean(ins);
  }

  function watch(ins) {
    sync(ins);
    if (typeof MutationObserver === 'function') {
      /* 只看 ins 自身：data-ad-status 变化 + Google 写内联 height。
         不监听容器 style/class，否则「改属性 → 触发观察 → 再改属性」会死循环。 */
      new MutationObserver(function () { sync(ins); })
        .observe(ins, { attributes: true, attributeFilter: ['data-ad-status', 'style'] });
    }
    /* Google 可能在初始渲染后才写内联高度：做有限次复查，不做无限监听 */
    for (var i = 0; i < CLEAN_DELAYS.length; i++) {
      (function (d) {
        setTimeout(function () { cleanInlineHeight(ins); }, d);
      })(CLEAN_DELAYS[i]);
    }
  }

  function slotFor(el) {
    var mobile = window.matchMedia('(max-width: 640px)').matches;
    var v = mobile ? el.getAttribute('data-slot-mobile') : el.getAttribute('data-slot-desktop');
    return v || null;
  }

  function init() {
    var nodes = document.querySelectorAll('.ad-slot ins.adsbygoogle');
    for (var i = 0; i < nodes.length; i++) {
      var ins = nodes[i];
      var wrap = ins.parentElement;
      if (wrap) {
        var slot = slotFor(wrap);
        if (slot) ins.setAttribute('data-ad-slot', slot);
        watch(ins);
      }
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        /* 广告脚本被拦截时不抛错，容器保持 90 / 50 占位 */
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
