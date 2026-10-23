// ==================== Mobile Menu ====================
const menuBtn = document.getElementById('menuBtn');
const mobileMenu = document.getElementById('mobileMenu');

if (menuBtn) {
    menuBtn.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
    });
}

// Close mobile menu on link click
document.querySelectorAll('.mobile-link').forEach(link => {
    link.addEventListener('click', () => {
        mobileMenu.classList.remove('active');
    });
});

// ==================== FAQ Accordion ====================
document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => {
        q.parentElement.classList.toggle('open');
    });
});

// ==================== Scroll Header Effect ====================
const header = document.querySelector('.header');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        header.style.background = 'rgba(15,23,42,0.95)';
    } else {
        header.style.background = 'rgba(15,23,42,0.85)';
    }
});

// ==================== Upload 原生按钮兜底隐藏 ====================
// 背景：.upload-area 内的 <input type="file"> 由 CSS 隐藏，但部分
//       iOS Safari / 旧内核只认 clip-path 不认老式 clip，或 CSS 版本
//       被 CDN 缓存时，按钮会重新露出来（显示成 "Choose Files"）。
//       这里在 JS 层再兜一次，不依赖 CSS 版本号，确保任何情况下都不显示。
// 说明：pointer-events:none 同时解决"点了没反应"——点击不再冒泡抵消，
//       统一由 .upload-area 的 click 委托转发一次 fileInput.click()。
(function hideNativeFileInputs() {
    var HIDE = 'position:absolute!important;' +
               'width:1px!important;height:1px!important;' +
               'opacity:0!important;pointer-events:none!important;' +
               'clip:rect(0,0,0,0)!important;clip-path:inset(50%)!important;' +
               'overflow:hidden!important;margin:-1px!important;padding:0!important;' +
               'border:0!important;font-size:0!important;line-height:0!important;' +
               'color:transparent!important;background:transparent!important;' +
               'appearance:none!important;-webkit-appearance:none!important;';

    function apply() {
        // 只处理上传虚线框内的；qrcode / watermark 的 logoInput 有意显示，跳过
        document.querySelectorAll('.upload-area input[type="file"]').forEach(function (el) {
            if (el.id === 'logoInput') return;
            el.setAttribute('aria-hidden', 'false');
            el.style.cssText = (el.style.cssText ? el.style.cssText + ';' : '') + HIDE;
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', apply);
    } else {
        apply();
    }
    // 动态插入的上传区（如 SPA 切换语言后重渲染）也能覆盖
    window.addEventListener('load', apply);
})();
