/* games.jsx */
/* globals React */

// ========== Rock • Paper • Scissors Simulation ==========
function RpsSim({ onBack }) {
  const [nPerType, setNPerType] = React.useState(12);
  const [speed, setSpeed] = React.useState(90);
  const [radius, setRadius] = React.useState(12);

  const [started, setStarted] = React.useState(false);
  const [running, setRunning] = React.useState(false);

  const canvasRef = React.useRef(null);
  const agentsRef = React.useRef([]);
  const sizeRef   = React.useRef({ w: 0, h: 0 });
  const dprRef    = React.useRef(1);

  const TYPES   = ["R","P","S"];
  const ICONS   = { R:"🪨", P:"📄", S:"✂️" };
  const COLORS  = { R:"#94a3b8", P:"#fbbf24", S:"#f87171" };

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

  React.useEffect(() => {
    resizeCanvas();
    const onResize = () => { resizeCanvas(); if (started) placeAgents(); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [started]);

  React.useEffect(() => {
    agentsRef.current.forEach(a => {
      const len = Math.hypot(a.vx, a.vy) || 1;
      a.vx = (a.vx/len) * speed;
      a.vy = (a.vy/len) * speed;
    });
  }, [speed]);

  const stepRef = React.useRef((dt)=>{});
  stepRef.current = (dt) => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    const { w, h } = sizeRef.current;
    const dpr = dprRef.current;
    const R = radius * dpr;
    const arr = agentsRef.current;

    for (let i=0;i<arr.length;i++){
      const a = arr[i];
      a.x += a.vx * dt * dpr;
      a.y += a.vy * dt * dpr;
      if (a.x < R){ a.x = R; a.vx = Math.abs(a.vx); }
      if (a.x > w-R){ a.x = w-R; a.vx = -Math.abs(a.vx); }
      if (a.y < R){ a.y = R; a.vy = Math.abs(a.vy); }
      if (a.y > h-R){ a.y = h-R; a.vy = -Math.abs(a.vy); }
    }

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

    ctx.clearRect(0,0,w,h);

    let cR=0,cP=0,cS=0;
    for (const a of arr){ if(a.type==="R") cR++; else if(a.type==="P") cP++; else cS++; }
    const fg = getComputedStyle(document.documentElement).getPropertyValue("--fg") || "#111";
    ctx.fillStyle = fg;
    ctx.font = `${12*dpr}px ui-sans-serif, system-ui, Segoe UI, Roboto, Arial`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(`🪨 ${cR}   📄 ${cP}   ✂️ ${cS}`, 8*dpr, 8*dpr);

    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (const a of arr){
      ctx.beginPath();
      ctx.fillStyle = COLORS[a.type] + "33";
      ctx.arc(a.x, a.y, R*0.95, 0, Math.PI*2);
      ctx.fill();
      ctx.font = `${R*1.9}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
      ctx.fillText(ICONS[a.type], a.x, a.y);
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
    <div className="card page">
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

/* ====== Survival RPG (text-based) ====== */
function StatBar({ username, day, overtime_days, hp, max_hp, stamina, max_stamina, deltas, location, biome }) {
  const fmt = v => (v>0 ? `+${v}` : v);
  const tone = v => (v>0 ? "#16a34a" : v<0 ? "#dc2626" : "var(--muted)");
  return (
    <div style={{display:"flex", gap:12, alignItems:"center",
      padding:"10px 12px", borderBottom:"1px solid var(--surface-border)"}}>
      <strong>{username}</strong>
      <div>Day: {day}{overtime_days>0 && <span> (+{overtime_days} OT)</span>} / {4}</div>
      <div>Pos: <code>{location}</code> • <span className="muted">{biome}</span></div>
      <div>HP: {hp}/{max_hp} {deltas && deltas.hp!==0 && <small style={{color:tone(deltas.hp)}}>({fmt(deltas.hp)})</small>}</div>
      <div>Stamina: {stamina}/{max_stamina} {deltas && deltas.stamina!==0 && <small style={{color:tone(deltas.stamina)}}>({fmt(deltas.stamina)})</small>}</div>
    </div>
  );
}

function Backpack({ items }) {
  return (
    <div className="card" style={{padding:12}}>
      <div style={{fontWeight:700, marginBottom:6}}>Backpack</div>
      {items?.length ? (
        <ul style={{margin:0, paddingLeft:18}}>
          {items.map(it => <li key={it}>{it}</li>)}
        </ul>
      ) : <div className="muted">Empty</div>}
    </div>
  );
}

function SurvivalGame({ onBack }) {
  // Game options
  const [username, setUsername] = React.useState("Scientist");
  const [shuffleOptions, setShuffleOptions] = React.useState(true);

  // Session/game state
  const [sessionId, setSessionId] = React.useState(null);
  const [state, setState] = React.useState(null);
  const [narration, setNarration] = React.useState("");
  const [companion, setCompanion] = React.useState("");
  const [hint, setHint] = React.useState(null);
  const [options, setOptions] = React.useState([]);
  const [futureMoves, setFutureMoves] = React.useState([]); // NEW
  const [isOver, setIsOver] = React.useState(false);
  const [ending, setEnding] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  // bars delta
  const [prevBars, setPrevBars] = React.useState({ hp: null, stamina: null });
  const [deltas, setDeltas] = React.useState({ hp: 0, stamina: 0 });

  function applyResponse(j) {
    // deltas
    setDeltas({
      hp: prevBars.hp == null ? 0 : (j.state.hp - prevBars.hp),
      stamina: prevBars.stamina == null ? 0 : (j.state.stamina - prevBars.stamina),
    });
    setPrevBars({ hp: j.state.hp, stamina: j.state.stamina });

    setState(j.state);
    setNarration(j.narration);
    setCompanion(j.companion || "");
    setHint(j.hint || null);

    let opts = j.options || [];
    if (shuffleOptions && opts.length > 1) opts = [...opts].sort(()=>Math.random()-0.5);
    setOptions(opts);
    setFutureMoves(j.future_moves || []); // NEW

    setIsOver(j.is_over);
    setEnding(j.ending || null);
  }

  async function startGame() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/rpg/survival/new", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ username })
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setSessionId(j.session_id);
      applyResponse(j);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  async function choose(optionId) {
    if (!sessionId) return;
    setBusy(true); setErr("");
    try {
      // Using legacy shim to keep your backend compatible
      const r = await fetch("/api/rpg/survival/choose", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ session_id: sessionId, option_id: optionId })
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      applyResponse(j);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  }

  function summaryEnding(e) {
    if (e === "rescued") return "You were rescued! 🎉";
    if (e === "dead") return "You died. 💀";
    return "";
  }

  function resetToMenu() {
    setSessionId(null);
    setOptions([]); setHint(null);
    setPrevBars({ hp: null, stamina: null });
    setDeltas({ hp: 0, stamina: 0 });
    setFutureMoves([]);
  }

  return (
    <div className="card page">
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
        <button onClick={onBack}>← Back</button>
        <h3 style={{margin:0}}>RPG — Survival (Text)</h3>
        <label style={{marginLeft:"auto", display:"inline-flex", gap:8, alignItems:"center"}}>
          <input type="checkbox" checked={shuffleOptions} onChange={e=>setShuffleOptions(e.target.checked)} />
          Shuffle Choice Order
        </label>
      </div>

      {!sessionId ? (
        <>
          <div className="row" style={{display:"grid", gap:12}}>
            <div style={{display:"flex", gap:12, flexWrap:"wrap", alignItems:"center"}}>
              <label>Username:&nbsp;
                <input value={username} onChange={e=>setUsername(e.target.value)} />
              </label>
            </div>
            <div>
              <button onClick={startGame} disabled={busy}>
                {busy ? "Starting..." : "Start ▶"}
              </button>
              {err && <div className="muted" style={{color:"crimson", marginTop:8}}>{err}</div>}
            </div>
            <div className="muted">
              Goal: move east across the island and signal a boat at the east shore. If you go past 4 days, the journey continues with increasing fatigue.
            </div>
          </div>
        </>
      ) : (
        <>
          <StatBar
            username={state.username}
            day={state.day}
            overtime_days={state.overtime_days}
            hp={state.hp} max_hp={state.max_hp}
            stamina={state.stamina} max_stamina={state.max_stamina}
            deltas={deltas}
            location={state.location} biome={state.biome}
          />

          <div style={{display:"grid", gridTemplateColumns:"1fr 280px", gap:16, marginTop:12}}>
            <div>
              {/* Narration */}
              <div style={{
                whiteSpace:"pre-wrap", lineHeight:1.5, padding:12,
                border:"1px solid var(--surface-border)", borderRadius:12,
                background:"var(--surface)", backdropFilter:"blur(8px) saturate(140%)"
              }}>
                {narration}
              </div>

              {/* Companion */}
              {companion && (
                <div style={{marginTop:8, padding:10, borderLeft:"4px solid var(--accent)",
                  background:"var(--surface)", borderRadius:10}}>
                  <em>Companion:</em> {companion}
                </div>
              )}

              {/* Hint */}
              {hint?.text && (
                <div className="muted" style={{marginTop:6}}>
                  <em>Hint:</em> {hint.text}{hint.tone && <span> <small>({hint.tone})</small></span>}
                </div>
              )}

              {/* Future routes preview */}
              {!!futureMoves.length && (
                <div className="card" style={{marginTop:10, padding:10}}>
                  <div style={{fontWeight:700, marginBottom:6}}>Next routes</div>
                  <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                    {futureMoves.map(m => (
                      <span key={m.id} className="muted" style={{
                        border:"1px solid var(--surface-border)", borderRadius:999, padding:"4px 10px"
                      }}>
                        {m.to.replace("_"," ")} • {m.biome} <small>({m.difficulty})</small>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Choices */}
              <div style={{display:"flex", gap:8, flexWrap:"wrap", marginTop:12}}>
                {!isOver ? options.map(o => (
                  <button key={o.id} onClick={()=>choose(o.id)} disabled={busy}>{o.label}</button>
                )) : (
                  <>
                    <div style={{fontWeight:700}}>{summaryEnding(ending)}</div>
                    <button onClick={resetToMenu}>Play Again</button>
                  </>
                )}
              </div>

              {err && <div className="muted" style={{color:"crimson", marginTop:8}}>{err}</div>}
            </div>

            {/* Sidebar: Backpack + Route */}
            <div style={{display:"grid", gap:12}}>
              <div className="card" style={{padding:12}}>
                <div style={{fontWeight:700, marginBottom:6}}>Backpack</div>
                {state.inventory?.length ? (
                  <ul style={{margin:0, paddingLeft:18}}>
                    {state.inventory.map(it => <li key={it}>{it}</li>)}
                  </ul>
                ) : <div className="muted">Empty</div>}
              </div>
              <div className="card" style={{padding:12}}>
                <div style={{fontWeight:700, marginBottom:6}}>Route so far</div>
                <div className="muted">{(state.path || []).join(" → ")}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ========== Games ==========
// ========== Games ==========
function Games() {
  const [screen, setScreen] = React.useState("menu"); // 'menu' | 'rps' | 'rpg' | 'llm'
  return (
    <div className="page">
      <h2>Games</h2>

      {screen === "menu" && (
        <div className="card">
          <h3>Pick a game</h3>
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}
          >
            <button className="card tile" onClick={() => setScreen("rps")}>
              <div className="emoji">🪨 📄 ✂️</div>
              <div style={{ fontWeight: 600 }}>Rock • Paper • Scissors (Simulation)</div>
              <div className="muted">Bouncing agents convert each other on contact.</div>
            </button>

            <button className="card tile" onClick={() => setScreen("rpg")}>
              <div className="emoji">🏝️ 🧪 🤖</div>
              <div style={{ fontWeight: 600 }}>RPG — Survival (Text)</div>
              <div className="muted">Guide the scientist east; wrong turns are dead ends.</div>
            </button>

            {/* LLM Diagnostics tile */}
            <button className="card tile" onClick={() => setScreen("llm")}>
              <div className="emoji">🧪🤖</div>
              <div style={{ fontWeight: 600 }}>LLM Diagnostics</div>
              <div className="muted">Connectivity &amp; round-trip test</div>
            </button>
          </div>
        </div>
      )}

      {screen === "rps" && <RpsSim onBack={() => setScreen("menu")} />}
      {screen === "rpg" && <SurvivalGame onBack={() => setScreen("menu")} />}
      {screen === "llm" && <LlmDiagnostics onBack={() => setScreen("menu")} />}
    </div>
  );
}


/* LlmDiagnostics.jsx */
function LlmDiagnostics({ onBack }) {
  const [result, setResult] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  async function run() {
    setBusy(true); setErr(""); setResult(null);
    try {
      const r = await fetch("/api/llm/test");
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setResult(j);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  const badge = (ok) => (
    <span style={{
      padding:"2px 8px", borderRadius:999,
      background: ok ? "rgba(22,163,74,.15)" : "rgba(220,38,38,.15)",
      color: ok ? "#16a34a" : "#dc2626",
      border: `1px solid ${ok ? "#16a34a33" : "#dc262633"}`
    }}>
      {ok ? "OK" : "FAIL"}
    </span>
  );

  return (
    <div className="card page">
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
        <button onClick={onBack}>← Back</button>
        <h3 style={{margin:0}}>LLM Diagnostics</h3>
      </div>

      <div className="card" style={{display:"grid", gap:12}}>
        <div className="muted">
          Quick connectivity and behavior check for your configured LLM.
        </div>
        <button onClick={run} disabled={busy}>{busy ? "Testing…" : "Run Test ▶"}</button>

        {err && <div className="muted" style={{color:"crimson"}}>{err}</div>}

        {result && (
          <div className="card" style={{display:"grid", gap:8}}>
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <strong>Status:</strong> {badge(result.ok)}
              {!result.configured && <span className="muted">Not configured</span>}
            </div>
            <div className="muted">Model: <code>{result.model || "?"}</code></div>
            <div className="muted">Base: <code>{result.provider_base || "?"}</code></div>
            <div className="muted">Latency: {result.latency_ms != null ? `${result.latency_ms} ms` : "—"}</div>
            {typeof result.encounter_ok === "boolean" && (
              <div className="muted">Encounter JSON: {badge(result.encounter_ok)}</div>
            )}
            {result.sample && (
              <div style={{
                padding:10, border:"1px solid var(--surface-border)",
                borderRadius:10, background:"var(--surface)"
              }}>
                <div style={{fontWeight:600, marginBottom:4}}>Sample reply</div>
                <div>{result.sample}</div>
              </div>
            )}
            {result.error && (
              <div className="muted" style={{color:"crimson"}}>Error: {result.error}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Expose to other scripts (no bundler)
window.RpsSim = RpsSim;
window.SurvivalGame = SurvivalGame;
window.Games  = Games;
