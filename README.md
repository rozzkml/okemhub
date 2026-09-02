# okemhub

A collection of free, client-side web tools. No accounts, no uploads — every
tool runs entirely in your browser.

Static site (HTML/CSS/JS), deployed via Vercel GitHub sync.

## Structure
- `index.html` — tool hub (lists all tools)
- `style.css` — shared theme (dark/light) + layout
- `theme.js` — shared theme toggle + footer year
- `script.js` — tool list + card rendering
- `tools/` — individual tool pages

## Tools
- Text Utils — case change + word/char/line count
- JSON Formatter — pretty-print, minify, validate
- Base64 — UTF-8 safe encode/decode
- UUID Generator — random UUID v4 (Web Crypto)
- Password Generator — strong random passwords (Web Crypto)
- URL Encode / Decode
- Color Converter — HEX ⇄ RGB

## Local preview
Open `index.html` directly, or serve it:

```bash
python -m http.server 8080
# then visit http://localhost:8080
```

## Deploy
Connect this repo to Vercel (Framework Preset: "Other" / static). No build step required.
