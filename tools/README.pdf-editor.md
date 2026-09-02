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
- `vendor/pdfjs-boot.mjs` — external module that exposes pdf.js as `window.pdfjsLib` (kept out-of-line so the CSP needs no `unsafe-inline`)
- `vendor/pdf-lib/pdf-lib.min.js` — `@cantoo/pdf-lib` fork: PDFDocument, embedFont, **working** `encrypt()` (upstream `pdf-lib@1.17` silently ignores encryption options)
- `vendor/fontkit/fontkit.umd.min.js` — `@pdf-lib/fontkit@1.1.1`, TTF subset embedding
- `vendor/fonts/LiberationSans-*.ttf` — editor UI + embedded text font (not Arial; Liberation is OFL-licensed)

### fontkit ↔ pdf-lib API bridge
`@cantoo/pdf-lib` calls `subset.encode()` and expects font bytes back, but
`@pdf-lib/fontkit@1.1.1` implements `encode(stream)` — it writes into a
restructure `EncodeStream` and throws `Cannot read properties of undefined
(reading 'pos')` when called with no argument. `wrapFontkit()` in
`pdf-editor.js` proxies the fontkit instance so `encode()` drains
`encodeStream()` into a `Uint8Array`. Do not drop this shim when bumping either
library — re-verify with `okemhub_geom_e2e.py` instead.

## Known limits
- Text is added as a new layer; it does not reflow or edit existing PDF text.
- Encryption is AES-256 (V5/R6) via the fork; verified by re-opening the export
  with and without the password.
- Very large PDFs (>~500 pages) may be slow on low-end mobile — offload to desktop if needed.

## Verification
Two headless harnesses (Chromium via CDP, run against a local server):

```bash
python3 ~/.hermes/scripts/okemhub_test_server.py 8099 &   # serves repo w/ strict CSP
python3 ~/.hermes/scripts/okemhub_e2e.py 8099 fixture.pdf out.pdf   # export smoke test
python3 ~/.hermes/scripts/okemhub_geom_e2e.py 8099 fixture.pdf      # geometry proof
```

`okemhub_geom_e2e.py` places colored probe rectangles and text at known display
coordinates, exports, re-renders the export with pdf.js, and samples pixels /
reads glyph origins back. It asserts positions on a 3-page fixture that mixes
rotation 0, rotation 90, and a non-zero MediaBox origin.
