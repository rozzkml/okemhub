# okem tools

Every okem tool lives here as a standalone HTML page, served from the okem
base repo on Vercel. Keep tools client-side and dependency-light.

## Convention

- Each tool = one `*.html` file in this folder (can pull shared `../style.css`).
- Add the tool to the grid in `../script.js` by pushing an entry to `projects[]`:
  - `status: "live"` -> set `url` to the internal path (e.g. `tools/pdf-editor.html`)
  - `status: "soon"` -> shows a "Soon" badge, not clickable
- External links (GitHub, etc.) open in a new tab automatically.
