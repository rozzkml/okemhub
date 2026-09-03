/*
 * pdf-text-editor.test.js
 * Real tests for the text editing engine (pdf-lib, offline).
 * Run: node tools/pdf-text-editor.test.js
 */
const fs = require("fs");
const path = require("path");
const Core = require("./pdf-text-editor.core.js");
const { PDFDocument } = require("../vendor/pdf-lib/pdf-lib.min.js");

const PDF_PATH = path.join(__dirname, "..", "vendor", "sample.pdf");
const tmp = path.join(__dirname, "_te_out.pdf");
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log("  ✅ " + name); }
  else { fail++; console.log("  ❌ " + name); }
}
function isPdf(bytes) {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

(async () => {
  const bytes = new Uint8Array(fs.readFileSync(PDF_PATH));
  console.log("PDF Text Editor Core Tests:");

  const doc = await Core.loadPdf(bytes);

  // 1. addText -> valid PDF, bytes grow, page count preserved
  await Core.addText(doc, 0, { x: 50, y: 700, text: "INJECTED TEXT", size: 20, color: "#ff0000", font: "Helvetica-Bold" });
  const out1 = await Core.save(doc);
  ok("addText produces valid PDF", isPdf(out1));
  ok("addText increases byte size", out1.length > bytes.length);
  const d1 = await PDFDocument.load(out1);
  ok("addText preserves page count", d1.getPageCount() === 1);

  // 2. coverRect (white hide) -> valid PDF, bytes grow
  const doc2 = await Core.loadPdf(bytes);
  await Core.coverRect(doc2, 0, { x: 100, y: 100, width: 200, height: 50 }, "#ffffff");
  const out2 = await Core.save(doc2);
  ok("coverRect (white) valid PDF", isPdf(out2));
  ok("coverRect increases byte size", out2.length > bytes.length);

  // 3. coverRect (black redact)
  const doc3 = await Core.loadPdf(bytes);
  await Core.coverRect(doc3, 0, { x: 10, y: 10, width: 80, height: 30 }, "#000000");
  const out3 = await Core.save(doc3);
  ok("coverRect (black) valid PDF", isPdf(out3));

  // 4. coordinate conversion math (css -> pdf points)
  const viewport = { width: 300, height: 600 }; // scale handled separately
  const scale = 1.5;
  const pt = Core.cssPointToPdf({ x: 150, y: 150 }, viewport, scale);
  ok("cssPointToPdf x scaled", Math.abs(pt.x - 100) < 1e-6);
  ok("cssPointToPdf y flipped (bottom-left origin)", Math.abs(pt.y - ((600 - 150) / 1.5)) < 1e-6);

  const rect = Core.cssRectToPdf({ x: 30, y: 60, w: 90, h: 120 }, viewport, scale);
  ok("cssRectToPdf x scaled", Math.abs(rect.x - 20) < 1e-6);
  ok("cssRectToPdf y flipped", Math.abs(rect.y - ((600 - (60 + 120)) / 1.5)) < 1e-6);
  ok("cssRectToPdf width scaled", Math.abs(rect.width - 60) < 1e-6);
  ok("cssRectToPdf height scaled", Math.abs(rect.height - 80) < 1e-6);

  // 5. hexToRgb
  const c = Core.hexToRgb("#ff0000");
  ok("hexToRgb red", Math.abs(c.r - 1) < 1e-6 && c.g === 0 && c.b === 0);
  const c3 = Core.hexToRgb("#abc");
  ok("hexToRgb shorthand", Math.abs(c3.r - 0xaa / 255) < 1e-6);

  // 6. applyEdits batch
  const doc4 = await Core.loadPdf(bytes);
  await Core.applyEdits(doc4, {
    0: [
      { type: "text", x: 40, y: 500, text: "A", size: 12, color: "#000000", font: "Helvetica" },
      { type: "rect", rect: { x: 0, y: 0, width: 50, height: 50 }, color: "#ffffff" },
    ],
  });
  const out4 = await Core.save(doc4);
  ok("applyEdits batch valid PDF", isPdf(out4));
  ok("applyEdits batch bytes grow", out4.length > bytes.length);

  fs.writeFileSync(tmp, Buffer.from(out4));
  ok("applyEdits output written to disk", fs.existsSync(tmp));
  fs.unlinkSync(tmp);

  console.log(`\n${fail === 0 ? "ALL PDF TEXT EDITOR CORE TESTS PASSED ✓" : "SOME TESTS FAILED ✗"} (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("TEST ERROR:", e); process.exit(1); });
