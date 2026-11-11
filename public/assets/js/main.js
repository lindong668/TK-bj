// ==================== Mobile Menu ====================
(function () {
    const menuBtn = document.getElementById('menuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    if (!menuBtn || !mobileMenu) return;

    function setOpen(open) {
        mobileMenu.classList.toggle('active', open);
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    setOpen(false);

    menuBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        setOpen(!mobileMenu.classList.contains('active'));
    });

    // Tap / click anywhere outside the menu closes it
    function closeOnOutside(e) {
        if (!mobileMenu.classList.contains('active')) return;
        var t = e.target;
        if (t && (menuBtn.contains(t) || mobileMenu.contains(t))) return;
        setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutside, true);
    document.addEventListener('click', closeOnOutside, true);

    // Escape and desktop resize also close it
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' || e.keyCode === 27) setOpen(false);
    });
    window.addEventListener('resize', function () {
        if (window.innerWidth > 768) setOpen(false);
    }, { passive: true });

    // Close mobile menu on link click
    document.querySelectorAll('.mobile-link').forEach(link => {
        link.addEventListener('click', () => setOpen(false));
    });
})();

// ==================== FAQ Accordion ====================
document.querySelectorAll('.faq-question').forEach(q => {
    q.addEventListener('click', () => {
        if (q.parentElement) q.parentElement.classList.toggle('open');
    });
});

// ==================== Scroll Header Effect ====================
const header = document.querySelector('.header');
if (header) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.background = 'rgba(15,23,42,0.95)';
        } else {
            header.style.background = 'rgba(15,23,42,0.85)';
        }
    }, { passive: true });
}








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
    
    window.addEventListener('load', apply);
})();



(function syncSelected() {
    function sync() {
        document.querySelectorAll('label.radio-option').forEach(function (lab) {
            var inp = lab.querySelector('input[type="radio"], input[type="checkbox"]');
            if (inp) lab.classList.toggle('is-selected', !!inp.checked);
        });
    }
    function bind() {
        document.querySelectorAll('label.radio-option input').forEach(function (inp) {
            inp.addEventListener('change', sync);
        });
        sync();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
    window.addEventListener('ps:langchange', sync);
})();
