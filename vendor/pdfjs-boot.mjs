// Bridges the pdf.js ES module into a global for the classic-script editor.
//
// Why a separate file instead of an inline <script type="module">:
// an inline module would require either 'unsafe-inline' or a per-deploy nonce/hash
// in the Content-Security-Policy. Keeping it external lets the CSP stay at
// `script-src 'self'` with no escape hatches.
//
// Ordering note: module scripts are deferred, so this executes AFTER the classic
// scripts (theme.js, pdf-editor.js) have parsed but BEFORE DOMContentLoaded fires.
// pdf-editor.js only touches window.pdfjsLib from its DOMContentLoaded handler,
// so the global is guaranteed to be present by the time it is read.
import * as pdfjsLib from "./pdfjs/pdf.min.mjs";

window.pdfjsLib = pdfjsLib;
