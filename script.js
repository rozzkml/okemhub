// okemhub — free client-side web tools.
// To add a tool: push an entry below.
//   url points to a page under tools/ (e.g. "tools/x.html")
const tools = [
  {
    name: "PDF Editor",
    tag: "PDF",
    desc: "Edit PDF files — add text, images, shapes, signatures, and more.",
    url: "tools/pdf-editor.html",
  },
];

(function renderTools() {
  const grid = document.getElementById("tool-grid");
  if (!grid) return;
  grid.innerHTML = tools
    .map(
      (t) => `
      <a class="card" href="${t.url}">
        <span class="tag">${t.tag}</span>
        <h3>${t.name}</h3>
        <p>${t.desc}</p>
        <span class="more">Open ↗</span>
      </a>`
    )
    .join("");
})();
