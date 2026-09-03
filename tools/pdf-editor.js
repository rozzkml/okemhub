// okemhub PDF Editor — client-side PDF editing
// Libraries: PDF.js (render) + pdf-lib (modify/save) + fontkit (font embedding)
// All assets are vendored locally (no CDN, no uploads).
// pdf.js is loaded as an ES module; window.pdfjsLib is assigned by the module script
// BEFORE DOMContentLoaded, so we set the worker source inside init() (not at top level).

/* global pdfjsLib, PDFLib, fontkit */

// Font files keyed by family → style. The vendor bundle ships Serif/Mono only
// as Regular+Bold, so their italic variants fall back to the upright/bold file.
const LIB_FONTS = {
  sans: {
    regular: "../vendor/fonts/LiberationSans-Regular.ttf",
    bold: "../vendor/fonts/LiberationSans-Bold.ttf",
    italic: "../vendor/fonts/LiberationSans-Italic.ttf",
    boldItalic: "../vendor/fonts/LiberationSans-BoldItalic.ttf",
  },
  serif: {
    regular: "../vendor/fonts/LiberationSerif-Regular.ttf",
    bold: "../vendor/fonts/LiberationSerif-Bold.ttf",
    italic: "../vendor/fonts/LiberationSerif-Regular.ttf",
    boldItalic: "../vendor/fonts/LiberationSerif-Bold.ttf",
  },
  mono: {
    regular: "../vendor/fonts/LiberationMono-Regular.ttf",
    bold: "../vendor/fonts/LiberationMono-Bold.ttf",
    italic: "../vendor/fonts/LiberationMono-Regular.ttf",
    boldItalic: "../vendor/fonts/LiberationMono-Bold.ttf",
  },
  roboto: {
    regular: "../vendor/fonts/Roboto-Regular.ttf",
    bold: "../vendor/fonts/Roboto-Bold.ttf",
    italic: "../vendor/fonts/Roboto-Italic.ttf",
    boldItalic: "../vendor/fonts/Roboto-BoldItalic.ttf",
  },
  opensans: {
    regular: "../vendor/fonts/OpenSans-Regular.ttf",
    bold: "../vendor/fonts/OpenSans-Bold.ttf",
    italic: "../vendor/fonts/OpenSans-Italic.ttf",
    boldItalic: "../vendor/fonts/OpenSans-BoldItalic.ttf",
  },
  montserrat: {
    regular: "../vendor/fonts/Montserrat-Regular.ttf",
    bold: "../vendor/fonts/Montserrat-Bold.ttf",
    italic: "../vendor/fonts/Montserrat-Italic.ttf",
    boldItalic: "../vendor/fonts/Montserrat-BoldItalic.ttf",
  },
  lora: {
    regular: "../vendor/fonts/Lora-Regular.ttf",
    bold: "../vendor/fonts/Lora-Bold.ttf",
    italic: "../vendor/fonts/Lora-Italic.ttf",
    boldItalic: "../vendor/fonts/Lora-BoldItalic.ttf",
  },
  merriweather: {
    regular: "../vendor/fonts/Merriweather-Regular.ttf",
    bold: "../vendor/fonts/Merriweather-Bold.ttf",
    italic: "../vendor/fonts/Merriweather-Italic.ttf",
    boldItalic: "../vendor/fonts/Merriweather-BoldItalic.ttf",
  },
  playfair: {
    regular: "../vendor/fonts/PlayfairDisplay-Regular.ttf",
    bold: "../vendor/fonts/PlayfairDisplay-Bold.ttf",
    italic: "../vendor/fonts/PlayfairDisplay-Italic.ttf",
    boldItalic: "../vendor/fonts/PlayfairDisplay-BoldItalic.ttf",
  },
  firacode: {
    regular: "../vendor/fonts/FiraCode-Regular.ttf",
    bold: "../vendor/fonts/FiraCode-Bold.ttf",
    italic: "../vendor/fonts/FiraCode-Regular.ttf",
    boldItalic: "../vendor/fonts/FiraCode-Bold.ttf",
  },
  ebgaramond: {
    regular: "../vendor/fonts/EBGaramond-Regular.ttf",
    bold: "../vendor/fonts/EBGaramond-Bold.ttf",
    italic: "../vendor/fonts/EBGaramond-Italic.ttf",
    boldItalic: "../vendor/fonts/EBGaramond-BoldItalic.ttf",
  },
  crimsontext: {
    regular: "../vendor/fonts/CrimsonText-Regular.ttf",
    bold: "../vendor/fonts/CrimsonText-Bold.ttf",
    italic: "../vendor/fonts/CrimsonText-Italic.ttf",
    boldItalic: "../vendor/fonts/CrimsonText-BoldItalic.ttf",
  },
  ptserif: {
    regular: "../vendor/fonts/PTSerif-Regular.ttf",
    bold: "../vendor/fonts/PTSerif-Bold.ttf",
    italic: "../vendor/fonts/PTSerif-Italic.ttf",
    boldItalic: "../vendor/fonts/PTSerif-BoldItalic.ttf",
  },
  notoserif: {
    regular: "../vendor/fonts/NotoSerif-Regular.ttf",
    bold: "../vendor/fonts/NotoSerif-Bold.ttf",
    italic: "../vendor/fonts/NotoSerif-Italic.ttf",
    boldItalic: "../vendor/fonts/NotoSerif-BoldItalic.ttf",
  },
  librebaskerville: {
    regular: "../vendor/fonts/LibreBaskerville-Regular.ttf",
    bold: "../vendor/fonts/LibreBaskerville-Bold.ttf",
    italic: "../vendor/fonts/LibreBaskerville-Italic.ttf",
    boldItalic: "../vendor/fonts/LibreBaskerville-Regular.ttf",
  },
  ptsans: {
    regular: "../vendor/fonts/PTSans-Regular.ttf",
    bold: "../vendor/fonts/PTSans-Bold.ttf",
    italic: "../vendor/fonts/PTSans-Italic.ttf",
    boldItalic: "../vendor/fonts/PTSans-BoldItalic.ttf",
  },
  sourceserif: {
    regular: "../vendor/fonts/SourceSerif-Regular.ttf",
    bold: "../vendor/fonts/SourceSerif-Bold.ttf",
    italic: "../vendor/fonts/SourceSerif-Italic.ttf",
    boldItalic: "../vendor/fonts/SourceSerif-BoldItalic.ttf",
  },
};

// ─── fontkit API bridge ─────────────────────────────────────────────────────
// The @cantoo/pdf-lib fork prefers `subset.encode()` returning font bytes, but
// @pdf-lib/fontkit@1.1.1 ships `encode(stream)` (writes into a restructure
// EncodeStream) — calling it with no argument throws "reading 'pos'".
// We wrap the fontkit instance so `encode()` collects `encodeStream()` into a
// Uint8Array, keeping every other fontkit property/method untouched.
function collectEncodeStream(subset) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    try {
      const stream = subset.encodeStream();
      stream.on("data", (chunk) => chunks.push(chunk));
      stream.on("end", () => {
        let total = 0;
        for (const c of chunks) total += c.length;
        const out = new Uint8Array(total);
        let offset = 0;
        for (const c of chunks) {
          out.set(c instanceof Uint8Array ? c : new Uint8Array(c), offset);
          offset += c.length;
        }
        resolve(out);
      });
      if (typeof stream.on === "function") stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

function forwardingProxy(target, overrides) {
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in overrides) return overrides[prop];
      const value = Reflect.get(obj, prop, obj);
      return typeof value === "function" ? value.bind(obj) : value;
    },
  });
}

function wrapFontkit(fk) {
  const wrapSubset = (subset) =>
    forwardingProxy(subset, { encode: () => collectEncodeStream(subset) });
  const wrapFont = (font) =>
    forwardingProxy(font, { createSubset: () => wrapSubset(font.createSubset()) });
  return forwardingProxy(fk, {
    create: (data, postscriptName) => wrapFont(fk.create(data, postscriptName)),
  });
}

class OkemPDFEditor {
  constructor() {
    this.pdfDoc = null;        // pdf.js document
    this.pdfBytes = null;      // original file bytes
    this.pdfLibDoc = null;     // pdf-lib document (built at export)
    this.pageInfos = [];       // per-page geometry + cached viewport
    this.totalPages = 0;
    this.currentPage = 1;
    this.zoom = 1.5;
    this.tool = "text";
    this.annotations = {};
    this.selectedAnnotation = null;
    this.undoStack = [];
    this.redoStack = [];
    this.isDrawing = false;
    this.drawStart = null;
    this.currentPath = [];
    this.signDataUrl = null;
    this.linkPosition = null;
    this.notePosition = null;
    this.imagePosition = null;
    this.signPosition = null;
    this.textInputActive = false;
    this.fontCache = {};       // embedded pdf-lib fonts
    this.els = {};
    this.pointers = new Map(); // active pointers for pinch
    this.pinchStart = null;
    this.init();
  }

  init() {
    // pdf.js is ESM; window.pdfjsLib is ready by DOMContentLoaded
    if (!window.pdfjsLib) {
      console.error("pdf.js failed to load — check vendor/pdfjs path");
    } else {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "../vendor/pdfjs/pdf.worker.min.mjs";
    }
    this.cacheDom();
    this.bindEvents();
  }

  cacheDom() {
    const ids = [
      "upload-screen", "editor-screen", "drop-zone", "file-input",
      "toolbar", "tool-options", "canvas-area", "canvas-wrapper",
      "pdf-canvas", "overlay-canvas", "annotation-layer",
      "sidebar", "page-list", "page-info",
      "btn-undo", "btn-redo", "btn-zoom-in", "btn-zoom-out", "btn-zoom-fit",
      "zoom-level", "btn-prev", "btn-next", "page-nav",
      "btn-download", "btn-new-file", "pdf-password",
      "sign-modal", "sign-close", "sign-canvas", "sign-clear",
      "sign-text", "sign-preview", "sign-file", "sign-upload-preview",
      "sign-cancel", "sign-apply",
      "link-modal", "link-close", "link-url", "link-cancel", "link-apply",
      "note-modal", "note-close", "note-text", "note-cancel", "note-apply",
      "image-input", "toast",
    ];
    ids.forEach((id) => (this.els[id] = document.getElementById(id)));
  }

  bindEvents() {
    const { els } = this;

    els["file-input"].addEventListener("change", (e) => this.handleFile(e.target.files[0]));
    els["drop-zone"].addEventListener("dragover", (e) => {
      e.preventDefault();
      els["drop-zone"].classList.add("dragover");
    });
    els["drop-zone"].addEventListener("dragleave", () => {
      els["drop-zone"].classList.remove("dragover");
    });
    els["drop-zone"].addEventListener("drop", (e) => {
      e.preventDefault();
      els["drop-zone"].classList.remove("dragover");
      if (e.dataTransfer.files[0]) this.handleFile(e.dataTransfer.files[0]);
    });

    document.querySelectorAll(".ribbon-tab").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.setTool(btn.dataset.tool);
      });
    });

    // Pointer events unify mouse / touch / pen
    const overlay = els["overlay-canvas"];
    overlay.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    overlay.addEventListener("pointermove", (e) => this.onPointerMove(e));
    overlay.addEventListener("pointerup", (e) => this.onPointerUp(e));
    overlay.addEventListener("pointercancel", (e) => this.onPointerUp(e));
    overlay.addEventListener("pointerleave", (e) => this.onPointerUp(e));

    // Pinch-zoom (two pointers on the canvas area)
    els["canvas-area"].addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
    els["canvas-area"].addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: false });
    els["canvas-area"].addEventListener("touchend", (e) => this.onTouchEnd(e), { passive: false });

    els["btn-zoom-in"].addEventListener("click", () => this.setZoom(this.zoom + 0.25));
    els["btn-zoom-out"].addEventListener("click", () => this.setZoom(this.zoom - 0.25));
    els["btn-zoom-fit"].addEventListener("click", () => this.fitToWidth());
    els["canvas-area"].addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.setZoom(this.zoom + (e.deltaY > 0 ? -0.15 : 0.15));
      }
    }, { passive: false });

    els["btn-prev"].addEventListener("click", () => this.goToPage(this.currentPage - 1));
    els["btn-next"].addEventListener("click", () => this.goToPage(this.currentPage + 1));

    els["btn-undo"].addEventListener("click", () => this.undo());
    els["btn-redo"].addEventListener("click", () => this.redo());

    els["btn-download"].addEventListener("click", () => this.downloadPDF());
    els["btn-new-file"].addEventListener("click", () => this.resetEditor());

    els["image-input"].addEventListener("change", (e) => this.handleImageUpload(e));

    els["sign-close"].addEventListener("click", () => this.closeModal("sign-modal"));
    els["sign-cancel"].addEventListener("click", () => this.closeModal("sign-modal"));
    els["sign-apply"].addEventListener("click", () => this.applySignature());
    els["sign-clear"].addEventListener("click", () => this.clearSignCanvas());
    els["sign-text"].addEventListener("input", () => {
      els["sign-preview"].textContent = els["sign-text"].value || "";
    });
    els["sign-file"].addEventListener("change", (e) => this.handleSignUpload(e));

    document.querySelectorAll(".modal-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const modal = tab.closest(".modal");
        modal.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        modal.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      });
    });

    els["link-close"].addEventListener("click", () => this.closeModal("link-modal"));
    els["link-cancel"].addEventListener("click", () => this.closeModal("link-modal"));
    els["link-apply"].addEventListener("click", () => this.applyLink());

    els["note-close"].addEventListener("click", () => this.closeModal("note-modal"));
    els["note-cancel"].addEventListener("click", () => this.closeModal("note-modal"));
    els["note-apply"].addEventListener("click", () => this.applyNote());

    document.addEventListener("keydown", (e) => this.onKeyDown(e), true);
  }

  // ─── Toast ──────────────────────────────────────
  toast(msg, ms = 2600) {
    const t = this.els["toast"];
    if (!t) return;
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
  }

  // ─── File Handling ──────────────────────────────
  async handleFile(file) {
    if (!file) return;
    if (file.type && file.type !== "application/pdf") {
      this.toast("Please select a PDF file.");
      return;
    }
    this.toast("Loading PDF…", 9999);
    try {
      this.pdfBytes = await file.arrayBuffer();
      this.pdfDoc = await pdfjsLib.getDocument({ data: this.pdfBytes.slice(0) }).promise;
      this.totalPages = this.pdfDoc.numPages;
      this.pageInfos = [];
      this.annotations = {};
      this.undoStack = [];
      this.redoStack = [];
      this.currentPage = 1;

      for (let i = 1; i <= this.totalPages; i++) {
        const page = await this.pdfDoc.getPage(i);
        const rotation = page.rotate || 0;
        const vp = page.getViewport({ scale: 1, rotation });
        const mb = page.getMediaBox ? page.getMediaBox() : null;
        const cb = page.getCropBox ? page.getCropBox() : null;
        this.pageInfos.push({
          width: vp.width,
          height: vp.height,
          rotation,
          mediaBox: mb ? [mb.x, mb.y, mb.width, mb.height] : null,
          cropBox: cb ? [cb.x, cb.y, cb.width, cb.height] : null,
          dispW: vp.width,   // displayed (rotated) size at scale 1
          dispH: vp.height,
          viewport1: vp,     // cached for coordinate mapping
        });
      }

      this.els["upload-screen"].classList.add("hidden");
      this.els["editor-screen"].classList.remove("hidden");
      this.renderThumbnails();
      this.fitToWidth();
      this.updateUI();
      this.toast("PDF loaded.");
    } catch (err) {
      console.error(err);
      this.toast("Failed to load PDF: " + err.message);
    }
  }

  resetEditor() {
    this.pdfDoc = null;
    this.pdfBytes = null;
    this.pdfLibDoc = null;
    this.pageInfos = [];
    this.annotations = {};
    this.undoStack = [];
    this.redoStack = [];
    this.currentPage = 1;
    this.fontCache = {};
    this.els["editor-screen"].classList.add("hidden");
    this.els["upload-screen"].classList.remove("hidden");
    this.els["file-input"].value = "";
    this.els["pdf-password"].value = "";
  }

  // ─── Rendering ──────────────────────────────────
  async renderPage() {
    const info = this.pageInfos[this.currentPage - 1];
    const page = await this.pdfDoc.getPage(this.currentPage);
    const viewport = page.getViewport({ scale: this.zoom, rotation: info.rotation });

    const canvas = this.els["pdf-canvas"];
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const overlay = this.els["overlay-canvas"];
    overlay.width = viewport.width;
    overlay.height = viewport.height;

    const layer = this.els["annotation-layer"];
    layer.style.width = viewport.width + "px";
    layer.style.height = viewport.height + "px";

    this.renderAnnotations();
    this.updateUI();
  }

  async renderThumbnails() {
    const list = this.els["page-list"];
    list.innerHTML = "";
    for (let i = 1; i <= this.totalPages; i++) {
      const info = this.pageInfos[i - 1];
      const div = document.createElement("div");
      div.className = "page-thumb" + (i === this.currentPage ? " active" : "");
      div.dataset.page = i;
      const canvas = document.createElement("canvas");
      const page = await this.pdfDoc.getPage(i);
      const vp = page.getViewport({ scale: 0.2, rotation: info.rotation });
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      const num = document.createElement("span");
      num.className = "page-thumb-num";
      num.textContent = i;
      div.appendChild(canvas);
      div.appendChild(num);
      div.addEventListener("click", () => this.goToPage(i));
      list.appendChild(div);
    }
  }

  async goToPage(n) {
    if (n < 1 || n > this.totalPages) return;
    this.currentPage = n;
    await this.renderPage();
    document.querySelectorAll(".page-thumb").forEach((t) => {
      t.classList.toggle("active", parseInt(t.dataset.page) === n);
    });
  }

  setZoom(z) {
    this.zoom = Math.max(0.5, Math.min(4, z));
    this.renderPage();
    this.els["zoom-level"].textContent = Math.round(this.zoom * 100) + "%";
  }

  fitToWidth() {
    const area = this.els["canvas-area"];
    const info = this.pageInfos[this.currentPage - 1];
    if (!info) return;
    this.zoom = (area.clientWidth - 60) / info.dispW;
    this.renderPage();
    this.els["zoom-level"].textContent = Math.round(this.zoom * 100) + "%";
  }

  // ─── Coordinate mapping ─────────────────────────
  // Display (CSS, y-down, scale-1) coords -> PDF page space (y-up), for a
  // specific page. pdf.js's viewport already folds in /Rotate and a non-zero
  // MediaBox origin, so this is correct for every page geometry.
  toPageSpace(dx, dy, pageNum = this.currentPage) {
    const info = this.pageInfos[pageNum - 1];
    const vp = info.viewport1; // scale 1, with page rotation
    const [px, py] = vp.convertToPdfPoint(dx, dy);
    return { x: px, y: py };
  }

  // Places a display-space box on a page. Returns pdf-lib draw args.
  //
  // pdf-lib anchors drawRectangle/drawImage at the shape's bottom-left and
  // rotates CCW about it, so the anchor is the display box's bottom-left
  // corner mapped into page space. The rotation needed to cancel the viewer's
  // /Rotate is the page rotation itself (CCW), which holds for 0/90/180/270.
  placeBox(pageNum, dx, dy, dw, dh) {
    const p = this.toPageSpace(dx, dy + dh, pageNum);
    return {
      x: p.x,
      y: p.y,
      width: dw,
      height: dh,
      rotate: PDFLib.degrees(this.pageInfos[pageNum - 1].rotation || 0),
    };
  }

  // Axis-aligned page-space rect from two opposite display corners. Used for
  // things that must be axis-aligned in page space (PDF /Rect annotations).
  pageRect(pageNum, dx, dy, dw, dh) {
    const a = this.toPageSpace(dx, dy, pageNum);
    const b = this.toPageSpace(dx + dw, dy + dh, pageNum);
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
  }

  // ─── Tool Management ────────────────────────────
  setTool(tool) {
    this.tool = tool;
    document.querySelectorAll(".ribbon-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === tool);
    });
    this.updateToolOptions();
    this.deselectAnnotation();

    const cursors = {
      select: "default", text: "text", image: "copy", draw: "crosshair",
      highlight: "crosshair", whiteout: "crosshair", shape: "crosshair",
      sign: "crosshair", link: "crosshair", note: "crosshair",
    };
    this.els["overlay-canvas"].style.cursor = cursors[tool] || "crosshair";

    if (tool === "image") {
      // No canvas click for image (file dialog opens immediately), so default
      // the drop position to the centre of the current page.
      const info = this.pageInfos[this.currentPage - 1];
      if (info) this.imagePosition = { x: Math.round(info.dispW / 2), y: Math.round(info.dispH / 2) };
      this.els["image-input"].click();
    }
  }

  updateToolOptions() {
    const c = this.els["tool-options"];
    const t = this.tool;
    const sec = (label, html) =>
      `<div class="opt-section"><span class="opt-section-label">${label}</span>${html}</div>`;

    if (t === "text") {
      c.innerHTML = `
        ${sec("Font", `<select id="opt-font">
          <optgroup label="Sans-Serif">
            <option value="sans">Sans (default)</option>
            <option value="roboto">Roboto</option>
            <option value="opensans">Open Sans</option>
            <option value="montserrat">Montserrat</option>
            <option value="ptsans">PT Sans</option>
          </optgroup>
          <optgroup label="Serif">
            <option value="serif">Liberation Serif</option>
            <option value="lora">Lora</option>
            <option value="merriweather">Merriweather</option>
            <option value="playfair">Playfair Display</option>
            <option value="ebgaramond">EB Garamond</option>
            <option value="crimsontext">Crimson Text</option>
            <option value="ptserif">PT Serif</option>
            <option value="notoserif">Noto Serif</option>
            <option value="librebaskerville">Libre Baskerville</option>
            <option value="sourceserif">Source Serif</option>
          </optgroup>
          <optgroup label="Monospace">
            <option value="mono">Liberation Mono</option>
            <option value="firacode">Fira Code</option>
          </optgroup>
        </select>`)}
        ${sec("Size", `<input type="number" id="opt-size-num" min="1" max="200" value="16" class="opt-size-num" />
          <input type="range" id="opt-size" min="1" max="200" value="16" />`)}
        ${sec("Weight", `<input type="range" id="opt-weight" min="100" max="900" step="100" value="400" />
          <span class="opt-val" id="opt-weight-val">400</span>`)}
        ${sec("Color", `<input type="color" id="opt-color" value="#000000" />`)}
        ${sec("Style", `<label><input type="checkbox" id="opt-italic" /> <i>I</i></label>`)}
        ${sec("Spacing", `<input type="range" id="opt-spacing" min="-2" max="10" step="0.5" value="0" />
          <span class="opt-val" id="opt-spacing-val">0</span>`)}
      `;
      const sizeSlider = c.querySelector("#opt-size");
      const sizeNum = c.querySelector("#opt-size-num");
      sizeSlider.addEventListener("input", (e) => { sizeNum.value = e.target.value; });
      sizeNum.addEventListener("input", (e) => { sizeSlider.value = e.target.value; });
      c.querySelector("#opt-weight").addEventListener("input", (e) => {
        const v = e.target.value;
        c.querySelector("#opt-weight-val").textContent = v;
        const labels = {100:"Thin",200:"ExtraLight",300:"Light",400:"Regular",500:"Medium",600:"SemiBold",700:"Bold",800:"ExtraBold",900:"Black"};
        c.querySelector("#opt-weight-val").title = labels[v] || "";
      });
      c.querySelector("#opt-spacing").addEventListener("input", (e) => {
        c.querySelector("#opt-spacing-val").textContent = e.target.value;
      });
    } else if (t === "draw") {
      c.innerHTML = `
        ${sec("Color", `<input type="color" id="opt-color" value="#000000" />`)}
        ${sec("Brush", `<input type="range" id="opt-width" min="1" max="20" value="3" />
          <span class="opt-val" id="opt-width-val">3</span>`)}
      `;
      c.querySelector("#opt-width").addEventListener("input", (e) => {
        c.querySelector("#opt-width-val").textContent = e.target.value;
      });
    } else if (t === "highlight") {
      c.innerHTML = `${sec("Color", `<input type="color" id="opt-color" value="#ffeb3b" />`)}
        <span class="opt-hint">Click & drag to highlight an area</span>`;
    } else if (t === "shape") {
      c.innerHTML = `
        ${sec("Shape", `<select id="opt-shape">
          <option value="rect">Rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="line">Line</option>
          <option value="arrow">Arrow</option>
        </select>`)}
        ${sec("Color", `<input type="color" id="opt-color" value="#000000" />`)}
        ${sec("Stroke", `<input type="range" id="opt-width" min="1" max="10" value="2" />
          <span class="opt-val" id="opt-width-val">2</span>`)}
        ${sec("Fill", `<label><input type="checkbox" id="opt-fill" /> Fill</label>`)}
      `;
      c.querySelector("#opt-width").addEventListener("input", (e) => {
        c.querySelector("#opt-width-val").textContent = e.target.value;
      });
    } else if (t === "whiteout") {
      c.innerHTML = `<span class="opt-hint">Click & drag to cover an area with white</span>`;
    } else if (t === "sign") {
      c.innerHTML = `<span class="opt-hint">Click on the canvas to create a signature</span>`;
    } else if (t === "link") {
      c.innerHTML = `<span class="opt-hint">Click on the canvas to add a link</span>`;
    } else if (t === "note") {
      c.innerHTML = `<span class="opt-hint">Click on the canvas to add a sticky note</span>`;
    } else if (t === "select") {
      c.innerHTML = `<span class="opt-hint">Click annotation to select · Drag to move · Delete to remove</span>`;
    } else if (t === "image") {
      c.innerHTML = `<span class="opt-hint">Select an image file to add to the PDF</span>`;
    } else {
      c.innerHTML = "";
    }
  }

  getToolOptions() {
    const opts = {};
    const el = (id) => document.getElementById(id);
    const color = el("opt-color");
    const size = el("opt-size-num") || el("opt-size");
    const font = el("opt-font");
    const width = el("opt-width");
    const shape = el("opt-shape");
    const weight = el("opt-weight");
    const italic = el("opt-italic");
    const fill = el("opt-fill");
    const spacing = el("opt-spacing");
    if (color) opts.color = color.value;
    if (size) opts.fontSize = parseInt(size.value);
    if (font) opts.font = font.value;
    if (width) opts.lineWidth = parseInt(width.value);
    if (shape) opts.shapeType = shape.value;
    if (weight) opts.fontWeight = parseInt(weight.value);
    if (italic) opts.italic = italic.checked;
    if (fill) opts.fill = fill.checked;
    if (spacing) opts.letterSpacing = parseFloat(spacing.value);
    return opts;
  }

  // ─── Pointer Events ─────────────────────────────
  getCanvasPos(e) {
    const rect = this.els["overlay-canvas"].getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.zoom,
      y: (e.clientY - rect.top) / this.zoom,
    };
  }

  onPointerDown(e) {
    if (e.pointerType === "touch" && this.pointers.size >= 1) return; // let pinch handle
    this.pointers.set(e.pointerId, e);
    if (this.tool === "select") {
      const pos = this.getCanvasPos(e);
      this.handleSelectDown(pos);
      return;
    }
    const pos = this.getCanvasPos(e);
    const opts = this.getToolOptions();
    switch (this.tool) {
      case "text": this.createTextInput(pos, opts); break;
      case "draw":
        this.isDrawing = true;
        this.currentPath = [pos];
        break;
      case "highlight":
      case "whiteout":
      case "shape":
        this.isDrawing = true;
        this.drawStart = pos;
        break;
      case "sign":
        this.signPosition = pos;
        this.openModal("sign-modal");
        this.initSignCanvas();
        break;
      case "link":
        this.linkPosition = pos;
        this.openModal("link-modal");
        this.els["link-url"].value = "";
        break;
      case "note":
        this.notePosition = pos;
        this.openModal("note-modal");
        this.els["note-text"].value = "";
        break;
    }
  }

  onPointerMove(e) {
    if (!this.isDrawing) return;
    const pos = this.getCanvasPos(e);
    const overlay = this.els["overlay-canvas"];
    const ctx = overlay.getContext("2d");

    if (this.tool === "draw") {
      this.currentPath.push(pos);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      this.drawTempAnnotations(ctx);
      const opts = this.getToolOptions();
      ctx.strokeStyle = opts.color || "#000";
      ctx.lineWidth = (opts.lineWidth || 3) * this.zoom;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const p0 = this.currentPath[0];
      ctx.moveTo(p0.x * this.zoom, p0.y * this.zoom);
      for (let i = 1; i < this.currentPath.length; i++) {
        ctx.lineTo(this.currentPath[i].x * this.zoom, this.currentPath[i].y * this.zoom);
      }
      ctx.stroke();
    } else if (["highlight", "whiteout", "shape"].includes(this.tool)) {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      this.drawTempAnnotations(ctx);
      this.drawPreview(ctx, this.drawStart, pos, this.getToolOptions());
    }
  }

  onPointerUp(e) {
    this.pointers.delete(e.pointerId);
    if (!this.isDrawing) return;
    this.isDrawing = false;
    const pos = e.clientX !== undefined ? this.getCanvasPos(e) : this.drawStart;
    const opts = this.getToolOptions();

    if (this.tool === "draw" && this.currentPath.length > 1) {
      this.addAnnotation({
        type: "draw", page: this.currentPage,
        points: [...this.currentPath],
        color: opts.color || "#000", lineWidth: opts.lineWidth || 3,
      });
    } else if (this.tool === "highlight" && this.drawStart && pos) {
      const r = this.normalizeRect(this.drawStart, pos);
      if (r.w > 2 && r.h > 2) {
        this.addAnnotation({
          type: "highlight", page: this.currentPage,
          x: r.x, y: r.y, w: r.w, h: r.h,
          color: opts.color || "#ffeb3b",
        });
      }
    } else if (this.tool === "whiteout" && this.drawStart && pos) {
      const r = this.normalizeRect(this.drawStart, pos);
      if (r.w > 2 && r.h > 2) {
        this.addAnnotation({
          type: "whiteout", page: this.currentPage,
          x: r.x, y: r.y, w: r.w, h: r.h,
        });
      }
    } else if (this.tool === "shape" && this.drawStart && pos) {
      const r = this.normalizeRect(this.drawStart, pos);
      if (r.w > 2 || r.h > 2) {
        this.addAnnotation({
          type: "shape", page: this.currentPage,
          shapeType: opts.shapeType || "rect",
          x: r.x, y: r.y, w: r.w, h: r.h,
          color: opts.color || "#000",
          lineWidth: opts.lineWidth || 2,
          fill: opts.fill || false,
          startX: this.drawStart.x, startY: this.drawStart.y,
          endX: pos.x, endY: pos.y,
        });
      }
    }

    this.currentPath = [];
    this.drawStart = null;
    this.renderAnnotations();
  }

  // Pinch-to-zoom
  onTouchStart(e) {
    if (e.touches.length === 2) {
      this.pinchStart = {
        dist: this._touchDist(e),
        zoom: this.zoom,
      };
    }
  }
  onTouchMove(e) {
    if (e.touches.length === 2 && this.pinchStart) {
      e.preventDefault();
      const d = this._touchDist(e);
      const ratio = d / this.pinchStart.dist;
      this.setZoom(this.pinchStart.zoom * ratio);
    }
  }
  onTouchEnd(e) {
    if (e.touches.length < 2) this.pinchStart = null;
  }
  _touchDist(e) {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  normalizeRect(a, b) {
    return {
      x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
    };
  }

  drawPreview(ctx, start, end, opts) {
    const z = this.zoom;
    if (this.tool === "highlight") {
      ctx.fillStyle = (opts.color || "#ffeb3b") + "55";
      const r = this.normalizeRect(start, end);
      ctx.fillRect(r.x * z, r.y * z, r.w * z, r.h * z);
    } else if (this.tool === "whiteout") {
      ctx.fillStyle = "#ffffff";
      const r = this.normalizeRect(start, end);
      ctx.fillRect(r.x * z, r.y * z, r.w * z, r.h * z);
    } else if (this.tool === "shape") {
      const type = opts.shapeType || "rect";
      ctx.strokeStyle = opts.color || "#000";
      ctx.lineWidth = (opts.lineWidth || 2) * z;
      ctx.fillStyle = (opts.color || "#000") + "33";
      if (type === "rect") {
        const r = this.normalizeRect(start, end);
        if (opts.fill) ctx.fillRect(r.x * z, r.y * z, r.w * z, r.h * z);
        ctx.strokeRect(r.x * z, r.y * z, r.w * z, r.h * z);
      } else if (type === "ellipse") {
        const r = this.normalizeRect(start, end);
        ctx.beginPath();
        ctx.ellipse((r.x + r.w / 2) * z, (r.y + r.h / 2) * z, (r.w / 2) * z, (r.h / 2) * z, 0, 0, Math.PI * 2);
        if (opts.fill) ctx.fill();
        ctx.stroke();
      } else if (type === "line") {
        ctx.beginPath();
        ctx.moveTo(start.x * z, start.y * z);
        ctx.lineTo(end.x * z, end.y * z);
        ctx.stroke();
      } else if (type === "arrow") {
        this.drawArrow(ctx, start.x * z, start.y * z, end.x * z, end.y * z, z);
      }
    }
  }

  drawArrow(ctx, x1, y1, x2, y2, z) {
    const headLen = 12 * z;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
  }

  // ─── Annotations ────────────────────────────────
  addAnnotation(ann) {
    ann.id = Date.now() + Math.random();
    if (!this.annotations[this.currentPage]) this.annotations[this.currentPage] = [];
    this.annotations[this.currentPage].push(ann);
    this.pushUndo({ type: "add", annotation: ann, page: this.currentPage });
  }

  removeAnnotation(ann) {
    const pageAnns = this.annotations[ann.page];
    if (!pageAnns) return;
    const idx = pageAnns.indexOf(ann);
    if (idx !== -1) {
      pageAnns.splice(idx, 1);
      this.pushUndo({ type: "remove", annotation: ann, page: ann.page });
    }
  }

  renderAnnotations() {
    const z = this.zoom;
    const overlay = this.els["overlay-canvas"];
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const layer = this.els["annotation-layer"];
    layer.innerHTML = "";

    const pageAnns = this.annotations[this.currentPage] || [];
    pageAnns.forEach((ann) => {
      switch (ann.type) {
        case "text": this.renderTextAnnotation(ann, layer, z); break;
        case "image": this.renderImageAnnotation(ann, layer, z); break;
        case "draw": this.renderDrawAnnotation(ann, ctx, z); break;
        case "highlight":
          ctx.fillStyle = ann.color + "55";
          ctx.fillRect(ann.x * z, ann.y * z, ann.w * z, ann.h * z);
          break;
        case "whiteout":
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(ann.x * z, ann.y * z, ann.w * z, ann.h * z);
          break;
        case "shape": this.renderShapeAnnotation(ann, ctx, z); break;
        case "signature": this.renderSignatureAnnotation(ann, layer, z); break;
        case "link": this.renderLinkAnnotation(ann, layer, z); break;
        case "note": this.renderNoteAnnotation(ann, layer, z); break;
      }
      // Draw selection indicator for canvas annotations
      if (this.selectedAnnotation && this.selectedAnnotation.id === ann.id) {
        this.drawSelectionIndicator(ann, ctx, z);
      }
    });
  }

  drawTempAnnotations(ctx) {
    const z = this.zoom;
    const pageAnns = this.annotations[this.currentPage] || [];
    pageAnns.forEach((ann) => {
      if (ann.type === "draw") this.renderDrawAnnotation(ann, ctx, z);
      if (ann.type === "highlight") {
        ctx.fillStyle = ann.color + "55";
        ctx.fillRect(ann.x * z, ann.y * z, ann.w * z, ann.h * z);
      }
      if (ann.type === "whiteout") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(ann.x * z, ann.y * z, ann.w * z, ann.h * z);
      }
      if (ann.type === "shape") this.renderShapeAnnotation(ann, ctx, z);
    });
  }

  drawSelectionIndicator(ann, ctx, z) {
    ctx.save();
    ctx.strokeStyle = "#5b8cff";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (ann.type === "draw" && ann.points && ann.points.length > 1) {
      // Bounding box around freehand path
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of ann.points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      const pad = 6;
      ctx.strokeRect((minX - pad) * z, (minY - pad) * z, (maxX - minX + pad * 2) * z, (maxY - minY + pad * 2) * z);
    } else if (ann.x !== undefined) {
      // Rect-based annotations (highlight, whiteout, shape)
      const pad = 4;
      ctx.strokeRect((ann.x - pad) * z, (ann.y - pad) * z, (ann.w + pad * 2) * z, (ann.h + pad * 2) * z);
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  renderTextAnnotation(ann, layer, z) {
    const el = document.createElement("div");
    el.className = "annotation-el annotation-text";
    el.contentEditable = true;
    el.textContent = ann.text;
    el.style.left = ann.x * z + "px";
    el.style.top = ann.y * z + "px";
    el.style.fontSize = ann.fontSize * z + "px";
    el.style.fontFamily = this._cssFont(ann);
    el.style.color = ann.color || "#000";
    el.style.fontWeight = ann.fontWeight || (ann.bold ? 700 : 400);
    el.style.fontStyle = ann.italic ? "italic" : "normal";
    el.style.letterSpacing = ((ann.letterSpacing || 0) * z) + "px";
    el.dataset.annId = ann.id;

    el.addEventListener("blur", () => {
      ann.text = el.textContent;
      if (!ann.text.trim()) {
        this.removeAnnotation(ann);
        this.renderAnnotations();
      }
    });
    el.addEventListener("pointerdown", (e) => {
      if (this.tool === "select") {
        e.stopPropagation();
        this.selectAnnotation(ann, el);
        this.startDrag(e, ann);
      }
    });
    layer.appendChild(el);
  }

  _cssFont(ann) {
    const fontMap = {
      sans: "'Liberation Sans', system-ui, sans-serif",
      serif: "'Liberation Serif', Georgia, serif",
      mono: "'Liberation Mono', monospace",
      roboto: "'Roboto', 'Liberation Sans', system-ui, sans-serif",
      opensans: "'Open Sans', 'Liberation Sans', system-ui, sans-serif",
      montserrat: "'Montserrat', 'Liberation Sans', system-ui, sans-serif",
      ptsans: "'PT Sans', 'Liberation Sans', system-ui, sans-serif",
      lora: "'Lora', 'Liberation Serif', Georgia, serif",
      merriweather: "'Merriweather', 'Liberation Serif', Georgia, serif",
      playfair: "'Playfair Display', 'Liberation Serif', Georgia, serif",
      ebgaramond: "'EB Garamond', 'Liberation Serif', Georgia, serif",
      crimsontext: "'Crimson Text', 'Liberation Serif', Georgia, serif",
      ptserif: "'PT Serif', 'Liberation Serif', Georgia, serif",
      notoserif: "'Noto Serif', 'Liberation Serif', Georgia, serif",
      librebaskerville: "'Libre Baskerville', 'Liberation Serif', Georgia, serif",
      sourceserif: "'Source Serif 4', 'Liberation Serif', Georgia, serif",
      firacode: "'Fira Code', 'Liberation Mono', monospace",
    };
    return fontMap[ann.font] || "'Liberation Sans', system-ui, sans-serif";
  }

  renderImageAnnotation(ann, layer, z) {
    const el = document.createElement("div");
    el.className = "annotation-el";
    el.style.left = ann.x * z + "px";
    el.style.top = ann.y * z + "px";
    el.style.width = ann.w * z + "px";
    el.style.height = ann.h * z + "px";
    el.dataset.annId = ann.id;
    const img = document.createElement("img");
    img.src = ann.dataUrl;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.draggable = false;
    el.appendChild(img);
    el.addEventListener("pointerdown", (e) => {
      if (this.tool === "select") {
        e.stopPropagation();
        this.selectAnnotation(ann, el);
        this.startDrag(e, ann);
        this.attachResize(ann, el, z);
      }
    });
    layer.appendChild(el);
  }

  renderDrawAnnotation(ann, ctx, z) {
    if (!ann.points || ann.points.length < 2) return;
    ctx.strokeStyle = ann.color || "#000";
    ctx.lineWidth = (ann.lineWidth || 3) * z;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(ann.points[0].x * z, ann.points[0].y * z);
    for (let i = 1; i < ann.points.length; i++) {
      ctx.lineTo(ann.points[i].x * z, ann.points[i].y * z);
    }
    ctx.stroke();
  }

  renderShapeAnnotation(ann, ctx, z) {
    ctx.strokeStyle = ann.color || "#000";
    ctx.lineWidth = (ann.lineWidth || 2) * z;
    ctx.fillStyle = (ann.color || "#000") + "33";
    const type = ann.shapeType || "rect";
    if (type === "rect") {
      if (ann.fill) ctx.fillRect(ann.x * z, ann.y * z, ann.w * z, ann.h * z);
      ctx.strokeRect(ann.x * z, ann.y * z, ann.w * z, ann.h * z);
    } else if (type === "ellipse") {
      ctx.beginPath();
      ctx.ellipse((ann.x + ann.w / 2) * z, (ann.y + ann.h / 2) * z, (ann.w / 2) * z, (ann.h / 2) * z, 0, 0, Math.PI * 2);
      if (ann.fill) ctx.fill();
      ctx.stroke();
    } else if (type === "line") {
      ctx.beginPath();
      ctx.moveTo(ann.startX * z, ann.startY * z);
      ctx.lineTo(ann.endX * z, ann.endY * z);
      ctx.stroke();
    } else if (type === "arrow") {
      this.drawArrow(ctx, ann.startX * z, ann.startY * z, ann.endX * z, ann.endY * z, z);
    }
  }

  renderSignatureAnnotation(ann, layer, z) {
    const el = document.createElement("div");
    el.className = "annotation-el";
    el.style.left = ann.x * z + "px";
    el.style.top = ann.y * z + "px";
    el.style.width = (ann.w || 200) * z + "px";
    el.style.height = (ann.h || 80) * z + "px";
    el.dataset.annId = ann.id;
    const img = document.createElement("img");
    img.src = ann.dataUrl;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.draggable = false;
    el.appendChild(img);
    el.addEventListener("pointerdown", (e) => {
      if (this.tool === "select") {
        e.stopPropagation();
        this.selectAnnotation(ann, el);
        this.startDrag(e, ann);
        this.attachResize(ann, el, z);
      }
    });
    layer.appendChild(el);
  }

  renderLinkAnnotation(ann, layer, z) {
    const el = document.createElement("div");
    el.className = "annotation-el annotation-link";
    el.style.left = ann.x * z + "px";
    el.style.top = ann.y * z + "px";
    el.style.width = (ann.w || 150) * z + "px";
    el.style.height = (ann.h || 30) * z + "px";
    el.textContent = ann.url;
    el.title = ann.url;
    el.dataset.annId = ann.id;
    el.addEventListener("click", (e) => {
      if (this.tool === "select") {
        e.stopPropagation();
        this.selectAnnotation(ann, el);
      } else {
        window.open(ann.url, "_blank");
      }
    });
    el.addEventListener("pointerdown", (e) => {
      if (this.tool === "select") {
        e.stopPropagation();
        this.startDrag(e, ann);
      }
    });
    layer.appendChild(el);
  }

  renderNoteAnnotation(ann, layer, z) {
    const el = document.createElement("div");
    el.className = "annotation-el annotation-note";
    el.style.left = ann.x * z + "px";
    el.style.top = ann.y * z + "px";
    el.textContent = ann.text;
    el.dataset.annId = ann.id;
    el.addEventListener("pointerdown", (e) => {
      if (this.tool === "select") {
        e.stopPropagation();
        this.selectAnnotation(ann, el);
        this.startDrag(e, ann);
      }
    });
    layer.appendChild(el);
  }

  // ─── Selection & Drag ───────────────────────────
  selectAnnotation(ann, el) {
    this.deselectAnnotation();
    this.selectedAnnotation = ann;
    el.classList.add("selected");
    this.showDeleteButton();
  }

  deselectAnnotation() {
    document.querySelectorAll(".annotation-el.selected").forEach((el) => el.classList.remove("selected"));
    document.querySelectorAll(".resize-handle").forEach((h) => h.remove());
    this.selectedAnnotation = null;
    this.hideDeleteButton();
  }

  showDeleteButton() {
    let btn = document.getElementById("btn-delete-ann");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "btn-delete-ann";
      btn.className = "btn-delete-ann";
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"/><path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2v2"/></svg> Delete`;
      btn.title = "Delete selected annotation (Del)";
      btn.addEventListener("click", () => this.deleteSelected());
      document.getElementById("app").appendChild(btn);
    }
    btn.classList.remove("hidden");
  }

  hideDeleteButton() {
    const btn = document.getElementById("btn-delete-ann");
    if (btn) btn.classList.add("hidden");
  }

  deleteSelected() {
    if (!this.selectedAnnotation) return;
    this.removeAnnotation(this.selectedAnnotation);
    this.selectedAnnotation = null;
    this.hideDeleteButton();
    this.renderAnnotations();
  }

  attachResize(ann, el, z) {
    const handle = document.createElement("div");
    handle.className = "resize-handle";
    el.appendChild(handle);
    const start = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const ow = ann.w, oh = ann.h;
      const move = (ev) => {
        const dw = (ev.clientX - sx) / this.zoom;
        const dh = (ev.clientY - sy) / this.zoom;
        ann.w = Math.max(20, ow + dw);
        ann.h = Math.max(20, oh + dh);
        el.style.width = ann.w * this.zoom + "px";
        el.style.height = ann.h * this.zoom + "px";
      };
      const up = () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        this.renderAnnotations();
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    };
    handle.addEventListener("pointerdown", start);
  }

  handleSelectDown(pos) {
    const pageAnns = this.annotations[this.currentPage] || [];
    for (let i = pageAnns.length - 1; i >= 0; i--) {
      const ann = pageAnns[i];
      if (this.hitTest(ann, pos)) {
        const el = document.querySelector(`[data-ann-id="${ann.id}"]`);
        if (el) {
          this.selectAnnotation(ann, el);
        } else {
          // Canvas annotation (draw, highlight, whiteout, shape)
          this.deselectAnnotation();
          this.selectedAnnotation = ann;
          this.renderAnnotations(); // redraw with selection indicator
        }
        this.showDeleteButton();
        return;
      }
    }
    this.deselectAnnotation();
    this.hideDeleteButton();
  }

  hitTest(ann, pos) {
    if (ann.type === "text") {
      const charW = ann.fontSize * 0.6;
      const spacing = ann.letterSpacing || 0;
      const approxW = (ann.text || "").length * charW + Math.max(0, (ann.text || "").length - 1) * spacing;
      const approxH = ann.fontSize * 1.4;
      return pos.x >= ann.x && pos.x <= ann.x + approxW / this.zoom &&
             pos.y >= ann.y - approxH / this.zoom && pos.y <= ann.y;
    }
    if (ann.type === "draw") {
      return ann.points.some((p) => Math.abs(p.x - pos.x) < 10 && Math.abs(p.y - pos.y) < 10);
    }
    if (ann.x !== undefined) {
      const w = ann.w || 150;
      const h = ann.h || 80;
      return pos.x >= ann.x && pos.x <= ann.x + w && pos.y >= ann.y && pos.y <= ann.y + h;
    }
    return false;
  }

  startDrag(e, ann) {
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = ann.x || 0;
    const origY = ann.y || 0;
    const origPoints = ann.points ? ann.points.map((p) => ({ ...p })) : null;

    const onMove = (ev) => {
      const dx = (ev.clientX - startX) / this.zoom;
      const dy = (ev.clientY - startY) / this.zoom;
      ann.x = origX + dx;
      ann.y = origY + dy;
      if (origPoints) {
        ann.points = origPoints.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
      if (ann.startX !== undefined) {
        ann.startX = origX + dx;
        ann.startY = origY + dy;
        ann.endX = ann.startX + (ann.endX - origX);
        ann.endY = ann.startY + (ann.endY - origY);
      }
      this.renderAnnotations();
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  // ─── Text Input ─────────────────────────────────
  createTextInput(pos, opts) {
    const z = this.zoom;
    const wrapper = this.els["canvas-wrapper"];

    wrapper.querySelectorAll(".canvas-text-input").forEach((el) => el.remove());
    this.textInputActive = false;

    const input = document.createElement("textarea");
    input.className = "canvas-text-input";
    input.style.left = pos.x * z + "px";
    input.style.top = pos.y * z + "px";
    input.style.fontSize = (opts.fontSize || 16) * z + "px";
    input.style.fontFamily = this._cssFont(opts);
    input.style.color = opts.color || "#000";
    input.style.fontWeight = opts.fontWeight || 400;
    input.style.fontStyle = opts.italic ? "italic" : "normal";
    input.style.letterSpacing = (opts.letterSpacing || 0) + "px";

    wrapper.appendChild(input);

    requestAnimationFrame(() => {
      input.focus();
      this.textInputActive = true;
    });

    const commit = () => {
      if (!this.textInputActive) return;
      this.textInputActive = false;
      const text = input.value.trim();
      if (text) {
        this.addAnnotation({
          type: "text", page: this.currentPage,
          x: pos.x, y: pos.y,
          text, fontSize: opts.fontSize || 16,
          font: opts.font || "sans",
          color: opts.color || "#000",
          fontWeight: opts.fontWeight || 400,
          italic: opts.italic || false,
          letterSpacing: opts.letterSpacing || 0,
        });
        this.renderAnnotations();
      }
      if (input.parentNode) input.remove();
    };

    let committed = false;
    input.addEventListener("blur", () => {
      if (!committed) { committed = true; commit(); }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        committed = true;
        this.textInputActive = false;
        input.remove();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        committed = true;
        commit();
      }
      e.stopPropagation();
    });
  }

  // ─── Image Upload ───────────────────────────────
  handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 300;
        const scale = img.width > maxW ? maxW / img.width : 1;
        const p = this.imagePosition || { x: 50, y: 50 };
        this.addAnnotation({
          type: "image", page: this.currentPage,
          x: p.x, y: p.y,
          w: img.width * scale, h: img.height * scale,
          dataUrl: ev.target.result,
        });
        this.renderAnnotations();
        this.setTool("select");
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  // ─── Signature ──────────────────────────────────
  initSignCanvas() {
    const canvas = this.els["sign-canvas"];
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    let drawing = false;
    canvas.onpointerdown = (e) => { drawing = true; ctx.beginPath(); ctx.moveTo(e.offsetX, e.offsetY); };
    canvas.onpointermove = (e) => { if (!drawing) return; ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); };
    canvas.onpointerup = () => (drawing = false);
    canvas.onpointerleave = () => (drawing = false);
    this.signDataUrl = null;
    this.els["sign-text"].value = "";
    this.els["sign-preview"].textContent = "";
    this.els["sign-upload-preview"].innerHTML = "";
  }

  clearSignCanvas() {
    const canvas = this.els["sign-canvas"];
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }

  handleSignUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      this.signDataUrl = ev.target.result;
      this.els["sign-upload-preview"].innerHTML = `<img src="${ev.target.result}" />`;
    };
    reader.readAsDataURL(file);
  }

  applySignature() {
    const activeTab = document.querySelector("#sign-modal .tab.active").dataset.tab;
    let dataUrl = null;
    if (activeTab === "draw") {
      dataUrl = this.els["sign-canvas"].toDataURL("image/png");
    } else if (activeTab === "type") {
      const text = this.els["sign-text"].value.trim();
      if (!text) return this.toast("Type your signature first.");
      const c = document.createElement("canvas");
      c.width = 400; c.height = 100;
      const ctx = c.getContext("2d");
      ctx.font = "36px 'Segoe Script', 'Brush Script MT', cursive";
      ctx.fillStyle = "#000";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 10, 50);
      dataUrl = c.toDataURL("image/png");
    } else if (activeTab === "upload") {
      dataUrl = this.signDataUrl;
    }
    if (!dataUrl) return this.toast("Create a signature first.");
    const p = this.signPosition || { x: 100, y: 100 };
    this.addAnnotation({
      type: "signature", page: this.currentPage,
      x: p.x, y: p.y, w: 200, h: 80, dataUrl,
    });
    this.renderAnnotations();
    this.closeModal("sign-modal");
    this.setTool("select");
  }

  // ─── Link / Note ────────────────────────────────
  applyLink() {
    const url = this.els["link-url"].value.trim();
    if (!url) return this.toast("Enter a URL.");
    if (!this.linkPosition) return;
    this.addAnnotation({
      type: "link", page: this.currentPage,
      x: this.linkPosition.x, y: this.linkPosition.y,
      w: 150, h: 30, url,
    });
    this.renderAnnotations();
    this.closeModal("link-modal");
  }

  applyNote() {
    const text = this.els["note-text"].value.trim();
    if (!text) return this.toast("Type a note.");
    if (!this.notePosition) return;
    this.addAnnotation({
      type: "note", page: this.currentPage,
      x: this.notePosition.x, y: this.notePosition.y, text,
    });
    this.renderAnnotations();
    this.closeModal("note-modal");
  }

  // ─── Modal Helpers ──────────────────────────────
  openModal(id) { this.els[id].classList.remove("hidden"); }
  closeModal(id) { this.els[id].classList.add("hidden"); }

  // ─── History ────────────────────────────────────
  pushUndo(action) {
    this.undoStack.push(action);
    this.redoStack = [];
    this.updateHistoryButtons();
  }

  undo() {
    const action = this.undoStack.pop();
    if (!action) return;
    if (action.type === "add") {
      const pageAnns = this.annotations[action.page];
      if (pageAnns) { const idx = pageAnns.indexOf(action.annotation); if (idx !== -1) pageAnns.splice(idx, 1); }
    } else if (action.type === "remove") {
      if (!this.annotations[action.page]) this.annotations[action.page] = [];
      this.annotations[action.page].push(action.annotation);
    }
    this.redoStack.push(action);
    this.renderAnnotations();
    this.updateHistoryButtons();
  }

  redo() {
    const action = this.redoStack.pop();
    if (!action) return;
    if (action.type === "add") {
      if (!this.annotations[action.page]) this.annotations[action.page] = [];
      this.annotations[action.page].push(action.annotation);
    } else if (action.type === "remove") {
      const pageAnns = this.annotations[action.page];
      if (pageAnns) { const idx = pageAnns.indexOf(action.annotation); if (idx !== -1) pageAnns.splice(idx, 1); }
    }
    this.undoStack.push(action);
    this.renderAnnotations();
    this.updateHistoryButtons();
  }

  updateHistoryButtons() {
    this.els["btn-undo"].disabled = this.undoStack.length === 0;
    this.els["btn-redo"].disabled = this.redoStack.length === 0;
  }

  // ─── Keyboard Shortcuts ─────────────────────────
  onKeyDown(e) {
    const el = e.target;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable) {
      return;
    }
    if (document.querySelector(".modal:not(.hidden)")) return;
    if (this.textInputActive) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key === "z") { e.preventDefault(); this.undo(); }
      else if (e.key === "y" || (e.shiftKey && e.key === "z")) { e.preventDefault(); this.redo(); }
      return;
    }

    const toolKeys = {
      v: "select", t: "text", i: "image", d: "draw",
      h: "highlight", w: "whiteout", s: "shape",
      g: "sign", l: "link", n: "note",
    };
    if (toolKeys[e.key]) {
      this.setTool(toolKeys[e.key]);
      return;
    }

    if ((e.key === "Delete" || e.key === "Backspace") && this.selectedAnnotation && this.tool === "select") {
      e.preventDefault();
      this.deleteSelected();
      return;
    }

    if (e.key === "+" || e.key === "=") this.setZoom(this.zoom + 0.25);
    if (e.key === "-") this.setZoom(this.zoom - 0.25);
  }

  // ─── Font embedding (Liberation Sans/Serif/Mono) ─
  async getFont(pdfDoc, ann) {
    const family = ann.font || "sans";
    const weight = ann.fontWeight || (ann.bold ? 700 : 400);
    const isBold = weight >= 600;
    const styleKey = ann.italic ? (isBold ? "boldItalic" : "italic") : (isBold ? "bold" : "regular");
    const key = family + ":" + styleKey;
    if (this.fontCache[key]) return this.fontCache[key];
    if (!pdfDoc.isFontkitRegistered) {
      pdfDoc.registerFontkit(wrapFontkit(fontkit));
      pdfDoc.isFontkitRegistered = true;
    }
    const bytes = await (await fetch(LIB_FONTS[family][styleKey])).arrayBuffer();
    const font = await pdfDoc.embedFont(bytes, { subset: true });
    this.fontCache[key] = font;
    return font;
  }

  // ─── Download PDF ───────────────────────────────
  async downloadPDF() {
    const btn = this.els["btn-download"];
    btn.disabled = true;
    const original = btn.innerHTML;
    btn.textContent = "Generating…";
    this.toast("Generating PDF…", 9999);

    try {
      const pdfDoc = await PDFLib.PDFDocument.load(this.pdfBytes);
      pdfDoc.registerFontkit(wrapFontkit(fontkit));
      pdfDoc.isFontkitRegistered = true;

      for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
        const pageAnns = this.annotations[pageNum] || [];
        if (pageAnns.length === 0) continue;
        const page = pdfDoc.getPage(pageNum - 1);
        const rot = PDFLib.degrees(this.pageInfos[pageNum - 1].rotation || 0);

        for (const ann of pageAnns) {
          try {
            switch (ann.type) {
              case "text": {
                const font = await this.getFont(pdfDoc, ann);
                const size = ann.fontSize || 16;
                const spacing = ann.letterSpacing || 0;
                // ann.y is the top of the display box; shift down to baseline
                // in display space, then map.
                const p = this.toPageSpace(ann.x, ann.y + size * 0.8, pageNum);
                const color = PDFLib.rgb(...this.hexToRgb(ann.color || "#000000"));
                if (spacing !== 0 && (ann.text || "").length > 1) {
                  // Draw char-by-char with letter-spacing
                  const text = ann.text || "";
                  let curX = p.x;
                  for (let ci = 0; ci < text.length; ci++) {
                    page.drawText(text[ci], {
                      x: curX, y: p.y, size, font, rotate: rot, color,
                    });
                    const charW = font.widthOfTextAtSize(text[ci], size);
                    curX += charW + spacing;
                  }
                } else {
                  page.drawText(ann.text || "", {
                    x: p.x, y: p.y, size, font, rotate: rot, color,
                  });
                }
                break;
              }
              case "highlight": {
                page.drawRectangle({
                  ...this.placeBox(pageNum, ann.x, ann.y, ann.w, ann.h),
                  color: PDFLib.rgb(...this.hexToRgb(ann.color || "#ffeb3b")),
                  opacity: 0.35,
                  blendMode: PDFLib.BlendMode.Multiply,
                });
                break;
              }
              case "whiteout": {
                page.drawRectangle({
                  ...this.placeBox(pageNum, ann.x, ann.y, ann.w, ann.h),
                  color: PDFLib.rgb(1, 1, 1),
                });
                break;
              }
              case "shape": {
                const color = PDFLib.rgb(...this.hexToRgb(ann.color || "#000000"));
                const type = ann.shapeType || "rect";
                if (type === "rect") {
                  page.drawRectangle({
                    ...this.placeBox(pageNum, ann.x, ann.y, ann.w, ann.h),
                    borderColor: color, borderWidth: ann.lineWidth || 2,
                    color: ann.fill ? color : undefined,
                    opacity: ann.fill ? 0.2 : undefined,
                  });
                } else if (type === "ellipse") {
                  const c = this.toPageSpace(ann.x + ann.w / 2, ann.y + ann.h / 2, pageNum);
                  page.drawEllipse({
                    x: c.x, y: c.y,
                    xScale: ann.w / 2, yScale: ann.h / 2, rotate: rot,
                    borderColor: color, borderWidth: ann.lineWidth || 2,
                    color: ann.fill ? color : undefined,
                    opacity: ann.fill ? 0.2 : undefined,
                  });
                } else if (type === "line" || type === "arrow") {
                  // Endpoints map directly — no rotation needed, they are
                  // already absolute page-space points.
                  const a = this.toPageSpace(ann.startX, ann.startY, pageNum);
                  const b = this.toPageSpace(ann.endX, ann.endY, pageNum);
                  const thickness = ann.lineWidth || 2;
                  page.drawLine({ start: a, end: b, thickness, color, lineCap: PDFLib.LineCapStyle.Round });
                  if (type === "arrow") {
                    const ang = Math.atan2(b.y - a.y, b.x - a.x);
                    const hl = Math.max(8, thickness * 4);
                    for (const off of [-Math.PI / 6, Math.PI / 6]) {
                      page.drawLine({
                        start: b,
                        end: {
                          x: b.x - hl * Math.cos(ang + off),
                          y: b.y - hl * Math.sin(ang + off),
                        },
                        thickness, color, lineCap: PDFLib.LineCapStyle.Round,
                      });
                    }
                  }
                }
                break;
              }
              case "draw": {
                const pts = (ann.points || []).map((pt) => this.toPageSpace(pt.x, pt.y, pageNum));
                if (pts.length < 2) break;
                // One continuous path: correct joins, no double-stroked seams.
                page.pushOperators(
                  PDFLib.pushGraphicsState(),
                  PDFLib.setStrokingColor(PDFLib.rgb(...this.hexToRgb(ann.color || "#000000"))),
                  PDFLib.setLineWidth(ann.lineWidth || 3),
                  PDFLib.setLineCap(PDFLib.LineCapStyle.Round),
                  PDFLib.setLineJoin(PDFLib.LineJoinStyle.Round),
                  PDFLib.moveTo(pts[0].x, pts[0].y),
                  ...pts.slice(1).map((p) => PDFLib.lineTo(p.x, p.y)),
                  PDFLib.stroke(),
                  PDFLib.popGraphicsState(),
                );
                break;
              }
              case "image":
              case "signature": {
                let image;
                try { image = await pdfDoc.embedPng(ann.dataUrl); }
                catch { image = await pdfDoc.embedJpg(ann.dataUrl); }
                page.drawImage(image, this.placeBox(
                  pageNum, ann.x, ann.y, ann.w || 200, ann.h || 80,
                ));
                break;
              }
              case "link": {
                const w = ann.w || 150, h = ann.h || 30;
                const box = this.placeBox(pageNum, ann.x, ann.y, w, h);
                page.drawRectangle({
                  ...box,
                  borderColor: PDFLib.rgb(...this.hexToRgb("#5b8cff")),
                  borderWidth: 1, opacity: 0.5,
                });
                const font = await this.getFont(pdfDoc, { bold: false, italic: false });
                const label = this.toPageSpace(ann.x + 4, ann.y + 14, pageNum);
                page.drawText(ann.url.substring(0, 30), {
                  x: label.x, y: label.y, size: 10, font, rotate: rot,
                  color: PDFLib.rgb(...this.hexToRgb("#5b8cff")),
                });
                const url = /^https?:\/\//i.test(ann.url) ? ann.url : "https://" + ann.url;
                // /Rect must be axis-aligned in page space, so it is derived
                // from the mapped corners rather than the rotated draw box.
                page.drawLink({
                  url,
                  borderColor: PDFLib.rgb(0, 0, 0),
                  borderWidth: 0,
                  borderOpacity: 0,
                  rect: this.pageRect(pageNum, ann.x, ann.y, w, h),
                });
                break;
              }
              case "note": {
                const w = 160, h = 40;
                const box = this.placeBox(pageNum, ann.x, ann.y, w, h);
                page.drawRectangle({
                  ...box,
                  color: PDFLib.rgb(1, 0.97, 0.71),
                  borderColor: PDFLib.rgb(0.95, 0.85, 0.2),
                  borderWidth: 1,
                });
                const font = await this.getFont(pdfDoc, { bold: false, italic: false });
                const label = this.toPageSpace(ann.x + 6, ann.y + 16, pageNum);
                page.drawText((ann.text || "").substring(0, 50), {
                  x: label.x, y: label.y, size: 10, font, rotate: rot,
                  color: PDFLib.rgb(0.2, 0.2, 0.2),
                });
                break;
              }
            }
          } catch (err) {
            console.warn("Error rendering annotation:", err);
          }
        }
      }

      const saveOpts = {};
      const pw = (this.els["pdf-password"].value || "").trim();
      if (pw) {
        // AES-256 (V5/R6) via the pdf-lib fork's real encryption support.
        // Requires crypto.getRandomValues — present in every browser we target.
        pdfDoc.encrypt({
          userPassword: pw,
          ownerPassword: pw,
          permissions: {
            printing: "highResolution",
            modifying: false,
            copying: false,
            annotating: false,
          },
        });
      }

      const modifiedBytes = await pdfDoc.save(saveOpts);
      const blob = new Blob([modifiedBytes], { type: "application/pdf" });
      window.__lastBlob = blob; // test hook
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "edited-document.pdf";
      a.click();
      URL.revokeObjectURL(url);
      this.toast("PDF downloaded.");
    } catch (err) {
      console.error("Download error:", err);
      this.toast("Error generating PDF: " + err.message);
    } finally {
      btn.innerHTML = original;
      btn.disabled = false;
    }
  }

  hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return [
      parseInt(hex.substring(0, 2), 16) / 255,
      parseInt(hex.substring(2, 4), 16) / 255,
      parseInt(hex.substring(4, 6), 16) / 255,
    ];
  }

  // ─── UI Updates ─────────────────────────────────
  updateUI() {
    this.els["page-info"].textContent = `${this.currentPage} / ${this.totalPages}`;
    this.els["page-nav"].textContent = `Page ${this.currentPage}`;
    this.els["zoom-level"].textContent = Math.round(this.zoom * 100) + "%";
    this.updateHistoryButtons();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.editor = new OkemPDFEditor();
});
