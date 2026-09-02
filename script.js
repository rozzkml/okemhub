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

// Project cards — sourced from the rozzkml GitHub org
const projects = [
  {
    name: "okem",
    tag: "Free functions",
    desc: "A collection of small, free, single-purpose tools that run without accounts or installs.",
    url: "https://github.com/rozzkml/okem",
  },
  {
    name: "converter",
    tag: "Browser tool",
    desc: "Convert video, audio, and images entirely in your browser using FFmpeg.wasm. No uploads.",
    url: "https://github.com/rozzkml/converter",
  },
  {
    name: "gobalancer",
    tag: "AI gateway",
    desc: "A FastAPI AI gateway with provider routing, health checks, and edge retry logic.",
    url: "https://github.com/rozzkml/gobalancer",
  },
  {
    name: "proxygenerator",
    tag: "Tooling",
    desc: "Generate and manage proxy configs from a simple CLI and API surface.",
    url: "https://github.com/rozzkml/proxygenerator",
  },
  {
    name: "herm",
    tag: "Open source",
    desc: "Misc utilities and experiments from the rozzkml workspace.",
    url: "https://github.com/rozzkml/herm",
  },
];

(function renderProjects() {
  const grid = document.getElementById("project-grid");
  if (!grid) return;
  const html = projects
    .map(
      (p) => `
      <article class="card">
        <span class="tag">${p.tag}</span>
        <h3>${p.name}</h3>
        <p>${p.desc}</p>
        <a class="more" href="${p.url}" target="_blank" rel="noopener">View on GitHub ↗</a>
      </article>`
    )
    .join("");
  grid.innerHTML = html;
})();
