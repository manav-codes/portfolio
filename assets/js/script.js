document.addEventListener('DOMContentLoaded', () => {

    // =========================================================
    // HARDWARE-AWARE INITIALIZATION
    // =========================================================
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const cpuCores = navigator.hardwareConcurrency || 4;
    const ramGB    = navigator.deviceMemory        || 4;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function getGpuTier() {
        try {
            const c  = document.createElement('canvas');
            const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
            if (!gl) return 'low';
            const ext      = gl.getExtension('WEBGL_debug_renderer_info');
            const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL).toLowerCase() : '';
            if (/swiftshader|llvmpipe|software|microsoft basic/.test(renderer)) return 'low';
            if (/intel hd|intel uhd|intel iris/.test(renderer))                 return 'mid';
            return 'high';
        } catch { return 'mid'; }
    }
    const gpuTier = getGpuTier();

    if (prefersReducedMotion) {
        document.getElementById('shader-canvas').style.display = 'none';
    }

    // =========================================================
    // PERFORMANCE TIER SYSTEM
    // =========================================================
    const TIERS = [
        { label:'Ultra',  dpr:1.0,  interval:16, waves:6, yScale:1.0,  distort:0.08 },
        { label:'High',   dpr:0.85, interval:20, waves:5, yScale:0.9,  distort:0.07 },
        { label:'Medium', dpr:0.6,  interval:33, waves:4, yScale:0.55, distort:0.05 },
        { label:'Low',    dpr:0.45, interval:50, waves:3, yScale:0.35, distort:0.04 },
    ];

    function initialTier() {
        if (prefersReducedMotion)                              return 3;
        if (gpuTier === 'low' || ramGB <= 2 || cpuCores <= 2) return 3;
        if (gpuTier === 'mid' || isMobile || ramGB <= 4)       return 2;
        if (gpuTier === 'high' && cpuCores >= 8 && ramGB >= 8) return 0;
        return 1;
    }

    let tier       = initialTier();
    let tierLocked = false;
    let lockTimer  = null;

    function lockTierFor(ms) {
        tierLocked = true;
        clearTimeout(lockTimer);
        lockTimer = setTimeout(() => { tierLocked = false; }, ms);
    }

    const tierListeners = [];
    function setTier(t) {
        if (t === tier) return;
        tier = t;
        tierListeners.forEach(fn => fn(TIERS[tier]));
    }

    // =========================================================
    // FPS MONITOR + ADAPTIVE QUALITY
    // =========================================================
    let tabVisible  = true;
    let fpsCount    = 0;
    let fpsLast     = performance.now();
    let fpsSamples  = [];
    let lastFrameTs = 0;

    document.addEventListener('visibilitychange', () => {
        tabVisible = document.visibilityState === 'visible';
        if (tabVisible) { fpsLast = performance.now(); fpsCount = 0; }
    });

    function trackFps(now) {
        if (lastFrameTs > 0) { fpsSamples.push(now - lastFrameTs); if (fpsSamples.length > 30) fpsSamples.shift(); }
        lastFrameTs = now;
        fpsCount++;
        if (now - fpsLast < 1500) return;
        const measuredFps = Math.round(fpsCount / ((now - fpsLast) / 1000));
        fpsCount = 0; fpsLast = now;
        const ti = TIERS[tier].interval || (1000 / 60);
        const jankRatio = fpsSamples.filter(d => d > ti * 2.5).length / fpsSamples.length;
        adaptQuality(measuredFps, jankRatio);
    }

    function adaptQuality(fps, jankRatio) {
        if (tierLocked) return;
        if ((fps < 25 || jankRatio > 0.4)  && tier < 3) { setTier(tier + 1); lockTierFor(5000); }
        else if ((fps < 40 || jankRatio > 0.25) && tier < 2) { setTier(tier + 1); lockTierFor(3000); }
        else if (fps < 50 && tier < 1)                   { setTier(tier + 1); lockTierFor(2000); }
        else if (fps > 58 && jankRatio < 0.1 && tier > 0) { setTier(tier - 1); lockTierFor(4000); }
    }

    // =========================================================
    // RAINBOW SHADER
    // =========================================================
    const shaderCanvas = document.getElementById('shader-canvas');
    let shaderReady   = false;
    let rainbowActive = false;
    let rainbowRafId  = null;
    let experienceVisible = false;
    let skillsVisible = false;

    function initShader() {
        const gl = shaderCanvas.getContext('webgl', { powerPreference:'high-performance', antialias:false, depth:false, stencil:false })
                || shaderCanvas.getContext('experimental-webgl');
        if (!gl) return;

        const vertSrc = `attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0,1);}`;
        const fragSrc = `precision mediump float;
            uniform vec2 resolution; uniform float time,xScale,yScale,distortion,waveCount;
            vec3 wave(vec2 p,float offset,vec3 color){
                float x = p.x + sin((p.y*3.0 + time*1.4 + offset)*1.6) * 0.04;
                float bend = sin((x*2.0 + time*1.0 + offset*0.8)*1.15) * yScale * 0.16;
                float ripple = sin((x*4.2 - time*1.2 + offset*1.5)*0.7) * 0.022;
                float dist = abs(p.y - bend - ripple);
                float core = smoothstep(0.045, 0.0, dist);
                float glow = smoothstep(0.12, 0.0, dist) * 0.22;
                return color * (core + glow);
            }
            void main(){
                vec2 invRes=vec2(1.0)/resolution;
                vec2 p=(gl_FragCoord.xy*2.0-resolution)*invRes;
                p*=(resolution.x<resolution.y)?(resolution.x*invRes.y):1.0;
                vec3 col=vec3(0);
                col = max(col, wave(p,0.0,vec3(1.0,0.0,0.3)));
                col = max(col, wave(p,1.8,vec3(0.0,0.4,1.0)));
                col = max(col, wave(p,0.9,vec3(1.0,0.6,0.0)));
                if (waveCount > 3.5) { col = max(col, wave(p,2.7,vec3(0.6,0.0,1.0))); }
                if (waveCount > 4.5) { col = max(col, wave(p,3.6,vec3(0.0,1.0,0.2))); }
                if (waveCount > 5.5) { col = max(col, wave(p,4.5,vec3(0.0,1.0,1.0))); }
                float centerMask = smoothstep(0.16, 0.0, abs(p.y));
                col *= centerMask;
                gl_FragColor=vec4(col,1.0);
            }`;

        function compile(type, src) { const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); return s; }
        const prog = gl.createProgram();
        gl.attachShader(prog, compile(gl.VERTEX_SHADER, vertSrc));
        gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fragSrc));
        gl.linkProgram(prog); gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(prog, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        const uRes=gl.getUniformLocation(prog,'resolution'), uTime=gl.getUniformLocation(prog,'time');
        const uYScale=gl.getUniformLocation(prog,'yScale'), uDistort=gl.getUniformLocation(prog,'distortion');
        const uWaves=gl.getUniformLocation(prog,'waveCount');
        gl.uniform1f(gl.getUniformLocation(prog,'xScale'), 1.2);

        function resize() {
            const dpr=TIERS[tier].dpr, w=Math.max(1,Math.floor(window.innerWidth*dpr)), h=Math.max(1,Math.floor(window.innerHeight*dpr));
            shaderCanvas.width=w; shaderCanvas.height=h; gl.viewport(0,0,w,h); gl.uniform2f(uRes,w,h);
        }
        function applyTier(t) { gl.uniform1f(uWaves,t.waves); gl.uniform1f(uYScale,t.yScale); gl.uniform1f(uDistort,t.distort); resize(); }
        window.addEventListener('resize', resize);
        applyTier(TIERS[tier]);
        tierListeners.push(applyTier);

        let t=0, lastFrameTime=0;
        function loop(now) {
            if (!rainbowActive || !tabVisible) { rainbowRafId=null; return; }
            rainbowRafId=requestAnimationFrame(loop);
            trackFps(now);
            const interval=TIERS[tier].interval;
            if (interval>0 && now-lastFrameTime<interval) return;
            lastFrameTime=now; t += (tier <= 1) ? 0.012 : 0.008;
            gl.uniform1f(uTime,t); gl.drawArrays(gl.TRIANGLES,0,6);
        }
        shaderCanvas._startLoop = () => { if (!rainbowRafId) { rainbowActive=true; rainbowRafId=requestAnimationFrame(loop); } };
        shaderCanvas._stopLoop  = () => { rainbowActive=false; };
        shaderReady = true;
    }

    // =========================================================
    // SCROLL + BACKGROUND
    // =========================================================
    const bgImage  = document.getElementById('bg-image');
    const bgOverlay= document.getElementById('bg-overlay');
    const fluidCanvas = document.getElementById('fluid');
    const section3 = document.getElementById('section-3');
    const section4 = document.getElementById('section-4');
    let scrollRafPending = false;

    const cullingObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const sectionId = entry.target.getAttribute('id');
            const visible = entry.isIntersecting;
            if (sectionId === 'section-3') experienceVisible = visible;
            if (sectionId === 'section-4') skillsVisible = visible;
            window.dispatchEvent(new CustomEvent('portfolio:section-visibility', {
                detail: { sectionId, visible }
            }));
        });
        updateBackground();
    }, { root: null, rootMargin: '18% 0px 18% 0px', threshold: 0 });

    if (section3) cullingObserver.observe(section3);
    if (section4) cullingObserver.observe(section4);
    const enableAnimatedBackground = rainbowOpacity > 0.01 && experienceVisible;

    // Find the globalgamejam.org link to use as trigger point
    const ggjLink = Array.from(document.querySelectorAll('a')).find(a => a.textContent === 'globalgamejam.org');
    let ggjLinkTop = 0;
    if (ggjLink) {
        ggjLinkTop = ggjLink.getBoundingClientRect().top + window.scrollY;
    }

    function updateBackground() {
        scrollRafPending = false;
        const s3top = section3.getBoundingClientRect().top + window.scrollY;
        const s4top = section4.getBoundingClientRect().top + window.scrollY;
        const s5top = document.getElementById('section-5').getBoundingClientRect().top + window.scrollY;
        const sy    = window.scrollY;
        const vh = window.innerHeight;
        const clamp01 = (v) => Math.max(0, Math.min(1, v));
        const smooth01 = (v) => {
            const t = clamp01(v);
            return t * t * (3 - 2 * t);
        };

        const bgProg = smooth01(sy / s3top);
        bgImage.style.filter       = `blur(${bgProg*20}px)`;
        bgOverlay.style.background = `rgba(0,0,0,${bgProg})`;

        const rainbowInStart = s3top - vh * 0.45;
        const rainbowInEnd = s3top + vh * 0.12;
        const rainbowOutStart = s4top - vh * 0.28;
        const rainbowOutEnd = s4top;

        const rainbowIn = smooth01((sy - rainbowInStart) / (rainbowInEnd - rainbowInStart));
        const rainbowOut = 1 - smooth01((sy - rainbowOutStart) / (rainbowOutEnd - rainbowOutStart));
        const rainbowOpacity = 0.72 * rainbowIn * clamp01(rainbowOut);
        const transProg = clamp01((sy - s3top) / (s4top - s3top));
        const enableAnimatedBackground = rainbowOpacity > 0.01;

        // Rainbow
        if (enableAnimatedBackground) {
            if (!shaderReady) initShader();
            shaderCanvas._startLoop && shaderCanvas._startLoop();
            shaderCanvas.style.filter  = `blur(${transProg*8}px)`;
            shaderCanvas.style.opacity = String(rainbowOpacity);
        } else {
            shaderCanvas._stopLoop && shaderCanvas._stopLoop();
            shaderCanvas.style.opacity = '0';
            shaderCanvas.style.filter  = 'none';
        }

        if (fluidCanvas && ggjLinkTop > 0) {
            const fluidFadeStart = ggjLinkTop - window.innerHeight * 0.22;
            const fluidFadeEnd = ggjLinkTop + window.innerHeight * 0.06;
            const fluidProgress = clamp01((sy - fluidFadeStart) / (fluidFadeEnd - fluidFadeStart));
            const fluidVisible = skillsVisible && fluidProgress > 0.01;
            fluidCanvas.style.opacity = fluidVisible ? String(fluidProgress) : '0';
            window.dispatchEvent(new CustomEvent('portfolio:fluid-visibility', {
                detail: { visible: fluidVisible }
            }));
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
    // PRANK: manav.win links scroll to top + cheeky alert
    // =========================================================
    document.querySelectorAll('a[href="https://manav.win"]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => {
                alert('You are already IN THE WEBSITE DUH!! 🙄');
            }, 600);
        });
    });
});
