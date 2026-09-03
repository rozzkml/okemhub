/*
 * pdf-text-editor.core.js
 * Real, offline PDF TEXT editing engine (no server, no CDN at runtime).
 * Built on pdf-lib. Exposes a pure API usable from both the browser and Node tests.
 *
 * What this does:
 *   - addText(page, {x,y,text,size,color,font})  -> write NEW text at a position
 *   - coverRect(page, rectPdf, colorHex)          -> paint a filled box (white = hide/delete appearance, black = redact)
 *
 * Honest limitation: PDF stores text as positioned glyphs, not editable strings.
 * True in-place glyph editing needs content-stream surgery pdf-lib doesn't do.
 * The standard, robust approach used by many free editors is:
 *   "delete"  = cover the region with a white box (text hidden visually)
 *   "edit"    = cover old text + draw new text on top
 *   "add"     = draw new text anywhere
 */
(function (global) {
  const PDFLib =
    global.PDFLib ||
    (typeof require !== "undefined" ? require("../vendor/pdf-lib/pdf-lib.min.js") : null);
  if (!PDFLib) throw new Error("pdf-lib not found for pdf-text-editor core");
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  // pdf-lib needs `fontkit` registered to embed custom (TTF) fonts.
  // In this pdf-lib build `registerFontkit` is an instance method, so it
  // must be called on the document instance (not the class).
  function findFontkit() {
    if (typeof window !== "undefined" && window.fontkit) return window.fontkit;
    if (typeof require === "function") {
      try { return require("../vendor/fontkit.umd.min.js"); } catch (e) { /* noop */ }
    }
    return null;
  }

  const FONTS = {
    Helvetica: StandardFonts.Helvetica,
    "Helvetica-Bold": StandardFonts.HelveticaBold,
    "Times-Roman": StandardFonts.TimesRoman,
    Courier: StandardFonts.Courier,
  };

  // Real TTF fonts (embedded, subsetted) so users can pick a proper typeface
  // with full glyph coverage (incl. accented/non-Latin-1 chars) instead of the
  // 14 standard PDF fonts (which only cover Latin-1).
  // `file` is relative to the tool page; resolved at embed time.
  const TTF_FONTS = {
    "Serif": { file: "../vendor/fonts/LiberationSerif-Regular.ttf" },
    "Serif Bold": { file: "../vendor/fonts/LiberationSerif-Bold.ttf" },
    "Sans": { file: "../vendor/fonts/LiberationSans-Regular.ttf" },
    "Sans Bold": { file: "../vendor/fonts/LiberationSans-Bold.ttf" },
    "Mono": { file: "../vendor/fonts/LiberationMono-Regular.ttf" },
    "Mono Bold": { file: "../vendor/fonts/LiberationMono-Bold.ttf" },
  };

  // Single source of truth for the UI dropdown.
  // Each entry: { label, kind: 'standard'|'ttf', key }
  const FONT_LIST = [
    { label: "Helvetica", kind: "standard", key: "Helvetica" },
    { label: "Helvetica Bold", kind: "standard", key: "Helvetica-Bold" },
    { label: "Times Roman", kind: "standard", key: "Times-Roman" },
    { label: "Courier", kind: "standard", key: "Courier" },
    { label: "Serif (TTF)", kind: "ttf", key: "Serif" },
    { label: "Serif Bold (TTF)", kind: "ttf", key: "Serif Bold" },
    { label: "Sans (TTF)", kind: "ttf", key: "Sans" },
    { label: "Sans Bold (TTF)", kind: "ttf", key: "Sans Bold" },
    { label: "Mono (TTF)", kind: "ttf", key: "Mono" },
    { label: "Mono Bold (TTF)", kind: "ttf", key: "Mono Bold" },
  ];

  // Resolve a TTF file to raw bytes, in both browser (fetch) and Node (fs).
  async function loadFontBytes(file) {
    if (typeof window !== "undefined" && typeof fetch !== "undefined") {
      // Browser: `file` is relative to the tool page (tools/), so it resolves
      // correctly (e.g. "../vendor/fonts/..." -> vendor/fonts/...).
      const res = await fetch(file);
      if (!res.ok) throw new Error("font fetch failed: " + file + " (" + res.status + ")");
      return new Uint8Array(await res.arrayBuffer());
    }
    if (typeof require === "function") {
      // Node / test harness
      const fs = require("fs");
      const path = require("path");
      // file is relative to the tool page (tools/); resolve from this module's dir.
      const abs = path.resolve(__dirname, file);
      return new Uint8Array(fs.readFileSync(abs));
    }
    throw new Error("no font loader available for this environment");
  }

  function hexToRgb(hex) {
    hex = String(hex || "#000000").replace("#", "");
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    const n = parseInt(hex, 16);
    if (isNaN(n)) return { r: 0, g: 0, b: 0 };
    return {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
    };
  }

  // Convert a CSS-pixel rect (top-left origin, as drawn on a pdf.js canvas)
  // into pdf-lib point coords (bottom-left origin).
  function cssRectToPdf(rect, viewport, scale) {
    return {
      x: rect.x / scale,
      y: (viewport.height - (rect.y + rect.h)) / scale,
      width: rect.w / scale,
      height: rect.h / scale,
    };
  }
  function cssPointToPdf(pt, viewport, scale) {
    return {
      x: pt.x / scale,
      y: (viewport.height - pt.y) / scale,
    };
  }

  async function loadPdf(bytes) {
    return await PDFDocument.load(bytes);
  }

  // Cache embedded TTF fonts per-doc so repeated addText calls reuse one embed.
  const _ttfCache = new WeakMap();
  async function embedTtf(doc, key) {
    let cache = _ttfCache.get(doc);
    if (!cache) { cache = {}; _ttfCache.set(doc, cache); }
    if (cache[key]) return cache[key];
    const spec = TTF_FONTS[key];
    if (!spec) throw new Error("unknown TTF font: " + key);
    const bytes = await loadFontBytes(spec.file);
    const font = await doc.embedFont(bytes, { subset: true });
    cache[key] = font;
    return font;
  }

  async function addText(doc, pageIndex, opts) {
    // Register fontkit (instance method in this pdf-lib build) once per doc.
    if (!doc.__fontkitReady) {
      const fk = findFontkit();
      if (fk) { try { doc.registerFontkit(fk); } catch (e) { /* noop */ } }
      doc.__fontkitReady = true;
    }
    const page = doc.getPages()[pageIndex];
    let font;
    if (TTF_FONTS[opts.font]) {
      try {
        font = await embedTtf(doc, opts.font);
      } catch (e) {
        // Fallback to a standard font if the TTF can't be loaded (offline/path issue).
        console.warn("TTF embed failed, falling back to Helvetica:", e.message);
        font = await doc.embedFont(FONTS["Helvetica"]);
      }
    } else {
      const fontKey = FONTS[opts.font] ? opts.font : "Helvetica";
      font = await doc.embedFont(FONTS[fontKey]);
    }
    const c = hexToRgb(opts.color);
    page.drawText(opts.text, {
      x: opts.x,
      y: opts.y,
      size: opts.size || 12,
      font,
      color: rgb(c.r, c.g, c.b),
    });
  }

  async function coverRect(doc, pageIndex, rectPdf, colorHex) {
    const page = doc.getPage(pageIndex);
    const c = hexToRgb(colorHex);
    page.drawRectangle({
      x: rectPdf.x,
      y: rectPdf.y,
      width: rectPdf.width,
      height: rectPdf.height,
      color: rgb(c.r, c.g, c.b),
    });
  }

  // editsByPage: { [pageIndex]: [ {type:'text', x,y,text,size,color,font}
  //                                 | {type:'rect', rect:{x,y,width,height}, color} ] }
  async function applyEdits(doc, editsByPage) {
    for (const [piStr, edits] of Object.entries(editsByPage)) {
      const pi = parseInt(piStr, 10);
      for (const e of edits) {
        if (e.type === "text") {
          await addText(doc, pi, e);
        } else if (e.type === "rect") {
          await coverRect(doc, pi, e.rect, e.color);
        }
      }
    }
    return doc;
  }

  async function save(doc) {
    return await doc.save();
  }

  const Api = {
    loadPdf,
    addText,
    coverRect,
    applyEdits,
    save,
    cssRectToPdf,
    cssPointToPdf,
    hexToRgb,
    FONTS,
    FONT_LIST,
    TTF_FONTS,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = Api;
  global.PdfTextEditorCore = Api;
})(typeof window !== "undefined" ? window : globalThis);
