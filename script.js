// okemhub — free client-side web tools.
// To add a tool: push an entry below.
//   url points to a page under tools/ (e.g. "tools/x.html")
const tools = [
  {
    name: "Text Utils",
    tag: "Text",
    desc: "Change text case and count words, characters, and lines.",
    url: "tools/text-utils.html",
  },
  {
    name: "JSON Formatter",
    tag: "Dev",
    desc: "Pretty-print, minify, and validate JSON.",
    url: "tools/json-formatter.html",
  },
  {
    name: "Base64",
    tag: "Encode",
    desc: "Encode and decode text to/from Base64 (UTF-8 safe).",
    url: "tools/base64.html",
  },
  {
    name: "UUID Generator",
    tag: "Dev",
    desc: "Generate random UUID v4 identifiers locally.",
    url: "tools/uuid.html",
  },
  {
    name: "Password Generator",
    tag: "Security",
    desc: "Create strong random passwords with the Web Crypto API.",
    url: "tools/password.html",
  },
  {
    name: "URL Encode / Decode",
    tag: "Encode",
    desc: "Encode and decode URL components.",
    url: "tools/url.html",
  },
  {
    name: "Color Converter",
    tag: "Design",
    desc: "Convert colors between HEX and RGB.",
    url: "tools/color.html",
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
