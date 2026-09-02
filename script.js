// Theme toggle (persists in localStorage)
(function () {
  const root = document.documentElement;
  const stored = localStorage.getItem("theme");
  if (stored) {
    root.setAttribute("data-theme", stored);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
    root.setAttribute("data-theme", "light");
  }

  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const current = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", current);
      localStorage.setItem("theme", current);
    });
  }

  // Footer year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();

// okemhub tools — every tool lives INSIDE the okemhub repo (base repo + Vercel).
// To add a tool: push an entry below.
//   status: "live" -> clickable (internal path like "tools/x.html" or external URL)
//   status: "soon" -> shows a "Soon" badge, not clickable
const projects = [
  {
    name: "PDF Editor",
    tag: "Tool",
    desc: "Edit, merge, and annotate PDFs entirely in the browser. No uploads.",
    url: "tools/pdf-editor.html",
    status: "soon",
  },
  {
    name: "Converter",
    tag: "Tool",
    desc: "Convert video, audio, and images client-side with FFmpeg.wasm.",
    url: "tools/converter.html",
    status: "soon",
  },
];

(function renderProjects() {
  const grid = document.getElementById("project-grid");
  if (!grid) return;
  const html = projects
    .map((p) => {
      const isSoon = p.status === "soon";
      const badges = isSoon
        ? `<span class="tag">${p.tag}</span><span class="status">Soon</span>`
        : `<span class="tag">${p.tag}</span>`;
      const external = p.url.startsWith("http");
      const link = isSoon
        ? `<span class="more muted">Coming soon</span>`
        : `<a class="more" href="${p.url}"${external ? ' target="_blank" rel="noopener"' : ""}>Open ↗</a>`;
      return `
      <article class="card">
        ${badges}
        <h3>${p.name}</h3>
        <p>${p.desc}</p>
        ${link}
      </article>`;
    })
    .join("");
  grid.innerHTML = html;
})();
