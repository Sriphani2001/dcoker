import React from "react";
import { Link } from "react-router-dom";

export default function Dashboard() {
  return (
    <div>
      <h2>Dashboard</h2>
      <Link to="/music">Music</Link>
      <br />
      <Link to="/videos">Videos</Link>
    </div>
  );
}
