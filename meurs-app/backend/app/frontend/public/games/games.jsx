// games/games.jsx
const React = window.React; // bind global for Babel+modules

import RpsSim from "RpsSim.jsx";
console.log("[app] games.jsx loaded");


export default function Games() {
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
