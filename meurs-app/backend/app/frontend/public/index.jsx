/* globals React, ReactDOM */
const API = "/api";
const STATIC_BASE = "/static";
// import { Games } from "./games/games.jsx";
// import RpsSim from "./games/RpsSim.jsx";
// console.log("[app] index.jsx loaded");
/* ---------------- utilities ---------------- */
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'" :'&#39;'}[m]));

function useLocalPref(key, initial) {
  const [val, setVal] = React.useState(() => {
    const v = localStorage.getItem(key);
    return v ?? initial;
  });
  React.useEffect(() => { localStorage.setItem(key, val); }, [key, val]);
  return [val, setVal];
}

function useTheme() {
  const [theme, setTheme] = useLocalPref("meurs_theme", "light");
  const [accent, setAccent] = useLocalPref("meurs_accent", "#3b82f6");
  const [density, setDensity] = useLocalPref("meurs_density", "1");

  React.useEffect(() => {
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  React.useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
  }, [accent]);

  React.useEffect(() => {
    document.documentElement.style.setProperty("--density", density);
  }, [density]);

  return { theme, setTheme, accent, setAccent, density, setDensity };
}

/* -------------- Ripple (global) -------------- */
function useGlobalRipple() {
  React.useEffect(() => {
    const onClick = (e) => {
      const el = e.target.closest("button, .card, .tile, .tab, .side-link");
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const d = Math.max(rect.width, rect.height);
      const r = document.createElement("span");
      r.className = "ripple";
      r.style.width = r.style.height = `${d}px`;
      r.style.left = `${e.clientX - rect.left - d/2}px`;
      r.style.top  = `${e.clientY - rect.top  - d/2}px`;
      el.appendChild(r);
      setTimeout(() => r.remove(), 650);
    };
    document.addEventListener("click", onClick, { passive:true });
    return () => document.removeEventListener("click", onClick);
  }, []);
}

/* -------------- Toasts -------------- */
const ToastCtx = React.createContext({ push: () => {} });
function ToastProvider({ children }) {
  const [toasts, setToasts] = React.useState([]);
  const push = (text, kind="ok", ms=2200) => {
    const id = Math.random().toString(36).slice(2,9);
    setToasts(ts => [...ts, { id, text, kind }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), ms);
  };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
function useToast(){ return React.useContext(ToastCtx); }

/* -------------- WebSocket hook for Comuni -------------- */
function useComuni(roomId, username) {
  const [messages, setMessages] = React.useState([]);
  const [connected, setConnected] = React.useState(false);
  const [incomingFilename, setIncomingFilename] = React.useState(null);
  const wsRef = React.useRef(null);

  React.useEffect(() => {
    if (!roomId || !username) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/ws/comuni/${encodeURIComponent(roomId)}?user=${encodeURIComponent(username)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setMessages(m => [...m, {type:"system", text:"WS error."}]);
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          const m = JSON.parse(ev.data);
          if (m.type === "history") setMessages(m.items || []);
          else if (m.type === "clear") setMessages([]);
          else if (m.type === "file-header") {
            setIncomingFilename(m.filename || "file.bin");
            setMessages(prev => [...prev, m]);
          } else {
            setMessages(prev => [...prev, m]);
          }
        } catch {}
      } else {
        const blob = new Blob([ev.data]);
        const url = URL.createObjectURL(blob);
        const name = incomingFilename || "file.bin";
        setIncomingFilename(null);
        setMessages(prev => [...prev, { type:"file-dl", url, name }]);
      }
    };
    return () => { try { ws.close(); } catch(e) {} wsRef.current = null; };
  }, [roomId, username, incomingFilename]);

  const sendChat = (text) => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type:"chat", text }));
  };
  const sendFile = async (file) => {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    wsRef.current.send(JSON.stringify({ type:"file", filename:file.name }));
    wsRef.current.send(await file.arrayBuffer());
  };

  return { messages, connected, sendChat, sendFile };
}

/* ---------------- Components ---------------- */
function Nav({ route, setRoute, user, onOpenProfile, onOpenSide, themeApi }) {
  const { theme, setTheme } = themeApi;
  const quickToggle = () => setTheme(theme === "dark" ? "light" : "dark");
  return (
    <div className="nav">
      <div className="nav-inner container">
        <button className="pill burger" aria-label="Open menu" onClick={onOpenSide} title="Menu">
          ☰
        </button>
        <div className="brand">MEURS</div>
        <div className="tabs">
          {["home","dashboard","games","about"].map(r => (
            <button key={r}
              className={`tab ${route===r?"active":""}`}
              data-route={r}
              title={r[0].toUpperCase()+r.slice(1)}
              onClick={() => setRoute(r)}>
              <span className="icon">{r==="home"?"🏠":r==="dashboard"?"📊":r==="games"?"🎮":"ℹ️"}</span>
              {r[0].toUpperCase()+r.slice(1)}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="pill ghost" title="Toggle theme" onClick={quickToggle}>
          {theme === "dark" ? "🌙" : "☀️"}
        </button>
        <button id="profileBtn" className="pill" onClick={onOpenProfile} title="Profile & settings">
          <span className="icon">👤</span><span id="profileName">{user||"Guest"}</span>
        </button>
      </div>
    </div>
  );
}

function SideNav({ open, onClose, route, setRoute }) {
  const [collapsed, setCollapsed] = React.useState(false);

  // Close on ESC key
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Change route and close drawer
  const go = (r) => {
    setRoute(r);
    onClose();
  };

  // Final navigation items
  const items = [
    { key: "home", label: "Home", icon: "🏠", onClick: () => go("home") },
    { key: "dashboard", label: "Comuni", icon: "💬", onClick: () => go("dashboard") },
    { key: "games", label: "Games", icon: "🎮", onClick: () => go("games") },
    { key: "about", label: "About Us", icon: "ℹ️", onClick: () => go("about") },
  ];

  const isActive = (k) => route === k;

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className={`backdrop side-backdrop ${open ? "show" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />

      {/* Side Navigation Drawer */}
      <aside
        className="side-drawer"
        aria-label="Main Navigation"
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
        <div className={`rail ${open ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
          
          {/* Logo / Header */}
          <div className="rail-head">
            <div className="rail-logo">M</div>
          </div>

          {/* Main Nav Buttons */}
          <div className="rail-card">
            <div className="rail-list">
              {items.map((it) => (
                <button
                  key={it.key}
                  className={`rail-item ${isActive(it.key) ? "active" : ""}`}
                  onClick={it.onClick}
                  title={it.label}
                >
                  <span className="ico">{it.icon}</span>
                  <span className="lbl">{it.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Footer Section */}
          <div className="rail-foot">
            <div className="row mini">
              <button
                className="pill"
                onClick={() => document.getElementById("profileBtn")?.click()}
                title="Profile"
              >
                👤
              </button>
              <button
                className="pill"
                onClick={() => onClose()}
                title="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Collapse / Expand Toggle */}
          <button
            className="rail-toggle"
            aria-label={collapsed ? "Expand menu" : "Collapse menu"}
            onClick={() => setCollapsed((v) => !v)}
          >
            {collapsed ? "›" : "‹"}
          </button>
        </div>
      </aside>
    </>
  );
}

function ProfileDrawer({ open, onClose, user, logout, themeApi }) {
  const { theme, setTheme, accent, setAccent, density, setDensity } = themeApi;

  // Close on ESC
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`backdrop ${open ? "show" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      {/* Drawer panel */}
      <div
        id="profileDrawer"
        className={`drawer ${open ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profileDrawerTitle"
      >
        <h3 id="profileDrawerTitle" style={{margin:"6px 0"}}>Profile</h3>
        <div className="muted" id="profileUserLine">Signed in as {user||"Guest"}</div>

        <hr className="row" style={{border:"none", borderTop:"1px solid var(--border)"}} />

        <h4 style={{margin:"6px 0"}}>Customize UI</h4>
        <div className="row">
          <label>Theme:&nbsp;
            <select id="themeSelect" value={theme} onChange={e=>setTheme(e.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label>Accent:&nbsp;
            <select id="accentSelect" value={accent} onChange={e=>setAccent(e.target.value)}>
              <option value="#3b82f6">Blue</option>
              <option value="#10b981">Green</option>
              <option value="#f59e0b">Amber</option>
              <option value="#ef4444">Red</option>
              <option value="#a855f7">Purple</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label>Density:&nbsp;
            <select id="densitySelect" value={density} onChange={e=>setDensity(e.target.value)}>
              <option value="0.9">Compact</option>
              <option value="1">Cozy</option>
              <option value="1.15">Comfy</option>
            </select>
          </label>
        </div>
        <div className="row" style={{display:"flex",gap:8,alignItems:"center"}}>
          <button id="logoutBtn" onClick={logout}>Log out</button>
          <button id="closeDrawer" onClick={onClose} autoFocus>Close</button>
        </div>
        <div className="muted" style={{fontSize:".9em"}}>Tip: Your choices are saved to this browser (localStorage).</div>
      </div>
    </>
  );
}

function Auth({ onLoginSuccess }) {
  const [mode, setMode] = React.useState("login");
  const [u, setU] = React.useState("");
  const [p, setP] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const toast = useToast();

  const notify = (t)=>{ setMsg(t); };

  const signup = async () => {
    if(!u||!p) return notify("Enter username & password");
    const r = await fetch(`${API}/signup`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username:u,password:p})
    });
    const d = await r.json(); if(!r.ok) return notify(d.detail||"Sign up failed");
    notify("Account created. You can log in now."); setMode("login");
  };

  const login = async () => {
    if(!u||!p) return notify("Enter username & password");
    const r = await fetch(`${API}/login`,{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({username:u,password:p})
    });
    const d = await r.json(); if(!r.ok) return notify(d.detail||"Login failed");
    toast.push(`Welcome, ${u}!`); onLoginSuccess(u);
  };

  return (
    <div className="auth-hero page">
      {/* Decorative waves */}
      <div className="waves" aria-hidden="true">
        <svg className="w1" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0,128L48,128C96,128,192,128,288,144C384,160,480,192,576,176C672,160,768,96,864,80C960,64,1056,96,1152,128C1248,160,1344,192,1392,208L1440,224L1440,0L0,0Z"></path>
        </svg>
        <svg className="w2" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0,192L60,170.7C120,149,240,107,360,101.3C480,96,600,128,720,122.7C840,117,960,75,1080,90.7C1200,107,1320,181,1380,218.7L1440,256L1440,0L0,0Z"></path>
        </svg>
        <svg className="w3" viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0,256L80,245.3C160,235,320,213,480,213.3C640,213,800,235,960,208C1120,181,1280,107,1360,69.3L1440,32L1440,0L0,0Z"></path>
        </svg>
      </div>

      {/* Optional tiny tip at the top-right */}
      <div className="auth-top-tip">Welcome to Meurs ✨</div>

      {/* Login card */}
      <div className="login-card">
        <h2>{mode === "login" ? "Login" : "Create Account"}</h2>

        <div className="row" style={{display:"flex", gap:10}}>
          <button className={`pill ${mode==="login"?"active":""}`} onClick={()=>setMode("login")}>Login</button>
          <button className={`pill ${mode==="signup"?"active":""}`} onClick={()=>setMode("signup")}>Sign up</button>
        </div>

        <div className="row">
          <input placeholder="Username" autoComplete="username" value={u} onChange={e=>setU(e.target.value)} />
        </div>
        <div className="row">
          <input type="password" placeholder="Password" autoComplete={mode==="login"?"current-password":"new-password"} value={p} onChange={e=>setP(e.target.value)} />
        </div>

        {mode==="login" ? (
          <button className="btn-yellow" onClick={login}>Login</button>
        ) : (
          <button className="btn-yellow" onClick={signup}>Create account</button>
        )}

        <div className="auth-minilinks">
          <label style={{opacity:.9}}><input type="checkbox" style={{verticalAlign:"middle"}} /> Remember me</label>
          <a href="#" onClick={(e)=>e.preventDefault()}>Forgot password?</a>
          <a href="#" onClick={(e)=>{e.preventDefault(); setMode(m=>m==="login"?"signup":"login");}}>
            {mode==="login" ? "Create Account" : "Have an account? Login"}
          </a>
        </div>

        <div className="row muted" style={{marginTop:8, color:"#fff"}}>{msg}</div>
      </div>
    </div>
  );
}


/* ---------------- PAGES ---------------- */
function MusicSection({ onBack }) {
  const [q, setQ] = React.useState("");
  const [musicResults, setMusicResults] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  const [year, setYear] = React.useState("all");
  const [sortDir, setSortDir] = React.useState("desc");
  const [years, setYears] = React.useState([]);

  const [currentTrack, setCurrentTrack] = React.useState(null);

  const audioRef = React.useRef(null);
  const searchRef = React.useRef(null);

  React.useEffect(() => {
    const onKey = (e)=>{ if(e.key==="/" && document.activeElement.tagName!=="INPUT" && document.activeElement.tagName!=="TEXTAREA"){ e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searchMusic = async () => {
    setLoading(true); setMusicResults(null);
    try {
      const r = await fetch(`${API}/search/music?q=${encodeURIComponent(q || "lofi")}`);
      const d = await r.json();

      const items = (d.items || []).map(it => {
        const dateRaw = it.releaseDate || it.release_date || it.create_date || null;
        let yr = null;
        if (dateRaw) {
          const yy = new Date(dateRaw).getFullYear();
          if (!isNaN(yy)) yr = yy;
        }
        const id = it.id || it.track_id || it.trackId || it.audius_id;
        const builtPlay = id ? `${API}/music/stream/${encodeURIComponent(id)}` : null;

        return {
          ...it,
          year: yr,
          playUrl: it.playUrl || it.streamUrl || it.stream_url || builtPlay,
        };
      });

      const ys = [...new Set(items.filter(x => x.year).map(x => x.year))].sort((a,b)=>b-a);
      setYears(ys);
      setMusicResults(items);
    } catch {
      setMusicResults([]);
      setYears([]);
    } finally {
      setLoading(false);
    }
  };

  const visibleMusic = React.useMemo(() => {
    let arr = Array.isArray(musicResults) ? [...musicResults] : [];
    if (year !== "all") arr = arr.filter(x => x.year === +year);
    arr.sort((a,b) => {
      const ya = a.year ?? 0, yb = b.year ?? 0;
      if (ya !== yb) return sortDir === "desc" ? (yb - ya) : (ya - yb);
      return String(a.title||"").localeCompare(String(b.title||""));
    });
    return arr;
  }, [musicResults, year, sortDir]);

  const playTrack = (item) => {
    const el = audioRef.current; if (!el) return;
    const src = item.playUrl || item.streamUrl || item.stream_url;
    if (!src) return alert("No stream available for this track.");
    if (el.src !== src) el.src = src;
    setCurrentTrack(item);
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: item.title || "Now playing",
        artist: item.artist || "",
        artwork: item.artwork ? [{ src: item.artwork, sizes: "300x300", type: "image/jpeg" }] : []
      });
    }
    el.play().catch(()=>{});
  };

  return (
    <div className="page">
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
        <button onClick={onBack}>← Back</button>
        <h3 style={{margin:0}}>Music</h3>
        <div className="muted" style={{marginLeft:"auto"}}>Press “/” to focus search</div>
      </div>

      <div className="card">
        <div className={`progress ${loading ? "active":""}`} />
        <div className="row" style={{display:"flex", gap:8, alignItems:"center"}}>
          <input
            ref={searchRef}
            placeholder="Search music… (e.g., 'lofi chill')"
            style={{flex:1}}
            value={q}
            onChange={e=>setQ(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") searchMusic(); }}
          />
          <button onClick={searchMusic}>Search</button>
        </div>

        {Array.isArray(musicResults) && musicResults.length > 0 && (
          <>
            <div className="row" style={{display:"flex", gap:12, alignItems:"center", flexWrap:"wrap"}}>
              <label>Year:&nbsp;
                <select value={year} onChange={e=>setYear(e.target.value)}>
                  <option value="all">All</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>
              <label>Sort:&nbsp;
                <select value={sortDir} onChange={e=>setSortDir(e.target.value)}>
                  <option value="desc">Newest → Oldest</option>
                  <option value="asc">Oldest → Newest</option>
                </select>
              </label>
            </div>

            {/* STICKY AUDIO BAR AT TOP OF LIST */}
            <div className="row player-sticky">
              {currentTrack && (
                <div className="muted" style={{marginBottom:6}}>
                  Now playing: <b>{currentTrack.title || "Untitled"}</b>
                  {currentTrack.artist ? ` — ${currentTrack.artist}` : ""}
                </div>
              )}
              <audio
                ref={audioRef}
                style={{width:"100%"}}
                controls
                controlsList="nodownload noplaybackrate"
                onContextMenu={(e)=>e.preventDefault()}
              />
            </div>
          </>
        )}

        {/* RESULTS */}
        <div id="music-results" className="row">
          {loading ? (
            Array.from({length:6}).map((_,i)=><div className="skeleton" key={i} />)
          ) : musicResults == null ? (
            <div className="muted">Type a query and press Search.</div>
          ) : visibleMusic.length === 0 ? (
            "No results."
          ) : (
            visibleMusic.map((it, idx) => (
              <div className="row" key={idx}>
                <div className="media-item">
                  {it.artwork ? <img className="thumb" src={it.artwork} alt="" /> : null}
                  <div className="label">
                    <div
                      className="title"
                      dangerouslySetInnerHTML={{__html:
                        `${escapeHtml(it.title||"Untitled")}${it.artist?` — <span class="meta">${escapeHtml(it.artist)}</span>`:""}`}}
                    />
                    <div className="meta">
                      {it.source?.toUpperCase()}{it.year?` • ${it.year}`:""}
                    </div>
                  </div>
                </div>
                <button
                  onClick={()=>playTrack(it)}
                  disabled={!(it.playUrl || it.streamUrl || it.stream_url)}
                >
                  Play
                </button>
              </div>
            ))
          )}
        </div>

        {/* IMPORTANT: no audio element here anymore */}
      </div>
    </div>
  );
}


function VideosSection({ onBack }) {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const videoRef = React.useRef(null);
  const searchRef = React.useRef(null);

  React.useEffect(() => {
    const onKey = (e)=>{ if(e.key==="/" && document.activeElement.tagName!=="INPUT" && document.activeElement.tagName!=="TEXTAREA"){ e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const searchVideos = async () => {
    setLoading(true); setResults(null);
    try {
      const r = await fetch(`${API}/search/videos?q=${encodeURIComponent(q || "trending")}`);
      const d = await r.json();
      const items = (d.items || []).map(it => {
        const dateRaw = it.releaseDate || it.release_date || it.create_date || null;
        const y = dateRaw ? new Date(dateRaw).getFullYear() : null;
        const year = isNaN(y) ? null : y;
        const raw =
          it.stream_url || it.streamUrl || it.playUrl ||
          it.file || it.fileUrl || it.bestUrl ||
          (it.videos && (it.videos.large?.url || it.videos.medium?.url || it.videos.small?.url)) ||
          it.url;
        const builtPlay = raw ? `${API}/proxy?url=${encodeURIComponent(raw)}` : null;
        return {
          ...it,
          year,
          playUrl: it.playUrl || it.streamUrl || it.stream_url || builtPlay,
        };
      });
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const playVideo = (item) => {
    const el = videoRef.current; if (!el) return;
    const src = item.playUrl || item.streamUrl || item.stream_url;
    if (!src) return alert("No stream available for this video.");
    if (el.src !== src) el.src = src;
    el.play().catch(()=>{});
  };

  return (
    <div className="page">
      <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
        <button onClick={onBack}>← Back</button>
        <h3 style={{margin:0}}>Videos</h3>
        <div className="muted" style={{marginLeft:"auto"}}>Press “/” to focus search</div>
      </div>

      <div className="card">
        <div className={`progress ${loading ? "active":""}`} />
        <div className="row" style={{display:"flex", gap:8, alignItems:"center"}}>
          <input
            ref={searchRef}
            placeholder="Search videos…"
            style={{flex:1}}
            value={q}
            onChange={e=>setQ(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") searchVideos(); }}
          />
          <button onClick={searchVideos}>Search</button>
        </div>

        <div className="row">
          {loading ? (
            Array.from({length:6}).map((_,i)=><div className="skeleton" key={i} />)
          ) : results == null ? (
            <div className="muted">Type a query and press Search.</div>
          ) : results.length === 0 ? (
            "No results."
          ) : (
            results.map((it, idx) => (
              <div className="row" key={idx}>
                <div className="media-item">
                  {it.thumbnail || it.artwork ? (
                    <img className="thumb" src={it.thumbnail || it.artwork} alt="" />
                  ) : null}
                  <div className="label">
                    <div className="title">{it.title || "Untitled"}</div>
                    <div className="meta">{it.source?.toUpperCase()}{it.year?` • ${it.year}`:""}</div>
                  </div>
                </div>
                <button
                  onClick={()=>playVideo(it)}
                  disabled={!(it.playUrl || it.streamUrl || it.stream_url)}
                >
                  Play
                </button>
              </div>
            ))
          )}
        </div>

        <video
          ref={videoRef}
          style={{width:"100%", marginTop:8, display: Array.isArray(results) ? "block":"none"}}
          controls
          controlsList="nodownload noplaybackrate"
          onContextMenu={(e)=>e.preventDefault()}
        />
        <div className="muted" style={{marginTop:6}}>
          Only one video plays at a time. Downloads are disabled in the player UI.
        </div>
      </div>
    </div>
  );
}

/* HOME */
function Home({ currentUser }) {
  const [screen, setScreen] = React.useState("menu"); // 'menu' | 'music' | 'videos' | 'shorts'

  if (screen === "music")  return <MusicSection onBack={()=>setScreen("menu")} />;
  if (screen === "videos") return <VideosSection onBack={()=>setScreen("menu")} />;

  if (screen === "shorts") {
    return (
      <div className="page">
        <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:8}}>
          <button onClick={()=>setScreen("menu")}>← Back</button>
          <h3 style={{margin:0}}>Shorts</h3>
        </div>
        <div className="card">
          <div className="muted">Shorts will live here soon — you can wire this up later.</div>
        </div>
      </div>
    );
  }

  return (
  <div className="page">
    <h2>Home</h2>
    <div className="muted" style={{ marginBottom: 8, color: "#000" }}>
      Hi{currentUser ? `, ${currentUser}` : ""} 👋 — what would you like to do?
    </div>

    <div className="card">
      <h3>Pick a section</h3>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <button className="card tile" onClick={() => setScreen("music")}>
          <div className="emoji">🎵</div>
          <div style={{ fontWeight: 600 }}>Music</div>
          <div className="muted" style={{ color: "#000" }}>Search and play music from online providers.</div>
        </button>

        <button className="card tile" onClick={() => setScreen("videos")}>
          <div className="emoji">🎬</div>
          <div style={{ fontWeight: 600 }}>Videos</div>
          <div className="muted" style={{ color: "#000" }}>Search and play videos via your API.</div>
        </button>

        <button className="card tile" onClick={() => setScreen("shorts")}>
          <div className="emoji">🎞️</div>
          <div style={{ fontWeight: 600 }}>Shorts</div>
          <div className="muted" style={{ color: "#000" }}>Coming soon.</div>
        </button>
      </div>
    </div>
  </div>
);

}

/* DASHBOARD */
function Dashboard({ currentUser }) {
  const [roomId, setRoomId] = React.useState(null);
  const [joinId, setJoinId] = React.useState("");
  const [isOwner, setIsOwner] = React.useState(false);
  const { messages, connected, sendChat, sendFile } = useComuni(roomId, currentUser);
  const toast = useToast();

  const createRoom = async () => {
    const r = await fetch(`${API}/comuni/rooms`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:currentUser})});
    const d = await r.json(); if(!r.ok) return alert(d.detail||"Failed to create room");
    setRoomId(d.room_id); setIsOwner(true);
    toast.push("Room created");
  };
  const joinRoom = async () => {
    if(!joinId) return alert("Enter room id");
    const r = await fetch(`${API}/comuni/rooms/${encodeURIComponent(joinId)}/join`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:currentUser})});
    const d = await r.json(); if(!r.ok) return alert(d.detail||"Failed to join");
    setRoomId(joinId); setIsOwner(!!d.is_owner);
    toast.push(`Joined room ${joinId}`);
  };
  const closeRoom = async () => {
    if(!roomId) return;
    const r = await fetch(`${API}/comuni/rooms/${encodeURIComponent(roomId)}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:currentUser})});
    if(!r.ok){ const d = await r.json().catch(()=>({})); alert(d.detail||"Failed to close room"); return; }
    setRoomId(null); setIsOwner(false);
    toast.push("Room closed");
  };

  const [text, setText] = React.useState("");

  return (
    <div className="page">
      <h2>Dashboard</h2>
      <div className="card">
        <h3>Comuni</h3>
        <div className="row" style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
          <button id="btn-create" onClick={createRoom}>Create room</button>
          <input id="join-id" placeholder="Enter room id (7 chars)" style={{width:240}} value={joinId} onChange={e=>setJoinId(e.target.value)} />
          <button id="btn-join" onClick={joinRoom}>Join room</button>
          {roomId && <button id="btn-copy" title="Copy room id" onClick={async ()=>{ await navigator.clipboard.writeText(roomId); toast.push("Room id copied"); }}>{`Copy room id`}</button>}
        </div>

        {roomId && (
          <>
            <div id="room-bar" className="row">
              <span>Room: <b id="room-id-label">{roomId}</b></span>
              <button id="btn-exit" style={{marginLeft:12}} onClick={()=>{ setRoomId(null); setIsOwner(false); toast.push("Exited room"); }}>Exit</button>
              {isOwner && <button id="btn-close" style={{marginLeft:8}} onClick={closeRoom}>Close room</button>}
            </div>

            <div id="chat-area">
              <div id="chat-log">
                {messages.map((m, i) => {
                  if (m.type==="chat") return <div className="chat-row" key={i}><b>{m.from}:</b> {m.text}</div>;
                  if (m.type==="system") return <div className="chat-row muted" key={i}><i>{m.text}</i></div>;
                  if (m.type==="file-header") return <div className="chat-row muted" key={i}><i>{m.from} sent: {m.filename}</i></div>;
                  if (m.type==="file-dl") return <div className="chat-row" key={i}><a href={m.url} download={m.name}>Download: {m.name}</a></div>;
                  return null;
                })}
                {!connected && <div className="chat-row muted"><i>Disconnected.</i></div>}
              </div>

              <div className="row" style={{display:"flex",gap:8}}>
                <textarea id="chat-text" placeholder="Type a message (Enter = send, Shift+Enter = newline)" rows="2" style={{flex:1}}
                  value={text}
                  onChange={e=>setText(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); if(text.trim()) { sendChat(text.trim()); setText(""); } } }}
                />
                <button id="chat-send" onClick={()=>{ if(text.trim()) { sendChat(text.trim()); setText(""); } }}>Send</button>
              </div>
              <div className="row" style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="file" id="chat-file" onChange={e=>{ const f=e.target.files?.[0]; if(f) sendFile(f); e.target.value=""; }} />
                <button id="file-send" onClick={()=>{ /* handled by input change */ }}>Send file</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Games() {
  const [screen, setScreen] = React.useState("menu"); // 'menu' | 'rps'
  return (
    <div className="page">
      <h2>Games</h2>
      {screen === "menu" && (
        <div className="card">
          <h3>Pick a game</h3>
          <div className="grid" style={{gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:16}}>
            <button className="card tile" onClick={()=>setScreen("rps")}>
              <div className="emoji">🪨 📄 ✂️</div>
              <div style={{fontWeight:600}}>Rock • Paper • Scissors (Simulation)</div>
              <div className="muted">Bouncing agents convert each other on contact.</div>
            </button>
          </div>
        </div>
      )}

      {screen === "rps" && <RpsSim onBack={()=>setScreen("menu")} />}
    </div>
  );
}

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

function About(){

  return (
    <div className="page">
      <h2>About</h2>
      <div className="card">
        <p><b>Meurs</b> is a personal media & communication hub. Play your local music/videos, and use <b>Comuni</b> to chat and share files directly via your server — no storage, just relay.</p>
        <ul>
          <li>Home: Music, Videos, and future Shorts (online)</li>
          <li>Dashboard: Comuni rooms</li>
          <li>Games: mini-games</li>
          <li>Profile (top right): your username + UI customization</li>
        </ul>
      </div>
    </div>
  );
}

/* ---------------- Root App ---------------- */
function App(){
  useGlobalRipple();
  const themeApi = useTheme();
  const toast = useToast();
  const [currentUser, setCurrentUser] = React.useState(null);
  const [route, setRoute] = React.useState("home");
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [sideOpen, setSideOpen] = React.useState(false);

  React.useEffect(()=> {
    const u = localStorage.getItem("meurs_user");
    if (u) setCurrentUser(u);
  }, []);

  // Close side menu when route changes
  React.useEffect(()=>{ setSideOpen(false); }, [route]);

  const onLoginSuccess = (u) => {
    setCurrentUser(u);
    localStorage.setItem("meurs_user", u);
  };
  const logout = () => {
    localStorage.removeItem("meurs_user");
    setCurrentUser(null);
    setDrawerOpen(false);
    setSideOpen(false);
    toast.push("Logged out", "ok");
  };

  return (
    <>
      <Nav
        route={route}
        setRoute={setRoute}
        user={currentUser}
        onOpenProfile={()=>setDrawerOpen(v=>!v)}
        onOpenSide={()=>setSideOpen(true)}
        themeApi={themeApi}
      />
      <SideNav open={sideOpen} onClose={()=>setSideOpen(false)} route={route} setRoute={setRoute} />
      <div className="container">
        {!currentUser ? (
          <Auth onLoginSuccess={onLoginSuccess} />
        ) : (
          <>
            {route==="home" && <Home currentUser={currentUser} />}
            {route==="dashboard" && <Dashboard currentUser={currentUser} />}
            {route==="games" && <Games />}
            {route==="about" && <About />}
          </>
        )}
      </div>
      <ProfileDrawer open={drawerOpen} onClose={()=>setDrawerOpen(false)} user={currentUser} logout={logout} themeApi={themeApi} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ToastProvider>
    <App />
  </ToastProvider>
);
