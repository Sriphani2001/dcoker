(function () {
  // Build a fixed, full-screen background (no waves)
  const root = document.createElement("div");
  root.className = "site-bg";
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "0",
    pointerEvents: "none",
    overflow: "hidden",
    background: "linear-gradient(180deg, rgba(212, 226, 249, 0.9) 0%, rgba(89, 73, 152, 1) 60%)"
  });

  // Top soft highlight
  const topGlow = document.createElement("div");
  Object.assign(topGlow.style, {
    position: "absolute",
    left: 0, right: 0, top: 0, height: "220px",
    background: "radial-gradient(100% 60% at 50% 0%, rgba(255,255,255,.25) 0%, rgba(255,255,255,0) 60%)",
    filter: "blur(6px)"
  });
  root.appendChild(topGlow);

  // If you want, you can add more decorative layers here
  // e.g., subtle particle canvas, glows, etc.
  // No waves are included anymore.

  // Append background once DOM is ready
  if (document.body) {
    document.body.prepend(root);
  } else {
    document.addEventListener("DOMContentLoaded", () => document.body.prepend(root));
  }
})();
