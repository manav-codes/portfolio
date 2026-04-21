document.addEventListener('DOMContentLoaded', () => {

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // =========================================================
    // RAINBOW VIDEO
    // =========================================================
    const shaderCanvas = document.getElementById('shader-canvas');
    let rainbowActive = false;
    let experienceVisible = false;
    let skillsVisible = false;

    if (prefersReducedMotion) shaderCanvas.style.display = 'none';

    shaderCanvas._startLoop = () => {
        if (!rainbowActive) {
            rainbowActive = true;
            shaderCanvas.play().catch(() => {});
        }
    };
    shaderCanvas._stopLoop = () => {
        if (rainbowActive) {
            rainbowActive = false;
            shaderCanvas.pause();
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') shaderCanvas.pause();
        else if (rainbowActive) shaderCanvas.play().catch(() => {});
    });

    // =========================================================
    // SCROLL + BACKGROUND
    // =========================================================
    const bgImage     = document.getElementById('bg-image');
    const bgImageBlur = document.getElementById('bg-image-blur');
    const bgOverlay   = document.getElementById('bg-overlay');
    const fluidCanvas = document.getElementById('fluid');
    const section3 = document.getElementById('section-3');
    const section4 = document.getElementById('section-4');
    let scrollRafPending = false;
    const layoutMetrics = { s3top: 1, s4top: 2, ggjTop: 0 };
    const styleState = {
        bgBlurOpacity: -1,
        overlayAlpha: -1,
        shaderOpacity: -1,
        fluidOpacity: -1,
        fluidVisible: false,
    };

    const cullingObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const sectionId = entry.target.getAttribute('id');
            const visible = entry.isIntersecting;
            if (sectionId === 'section-3') experienceVisible = visible;
            if (sectionId === 'section-4') skillsVisible = visible;
        });
        if (!scrollRafPending) { scrollRafPending = true; requestAnimationFrame(updateBackground); }
    }, { root: null, rootMargin: '18% 0px 18% 0px', threshold: 0 });

    if (section3) cullingObserver.observe(section3);
    if (section4) cullingObserver.observe(section4);

    // Find the globalgamejam.org link to use as trigger point
    const ggjLink = document.getElementById('ggj-link');

    function recalcLayoutMetrics() {
        layoutMetrics.s3top = Math.max(1, section3 ? section3.offsetTop : 1);
        layoutMetrics.s4top = Math.max(layoutMetrics.s3top + 1, section4 ? section4.offsetTop : layoutMetrics.s3top + window.innerHeight);
        if (ggjLink) layoutMetrics.ggjTop = ggjLink.offsetTop;
    }

    recalcLayoutMetrics();

    let resizeDebounceTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
            recalcLayoutMetrics();
            if (!scrollRafPending) { scrollRafPending = true; requestAnimationFrame(updateBackground); }
        }, 100);
    }, { passive: true });

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            recalcLayoutMetrics();
            if (!scrollRafPending) { scrollRafPending = true; requestAnimationFrame(updateBackground); }
        });
    }
    window.addEventListener('load', () => {
        recalcLayoutMetrics();
        if (!scrollRafPending) { scrollRafPending = true; requestAnimationFrame(updateBackground); }
    }, { once: true });

    function updateBackground() {
        scrollRafPending = false;
        const s3top = Math.max(1, layoutMetrics.s3top);
        const s4top = Math.max(s3top + 1, layoutMetrics.s4top);
        const sy    = window.scrollY;
        const vh = window.innerHeight;
        const clamp01 = (v) => Math.max(0, Math.min(1, v));
        const smooth01 = (v) => {
            const t = clamp01(v);
            return t * t * (3 - 2 * t);
        };

        const bgProg = smooth01(sy / s3top);
        if (Math.abs(bgProg - styleState.bgBlurOpacity) > 0.003) {
            bgImageBlur.style.opacity = bgProg.toFixed(3);
            styleState.bgBlurOpacity = bgProg;
        }
        if (Math.abs(bgProg - styleState.overlayAlpha) > 0.003) {
            bgOverlay.style.opacity = bgProg.toFixed(3);
            styleState.overlayAlpha = bgProg;
        }

        const rainbowInStart = s3top - vh * 0.75;
        const rainbowInEnd = s3top - vh * 0.18;
        const rainbowOutStart = s4top - vh * 0.50;
        const rainbowOutEnd = s4top - vh * 0.15;

        const rainbowIn = smooth01((sy - rainbowInStart) / (rainbowInEnd - rainbowInStart));
        const rainbowOut = 1 - smooth01((sy - rainbowOutStart) / (rainbowOutEnd - rainbowOutStart));
        const rainbowOpacity = 0.72 * rainbowIn * clamp01(rainbowOut);
        const transProg = clamp01((sy - s3top) / Math.max(1, s4top - s3top));
        const enableAnimatedBackground = rainbowOpacity > 0.01 && experienceVisible;

        // Rainbow video
        if (enableAnimatedBackground) {
            shaderCanvas._startLoop();
            if (Math.abs(rainbowOpacity - styleState.shaderOpacity) > 0.003) {
                shaderCanvas.style.opacity = rainbowOpacity.toFixed(3);
                styleState.shaderOpacity = rainbowOpacity;
            }
        } else {
            shaderCanvas._stopLoop();
            if (styleState.shaderOpacity !== 0) {
                shaderCanvas.style.opacity = '0';
                styleState.shaderOpacity = 0;
            }
        }

        if (fluidCanvas && layoutMetrics.ggjTop > 0) {
            const fluidFadeStart = layoutMetrics.ggjTop - window.innerHeight * 0.22;
            const fluidFadeEnd = layoutMetrics.ggjTop + window.innerHeight * 0.06;
            const fluidProgress = clamp01((sy - fluidFadeStart) / (fluidFadeEnd - fluidFadeStart));
            const fluidVisible = skillsVisible && fluidProgress > 0.01;
            const fluidOpacity = fluidVisible ? fluidProgress : 0;
            if (Math.abs(fluidOpacity - styleState.fluidOpacity) > 0.003) {
                fluidCanvas.style.opacity = fluidOpacity.toFixed(3);
                styleState.fluidOpacity = fluidOpacity;
            }
            if (fluidVisible !== styleState.fluidVisible) {
                styleState.fluidVisible = fluidVisible;
                window.dispatchEvent(new CustomEvent('portfolio:fluid-visibility', {
                    detail: { visible: fluidVisible }
                }));
            }
        }

    }

    window.addEventListener('scroll', () => {
        if (!scrollRafPending) { scrollRafPending=true; requestAnimationFrame(updateBackground); }
    }, { passive:true });
    updateBackground();

    // =========================================================
    // SCROLL ANIMATIONS
    // =========================================================
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                entry.target.querySelectorAll('.progress-fill').forEach(bar => { bar.style.width=bar.dataset.width+'%'; });
            }
        });
    }, { threshold:0.1 });
    document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

    const progressObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) { entry.target.style.width=entry.target.dataset.width+'%'; progressObserver.unobserve(entry.target); }
        });
    }, { threshold:0.1 });
    document.querySelectorAll('.progress-fill').forEach(bar => progressObserver.observe(bar));

    // =========================================================
    // NAVIGATION
    // =========================================================
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.section');

    const navObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.getAttribute('id');
                navItems.forEach(nav => {
                    nav.classList.remove('active');
                    if (nav.getAttribute('href') === `#${id}`) nav.classList.add('active');
                });
            }
        });
    }, { root:null, rootMargin:'-50% 0px -50% 0px', threshold:0 });
    sections.forEach(s => navObserver.observe(s));

    navItems.forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            const target = document.querySelector(item.getAttribute('href'));
            if (!target) return;
            const extra = item.getAttribute('href') === '#section-3' ? 80 : 0;
            window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + extra, behavior:'smooth' });
        });
    });

    // =========================================================
    // PRANK: manav.win links scroll to top + cheeky toast
    // =========================================================
    function showPrankToast(msg) {
        const existing = document.getElementById('prank-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'prank-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        toast.getBoundingClientRect();
        toast.classList.add('prank-toast--visible');
        setTimeout(() => {
            toast.classList.remove('prank-toast--visible');
            setTimeout(() => toast.remove(), 400);
        }, 3000);
    }

    document.querySelectorAll('a[href="https://manav.win"]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => {
                showPrankToast('You are already IN THE WEBSITE DUH!! 🙄');
            }, 600);
        });
    });
});
