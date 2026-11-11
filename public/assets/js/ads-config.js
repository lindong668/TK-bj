/* PicStudio V70 — AdSense 广告单元 ID（全站唯一配置，只改这一个文件）
 * 全站仅 2 个广告位：英文首页 1 个、中文首页 1 个，位置在「工具卡片网格结束 ↔ 图片处理指南标题之前」。
 * 已绑定 AdSense 后台「0003」横幅·自适应单元，正式 slot：1784463687。
 * 容器高度由 CSS 写死（桌面 90px / 手机 100px，与自适应单元常见回传尺寸一致），不折叠、不由 JS 改高度、不改广告内部尺寸。
 */
window.PS_AD_SLOTS = {
  HOME_INLINE: '1784463687'
};

/* 统一绑定：只设 slot 号并 push 一次。尺寸完全由 CSS 决定，不强改广告内部尺寸。 */
(function () {
  function init() {
    var S = window.PS_AD_SLOTS || {};
    document.querySelectorAll('ins.ps-ad').forEach(function (el) {
      var key = el.getAttribute('data-ps-slot');
      if (S[key]) el.setAttribute('data-ad-slot', S[key]);
      el.classList.add('adsbygoogle');
      try { (adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
