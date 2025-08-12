import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import MusicPage from "./pages/MusicPage";
import VideosPage from "./pages/VideosPage";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/music" element={<MusicPage />} />
        <Route path="/videos" element={<VideosPage />} />
      </Routes>
    </Router>
  );
}

export default App;
