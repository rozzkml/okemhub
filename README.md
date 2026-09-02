# rozzkml

Personal site — free functions, fewer gatekeepers.

Static site (HTML/CSS/JS), deployed via Vercel GitHub sync.

## Structure
- `index.html` — page markup
- `style.css` — theme (dark/light) + layout
- `script.js` — theme toggle, footer year, project cards

## Local preview
Open `index.html` directly, or serve it:

```bash
python -m http.server 8080
# then visit http://localhost:8080
```

## Deploy
Connect this repo to Vercel (Framework Preset: "Other" / static). No build step required.
