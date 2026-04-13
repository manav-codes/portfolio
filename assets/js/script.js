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
        { label:'Ultra',  dpr:1.5,  interval:0,  waves:7, yScale:0.8,  distort:0.08 },
        { label:'High',   dpr:1.0,  interval:0,  waves:7, yScale:0.7,  distort:0.06 },
        { label:'Medium', dpr:0.75, interval:33, waves:5, yScale:0.4,  distort:0.03 },
        { label:'Low',    dpr:0.5,  interval:50, waves:3, yScale:0.25, distort:0.02 },
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

    function initShader() {
        const gl = shaderCanvas.getContext('webgl', { powerPreference:'high-performance', antialias:false, depth:false, stencil:false })
                || shaderCanvas.getContext('experimental-webgl');
        if (!gl) return;

        const vertSrc = `attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0,1);}`;
        const fragSrc = `precision mediump float;
            uniform vec2 resolution; uniform float time,xScale,yScale,distortion,waveCount;
            vec3 wave(vec2 p,float offset,vec3 color){
                float d=dot(p,p)*distortion; float x=p.x*(1.0+d);
                float dist=abs(p.y+sin((x+time+offset)*xScale)*yScale);
                return color*smoothstep(0.18,0.0,dist)*0.75;
            }
            void main(){
                vec2 invRes=vec2(1.0)/resolution;
                vec2 p=(gl_FragCoord.xy*2.0-resolution)*invRes;
                p*=(resolution.x<resolution.y)?(resolution.x*invRes.y):1.0;
                vec3 col=vec3(0);
                col+=wave(p,0.0,vec3(0.56,0.0,1.0)); col+=wave(p,1.8,vec3(0.0,0.0,1.0)); col+=wave(p,5.4,vec3(1.0,0.0,0.0));
                float hi=step(3.5,waveCount);
                col+=wave(p,0.9,vec3(0.29,0.0,1.0))*hi; col+=wave(p,3.6,vec3(1.0,1.0,0.0))*hi;
                float ultra=step(5.5,waveCount);
                col+=wave(p,2.7,vec3(0.0,0.8,0.0))*ultra; col+=wave(p,4.5,vec3(1.0,0.5,0.0))*ultra;
                gl_FragColor=vec4(min(col,vec3(0.85)),1.0);
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
        gl.uniform1f(gl.getUniformLocation(prog,'xScale'), 0.6);

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
            lastFrameTime=now; t+=0.005;
            gl.uniform1f(uTime,t); gl.drawArrays(gl.TRIANGLES,0,6);
        }
        shaderCanvas._startLoop = () => { if (!rainbowRafId) { rainbowActive=true; rainbowRafId=requestAnimationFrame(loop); } };
        shaderCanvas._stopLoop  = () => { rainbowActive=false; };
        shaderReady = true;
    }

    // =========================================================
    // CUSTOM FLUID SIMULATION — fully optimized
    // =========================================================
    let fluidLoaded  = false;
    let fluidRafId   = null;
    let fluidRunning = false;
    let fluidVisible = false;
    let fluidIdleTimer = null;
    let fluidHasSplat  = false;

    // 3-tier quality system
    const FLUID_TIERS = {
        HIGH:   { SIM:128, DYE:512, PITERS:4, FRAME_MS:16 },
        MEDIUM: { SIM:64,  DYE:256, PITERS:2, FRAME_MS:33 },
        LOW:    { SIM:32,  DYE:128, PITERS:1, FRAME_MS:50 },
    };
    function fluidInitialTier() {
        if (gpuTier==='low'||isMobile||ramGB<=2) return 'LOW';
        if (gpuTier==='mid'||ramGB<=4)           return 'MEDIUM';
        return 'HIGH';
    }

    function loadFluid() {
        if (fluidLoaded) return;
        fluidLoaded = true;

        const canvas = document.getElementById('smokey-fluid-canvas');
        if (!canvas) return;

        const gl = canvas.getContext('webgl', { alpha:false, antialias:false, depth:false, stencil:false, powerPreference:'high-performance' });
        if (!gl) return;

        const hf    = gl.getExtension('OES_texture_half_float');
        const hfLin = gl.getExtension('OES_texture_half_float_linear');
        // Use half-float only when linear filtering is also supported
        // Otherwise fall back to UNSIGNED_BYTE which always supports LINEAR
        const texType = (hf && hfLin) ? hf.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
        const filter  = gl.LINEAR; // always LINEAR — UNSIGNED_BYTE always supports it

        // Device-based initial tier, adaptive at runtime
        let fTierName = fluidInitialTier();
        let fTier = FLUID_TIERS[fTierName];
        let SIM = fTier.SIM, DYE = fTier.DYE, PITERS = fTier.PITERS, FRAME_MS = fTier.FRAME_MS;
        let tSIM = [1/SIM,1/SIM], tDYE = [1/DYE,1/DYE];

        // Adaptive FPS for fluid
        let fTierLocked=false, fTierLockTimer=null, paceFrames=0, paceTs=performance.now();
        function lockFTier(ms){ fTierLocked=true; clearTimeout(fTierLockTimer); fTierLockTimer=setTimeout(()=>{fTierLocked=false;},ms); }
        function adaptFTier(fps) {
            if (fTierLocked) return;
            let next = fTierName;
            if      (fps<25 && fTierName!=='LOW')    next='LOW';
            else if (fps<45 && fTierName==='HIGH')   next='MEDIUM';
            else if (fps>55 && fTierName!=='HIGH')   next = fTierName==='LOW'?'MEDIUM':'HIGH';
            if (next===fTierName) return;
            fTierName=next; fTier=FLUID_TIERS[next];
            SIM=fTier.SIM; DYE=fTier.DYE; PITERS=fTier.PITERS; FRAME_MS=fTier.FRAME_MS;
            tSIM=[1/SIM,1/SIM]; tDYE=[1/DYE,1/DYE];
            lockFTier(next==='HIGH'?4000:next==='MEDIUM'?3000:5000);
        }

        const V=`precision mediump float; attribute vec2 a; varying vec2 v; void main(){v=a*.5+.5;gl_Position=vec4(a,0,1);}`;
        function mkProg(f){
            function sh(t,s){const x=gl.createShader(t);gl.shaderSource(x,s);gl.compileShader(x);return x;}
            const p=gl.createProgram(); gl.attachShader(p,sh(gl.VERTEX_SHADER,V)); gl.attachShader(p,sh(gl.FRAGMENT_SHADER,f)); gl.linkProgram(p); return p;
        }
        // Cache uniforms at compile time — never call getUniformLocation per frame
        function U(p,names){const u={};names.forEach(n=>{u[n]=gl.getUniformLocation(p,n);});return u;}

        const pAdvect=mkProg(`precision mediump float; uniform sampler2D uVel,uSrc; uniform vec2 tV,tS; uniform float dt,diss; varying vec2 v;
            void main(){gl_FragColor=diss*texture2D(uSrc,v-dt*texture2D(uVel,v).xy*tV);}`);
        const uA=U(pAdvect,['uVel','uSrc','tV','tS','dt','diss']);

        const pDiverg=mkProg(`precision mediump float; uniform sampler2D uVel; uniform vec2 t; varying vec2 v;
            void main(){float L=texture2D(uVel,v-vec2(t.x,0)).x,R=texture2D(uVel,v+vec2(t.x,0)).x,T=texture2D(uVel,v+vec2(0,t.y)).y,B=texture2D(uVel,v-vec2(0,t.y)).y;
            gl_FragColor=vec4(.5*(R-L+T-B),0,0,1);}`);
        const uDv=U(pDiverg,['uVel','t']);

        const pPres=mkProg(`precision mediump float; uniform sampler2D uP,uD; uniform vec2 t; varying vec2 v;
            void main(){float L=texture2D(uP,v-vec2(t.x,0)).x,R=texture2D(uP,v+vec2(t.x,0)).x,T=texture2D(uP,v+vec2(0,t.y)).x,B=texture2D(uP,v-vec2(0,t.y)).x;
            gl_FragColor=vec4((L+R+B+T-texture2D(uD,v).x)*.25,0,0,1);}`);
        const uPr=U(pPres,['uP','uD','t']);

        const pGrad=mkProg(`precision mediump float; uniform sampler2D uP,uVel; uniform vec2 t; varying vec2 v;
            void main(){float L=texture2D(uP,v-vec2(t.x,0)).x,R=texture2D(uP,v+vec2(t.x,0)).x,T=texture2D(uP,v+vec2(0,t.y)).x,B=texture2D(uP,v-vec2(0,t.y)).x;
            gl_FragColor=vec4(texture2D(uVel,v).xy-.5*vec2(R-L,T-B),0,1);}`);
        const uGr=U(pGrad,['uP','uVel','t']);

        const pSplat=mkProg(`precision mediump float; uniform sampler2D uT; uniform vec2 pt,tx; uniform vec3 col; uniform float r; varying vec2 v;
            void main(){vec2 d=(v-pt)*vec2(tx.x/tx.y,1); gl_FragColor=texture2D(uT,v)+vec4(col*exp(-dot(d,d)*r),0);}`);
        const uSp=U(pSplat,['uT','pt','tx','col','r']);

        const pDisp=mkProg(`precision mediump float; uniform sampler2D uD; varying vec2 v;
            void main(){
                vec3 c=texture2D(uD,v).rgb;
                // Stronger tonemap — compress highlights more aggressively
                c = c / (c + vec3(0.7));
                gl_FragColor=vec4(c,1);
            }`);
        const uDp=U(pDisp,['uD']);

        // Single quad buffer, bound once
        const qbuf=gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER,qbuf);
        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);

        let curProg=null;
        function use(p){
            if(curProg===p)return; curProg=p; gl.useProgram(p);
            const a=gl.getAttribLocation(p,'a'); gl.enableVertexAttribArray(a);
            gl.bindBuffer(gl.ARRAY_BUFFER,qbuf); gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
        }

        function mkTex(w,h){
            const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,texType,null);
            const fb=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fb);
            gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
            return {t,fb,w,h};
        }
        function dbl(w,h){let a=mkTex(w,h),b=mkTex(w,h); return{get r(){return a;},get w(){return b;},swap(){[a,b]=[b,a];}};}

        let vel=dbl(SIM,SIM),dye=dbl(DYE,DYE),pres=dbl(SIM,SIM),div=mkTex(SIM,SIM);

        function bt(unit,fbo){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,fbo.t||fbo.r.t);}
        function blit(fbo){
            if(fbo){gl.bindFramebuffer(gl.FRAMEBUFFER,fbo.fb||fbo.r.fb);gl.viewport(0,0,fbo.w||fbo.r.w,fbo.h||fbo.r.h);}
            else{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,canvas.width,canvas.height);}
            gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        }

        const COLORS=[[0.0,0.9,1.0],[1.0,0.0,0.8]]; // cyan, stronger magenta
        let ci=0;

        function splat(x,y,dx,dy){
            const [r,g,b]=COLORS[ci^=1]; const force=isMobile?1500:2500;
            use(pSplat); bt(0,vel.r); gl.uniform1i(uSp.uT,0);
            gl.uniform2f(uSp.pt,x,y); gl.uniform2fv(uSp.tx,tSIM);
            gl.uniform3f(uSp.col,dx*force,dy*force,0); gl.uniform1f(uSp.r,400);
            blit(vel.w); vel.swap(); curProg=null;

            use(pSplat); bt(0,dye.r); gl.uniform1i(uSp.uT,0);
            gl.uniform2f(uSp.pt,x,y); gl.uniform2fv(uSp.tx,tDYE);
            gl.uniform3f(uSp.col,r*.24,g*.24,b*.24); gl.uniform1f(uSp.r,600);
            blit(dye.w); dye.swap();
            fluidHasSplat=true;
            // Restart loop if it self-paused after dye faded
            if(!fluidRafId&&fluidVisible){fluidRunning=true;fluidRafId=requestAnimationFrame(loop);}
        }

        function step(){
            use(pAdvect); bt(0,vel.r);gl.uniform1i(uA.uVel,0); bt(1,vel.r);gl.uniform1i(uA.uSrc,1);
            gl.uniform2fv(uA.tV,tSIM);gl.uniform2fv(uA.tS,tSIM);gl.uniform1f(uA.dt,.016);gl.uniform1f(uA.diss,.94);
            blit(vel.w); vel.swap(); curProg=null;

            use(pAdvect); bt(0,vel.r);gl.uniform1i(uA.uVel,0); bt(1,dye.r);gl.uniform1i(uA.uSrc,1);
            gl.uniform2fv(uA.tV,tSIM);gl.uniform2fv(uA.tS,tDYE);gl.uniform1f(uA.dt,.016);gl.uniform1f(uA.diss,.93);
            blit(dye.w); dye.swap();

            if(!fluidHasSplat)return; // skip pressure when idle

            use(pDiverg); bt(0,vel.r);gl.uniform1i(uDv.uVel,0);gl.uniform2fv(uDv.t,tSIM); blit(div);

            for(let i=0;i<PITERS;i++){
                use(pPres); bt(0,pres.r);gl.uniform1i(uPr.uP,0); bt(1,div);gl.uniform1i(uPr.uD,1);
                gl.uniform2fv(uPr.t,tSIM); blit(pres.w); pres.swap();
            }

            use(pGrad); bt(0,pres.r);gl.uniform1i(uGr.uP,0); bt(1,vel.r);gl.uniform1i(uGr.uVel,1);
            gl.uniform2fv(uGr.t,tSIM); blit(vel.w); vel.swap();
        }

        let lastFT=0, dyeFadeCheck=0;
        function loop(now){
            if(!fluidRunning||!tabVisible){fluidRafId=null;return;}
            fluidRafId=requestAnimationFrame(loop);

            // Adaptive FPS measurement every 2s
            paceFrames++;
            if(now-paceTs>=2000){
                adaptFTier(Math.round(paceFrames/((now-paceTs)*.001)));
                paceFrames=0; paceTs=now;
            }

            if(now-lastFT<FRAME_MS)return; // frame cap
            lastFT=now;
            step();
            use(pDisp); bt(0,dye.r); gl.uniform1i(uDp.uD,0); blit(null);

            // Check dye fade every 30 frames — stop loop when fully dissipated
            dyeFadeCheck++;
            if(dyeFadeCheck>=30){
                dyeFadeCheck=0;
                if(!fluidHasSplat){
                    gl.bindFramebuffer(gl.FRAMEBUFFER, dye.r.fb);
                    const fmt  = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
                    const type = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
                    // Pick correct ArrayBufferView for the returned type
                    const buf  = (type === gl.UNSIGNED_BYTE) ? new Uint8Array(4) : new Uint16Array(4);
                    gl.readPixels(DYE>>1, DYE>>1, 1, 1, fmt, type, buf);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                    // For half-float, values are 16-bit; threshold ~3/255 ≈ 200 in half-float
                    const threshold = (type === gl.UNSIGNED_BYTE) ? 3 : 200;
                    if(buf[0]<threshold && buf[1]<threshold && buf[2]<threshold){
                        fluidRunning=false; fluidRafId=null; return;
                    }
                }
            }
        }

        function resize(){
            const dpr=Math.min(window.devicePixelRatio,isMobile?1:1.5);
            canvas.width=Math.floor(window.innerWidth*dpr);
            canvas.height=Math.floor(window.innerHeight*dpr);
        }
        window.addEventListener('resize',resize); resize();

        let lx=.5,ly=.5;
        window.addEventListener('pointermove',e=>{
            if(!fluidVisible)return;
            const nx=e.clientX/window.innerWidth,ny=1-e.clientY/window.innerHeight;
            const dx=(nx-lx)*5,dy=(ny-ly)*5; lx=nx;ly=ny;
            if(Math.abs(dx)+Math.abs(dy)<.0001)return;
            splat(nx,ny,dx,dy);
            clearTimeout(fluidIdleTimer);
            fluidIdleTimer=setTimeout(()=>{fluidHasSplat=false;},1500);
        },{passive:true});

        window.addEventListener('touchmove',e=>{
            if(!fluidVisible)return;
            const nx=e.touches[0].clientX/window.innerWidth,ny=1-e.touches[0].clientY/window.innerHeight;
            const dx=(nx-lx)*5,dy=(ny-ly)*5; lx=nx;ly=ny;
            splat(nx,ny,dx,dy);
            clearTimeout(fluidIdleTimer);
            fluidIdleTimer=setTimeout(()=>{fluidHasSplat=false;},1500);
        },{passive:true});

        canvas._startFluid=()=>{if(!fluidRafId){fluidRunning=true;fluidRafId=requestAnimationFrame(loop);}};
        canvas._stopFluid =()=>{fluidRunning=false;};
    }

    // =========================================================
    // SCROLL + BACKGROUND
    // =========================================================
    const bgImage  = document.getElementById('bg-image');
    const bgOverlay= document.getElementById('bg-overlay');
    const section3 = document.getElementById('section-3');
    const section4 = document.getElementById('section-4');
    let scrollRafPending = false;

    function updateBackground() {
        scrollRafPending = false;
        const s3top = section3.getBoundingClientRect().top + window.scrollY;
        const s4top = section4.getBoundingClientRect().top + window.scrollY;
        const s5top = document.getElementById('section-5').getBoundingClientRect().top + window.scrollY;
        const sy    = window.scrollY;

        const bgProg = Math.min(Math.max(sy / s3top, 0), 1);
        bgImage.style.filter       = `blur(${bgProg*20}px)`;
        bgOverlay.style.background = `rgba(0,0,0,${bgProg})`;

        const transLen  = s4top - s3top;
        const transProg = Math.min(Math.max((sy - s3top) / transLen, 0), 1);

        // Rainbow
        if (bgProg >= 1) {
            if (!shaderReady) initShader();
            shaderCanvas._startLoop && shaderCanvas._startLoop();
            shaderCanvas.style.filter  = `blur(${transProg*24}px)`;
            shaderCanvas.style.opacity = String((1-transProg)*0.35);
        } else {
            shaderCanvas._stopLoop && shaderCanvas._stopLoop();
            shaderCanvas.style.opacity = '0';
            shaderCanvas.style.filter  = 'none';
        }

        // Fluid — trigger when section-4 enters viewport (s4top - innerHeight)
        if (sy > s4top - 500) loadFluid();

        const viewportTrigger = s4top - window.innerHeight;
        const fluidTrigger = viewportTrigger + window.innerHeight * 0.5;
        const fluidIn      = Math.min(Math.max((sy - fluidTrigger) / 200, 0), 1);
        const fluidOut     = Math.min(Math.max((sy - (s5top - 300)) / 200, 0), 1);
        const fluidOpacity = fluidIn * (1 - fluidOut) * 0.9;

        const fc = document.getElementById('smokey-fluid-canvas');
        if (fc) {
            fluidVisible = fluidOpacity > 0.01;
            fc.style.opacity = String(fluidOpacity);
            if (fluidVisible) fc._startFluid && fc._startFluid();
            else              fc._stopFluid  && fc._stopFluid();
        }
    }

    window.addEventListener('scroll', () => {
        if (!scrollRafPending) { scrollRafPending=true; requestAnimationFrame(updateBackground); }
    }, { passive:true });
    updateBackground();

    // Preload fluid when the portfolio preview image comes into view
    // (section-3, well before section-4) — zero lag by the time user gets there
    const portfolioPreview = document.querySelector('a[href="https://manav.win"] img');
    if (portfolioPreview) {
        const preloadObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                loadFluid();
                preloadObserver.disconnect();
            }
        }, { threshold: 0.1 });
        preloadObserver.observe(portfolioPreview);
    } else {
        setTimeout(loadFluid, 2000);
    }

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
});
