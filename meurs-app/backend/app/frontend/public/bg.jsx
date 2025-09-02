// bg.jsx — theme-aware, visible flower/wave background
(() => {
  // ===== CONFIG =====
  const MODE = 'flower';   // 'flower' | 'wave'
  const PETALS = 7;        // petals for flower mode
  const SPEED = 0.5;       // motion speed
  const RADIUS = 0.40;     // travel radius (0..1 of min(vw,vh))
  const INTENSITY = 1.15;  // global punch (1.0..1.4). Try 1.25 if you want more pop.
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // de-dupe
  const prev = document.querySelector('.site-bg');
  if (prev) prev.remove();

  // helpers
  const isDark = () =>
    (document.documentElement.getAttribute('data-theme') || '')
      .toLowerCase() === 'dark';

  // root
  const root = document.createElement('div');
  root.className = 'site-bg';
  Object.assign(root.style, {
    position:'fixed', inset:'0', zIndex:'0', pointerEvents:'none',
    overflow:'hidden', background:'var(--app-gradient)', transform:'translateZ(0)'
  });

  // subtle drift wash (now stronger + theme-aware)
  const drift = document.createElement('div');
  const setDriftStyle = () => {
    const blend = isDark() ? 'screen' : 'overlay';
    Object.assign(drift.style, {
      position:'absolute', inset:'-18%',
      background: 'radial-gradient(60% 60% at 20% 20%, rgba(255,255,255,.14), transparent 60%)',
      filter:'blur(24px) saturate(120%)',
      mixBlendMode: blend,
      opacity: 0.8 * INTENSITY
    });
  };
  setDriftStyle();

  // brighter top glow
  const topGlow = document.createElement('div');
  Object.assign(topGlow.style, {
    position:'absolute', left:0, right:0, top:0, height:'260px',
    background:'radial-gradient(100% 60% at 50% 0%, rgba(255,255,255,.35) 0%, rgba(255,255,255,0) 60%)',
    filter:'blur(12px)', opacity: 0.9
  });

  // soft pads for depth
  const pad = (blur, op) => {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position:'absolute', inset:'-10%',
      background:'radial-gradient(35% 35% at 70% 30%, rgba(255,255,255,.18), transparent 60%)',
      filter:`blur(${blur}px)`, opacity: String(op * INTENSITY)
    });
    return el;
  };
  const p1 = pad(42, .9);
  const p2 = pad(64, .7);

  // blobs: inner + outer skirt for visibility, hues from CSS vars
  const mkBlob = (size, alphaVar = '--bg-blob-alpha') => {
    const b = document.createElement('div');
    b.style.position = 'absolute';
    b.style.width = `${size}px`;
    b.style.height = `${size}px`;
    b.style.transform = 'translate(-50%,-50%)';
    b.style.borderRadius = '9999px';
    b.style.willChange = 'transform, opacity';

    // inner core
    const core = document.createElement('div');
    Object.assign(core.style, {
      position:'absolute', inset:0, borderRadius:'inherit',
      background:
        `radial-gradient(circle at 35% 35%,
          rgba(var(--bg-blob-1) / calc(var(${alphaVar}) * ${INTENSITY})),
          rgba(var(--bg-blob-1) / 0) 62%),
         radial-gradient(circle at 65% 65%,
          rgba(var(--bg-blob-2) / calc(var(${alphaVar}) * ${INTENSITY})),
          rgba(var(--bg-blob-2) / 0) 65%)`,
      filter: 'blur(0.5px) saturate(120%)'
    });

    // outer halo (bigger for visibility)
    const halo = document.createElement('div');
    Object.assign(halo.style, {
      position:'absolute', inset:'-18%', borderRadius:'inherit',
      background:
        `radial-gradient(circle,
          rgba(var(--bg-blob-1) / calc(var(--bg-blob-alpha-outer) * ${INTENSITY})) 0%,
          rgba(var(--bg-blob-2) / 0) 70%)`,
      filter:'blur(26px)'
    });

    b.append(core, halo);
    return b;
  };

  const blobA = mkBlob(360);
  const blobB = mkBlob(260);

  // blend mode per theme for blobs (critical for visibility)
  const applyBlobBlend = () => {
    const blend = isDark() ? 'screen' : 'multiply'; // screen brightens on dark; multiply adds depth on light
    blobA.style.mixBlendMode = blend;
    blobB.style.mixBlendMode = blend;
  };
  applyBlobBlend();

  root.append(drift, p1, p2, topGlow, blobA, blobB);

  // mount
  const mount = () => document.body.prepend(root);
  document.body ? mount() : addEventListener('DOMContentLoaded', mount);

  // ===== motion paths =====
  let t = 0, raf = null;

  const flowerPath = (u, phase=0) => {
    const k = PETALS / 2;
    const θ = u + phase, r = Math.cos(k * θ);
    return { x: r * Math.cos(θ), y: r * Math.sin(θ) };
  };
  const wavePath = (u, ax=1, ay=2, phase=0) => ({ x: Math.sin(ax*u + phase), y: Math.sin(ay*u) });

  function tick(){
    const vw = innerWidth, vh = innerHeight;
    const radiusPx = Math.min(vw, vh) * RADIUS;

    t += (SPEED * 0.012);

    const pA = MODE==='flower' ? flowerPath(t, 0.0)         : wavePath(t, 1, 2, Math.PI*0.25);
    const pB = MODE==='flower' ? flowerPath(t, Math.PI/PETALS) : wavePath(t*0.9, 2, 3, Math.PI*0.5);

    const cx = vw*0.5, cy = vh*0.42;

    const xA = cx + pA.x * radiusPx;
    const yA = cy + pA.y * radiusPx * 0.75;
    const xB = cx + pB.x * radiusPx * 0.85;
    const yB = cy + pB.y * radiusPx * 0.65;

    blobA.style.left = `${xA}px`; blobA.style.top = `${yA}px`;
    blobB.style.left = `${xB}px`; blobB.style.top = `${yB}px`;

    // depth movement boosts visibility
    drift.style.transform = `translate(${-(xA-cx)*0.02}px, ${-(yA-cy)*0.02}px) scale(1.08)`;
    p1.style.transform    = `translate(${ (xA-cx)*0.018}px, ${(yA-cy)*0.018}px)`;
    p2.style.transform    = `translate(${-(xB-cx)*0.026}px, ${-(yB-cy)*0.026}px)`;

    raf = requestAnimationFrame(tick);
  }

  if (!reduceMotion) raf = requestAnimationFrame(tick);

  // ===== theme + resize reactions =====
  const repaint = () => { root.style.opacity='0.999'; requestAnimationFrame(() => root.style.opacity=''); };
  const themeObserver = new MutationObserver(() => { applyBlobBlend(); setDriftStyle(); repaint(); });
  themeObserver.observe(document.documentElement, { attributes:true, attributeFilter:['data-theme'] });

  addEventListener('resize', repaint, { passive:true });
  addEventListener('unload', () => { themeObserver.disconnect(); if (raf) cancelAnimationFrame(raf); });
})();
