(function () {
    // DOM references
    const canvas = document.getElementById('simCanvas');
    const ctx = canvas.getContext('2d');

    const elSpeed = document.getElementById('speed');
    const elAngle = document.getElementById('angle');
    const elHeight = document.getElementById('height');
    const elGravity = document.getElementById('gravity');

    const elShowV = document.getElementById('showV');
    const elShowVx = document.getElementById('showVx');
    const elShowVy = document.getElementById('showVy');
    const elShowG = document.getElementById('showG');
    const elShowTrail = document.getElementById('showTrail');
    const elLockScale = document.getElementById('lockScale');

    const btnPlayPause = document.getElementById('playPause');
    const btnReset = document.getElementById('reset');
    // --- Added: fullscreen elements ---
    const canvasWrap = document.getElementById('canvasWrap');
    const btnFullscreen = document.getElementById('btnFullscreen');
    const fsPlayPause = document.getElementById('fsPlayPause');
    const fsReset = document.getElementById('fsReset');

    const tVal = document.getElementById('tVal');
    const xVal = document.getElementById('xVal');
    const yVal = document.getElementById('yVal');
    const vxVal = document.getElementById('vxVal');
    const vyVal = document.getElementById('vyVal');
    const vVal = document.getElementById('vVal');

    const tofVal = document.getElementById('tofVal');
    const rangeVal = document.getElementById('rangeVal');
    const hmaxVal = document.getElementById('hmaxVal');

    const eq_v0 = document.getElementById('eq_v0');
    const eq_theta = document.getElementById('eq_theta');
    const eq_y0 = document.getElementById('eq_y0');
    const eq_g = document.getElementById('eq_g');

    // Simulation state
    const state = {
        v0: 25,
        thetaDeg: 45,
        y0: 0,
        g: 9.81,

        playing: false,
        t: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        speed: 0,

        trail: [],
        deviceRatio: window.devicePixelRatio || 1,

        // world-to-screen mapping
        scale: 50,  // px per meter, auto-adjusted
        padding: 50,
        lockScale: false,

        // --- Added: initial horizontal position (draggable start) ---
        x0: 0,

        // predicted extents
        tFlight: null,
        range: null,
        hMax: null
    };

    // Resize canvas to device pixel ratio for crisp lines
    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const dpr = state.deviceRatio;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
    }

    // Added: new result elements
    const peakVal = document.getElementById('peakVal');
    const eqPath = document.getElementById('eqPath');

    // Compute analytic results for range and max height (no air resistance)
    function computeAnalytics() {
        const theta = toRad(state.thetaDeg);
        const v0x = state.v0 * Math.cos(theta);
        const v0y = state.v0 * Math.sin(theta);

        // Time of flight: solve y(t)=0, y0 + v0y t - 0.5 g t^2 = 0
        const disc = v0y * v0y + 2 * state.g * state.y0;
        const tFlight = (v0y + Math.sqrt(Math.max(0, disc))) / state.g;
        state.tFlight = isFinite(tFlight) ? tFlight : null;

        state.range = isFinite(tFlight) ? v0x * tFlight : null;

        // Max height and peak time/position
        const tPeak = v0y / state.g;
        state.hMax = (v0y * v0y) / (2 * state.g) + state.y0;
        // --- Changed: peak x includes x0 offset ---
        state.xPeak = state.x0 + v0x * tPeak;

        // Update summary UI
        tofVal.textContent = state.tFlight ? state.tFlight.toFixed(2) : '—';
        rangeVal.textContent = state.range ? state.range.toFixed(2) : '—';
        hmaxVal.textContent = state.hMax ? state.hMax.toFixed(2) : '—';
        peakVal.textContent = (isFinite(state.xPeak) && isFinite(state.hMax))
            ? `(${state.xPeak.toFixed(2)} m, ${state.hMax.toFixed(2)} m)`
            : '—';

        // --- Changed: trajectory equation shows offset x0 ---
        // y(x) = y0 + tanθ (x − x0) − (g / (2 v0² cos²θ)) (x − x0)²
        const tanTheta = Math.tan(theta);
        const cosTheta = Math.cos(theta);
        const denom = 2 * state.v0 * state.v0 * cosTheta * cosTheta;
        const quadCoeff = denom > 0 ? state.g / denom : 0; // safeguard
        eqPath.textContent = `y(x) = ${state.y0.toFixed(2)} + ${tanTheta.toFixed(4)} (x − ${state.x0.toFixed(2)}) − ${quadCoeff.toFixed(6)} (x − ${state.x0.toFixed(2)})²`;

        // Adjust scale to fit trajectory nicely, unless locked
        if (!state.lockScale) {
            const pad = 2; // meters padding
            // --- Changed: include x0 in horizontal fit so full path stays on-screen ---
            const xMax = Math.max(10, (state.x0 + (state.range || 10)) + pad);
            const yMax = Math.max(10, state.hMax + pad);
            const usableW = canvas.clientWidth - state.padding * 2;
            const usableH = canvas.clientHeight - state.padding * 2;
            const sx = usableW / xMax;
            const sy = usableH / yMax;
            state.scale = Math.min(sx, sy);
        }
    }

    // Reset simulation state
    function resetSim() {
        state.t = 0;
        state.playing = false;
        btnPlayPause.textContent = 'Play';

        const theta = toRad(state.thetaDeg);
        state.vx = state.v0 * Math.cos(theta);
        state.vy = state.v0 * Math.sin(theta);
        state.speed = Math.hypot(state.vx, state.vy);

        // --- Changed: start at (x0, y0) ---
        state.x = state.x0;
        state.y = state.y0;
        state.trail = [{ x: state.x, y: state.y }];

        updateReadouts();
        computeAnalytics();
        draw();
    }

    // Update physics with a fixed dt (seconds)
    function stepPhysics(dt) {
        // Kinematics without drag
        state.t += dt;
        // --- Changed: x includes x0 offset ---
        state.x = state.x0 + state.vx * state.t;
        state.y = state.y0 + state.vy * state.t - 0.5 * state.g * state.t * state.t;

        // Velocity components
        const vy = state.vy - state.g * state.t;
        state.speed = Math.hypot(state.vx, vy);

        // Update trail
        if (elShowTrail.checked && state.y >= 0) {
            const last = state.trail[state.trail.length - 1];
            if (!last || Math.hypot(state.x - last.x, state.y - last.y) > 0.02) {
                state.trail.push({ x: state.x, y: state.y });
            }
        }

        // Stop when projectile hits ground (y <= 0)
        if (state.y <= 0 && state.t > 0) {
            state.y = 0;
            state.playing = false;
            btnPlayPause.textContent = 'Play';
        }

        updateReadouts();
    }

    function updateReadouts() {
        const theta = toRad(state.thetaDeg);
        const v0x = state.v0 * Math.cos(theta);
        const v0y0 = state.v0 * Math.sin(theta);
        const vy = v0y0 - state.g * state.t;
        const speed = Math.hypot(v0x, vy);

        tVal.textContent = state.t.toFixed(2);
        xVal.textContent = state.x.toFixed(2);
        yVal.textContent = state.y.toFixed(2);
        vxVal.textContent = v0x.toFixed(2);
        vyVal.textContent = vy.toFixed(2);
        vVal.textContent = speed.toFixed(2);

        eq_v0.textContent = state.v0.toFixed(2);
        eq_theta.textContent = state.thetaDeg.toFixed(2);
        eq_y0.textContent = state.y0.toFixed(2);
        eq_g.textContent = state.g.toFixed(2);
    }

    // Animation loop
    let lastTime = 0;
    function tick(ts) {
        if (!lastTime) lastTime = ts;
        const elapsedMs = ts - lastTime;
        lastTime = ts;

        if (state.playing) {
            const dt = Math.min(0.033, elapsedMs / 1000); // cap dt at ~1/30 s
            stepPhysics(dt);
            draw();
        }
        requestAnimationFrame(tick);
    }

    // Drawing helpers
    function toRad(deg) { return deg * Math.PI / 180; }

    function worldToScreen(wx, wy) {
        const px = state.padding + wx * state.scale;
        const py = canvas.clientHeight - state.padding - wy * state.scale;
        return { x: px, y: py };
    }
    // --- Added: screen to world (for dragging start point) ---
    function screenToWorld(sx, sy) {
        const wx = (sx - state.padding) / state.scale;
        const wy = (canvas.clientHeight - state.padding - sy) / state.scale;
        return { x: wx, y: wy };
    }

    // --- Added: label at the selected starting point (x0, y0) ---
    function drawStartLabel() {
        const p = worldToScreen(state.x0, state.y0);

        // small marker
        ctx.save();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.stroke();

        // coordinate label
        ctx.font = '12px Segoe UI, Arial';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText(`Start (${state.x0.toFixed(2)} m, ${state.y0.toFixed(2)} m)`, p.x + 8, p.y - 8);
        ctx.restore();
    }

    function drawGridAndAxes() {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        ctx.clearRect(0, 0, w, h);
    
        // Grid
        ctx.save();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#1f2937';
        const step = Math.max(20, state.scale); // grid step ~ 1m or more
        for (let x = state.padding; x <= w - state.padding; x += step) {
            ctx.beginPath();
            ctx.moveTo(x + 0.5, state.padding);
            ctx.lineTo(x + 0.5, h - state.padding);
            ctx.stroke();
        }
        for (let y = state.padding; y <= h - state.padding; y += step) {
            ctx.beginPath();
            ctx.moveTo(state.padding, y + 0.5);
            ctx.lineTo(w - state.padding, y + 0.5);
            ctx.stroke();
        }
        ctx.restore();
    
        // Axes
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        // x-axis (ground line)
        ctx.beginPath();
        const groundY = worldToScreen(0, 0).y;
        ctx.moveTo(state.padding, groundY);
        ctx.lineTo(w - state.padding, groundY);
        ctx.stroke();
    
        // y-axis
        ctx.beginPath();
        const origin = worldToScreen(0, 0);
        ctx.moveTo(origin.x, h - state.padding);
        ctx.lineTo(origin.x, state.padding);
        ctx.stroke();
    
        // --- Added: Axis ticks and numeric labels ---
        // Choose a "nice" tick step in meters so labels are ~80px apart
        const targetPx = 80;
        const targetMeters = Math.max(0.1, targetPx / state.scale);
        const base = Math.pow(10, Math.floor(Math.log10(targetMeters)));
        const ratio = targetMeters / base;
        let tickStep = base;
        if (ratio >= 5) tickStep = 5 * base;
        else if (ratio >= 2) tickStep = 2 * base;
    
        const decimals = tickStep >= 1 ? 0 : tickStep >= 0.1 ? 1 : 2;
    
        const xMaxMeters = (w - state.padding * 2) / state.scale;
        const yMaxMeters = (h - state.padding * 2) / state.scale;
    
        ctx.save();
        ctx.strokeStyle = '#9ca3af';
        ctx.fillStyle = '#9ca3af';
        ctx.lineWidth = 1;
        ctx.font = '12px Segoe UI, Arial';
    
        // X-axis ticks and labels (meters)
        for (let m = 0; m <= xMaxMeters + 1e-6; m += tickStep) {
            const p = worldToScreen(m, 0);
            // tick mark
            ctx.beginPath();
            ctx.moveTo(p.x + 0.5, groundY);
            ctx.lineTo(p.x + 0.5, groundY + 6);
            ctx.stroke();
            // label under the axis
            ctx.fillText(m.toFixed(decimals), p.x - 8, groundY + 18);
        }
    
        // Y-axis ticks and labels (meters)
        for (let m = 0; m <= yMaxMeters + 1e-6; m += tickStep) {
            const p = worldToScreen(0, m);
            // tick mark
            ctx.beginPath();
            ctx.moveTo(origin.x, p.y + 0.5);
            ctx.lineTo(origin.x - 6, p.y + 0.5);
            ctx.stroke();
            // label left of the axis
            ctx.fillText(m.toFixed(decimals), origin.x - 28, p.y + 4);
        }
        ctx.restore();
        // --- End added ---
    
        // Axis labels
        ctx.fillStyle = '#9ca3af';
        ctx.font = '12px Segoe UI, Arial';
        ctx.fillText('x (m)', w - state.padding + 6, groundY - 6);
        ctx.fillText('y (m)', origin.x + 6, state.padding - 6);
        ctx.restore();
    }

    function drawTrail() {
        if (!elShowTrail.checked || state.trail.length < 2) return;
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const p0 = worldToScreen(state.trail[0].x, state.trail[0].y);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < state.trail.length; i++) {
            const p = worldToScreen(state.trail[i].x, state.trail[i].y);
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.restore();
    }

    // --- Added: preview path before launch ---
    function drawPreviewPath() {
        if (state.playing || !isFinite(state.tFlight)) return;
        const theta = toRad(state.thetaDeg);
        const v0x = state.v0 * Math.cos(theta);
        const v0y = state.v0 * Math.sin(theta);

        ctx.save();
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.6)'; // semi-transparent accent
        ctx.setLineDash([6, 6]);
        ctx.lineWidth = 2;
        ctx.beginPath();

        const pStart = worldToScreen(state.x0, state.y0);
        ctx.moveTo(pStart.x, pStart.y);

        // sample the analytic path
        const steps = 120;
        const dt = state.tFlight / steps;
        for (let i = 1; i <= steps; i++) {
            const t = dt * i;
            const x = state.x0 + v0x * t;
            const y = state.y0 + v0y * t - 0.5 * state.g * t * t;
            const p = worldToScreen(x, Math.max(0, y));
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    function drawProjectile() {
        const pos = worldToScreen(state.x, state.y);

        // Body
        ctx.save();
        ctx.fillStyle = '#22d3ee';
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Vectors
        drawVectors(pos);
    }

    function arrow(fromX, fromY, toX, toY, color, label) {
        const dx = toX - fromX, dy = toY - fromY;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;

        const headLen = Math.min(16, Math.max(10, len * 0.15));
        const angle = Math.atan2(dy, dx);

        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;

        // Shaft
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        // Arrowhead
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLen * Math.cos(angle - Math.PI / 8), toY - headLen * Math.sin(angle - Math.PI / 8));
        ctx.lineTo(toX - headLen * Math.cos(angle + Math.PI / 8), toY - headLen * Math.sin(angle + Math.PI / 8));
        ctx.closePath();
        ctx.fill();

        // Label
        if (label) {
            ctx.font = '12px Segoe UI, Arial';
            ctx.fillStyle = color;
            const lxRaw = toX + 6 * Math.cos(angle);
            const lyRaw = toY + 6 * Math.sin(angle);
            // --- Added: keep labels inside the canvas ---
            const w = canvas.clientWidth, h = canvas.clientHeight;
            const lx = Math.max(8, Math.min(w - 8, lxRaw));
            const ly = Math.max(12, Math.min(h - 12, lyRaw));
            ctx.fillText(label, lx, ly);
        }
        ctx.restore();
    }

    function drawVectors(pos) {
        const theta = toRad(state.thetaDeg);
        const v0x = state.v0 * Math.cos(theta);
        const v0y0 = state.v0 * Math.sin(theta);
        const vy = v0y0 - state.g * state.t;

        // --- Replaced: adaptive saturating scaling to keep arrows readable across speeds ---
        const vMag = Math.hypot(v0x, vy);
        // Target max arrow length in pixels (saturates to this)
        const maxLenPx = Math.max(90, Math.min(160, canvas.clientHeight * 0.20));
        // Reference speed (m/s) controlling how fast arrows approach maxLenPx
        const vRef = 60; // tweakable; higher => slower growth
        // Smooth saturation: small speeds -> shorter arrows, large speeds -> ~maxLenPx
        let lenPx = maxLenPx * (1 - Math.exp(-vMag / vRef));
        // Ensure a minimum visible size when speed > 0
        if (vMag > 0) lenPx = Math.max(28, lenPx);
        const arrowScale = vMag > 0 ? (lenPx / vMag) : 0; // pixels per m/s

        // --- Existing labels (will now stay in-bounds due to scaling & clamping) ---
        const vMagStr = vMag.toFixed(2);
        const vxStr = v0x.toFixed(2);
        const vyStr = vy.toFixed(2);
        const gStr = state.g.toFixed(2);

        // Total velocity vector v
        if (elShowV.checked) {
            const tx = pos.x + v0x * arrowScale;
            const ty = pos.y - vy * arrowScale; // screen y is inverted
            arrow(pos.x, pos.y, tx, ty, '#ef4444', `v = ${vMagStr} m/s`);
        }

        // Horizontal component vx
        if (elShowVx.checked) {
            const tx = pos.x + v0x * arrowScale;
            const ty = pos.y;
            arrow(pos.x, pos.y, tx, ty, '#3b82f6', `vₓ = ${vxStr} m/s`);
        }

        // Vertical component vy
        if (elShowVy.checked) {
            const tx = pos.x;
            const ty = pos.y - vy * arrowScale;
            arrow(pos.x, pos.y, tx, ty, '#10b981', `vᵧ = ${vyStr} m/s`);
        }

        // Gravity vector g (constant downward)
        if (elShowG.checked) {
            const gLenPx = state.g * arrowScale;
            arrow(pos.x, pos.y, pos.x, pos.y + gLenPx, '#a78bfa', `g = ${gStr} m/s²`);
        }
    }

    // Added: draw a marker at the peak point on the trajectory
    function drawPeakMarker() {
        if (!isFinite(state.xPeak) || !isFinite(state.hMax)) return;
        const p = worldToScreen(state.xPeak, state.hMax);

        ctx.save();
        ctx.strokeStyle = '#f59e0b'; // use trail color for consistency
        ctx.fillStyle = '#f59e0b';
        ctx.lineWidth = 2;

        // Marker circle
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.stroke();

        // Small label
        ctx.font = '12px Segoe UI, Arial';
        ctx.fillText(`peak (${state.hMax.toFixed(2)} m)`, p.x + 8, p.y - 8);
        ctx.restore();
    }

    function draw() {
        resizeCanvas();
        drawGridAndAxes();
        // --- Added: show selected starting point label ---
        drawStartLabel();
        drawTrail();
        drawPreviewPath();
        drawPeakMarker();
        drawProjectile();
        // --- Added: keep overlay play button text in sync ---
        if (fsPlayPause) fsPlayPause.textContent = state.playing ? 'Pause' : 'Play';
    }

    // --- Added: ensure proper initial sizing and redraw when container resizes ---
    function setupResizeHooks() {
        const target = canvasWrap || canvas;

        // Redraw on container size changes (fixes initial clipping)
        if (window.ResizeObserver && target) {
            const ro = new ResizeObserver(() => {
                resizeCanvas();
                computeAnalytics();
                if (!state.playing) draw();
            });
            ro.observe(target);
        } else {
            // Fallback: window resize
            window.addEventListener('resize', () => {
                resizeCanvas();
                computeAnalytics();
                if (!state.playing) draw();
            });
        }

        // Force one render after styles/fonts are applied
        window.addEventListener('load', () => {
            resizeCanvas();
            computeAnalytics();
            draw();
        });
    }

    // --- Added: fullscreen handlers ---
    if (btnFullscreen && canvasWrap) {
        btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                canvasWrap.requestFullscreen().catch(() => {});
            }
        });
    }

    if (fsPlayPause) {
        fsPlayPause.addEventListener('click', () => {
            // proxy to main play/pause button
            btnPlayPause.click();
            fsPlayPause.textContent = state.playing ? 'Pause' : 'Play';
        });
    }

    if (fsReset) {
        fsReset.addEventListener('click', () => {
            // proxy to main reset button
            btnReset.click();
            if (fsPlayPause) fsPlayPause.textContent = 'Play';
        });
    }

    // Exit fullscreen on ESC and redraw when state changes
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    });

    document.addEventListener('fullscreenchange', () => {
        // Recompute size and redraw in new mode
        resizeCanvas();
        draw();
        // Sync overlay play button
        if (fsPlayPause) fsPlayPause.textContent = state.playing ? 'Pause' : 'Play';
    });

    // --- Added: allow clicking/dragging to set start point (x0, y0) ---
    let draggingStart = false;
    function setStartPointFromScreen(sx, sy) {
        const w = screenToWorld(sx, sy);
        // clamp within visible world and above ground
        const maxX = Math.max(0, (canvas.clientWidth - state.padding * 2) / state.scale);
        state.x0 = Math.max(0, Math.min(maxX, w.x));
        state.y0 = Math.max(0, w.y);

        // reflect y0 in the input field
        elHeight.value = state.y0.toFixed(2);

        // reset to pre-launch at new start
        state.t = 0;
        state.playing = false;
        btnPlayPause.textContent = 'Play';
        state.x = state.x0;
        state.y = state.y0;
        state.trail = [{ x: state.x0, y: state.y0 }];

        computeAnalytics();
        draw();
    }
    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const startPos = worldToScreen(state.x0, state.y0);
        const dist = Math.hypot(sx - startPos.x, sy - startPos.y);
        if (dist <= 12) {
            draggingStart = true;
        } else {
            // click elsewhere sets the start point
            setStartPointFromScreen(sx, sy);
        }
    });
    window.addEventListener('mousemove', (e) => {
        if (!draggingStart) return;
        const rect = canvas.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        setStartPointFromScreen(sx, sy);
    });
    window.addEventListener('mouseup', () => { draggingStart = false; });
    canvas.addEventListener('mouseleave', () => { draggingStart = false; });

    // Event handlers
    function readInputs() {
        state.v0 = clamp(Number(elSpeed.value) || 0, 0, 500);
        state.thetaDeg = clamp(Number(elAngle.value) || 0, -10, 85);
        state.y0 = clamp(Number(elHeight.value) || 0, 0, 200);
        state.g = clamp(Number(elGravity.value) || 9.81, 0.1, 50);
        state.lockScale = !!elLockScale.checked;
        resetSim(); // re-compute analytics and redraw
    }

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    elSpeed.addEventListener('change', readInputs);
    elAngle.addEventListener('change', readInputs);
    elHeight.addEventListener('change', readInputs);
    elGravity.addEventListener('change', readInputs);
    elShowV.addEventListener('change', draw);
    elShowVx.addEventListener('change', draw);
    elShowVy.addEventListener('change', draw);
    elShowG.addEventListener('change', draw);
    elShowTrail.addEventListener('change', draw);
    elLockScale.addEventListener('change', readInputs);

    btnPlayPause.addEventListener('click', () => {
        state.playing = !state.playing;
        btnPlayPause.textContent = state.playing ? 'Pause' : 'Play';
        if (!state.playing) draw();
    });

    btnReset.addEventListener('click', resetSim);

    // Initialize
    // --- Added: set up size observers BEFORE reading inputs ---
    setupResizeHooks();
    readInputs();
    requestAnimationFrame(tick);
})();