const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = "C:\\Users\\OKEMGGWP\\okem";

class El {
  constructor(id, act) {
    this.id = id; this.act = act; this.value = ""; this.textContent = "";
    this.dataset = act ? { act } : {}; this._h = {}; this.checked = true; this.style = {};
  }
  addEventListener(ev, cb) { this._h[ev] = cb; }
  querySelectorAll() { return []; }
  fire(ev) { if (this._h[ev]) this._h[ev](); }
}

const tests = {
  "text-utils": {
    file: "tools/text-utils.html",
    run: (els, actBtns) => {
      els["in"].value = "hello world\nfoo BAR";
      els["in"].fire("input");
      return `words=${els["s-words"].textContent} chars=${els["s-chars"].textContent} lines=${els["s-lines"].textContent}`;
    }
  },
  "json-formatter": {
    file: "tools/json-formatter.html",
    run: (els, actBtns) => {
      els["in"].value = '{"a":1,"b":[2,3]}';
      actBtns["format"].fire("click");
      return els["out"].textContent;
    }
  },
  "base64": {
    file: "tools/base64.html",
    run: (els, actBtns) => {
      els["in"].value = "héllo";
      actBtns["enc"].fire("click");
      return els["out"].textContent;
    }
  },
  "url": {
    file: "tools/url.html",
    run: (els, actBtns) => {
      els["in"].value = "a b&c=d";
      actBtns["enc"].fire("click");
      return els["out"].textContent;
    }
  },
  "color": {
    file: "tools/color.html",
    run: (els, actBtns) => {
      els["hex"].value = "#5b8cff";
      actBtns["h2r"].fire("click");
      const r1 = els["out"].textContent;
      els["rgb"].value = "255, 140, 91";
      actBtns["r2h"].fire("click");
      const r2 = els["out"].textContent;
      return `h2r=${r1} | r2h=${r2}`;
    }
  },
  "uuid": {
    file: "tools/uuid.html",
    run: (els, actBtns) => {
      els["count"].value = "3";
      els["gen"].fire("click");
      return els["out"].textContent;
    }
  },
  "password": {
    file: "tools/password.html",
    run: (els, actBtns) => {
      els["len"].value = "20";
      els["gen"].fire("click");
      return els["out"].textContent;
    }
  },
};

function runTool(name, t) {
  const p = path.join(root, t.file);
  const html = fs.readFileSync(p, "utf-8");
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const code = scripts.sort((a, b) => b.length - a.length)[0];
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  const acts = [...new Set([...html.matchAll(/data-act="([^"]+)"/g)].map(m => m[1]))];

  const els = {};
  for (const i of ids) els[i] = new El(i);
  const actBtns = {};
  for (const a of acts) actBtns[a] = new El(null, a);

  const document = {
    getElementById: (i) => els[i] || (els[i] = new El(i)),
    querySelectorAll: (sel) => sel.includes("data-act") ? Object.values(actBtns) : [],
    querySelector: (sel) => {
      const m = sel.match(/data-act=([\w-]+)/);
      if (m) return actBtns[m[1]] || new El(null, m[1]);
      return new El();
    },
  };
  const sandbox = {
    document,
    navigator: { clipboard: { writeText: () => {} } },
    crypto,
    btoa: (s) => Buffer.from(s, "utf-8").toString("base64"),
    atob: (s) => Buffer.from(s, "base64").toString("utf-8"),
    TextEncoder, TextDecoder, console, setTimeout: () => {},
  };
  const vm = require("vm");
  try {
    vm.createContext(sandbox);
    vm.runInContext(code, sandbox);
  } catch (e) {
    return "RUN ERROR: " + e.message;
  }
  try {
    return t.run(els, actBtns);
  } catch (e) {
    return "TEST ERROR: " + e.message;
  }
}

let allOk = true;
for (const [name, t] of Object.entries(tests)) {
  const out = runTool(name, t);
  const ok = !out.startsWith("ERROR");
  if (!ok) allOk = false;
  console.log(`[${name}] ${ok ? "OK" : "FAIL"} -> ${out}`);
}
console.log("\n=== FUNCTIONAL", allOk ? "PASS" : "FAIL", "===");
