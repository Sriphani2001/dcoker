/* globals React, ReactDOM */
const API = "/api";
const STATIC_BASE = "/static";

// ---------- utilities ----------
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

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

// ---------- WebSocket hook for Comuni ----------
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

// ---------- Components ----------
function Nav({ route, setRoute, user, onOpenProfile }) {
  return (
    <div className="nav">
      <div className="nav-inner container">
        <div className="brand">MEURS</div>
        <div className="tabs">
          {["home","dashboard","games","about"].map(r => (
            <button key={r}
              className={`tab ${route===r?"active":""}`}
              data-route={r}
              onClick={() => setRoute(r)}>
              <span className="icon">{r==="home"?"🏠":r==="dashboard"?"📊":r==="games"?"🎮":"ℹ️"}</span>
              {r[0].toUpperCase()+r.slice(1)}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button id="profileBtn" className="pill" onClick={onOpenProfile}>
          <span className="icon">👤</span><span id="profileName">{user||"Guest"}</span>
        </button>
      </div>
    </div>
  );
}

function ProfileDrawer({ open, onClose, user, logout, themeApi }) {
  const { theme, setTheme, accent, setAccent, density, setDensity } = themeApi;
  return (
    <div id="profileDrawer" className={`drawer ${open?"":"hidden"}`}>
      <h3 style={{margin:"6px 0"}}>Profile</h3>
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
        <button id="closeDrawer" onClick={onClose}>Close</button>
      </div>
      <div className="muted" style={{fontSize:".9em"}}>Tip: Your choices are saved to this browser (localStorage).</div>
    </div>
  );
}

function Auth({ onLoginSuccess }) {
  const [mode, setMode] = React.useState("login");
  const [u, setU] = React.useState("");
  const [p, setP] = React.useState("");
  const [msg, setMsg] = React.useState("");

  const notify = (t, ok=false) => { setMsg(t); };

  const signup = async () => {
    if(!u||!p) return notify("Enter username & password");
    const r = await fetch(`${API}/signup`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,password:p})});
    const d = await r.json(); if(!r.ok) return notify(d.detail||"Sign up failed");
    notify("Account created. You can log in now."); setMode("login");
  };

  const login = async () => {
    if(!u||!p) return notify("Enter username & password");
    const r = await fetch(`${API}/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u,password:p})});
    const d = await r.json(); if(!r.ok) return notify(d.detail||"Login failed");
    onLoginSuccess(u);
  };

  return (
    <div className="center">
      <div className="card" style={{width:"min(560px, 92vw)"}}>
        <h2>Welcome to Meurs</h2>
        <div className="row">
          <div className="tabs">
            <button id="tab-login" className={`tab ${mode==="login"?"active":""}`} onClick={()=>setMode("login")}>Login</button>
            <button id="tab-signup" className={`tab ${mode==="signup"?"active":""}`} onClick={()=>setMode("signup")}>Sign up</button>
          </div>
        </div>

        {mode==="login" ? (
          <div id="login-form">
            <div className="row"><input placeholder="Username" autoComplete="username" value={u} onChange={e=>setU(e.target.value)} /></div>
            <div className="row"><input type="password" placeholder="Password" autoComplete="current-password" value={p} onChange={e=>setP(e.target.value)} /></div>
            <button id="login-btn" onClick={login}>Login</button>
          </div>
        ) : (
          <div id="signup-form">
            <div className="row"><input placeholder="Username" autoComplete="username" value={u} onChange={e=>setU(e.target.value)} /></div>
            <div className="row"><input type="password" placeholder="Password" autoComplete="new-password" value={p} onChange={e=>setP(e.target.value)} /></div>
            <button id="signup-btn" onClick={signup}>Create account</button>
          </div>
        )}
        <div id="auth-msg" className="row muted">{msg}</div>
      </div>
    </div>
  );
}

// ---------- Pages ----------
function Home() {
  const [pane, setPane] = React.useState("local");
  const [music, setMusic] = React.useState(null);
  const [videos, setVideos] = React.useState(null);
  const [q, setQ] = React.useState("");
  const [provider, setProvider] = React.useState("audius");
  const [results, setResults] = React.useState(null);
  const [loadingOnline, setLoadingOnline] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const r1 = await fetch(`${API}/music`); setMusic(await r1.json());
      const r2 = await fetch(`${API}/videos`); setVideos(await r2.json());
    })();
  }, []);

  const searchOnline = async () => {
    setLoadingOnline(true); setResults(null);
    try {
      const url = provider==="audius"
        ? `${API}/external/music/audius?q=${encodeURIComponent(q||"lofi")}`
        : `${API}/external/videos/pixabay?q=${encodeURIComponent(q||"nature")}`;
      const r = await fetch(url);
      const d = await r.json();
      setResults(d.items || []);
    } catch {
      setResults([]);
    } finally {
      setLoadingOnline(false);
    }
  };

  return (
    <>
      <h2>Home</h2>
      <div className="card">
        <div className="tabs" style={{marginBottom:8}}>
          <button className={`tab ${pane==="local"?"active":""}`} onClick={()=>setPane("local")}>Local</button>
          <button className={`tab ${pane==="online"?"active":""}`} onClick={()=>setPane("online")}>Online</button>
        </div>

        {pane==="local" && (
          <div id="pane-local">
            <div className="grid grid-2">
              <div>
                <h3>Music</h3>
                <div id="home-music">
                  {!music ? "Loading…" :
                    !Array.isArray(music.music) || music.music.length===0 ? "No music found" :
                    music.music.map(file => (
                      <div className="row" key={file}>
                        <div className="muted">{file}</div>
                        <audio controls src={`${STATIC_BASE}/music/${encodeURIComponent(file)}`} />
                      </div>
                    ))
                  }
                </div>
              </div>
              <div>
                <h3>Videos</h3>
                <div id="home-videos">
                  {!videos ? "Loading…" :
                    !Array.isArray(videos.videos) || videos.videos.length===0 ? "No videos found" :
                    videos.videos.map(file => (
                      <div className="row" key={file}>
                        <div className="muted">{file}</div>
                        <video controls src={`${STATIC_BASE}/videos/${encodeURIComponent(file)}`} />
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        )}

        {pane==="online" && (
          <div id="pane-online">
            <div className="row" style={{display:"flex", gap:8, alignItems:"center"}}>
              <input id="search-q" placeholder="Search online… (e.g., 'lofi', 'nature')" style={{flex:1}}
                value={q} onChange={e=>setQ(e.target.value)} />
              <select id="provider" value={provider} onChange={e=>setProvider(e.target.value)}>
                <option value="audius">Audius (music)</option>
                <option value="pixabay">Pixabay (videos)</option>
              </select>
              <button id="search-btn" onClick={searchOnline}>Search</button>
            </div>
            <div id="online-results" className="row">
              {loadingOnline ? "Searching…" :
                !results ? null :
                results.length === 0 ? "No results." :
                results.map((it, idx) => (
                  <div className="row" key={idx}>
                    <div className="media-item">
                      {it.thumb ? <img className="thumb" src={it.thumb} alt="" /> : null}
                      <div className="label">
                        <div className="title" dangerouslySetInnerHTML={{__html: `${escapeHtml(it.title||"Untitled")}${it.artist?` — <span class="meta">${escapeHtml(it.artist)}</span>`:""}`}} />
                        <div className="meta">{it.source}{it.license ? ` • ${it.license}` : ""}</div>
                      </div>
                    </div>
                    {provider==="audius"
                      ? <audio controls src={it.stream_url} />
                      : <video controls src={it.stream_url} />}
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>
      <div className="row muted">Tip: toggle Local/Online above. Online results stream via providers through your server.</div>
    </>
  );
}

function Dashboard({ currentUser }) {
  const [roomId, setRoomId] = React.useState(null);
  const [joinId, setJoinId] = React.useState("");
  const [isOwner, setIsOwner] = React.useState(false);
  const { messages, connected, sendChat, sendFile } = useComuni(roomId, currentUser);

  const createRoom = async () => {
    const r = await fetch(`${API}/comuni/rooms`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:currentUser})});
    const d = await r.json(); if(!r.ok) return alert(d.detail||"Failed to create room");
    setRoomId(d.room_id); setIsOwner(true);
  };
  const joinRoom = async () => {
    if(!joinId) return alert("Enter room id");
    const r = await fetch(`${API}/comuni/rooms/${encodeURIComponent(joinId)}/join`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:currentUser})});
    const d = await r.json(); if(!r.ok) return alert(d.detail||"Failed to join");
    setRoomId(joinId); setIsOwner(!!d.is_owner);
  };
  const closeRoom = async () => {
    if(!roomId) return;
    const r = await fetch(`${API}/comuni/rooms/${encodeURIComponent(roomId)}`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:currentUser})});
    if(!r.ok){ const d = await r.json().catch(()=>({})); alert(d.detail||"Failed to close room"); return; }
    setRoomId(null); setIsOwner(false);
  };

  const [text, setText] = React.useState("");

  return (
    <>
      <h2>Dashboard</h2>
      <div className="card">
        <h3>Comuni</h3>
        <div className="row" style={{display:"flex", gap:8, flexWrap:"wrap", alignItems:"center"}}>
          <button id="btn-create" onClick={createRoom}>Create room</button>
          <input id="join-id" placeholder="Enter room id (7 chars)" style={{width:240}} value={joinId} onChange={e=>setJoinId(e.target.value)} />
          <button id="btn-join" onClick={joinRoom}>Join room</button>
          {roomId && <button id="btn-copy" title="Copy room id" onClick={async ()=>{ await navigator.clipboard.writeText(roomId); }}>{`Copy room id`}</button>}
        </div>

        {roomId && (
          <>
            <div id="room-bar" className="row">
              <span>Room: <b id="room-id-label">{roomId}</b></span>
              <button id="btn-exit" style={{marginLeft:12}} onClick={()=>{ setRoomId(null); setIsOwner(false); }}>Exit</button>
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
    </>
  );
}

function Games(){
  return (
    <>
      <h2>Games</h2>
      <div className="card">
        <p>This is a placeholder for mini-games (e.g., Tic-Tac-Toe, 2048, Snake). You can decide in <b>Profile → Customize UI</b> whether “Games” lives here as its own tab, or appears inside <b>Home</b> or <b>Dashboard</b>. For now it’s a separate tab.</p>
        <p className="muted">Want me to drop in a quick Tic-Tac-Toe component next?</p>
      </div>
    </>
  );
}

function About(){
  return (
    <>
      <h2>About</h2>
      <div className="card">
        <p><b>Meurs</b> is a personal media & communication hub. Play your local music/videos, and use <b>Comuni</b> to chat and share files directly via your server — no storage, just relay.</p>
        <ul>
          <li>Home: Music & Videos (Local + Online)</li>
          <li>Dashboard: Comuni rooms</li>
          <li>Games: placeholder for your mini-games</li>
          <li>Profile (top right): your username + UI customization</li>
        </ul>
      </div>
    </>
  );
}

// ---------- Root App ----------
function App(){
  const themeApi = useTheme();
  const [currentUser, setCurrentUser] = React.useState(null);
  const [route, setRoute] = React.useState("home");
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // restore user (demo)
  React.useEffect(()=> {
    const u = localStorage.getItem("meurs_user");
    if (u) setCurrentUser(u);
  }, []);

  const onLoginSuccess = (u) => {
    setCurrentUser(u);
    localStorage.setItem("meurs_user", u);
  };
  const logout = () => {
    localStorage.removeItem("meurs_user");
    setCurrentUser(null);
    setDrawerOpen(false);
  };

  return (
    <>
      <Nav route={route} setRoute={setRoute} user={currentUser} onOpenProfile={()=>setDrawerOpen(v=>!v)} />
      <div className="container">
        {!currentUser ? (
          <Auth onLoginSuccess={onLoginSuccess} />
        ) : (
          <>
            {route==="home" && <Home />}
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

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
