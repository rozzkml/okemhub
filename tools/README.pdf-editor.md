# PDF Editor — okemhub/tools/pdf-editor.html

Browser-only PDF editor. No upload, no server, no telemetry. Everything runs client-side.

## Run it
Serve the repo over HTTP (ES modules + workers need a real origin, not `file://`):

```bash
python3 -m http.server 8099
# open http://localhost:8099/tools/pdf-editor.html
```

On Vercel it's auto-deployed from the repo root (`vercel.json` maps `/` → `index.html`).

## Features
- **Open**: drag-drop or file picker. Reads the original PDF via pdf.js, keeps its bytes for lossless re-save.
- **Text**: click to place a text box. Font = Liberation Sans (subset-embedded into the output, so it renders on any machine). Bold / italic / size / color.
- **Highlight**: drag a rectangle. Semi-transparent yellow overlay.
- **Draw**: freehand pen (configurable color + width).
- **Erase / Undo / Redo**: per-page annotation history.
- **Rotate**: 0/90/180/270 per page. Annotation geometry is transformed so it stays glued to the page under rotation.
- **Encrypt**: optional user password + permissions (copy/print) on export, via pdf-lib `encrypt`.
- **Download**: merges annotations onto the original PDF and saves. Original content is preserved; only annotations are added.

## How it works
1. pdf.js renders each page to a canvas (with full CJK cmap + standard fonts bundled in `vendor/pdfjs`).
2. Annotations are stored in page space (PDF user units), independent of zoom/rotation.
3. On export, pdf-lib loads the original `pdfBytes` and draws each annotation as a real PDF object (text → embedded subset font; highlight/draw → vector). The result is a valid, re-openable PDF.

## Privacy
- Files never leave the browser. No network calls except loading bundled local assets.
- No cookies, no analytics, no external CDNs.

## Assets (vendored, pinned)
- `vendor/pdfjs/` — pdf.js 4.10.38 (worker + cmaps + standard fonts)
- `vendor/pdf-lib/pdf-lib.min.js` — PDFDocument, embedFont, encrypt
- `vendor/fontkit/fontkit.umd.min.js` — TTF subset embedding
- `vendor/fonts/LiberationSans-*.ttf` — editor UI + embedded text font (not Arial; Liberation is OFL-licensed)

## Known limits
- Text is added as a new layer; it does not reflow or edit existing PDF text.
- Encryption uses RC4/AES as supported by pdf-lib; for high-security needs use `qpdf`/`pdftk` separately.
- Very large PDFs (>~500 pages) may be slow on low-end mobile — offload to desktop if needed.
