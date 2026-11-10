/* PicStudio i18n - fixed-language, independent-URL edition.
 * Each language lives at its own URL. The active language is taken from
 * <html data-lang>. All visible copy is already baked into the static HTML;
 * this file only serves dynamic strings and keeps the language event alive. */
(function () {
  'use strict';
  var LANG = document.documentElement.getAttribute('data-lang') === 'zh' ? 'zh' : 'en';

  function dict(l) { return (window.PS_I18N && window.PS_I18N[l]) || {}; }
  function t(k) {
    var d = dict(LANG);
    return d[k] != null ? d[k] : k;
  }
  function apply() {
    var h = document.documentElement;
    h.setAttribute('lang', LANG === 'zh' ? 'zh-CN' : 'en');
    h.setAttribute('data-lang', LANG);
    // Dynamic nodes created after load still use data-i18n.
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], v = t(el.getAttribute('data-i18n'));
      if (!v) continue;
      var attr = el.getAttribute('data-i18n-attr');
      if (attr) el.setAttribute(attr, v); else el.textContent = v;
    }
  }
  function set() {
    var a = document.querySelector('[data-lang-toggle]');
    if (a && a.getAttribute('href')) { window.location.href = a.getAttribute('href'); return; }
    apply();
  }
  window.PSLang = { get: function () { return LANG; }, set: set, t: t, apply: apply };
  apply();
  document.addEventListener('DOMContentLoaded', function () {
    apply();
    try { window.dispatchEvent(new CustomEvent('ps:langchange', { detail: { lang: LANG } })); } catch (e) {}
  });
})();
