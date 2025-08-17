function Games() {
  const [screen, setScreen] = React.useState("menu"); // 'menu' | 'rps'
  return (
    <>
      <h2>Games</h2>
      {screen === "menu" && (
        <div className="card">
          <h3>Pick a game</h3>
          <div className="grid" style={{gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:16}}>
            <button className="card" style={{textAlign:"left"}} onClick={()=>setScreen("rps")}>
              <div style={{fontSize:28, marginBottom:8}}>🪨 📄 ✂️</div>
              <div style={{fontWeight:600}}>Rock • Paper • Scissors (Simulation)</div>
              <div className="muted">Bouncing agents convert each other on contact.</div>
            </button>
            {/* Add more game tiles here later */}
          </div>
        </div>
      )}

      {screen === "rps" && <RpsSim onBack={()=>setScreen("menu")} />}
    </>
  );
}

function RpsSim({ onBack }) {
  // pre-start options
  const [nPerType, setNPerType] = React.useState(12);
  const [speed, setSpeed] = React.useState(90);     // px/s
  const [radius, setRadius] = React.useState(12);   // px

  // run state
  const [started, setStarted] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  const canvasRef = React.useRef(null);
  const agentsRef = React.useRef([]);
  const sizeRef   = React.useRef({ w: 0, h: 0 });
  const dprRef    = React.useRef(1);

  const TYPES   = ["R","P","S"];
  const ICONS   = { R:"🪨", P:"📄", S:"✂️" }; // icons used for drawing
  const COLORS  = { R:"#94a3b8", P:"#fbbf24", S:"#f87171" }; // glow tint (subtle)

  const rand = (a,b)=> a + Math.random()*(b-a);
  const dist2 = (ax,ay,bx,by)=> (ax-bx)*(ax-bx) + (ay-by)*(ay-by);

  function winnerOf(a, b) {
    if (a === b) return 0;
    if ((a==="R"&&b==="S")||(a==="S"&&b==="P")||(a==="P"&&b==="R")) return 1;
    return -1;
  }

  function resizeCanvas() {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    dprRef.current = dpr;
    c.width  = Math.floor(rect.width * dpr);
    c.height = Math.floor(rect.height * dpr);
    sizeRef.current = { w: c.width, h: c.height };
  }

  function placeAgents() {
    const { w, h } = sizeRef.current;
    const R = radius * dprRef.current;
    const out = [];
    const maxTries = 600;

    for (const t of TYPES) {
      for (let i=0;i<nPerType;i++) {
        let x,y, tries=0;
        do {
          x = rand(R, w - R);
          y = rand(R, h - R);
          tries++;
          if (tries > maxTries) break;
        } while (out.some(o => dist2(o.x,o.y,x,y) < (R*2+1)*(R*2+1)));
        const ang = rand(0, Math.PI*2);
        out.push({ type:t, x, y, vx: Math.cos(ang)*speed, vy: Math.sin(ang)*speed });
      }
    }
    agentsRef.current = out;
  }

  // init / cleanup
  React.useEffect(() => {
    resizeCanvas();
    const onResize = () => { resizeCanvas(); if (started) placeAgents(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [started]);

  // live speed adjustment
  React.useEffect(() => {
    agentsRef.current.forEach(a => {
      const len = Math.hypot(a.vx, a.vy) || 1;
      a.vx = (a.vx/len) * speed;
      a.vy = (a.vy/len) * speed;
    });
  }, [speed]);

  // main loop
  const stepRef = React.useRef((dt)=>{});
  stepRef.current = (dt) => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    const { w, h } = sizeRef.current;
    const dpr = dprRef.current;
    const R = radius * dpr;
    const arr = agentsRef.current;

    // update
    for (let i=0;i<arr.length;i++){
      const a = arr[i];
      a.x += a.vx * dt * dpr;
      a.y += a.vy * dt * dpr;
      if (a.x < R){ a.x = R; a.vx = Math.abs(a.vx); }
      if (a.x > w-R){ a.x = w-R; a.vx = -Math.abs(a.vx); }
      if (a.y < R){ a.y = R; a.vy = Math.abs(a.vy); }
      if (a.y > h-R){ a.y = h-R; a.vy = -Math.abs(a.vy); }
    }

    // collisions
    const rr = R*2, rr2 = rr*rr;
    for (let i=0;i<arr.length;i++){
      for (let j=i+1;j<arr.length;j++){
        const a = arr[i], b = arr[j];
        const d2 = dist2(a.x,a.y,b.x,b.y);
        if (d2 < rr2){
          const d = Math.max(0.0001, Math.sqrt(d2));
          const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
          const overlap = rr - d;
          const push = overlap/2 + 0.1;
          a.x -= nx*push; a.y -= ny*push;
          b.x += nx*push; b.y += ny*push;

          const avn = a.vx*nx + a.vy*ny;
          const atx = a.vx - avn*nx, aty = a.vy - avn*ny;
          const bvn = b.vx*nx + b.vy*ny;
          const btx = b.vx - bvn*nx, bty = b.vy - bvn*ny;
          a.vx = bvn*nx + atx; a.vy = bvn*ny + aty;
          b.vx = avn*nx + btx; b.vy = avn*ny + bty;

          const res = winnerOf(a.type, b.type);
          if (res === 1) b.type = a.type;
          else if (res === -1) a.type = b.type;
        }
      }
    }

    // draw
    ctx.clearRect(0,0,w,h);

    // counts HUD
    let cR=0,cP=0,cS=0;
    for (const a of arr){ if(a.type==="R") cR++; else if(a.type==="P") cP++; else cS++; }
    const fg = getComputedStyle(document.documentElement).getPropertyValue("--fg") || "#111";
    ctx.fillStyle = fg;
    ctx.font = `${12*dpr}px ui-sans-serif, system-ui, Segoe UI, Roboto, Arial`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`🪨 ${cR}   📄 ${cP}   ✂️ ${cS}`, 8*dpr, 8*dpr);

    // agents as emoji icons (centered)
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const a of arr){
      // subtle glow behind icon for visibility
      ctx.beginPath();
      ctx.fillStyle = COLORS[a.type] + "33";
      ctx.arc(a.x, a.y, R*0.95, 0, Math.PI*2);
      ctx.fill();

      ctx.font = `${R*1.9}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
      ctx.fillText(ICONS[a.type], a.x, a.y); // draw emoji
    }
  };

  React.useEffect(() => {
    let raf=0, last=performance.now();
    function loop(t){
      const dt = Math.min(0.033, (t-last)/1000);
      last = t;
      if (started && running) stepRef.current(dt);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [started, running]);

  const start = () => {
    resizeCanvas();
    placeAgents();
    setStarted(true);
    setRunning(true);
  };
  const reset = () => {
    resizeCanvas();
    placeAgents();
  };

  const canvasStyle = {
    width:"100%", height:420, display:"block",
    borderRadius:12, border:"1px solid var(--border)", background:"var(--bg)"
  };

  return (
    <div className="card">
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
        <button onClick={onBack}>← Back</button>
        <h3 style={{margin:0}}>Rock • Paper • Scissors — Simulation</h3>
      </div>

      {!started ? (
        <>
          <div className="row" style={{display:"flex", gap:16, flexWrap:"wrap", alignItems:"center"}}>
            <div style={{fontSize:28}}>🪨 📄 ✂️</div>
            <label>Per type:&nbsp;
              <input type="number" min="2" max="150" value={nPerType}
                onChange={e=>setNPerType(Math.max(2, Math.min(150, +e.target.value||0)))} style={{width:90}}/>
            </label>
            <label>Speed:&nbsp;
              <input type="range" min="20" max="200" value={speed} onChange={e=>setSpeed(+e.target.value)} />
              <span className="muted" style={{marginLeft:6}}>{speed}px/s</span>
            </label>
            <label>Radius:&nbsp;
              <input type="range" min="6" max="22" value={radius} onChange={e=>setRadius(+e.target.value)} />
              <span className="muted" style={{marginLeft:6}}>{radius}px</span>
            </label>
            <button onClick={start} style={{marginLeft:"auto"}}>Start ▶</button>
          </div>
          <canvas ref={canvasRef} style={canvasStyle} />
          <div className="row muted">Set options, then press <b>Start</b> to begin.</div>
        </>
      ) : (
        <>
          <div className="row" style={{display:"flex", gap:12, flexWrap:"wrap", alignItems:"center"}}>
            <div className="muted" style={{display:"flex", alignItems:"center", gap:10}}>
              <span>🪨</span>
              <span>📄</span>
              <span>✂️</span>
            </div>
            <label>Speed:&nbsp;
              <input type="range" min="20" max="200" value={speed} onChange={e=>setSpeed(+e.target.value)} />
              <span className="muted" style={{marginLeft:6}}>{speed}px/s</span>
            </label>
            <label>Radius:&nbsp;
              <input type="range" min="6" max="22" value={radius} onChange={e=>setRadius(+e.target.value)} />
              <span className="muted" style={{marginLeft:6}}>{radius}px</span>
            </label>
            <button onClick={()=>setRunning(r=>!r)}>{running ? "Pause II" : "Play ▶"}</button>
            <button onClick={reset}>Reset</button>
            <button onClick={()=>{ setStarted(false); setRunning(false); }}>Change Options</button>
          </div>
          <canvas ref={canvasRef} style={canvasStyle} />
          <div className="row muted">Rules: same-type bounce; winners convert losers (R&gt;S, S&gt;P, P&gt;R).</div>
        </>
      )}
    </div>
  );
}
