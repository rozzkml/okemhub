// okemhub PDF Editor — client-side PDF editing
// Libraries: PDF.js (render) + pdf-lib (modify/save)

/* global pdfjsLib, PDFLib */

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

class OkemPDFEditor {
  constructor() {
    // State
    this.pdfDoc = null;        // pdf.js doc
    this.pdfBytes = null;      // raw bytes for pdf-lib
    this.pages = [];           // { viewport, width, height }
    this.currentPage = 1;
    this.totalPages = 0;
    this.zoom = 1.5;
    this.tool = "text";

    // Annotations per page: { pageNum: [annotation, ...] }
    this.annotations = {};
    this.selectedAnnotation = null;

    // History
    this.undoStack = [];
    this.redoStack = [];

    // Drawing state
    this.isDrawing = false;
    this.drawStart = null;
    this.currentPath = [];
    this.signDataUrl = null;
    this.linkPosition = null;
    this.notePosition = null;

    // DOM refs
    this.els = {};

    this.init();
  }

  // ─── Init ──────────────────────────────────────────
  init() {
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
      "btn-download", "btn-new-file",
      "sign-modal", "sign-close", "sign-canvas", "sign-clear",
      "sign-text", "sign-preview", "sign-file", "sign-upload-preview",
      "sign-cancel", "sign-apply",
      "link-modal", "link-close", "link-url", "link-cancel", "link-apply",
      "note-modal", "note-close", "note-text", "note-cancel", "note-apply",
      "image-input",
    ];
    ids.forEach((id) => (this.els[id] = document.getElementById(id)));
  }

  bindEvents() {
    const { els } = this;

    // Upload
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

    // Tools
    document.querySelectorAll(".ribbon-tab").forEach((btn) => {
      btn.addEventListener("click", () => this.setTool(btn.dataset.tool));
    });

    // Canvas events
    const overlay = els["overlay-canvas"];
    overlay.addEventListener("mousedown", (e) => this.onMouseDown(e));
    overlay.addEventListener("mousemove", (e) => this.onMouseMove(e));
    overlay.addEventListener("mouseup", (e) => this.onMouseUp(e));
    overlay.addEventListener("mouseleave", (e) => this.onMouseUp(e));

    // Touch support — only prevent default when actively editing
    overlay.addEventListener("touchstart", (e) => {
      if (this.tool !== "select") {
        e.preventDefault();
      }
      const t = e.touches[0];
      this.onMouseDown({ clientX: t.clientX, clientY: t.clientY, target: overlay });
    }, { passive: false });
    overlay.addEventListener("touchmove", (e) => {
      if (this.isDrawing) {
        e.preventDefault();
        const t = e.touches[0];
        this.onMouseMove({ clientX: t.clientX, clientY: t.clientY, target: overlay });
      }
    }, { passive: false });
    overlay.addEventListener("touchend", (e) => {
      this.onMouseUp({});
    });

    // Zoom
    els["btn-zoom-in"].addEventListener("click", () => this.setZoom(this.zoom + 0.25));
    els["btn-zoom-out"].addEventListener("click", () => this.setZoom(this.zoom - 0.25));
    els["btn-zoom-fit"].addEventListener("click", () => this.fitToWidth());

    // Ctrl+Scroll to zoom
    els["canvas-area"].addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        this.setZoom(this.zoom + delta);
      }
    }, { passive: false });

    // Navigation
    els["btn-prev"].addEventListener("click", () => this.goToPage(this.currentPage - 1));
    els["btn-next"].addEventListener("click", () => this.goToPage(this.currentPage + 1));

    // Undo/Redo
    els["btn-undo"].addEventListener("click", () => this.undo());
    els["btn-redo"].addEventListener("click", () => this.redo());

    // Download / New
    els["btn-download"].addEventListener("click", () => this.downloadPDF());
    els["btn-new-file"].addEventListener("click", () => this.resetEditor());

    // Image tool
    els["image-input"].addEventListener("change", (e) => this.handleImageUpload(e));

    // Signature modal
    els["sign-close"].addEventListener("click", () => this.closeModal("sign-modal"));
    els["sign-cancel"].addEventListener("click", () => this.closeModal("sign-modal"));
    els["sign-apply"].addEventListener("click", () => this.applySignature());
    els["sign-clear"].addEventListener("click", () => this.clearSignCanvas());
    els["sign-text"].addEventListener("input", () => {
      els["sign-preview"].textContent = els["sign-text"].value || "";
    });
    els["sign-file"].addEventListener("change", (e) => this.handleSignUpload(e));

    // Modal tabs
    document.querySelectorAll(".modal-tabs .tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const modal = tab.closest(".modal");
        modal.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        modal.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
        tab.classList.add("active");
        document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
      });
    });

    // Link modal
    els["link-close"].addEventListener("click", () => this.closeModal("link-modal"));
    els["link-cancel"].addEventListener("click", () => this.closeModal("link-modal"));
    els["link-apply"].addEventListener("click", () => this.applyLink());

    // Note modal
    els["note-close"].addEventListener("click", () => this.closeModal("note-modal"));
    els["note-cancel"].addEventListener("click", () => this.closeModal("note-modal"));
    els["note-apply"].addEventListener("click", () => this.applyNote());

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => this.onKeyDown(e));
  }

  // ─── File Handling ─────────────────────────────────
  async handleFile(file) {
    if (!file || file.type !== "application/pdf") {
      alert("Please select a PDF file.");
      return;
    }
    this.pdfBytes = await file.arrayBuffer();
    this.pdfDoc = await pdfjsLib.getDocument({ data: this.pdfBytes.slice(0) }).promise;
    this.totalPages = this.pdfDoc.numPages;
    this.pages = [];
    this.annotations = {};
    this.undoStack = [];
    this.redoStack = [];
    this.currentPage = 1;

    // Pre-load page info
    for (let i = 1; i <= this.totalPages; i++) {
      const page = await this.pdfDoc.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      this.pages.push({ width: vp.width, height: vp.height });
    }

    // Switch to editor
    this.els["upload-screen"].classList.add("hidden");
    this.els["editor-screen"].classList.remove("hidden");

    this.renderThumbnails();
    this.fitToWidth();
    this.updateUI();
  }

  resetEditor() {
    this.pdfDoc = null;
    this.pdfBytes = null;
    this.pages = [];
    this.annotations = {};
    this.undoStack = [];
    this.redoStack = [];
    this.currentPage = 1;
    this.els["editor-screen"].classList.add("hidden");
    this.els["upload-screen"].classList.remove("hidden");
    this.els["file-input"].value = "";
  }

  // ─── Rendering ─────────────────────────────────────
  async renderPage() {
    const page = await this.pdfDoc.getPage(this.currentPage);
    const viewport = page.getViewport({ scale: this.zoom });

    const canvas = this.els["pdf-canvas"];
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Overlay canvas
    const overlay = this.els["overlay-canvas"];
    overlay.width = viewport.width;
    overlay.height = viewport.height;

    // Annotation layer
    const layer = this.els["annotation-layer"];
    layer.style.width = viewport.width + "px";
    layer.style.height = viewport.height + "px";

    // Re-render annotations
    this.renderAnnotations();
    this.updateUI();
  }

  async renderThumbnails() {
    const list = this.els["page-list"];
    list.innerHTML = "";
    for (let i = 1; i <= this.totalPages; i++) {
      const div = document.createElement("div");
      div.className = "page-thumb" + (i === this.currentPage ? " active" : "");
      div.dataset.page = i;

      const canvas = document.createElement("canvas");
      const page = await this.pdfDoc.getPage(i);
      const vp = page.getViewport({ scale: 0.2 });
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

    // Update thumbnail selection
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
    const page = this.pages[this.currentPage - 1];
    if (!page) return;
    const available = area.clientWidth - 60;
    this.zoom = available / page.width;
    this.renderPage();
    this.els["zoom-level"].textContent = Math.round(this.zoom * 100) + "%";
  }

  // ─── Tool Management ───────────────────────────────
  setTool(tool) {
    this.tool = tool;
    document.querySelectorAll(".ribbon-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === tool);
    });
    this.updateToolOptions();
    this.deselectAnnotation();

    // Update cursor
    const overlay = this.els["overlay-canvas"];
    const cursors = {
      select: "default", text: "text", image: "copy", draw: "crosshair",
      highlight: "crosshair", whiteout: "crosshair", shape: "crosshair",
      sign: "crosshair", link: "crosshair", note: "crosshair",
    };
    overlay.style.cursor = cursors[tool] || "crosshair";

    // Trigger image upload if image tool
    if (tool === "image") {
      this.els["image-input"].click();
    }
  }

  updateToolOptions() {
    const container = this.els["tool-options"];
    const t = this.tool;

    const section = (label, html) =>
      `<div class="opt-section"><span class="opt-section-label">${label}</span>${html}</div>`;

    if (t === "text") {
      container.innerHTML = `
        ${section("Font", `
          <select id="opt-font">
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier">Courier</option>
            <option value="Arial">Arial</option>
            <option value="Georgia">Georgia</option>
            <option value="Verdana">Verdana</option>
          </select>
        `)}
        ${section("Size", `
          <input type="range" id="opt-size" min="8" max="72" value="16" />
          <span class="opt-val" id="opt-size-val">16</span>
        `)}
        ${section("Color", `
          <input type="color" id="opt-color" value="#000000" />
        `)}
        ${section("Style", `
          <label><input type="checkbox" id="opt-bold" /> <b>B</b></label>
          <label><input type="checkbox" id="opt-italic" /> <i>I</i></label>
        `)}
      `;
      container.querySelector("#opt-size").addEventListener("input", (e) => {
        container.querySelector("#opt-size-val").textContent = e.target.value;
      });
    } else if (t === "draw") {
      container.innerHTML = `
        ${section("Color", `
          <input type="color" id="opt-color" value="#000000" />
        `)}
        ${section("Brush", `
          <input type="range" id="opt-width" min="1" max="20" value="3" />
          <span class="opt-val" id="opt-width-val">3</span>
        `)}
      `;
      container.querySelector("#opt-width").addEventListener("input", (e) => {
        container.querySelector("#opt-width-val").textContent = e.target.value;
      });
    } else if (t === "highlight") {
      container.innerHTML = `
        ${section("Color", `
          <input type="color" id="opt-color" value="#ffeb3b" />
        `)}
        <span class="opt-hint">Click & drag to highlight an area</span>
      `;
    } else if (t === "shape") {
      container.innerHTML = `
        ${section("Shape", `
          <select id="opt-shape">
            <option value="rect">Rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="line">Line</option>
            <option value="arrow">Arrow</option>
          </select>
        `)}
        ${section("Color", `
          <input type="color" id="opt-color" value="#000000" />
        `)}
        ${section("Stroke", `
          <input type="range" id="opt-width" min="1" max="10" value="2" />
          <span class="opt-val" id="opt-width-val">2</span>
        `)}
        ${section("Fill", `
          <label><input type="checkbox" id="opt-fill" /> Fill</label>
        `)}
      `;
      container.querySelector("#opt-width").addEventListener("input", (e) => {
        container.querySelector("#opt-width-val").textContent = e.target.value;
      });
    } else if (t === "whiteout") {
      container.innerHTML = `<span class="opt-hint">Click & drag to cover an area with white</span>`;
    } else if (t === "sign") {
      container.innerHTML = `<span class="opt-hint">Click on the canvas to create a signature</span>`;
    } else if (t === "link") {
      container.innerHTML = `<span class="opt-hint">Click on the canvas to add a link</span>`;
    } else if (t === "note") {
      container.innerHTML = `<span class="opt-hint">Click on the canvas to add a sticky note</span>`;
    } else if (t === "select") {
      container.innerHTML = `<span class="opt-hint">Click annotation to select · Drag to move · Delete to remove</span>`;
    } else if (t === "image") {
      container.innerHTML = `<span class="opt-hint">Select an image file to add to the PDF</span>`;
    } else {
      container.innerHTML = "";
    }
  }

  getToolOptions() {
    const opts = {};
    const color = document.getElementById("opt-color");
    const size = document.getElementById("opt-size");
    const font = document.getElementById("opt-font");
    const width = document.getElementById("opt-width");
    const shape = document.getElementById("opt-shape");
    const bold = document.getElementById("opt-bold");
    const italic = document.getElementById("opt-italic");
    const fill = document.getElementById("opt-fill");

    if (color) opts.color = color.value;
    if (size) opts.fontSize = parseInt(size.value);
    if (font) opts.font = font.value;
    if (width) opts.lineWidth = parseInt(width.value);
    if (shape) opts.shapeType = shape.value;
    if (bold) opts.bold = bold.checked;
    if (italic) opts.italic = italic.checked;
    if (fill) opts.fill = fill.checked;
    return opts;
  }

  // ─── Canvas Mouse Events ───────────────────────────
  getCanvasPos(e) {
    const rect = this.els["overlay-canvas"].getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / this.zoom,
      y: (e.clientY - rect.top) / this.zoom,
    };
  }

  onMouseDown(e) {
    const pos = this.getCanvasPos(e);
    const opts = this.getToolOptions();

    switch (this.tool) {
      case "select":
        this.handleSelectDown(pos);
        break;

      case "text":
        this.createTextInput(pos, opts);
        break;

      case "draw":
        this.isDrawing = true;
        this.currentPath = [pos];
        break;

      case "highlight":
      case "whiteout":
        this.isDrawing = true;
        this.drawStart = pos;
        break;

      case "shape":
        this.isDrawing = true;
        this.drawStart = pos;
        break;

      case "sign":
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

  onMouseMove(e) {
    if (!this.isDrawing) return;
    const pos = this.getCanvasPos(e);
    const overlay = this.els["overlay-canvas"];
    const ctx = overlay.getContext("2d");

    if (this.tool === "draw") {
      this.currentPath.push(pos);
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      this.drawTempAnnotations(ctx);
      // Draw current stroke
      const opts = this.getToolOptions();
      ctx.strokeStyle = opts.color || "#000";
      ctx.lineWidth = (opts.lineWidth || 3) * this.zoom;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const p0 = this.currentPath[0];
      ctx.moveTo(p0.x * this.zoom, p0.y * this.zoom);
      for (let i = 1; i < this.currentPath.length; i++) {
        const p = this.currentPath[i];
        ctx.lineTo(p.x * this.zoom, p.y * this.zoom);
      }
      ctx.stroke();
    } else if (this.tool === "highlight" || this.tool === "whiteout" || this.tool === "shape") {
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      this.drawTempAnnotations(ctx);
      this.drawPreview(ctx, this.drawStart, pos, this.getToolOptions());
    }
  }

  onMouseUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    const pos = e.clientX ? this.getCanvasPos(e) : this.drawStart;
    const opts = this.getToolOptions();

    if (this.tool === "draw" && this.currentPath.length > 1) {
      this.addAnnotation({
        type: "draw",
        page: this.currentPage,
        points: [...this.currentPath],
        color: opts.color || "#000",
        lineWidth: opts.lineWidth || 3,
      });
    } else if (this.tool === "highlight" && this.drawStart && pos) {
      const r = this.normalizeRect(this.drawStart, pos);
      if (r.w > 2 && r.h > 2) {
        this.addAnnotation({
          type: "highlight",
          page: this.currentPage,
          x: r.x, y: r.y, w: r.w, h: r.h,
          color: opts.color || "#ffeb3b",
        });
      }
    } else if (this.tool === "whiteout" && this.drawStart && pos) {
      const r = this.normalizeRect(this.drawStart, pos);
      if (r.w > 2 && r.h > 2) {
        this.addAnnotation({
          type: "whiteout",
          page: this.currentPage,
          x: r.x, y: r.y, w: r.w, h: r.h,
        });
      }
    } else if (this.tool === "shape" && this.drawStart && pos) {
      const r = this.normalizeRect(this.drawStart, pos);
      if (r.w > 2 || r.h > 2) {
        this.addAnnotation({
          type: "shape",
          page: this.currentPage,
          shapeType: opts.shapeType || "rect",
          x: r.x, y: r.y, w: r.w, h: r.h,
          color: opts.color || "#000",
          lineWidth: opts.lineWidth || 2,
          fill: opts.fill || false,
          startX: this.drawStart.x,
          startY: this.drawStart.y,
          endX: pos.x,
          endY: pos.y,
        });
      }
    }

    this.currentPath = [];
    this.drawStart = null;
    this.renderAnnotations();
  }

  normalizeRect(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
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
        ctx.ellipse(
          (r.x + r.w / 2) * z, (r.y + r.h / 2) * z,
          (r.w / 2) * z, (r.h / 2) * z,
          0, 0, Math.PI * 2
        );
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
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  }

  // ─── Annotations ───────────────────────────────────
  addAnnotation(ann) {
    ann.id = Date.now() + Math.random();
    if (!this.annotations[this.currentPage]) {
      this.annotations[this.currentPage] = [];
    }
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
        case "text":
          this.renderTextAnnotation(ann, layer, z);
          break;
        case "image":
          this.renderImageAnnotation(ann, layer, z);
          break;
        case "draw":
          this.renderDrawAnnotation(ann, ctx, z);
          break;
        case "highlight":
          ctx.fillStyle = ann.color + "55";
          ctx.fillRect(ann.x * z, ann.y * z, ann.w * z, ann.h * z);
          break;
        case "whiteout":
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(ann.x * z, ann.y * z, ann.w * z, ann.h * z);
          break;
        case "shape":
          this.renderShapeAnnotation(ann, ctx, z);
          break;
        case "signature":
          this.renderSignatureAnnotation(ann, layer, z);
          break;
        case "link":
          this.renderLinkAnnotation(ann, layer, z);
          break;
        case "note":
          this.renderNoteAnnotation(ann, layer, z);
          break;
      }
    });
  }

  drawTempAnnotations(ctx) {
    // Draw existing draw annotations for current page during drawing
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

  renderTextAnnotation(ann, layer, z) {
    const el = document.createElement("div");
    el.className = "annotation-el annotation-text";
    el.contentEditable = true;
    el.textContent = ann.text;
    el.style.left = ann.x * z + "px";
    el.style.top = ann.y * z + "px";
    el.style.fontSize = ann.fontSize * z + "px";
    el.style.fontFamily = ann.font || "Helvetica";
    el.style.color = ann.color || "#000";
    el.style.fontWeight = ann.bold ? "bold" : "normal";
    el.style.fontStyle = ann.italic ? "italic" : "normal";
    el.dataset.annId = ann.id;

    el.addEventListener("blur", () => {
      ann.text = el.textContent;
      if (!ann.text.trim()) {
        this.removeAnnotation(ann);
        this.renderAnnotations();
      }
    });

    el.addEventListener("mousedown", (e) => {
      if (this.tool === "select") {
        e.stopPropagation();
        this.selectAnnotation(ann, el);
        this.startDrag(e, ann);
      }
    });

    layer.appendChild(el);
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

    el.addEventListener("mousedown", (e) => {
      if (this.tool === "select") {
        e.stopPropagation();
        this.selectAnnotation(ann, el);
        this.startDrag(e, ann);
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
      ctx.ellipse(
        (ann.x + ann.w / 2) * z, (ann.y + ann.h / 2) * z,
        (ann.w / 2) * z, (ann.h / 2) * z,
        0, 0, Math.PI * 2
      );
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

    el.addEventListener("mousedown", (e) => {
      if (this.tool === "select") {
        e.stopPropagation();
        this.selectAnnotation(ann, el);
        this.startDrag(e, ann);
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

    el.addEventListener("mousedown", (e) => {
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

    el.addEventListener("mousedown", (e) => {
      if (this.tool === "select") {
        e.stopPropagation();
        this.selectAnnotation(ann, el);
        this.startDrag(e, ann);
      }
    });

    layer.appendChild(el);
  }

  // ─── Selection & Drag ──────────────────────────────
  selectAnnotation(ann, el) {
    this.deselectAnnotation();
    this.selectedAnnotation = ann;
    el.classList.add("selected");
  }

  deselectAnnotation() {
    document.querySelectorAll(".annotation-el.selected").forEach((el) => {
      el.classList.remove("selected");
    });
    this.selectedAnnotation = null;
  }

  handleSelectDown(pos) {
    // Check if clicking on an annotation
    const pageAnns = this.annotations[this.currentPage] || [];
    for (let i = pageAnns.length - 1; i >= 0; i--) {
      const ann = pageAnns[i];
      if (this.hitTest(ann, pos)) {
        const el = document.querySelector(`[data-ann-id="${ann.id}"]`);
        if (el) this.selectAnnotation(ann, el);
        return;
      }
    }
    this.deselectAnnotation();
  }

  hitTest(ann, pos) {
    if (ann.type === "text") {
      // Approximate hit test
      const approxW = (ann.text || "").length * ann.fontSize * 0.6;
      const approxH = ann.fontSize * 1.4;
      return pos.x >= ann.x && pos.x <= ann.x + approxW / this.zoom &&
             pos.y >= ann.y - approxH / this.zoom && pos.y <= ann.y;
    }
    if (ann.type === "draw") {
      return ann.points.some(
        (p) => Math.abs(p.x - pos.x) < 10 && Math.abs(p.y - pos.y) < 10
      );
    }
    if (ann.x !== undefined) {
      const w = ann.w || 150;
      const h = ann.h || 80;
      return pos.x >= ann.x && pos.x <= ann.x + w &&
             pos.y >= ann.y && pos.y <= ann.y + h;
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
        ann.points = origPoints.map((p) => ({
          x: p.x + dx,
          y: p.y + dy,
        }));
      }
      this.renderAnnotations();
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ─── Text Input ────────────────────────────────────
  createTextInput(pos, opts) {
    const z = this.zoom;
    const wrapper = this.els["canvas-wrapper"];

    // Remove existing text inputs
    wrapper.querySelectorAll(".canvas-text-input").forEach((el) => el.remove());

    const input = document.createElement("textarea");
    input.className = "canvas-text-input";
    input.style.left = pos.x * z + "px";
    input.style.top = pos.y * z + "px";
    input.style.fontSize = (opts.fontSize || 16) * z + "px";
    input.style.fontFamily = opts.font || "Helvetica";
    input.style.color = opts.color || "#000";
    input.style.fontWeight = opts.bold ? "bold" : "normal";
    input.style.fontStyle = opts.italic ? "italic" : "normal";

    wrapper.appendChild(input);
    input.focus();

    const commit = () => {
      const text = input.value.trim();
      if (text) {
        this.addAnnotation({
          type: "text",
          page: this.currentPage,
          x: pos.x,
          y: pos.y + (opts.fontSize || 16),
          text,
          fontSize: opts.fontSize || 16,
          font: opts.font || "Helvetica",
          color: opts.color || "#000",
          bold: opts.bold || false,
          italic: opts.italic || false,
        });
        this.renderAnnotations();
      }
      input.remove();
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        input.remove();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
    });
  }

  // ─── Image Upload ──────────────────────────────────
  handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const maxW = 300;
        const scale = img.width > maxW ? maxW / img.width : 1;
        this.addAnnotation({
          type: "image",
          page: this.currentPage,
          x: 50,
          y: 50,
          w: img.width * scale,
          h: img.height * scale,
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

  // ─── Signature ─────────────────────────────────────
  initSignCanvas() {
    const canvas = this.els["sign-canvas"];
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    let drawing = false;
    canvas.onmousedown = (e) => {
      drawing = true;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    };
    canvas.onmousemove = (e) => {
      if (!drawing) return;
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
    };
    canvas.onmouseup = () => (drawing = false);
    canvas.onmouseleave = () => (drawing = false);

    this.signDataUrl = null;
    this.els["sign-text"].value = "";
    this.els["sign-preview"].textContent = "";
    this.els["sign-upload-preview"].innerHTML = "";
  }

  clearSignCanvas() {
    const canvas = this.els["sign-canvas"];
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      const canvas = this.els["sign-canvas"];
      dataUrl = canvas.toDataURL("image/png");
    } else if (activeTab === "type") {
      const text = this.els["sign-text"].value.trim();
      if (!text) return alert("Type your signature first.");
      // Create canvas with text
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 100;
      const ctx = c.getContext("2d");
      ctx.font = "36px 'Segoe Script', 'Brush Script MT', cursive";
      ctx.fillStyle = "#000";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 10, 50);
      dataUrl = c.toDataURL("image/png");
    } else if (activeTab === "upload") {
      dataUrl = this.signDataUrl;
    }

    if (!dataUrl) return alert("Create a signature first.");

    this.addAnnotation({
      type: "signature",
      page: this.currentPage,
      x: 100,
      y: 100,
      w: 200,
      h: 80,
      dataUrl,
    });
    this.renderAnnotations();
    this.closeModal("sign-modal");
    this.setTool("select");
  }

  // ─── Link ──────────────────────────────────────────
  applyLink() {
    const url = this.els["link-url"].value.trim();
    if (!url) return alert("Enter a URL.");
    if (!this.linkPosition) return;

    this.addAnnotation({
      type: "link",
      page: this.currentPage,
      x: this.linkPosition.x,
      y: this.linkPosition.y,
      w: 150,
      h: 30,
      url,
    });
    this.renderAnnotations();
    this.closeModal("link-modal");
  }

  // ─── Note ──────────────────────────────────────────
  applyNote() {
    const text = this.els["note-text"].value.trim();
    if (!text) return alert("Type a note.");
    if (!this.notePosition) return;

    this.addAnnotation({
      type: "note",
      page: this.currentPage,
      x: this.notePosition.x,
      y: this.notePosition.y,
      text,
    });
    this.renderAnnotations();
    this.closeModal("note-modal");
  }

  // ─── Modal Helpers ─────────────────────────────────
  openModal(id) {
    this.els[id].classList.remove("hidden");
  }

  closeModal(id) {
    this.els[id].classList.add("hidden");
  }

  // ─── History (Undo/Redo) ───────────────────────────
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
      if (pageAnns) {
        const idx = pageAnns.indexOf(action.annotation);
        if (idx !== -1) pageAnns.splice(idx, 1);
      }
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
      if (pageAnns) {
        const idx = pageAnns.indexOf(action.annotation);
        if (idx !== -1) pageAnns.splice(idx, 1);
      }
    }

    this.undoStack.push(action);
    this.renderAnnotations();
    this.updateHistoryButtons();
  }

  updateHistoryButtons() {
    this.els["btn-undo"].disabled = this.undoStack.length === 0;
    this.els["btn-redo"].disabled = this.redoStack.length === 0;
  }

  // ─── Keyboard Shortcuts ────────────────────────────
  onKeyDown(e) {
    // Don't trigger shortcuts when typing in inputs
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.contentEditable === "true") {
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      if (e.key === "z") {
        e.preventDefault();
        this.undo();
      } else if (e.key === "y" || (e.shiftKey && e.key === "z")) {
        e.preventDefault();
        this.redo();
      }
      return;
    }

    const toolKeys = {
      v: "select", t: "text", i: "image", d: "draw",
      h: "highlight", w: "whiteout", s: "shape",
      g: "sign", l: "link", n: "note",
    };

    if (toolKeys[e.key]) {
      this.setTool(toolKeys[e.key]);
    }

    if (e.key === "Delete" || e.key === "Backspace") {
      if (this.selectedAnnotation && this.tool === "select") {
        this.removeAnnotation(this.selectedAnnotation);
        this.selectedAnnotation = null;
        this.renderAnnotations();
      }
    }

    if (e.key === "+" || e.key === "=") this.setZoom(this.zoom + 0.25);
    if (e.key === "-") this.setZoom(this.zoom - 0.25);
  }

  // ─── Download PDF ──────────────────────────────────
  async downloadPDF() {
    const btn = this.els["btn-download"];
    btn.textContent = "Generating...";
    btn.disabled = true;

    try {
      const pdfDoc = await PDFLib.PDFDocument.load(this.pdfBytes);
      const helveticaFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
      const timesFont = await pdfDoc.embedFont(PDFLib.StandardFonts.TimesRoman);
      const courierFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Courier);

      const fontMap = {
        Helvetica: helveticaFont,
        "Times New Roman": timesFont,
        Arial: helveticaFont,
        Courier: courierFont,
        Georgia: timesFont,
        Verdana: helveticaFont,
      };

      for (let pageNum = 1; pageNum <= this.totalPages; pageNum++) {
        const pageAnns = this.annotations[pageNum] || [];
        if (pageAnns.length === 0) continue;

        const page = pdfDoc.getPage(pageNum - 1);
        const { width, height } = page.getSize();

        for (const ann of pageAnns) {
          try {
            switch (ann.type) {
              case "text": {
                const font = fontMap[ann.font] || helveticaFont;
                const textY = height - ann.y;
                page.drawText(ann.text || "", {
                  x: ann.x,
                  y: textY,
                  size: ann.fontSize || 16,
                  font,
                  color: PDFLib.rgb(
                    ...this.hexToRgb(ann.color || "#000000")
                  ),
                });
                break;
              }
              case "highlight": {
                const y = height - ann.y - ann.h;
                page.drawRectangle({
                  x: ann.x,
                  y,
                  width: ann.w,
                  height: ann.h,
                  color: PDFLib.rgb(
                    ...this.hexToRgb(ann.color || "#ffeb3b")
                  ),
                  opacity: 0.35,
                });
                break;
              }
              case "whiteout": {
                const y = height - ann.y - ann.h;
                page.drawRectangle({
                  x: ann.x,
                  y,
                  width: ann.w,
                  height: ann.h,
                  color: PDFLib.rgb(1, 1, 1),
                });
                break;
              }
              case "shape": {
                const y = height - ann.y - ann.h;
                const color = PDFLib.rgb(...this.hexToRgb(ann.color || "#000000"));
                const type = ann.shapeType || "rect";
                if (type === "rect") {
                  page.drawRectangle({
                    x: ann.x, y,
                    width: ann.w, height: ann.h,
                    borderColor: color,
                    borderWidth: ann.lineWidth || 2,
                    color: ann.fill ? PDFLib.rgb(...this.hexToRgb(ann.color || "#000000")) : undefined,
                    opacity: ann.fill ? 0.2 : 1,
                  });
                } else if (type === "ellipse") {
                  page.drawEllipse({
                    x: ann.x + ann.w / 2,
                    y: y + ann.h / 2,
                    xScale: ann.w / 2,
                    yScale: ann.h / 2,
                    borderColor: color,
                    borderWidth: ann.lineWidth || 2,
                  });
                } else if (type === "line" || type === "arrow") {
                  page.drawLine({
                    start: { x: ann.startX, y: height - ann.startY },
                    end: { x: ann.endX, y: height - ann.endY },
                    thickness: ann.lineWidth || 2,
                    color,
                  });
                }
                break;
              }
              case "image":
              case "signature": {
                let image;
                if (ann.dataUrl.startsWith("data:image/png")) {
                  image = await pdfDoc.embedPng(ann.dataUrl);
                } else {
                  image = await pdfDoc.embedJpg(ann.dataUrl);
                }
                const y = height - ann.y - (ann.h || 80);
                page.drawImage(image, {
                  x: ann.x,
                  y,
                  width: ann.w || 200,
                  height: ann.h || 80,
                });
                break;
              }
              case "link": {
                const y = height - ann.y - (ann.h || 30);
                page.drawRectangle({
                  x: ann.x,
                  y,
                  width: ann.w || 150,
                  height: ann.h || 30,
                  borderColor: PDFLib.rgb(...this.hexToRgb("#5b8cff")),
                  borderWidth: 1,
                  opacity: 0.5,
                });
                // Note: pdf-lib doesn't support clickable links easily,
                // but we draw the URL text
                page.drawText(ann.url.substring(0, 30), {
                  x: ann.x + 4,
                  y: y + 10,
                  size: 10,
                  font: helveticaFont,
                  color: PDFLib.rgb(...this.hexToRgb("#5b8cff")),
                });
                break;
              }
              case "note": {
                const y = height - ann.y - 40;
                page.drawRectangle({
                  x: ann.x,
                  y,
                  width: 160,
                  height: 40,
                  color: PDFLib.rgb(1, 0.97, 0.71),
                  borderColor: PDFLib.rgb(0.95, 0.85, 0.2),
                  borderWidth: 1,
                });
                page.drawText(ann.text.substring(0, 50), {
                  x: ann.x + 6,
                  y: y + 16,
                  size: 10,
                  font: helveticaFont,
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

      const modifiedBytes = await pdfDoc.save();
      const blob = new Blob([modifiedBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "edited-document.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      alert("Error generating PDF: " + err.message);
    }

    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download PDF`;
    btn.disabled = false;
  }

  hexToRgb(hex) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return [r, g, b];
  }

  // ─── UI Updates ────────────────────────────────────
  updateUI() {
    this.els["page-info"].textContent = `${this.currentPage} / ${this.totalPages}`;
    this.els["page-nav"].textContent = `Page ${this.currentPage}`;
    this.els["zoom-level"].textContent = Math.round(this.zoom * 100) + "%";
    this.updateHistoryButtons();
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  window.editor = new OkemPDFEditor();
});
