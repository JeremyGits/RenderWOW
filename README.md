# RenderWOW

A fast, offline-friendly **Mermaid renderer** with a floating Monaco editor over an “endless” canvas. Pan, zoom, fit-to-screen, export to SVG/PNG, and share diagrams via a custom deeplink URL.

Paste Mermaid → press **Ctrl/⌘ + S** → get a polished, pannable diagram you can export or share.

---

## Features

- Floating **Monaco** editor over a full-window canvas (design-tool vibe)
- **Pan & Zoom** (drag to pan; **Ctrl/⌘ + wheel** to zoom at cursor)
- **Fit** to viewport and **Reset** view
- **Endless canvas** that expands as you approach edges
- **Beautiful defaults** (rounded cards, soft shadows, subtle grid, readable edge chips)
- **Export**: SVG/PNG (native dialogs in Electron; browser fallback)
- **Share**: `renderwow://` deeplink with compressed Mermaid payload
- **Offline vendors**: ships Mermaid + Monaco locally
- QoL: word-wrap, quick **Templates**, **Format** button, dark/light toggle

---

## Project Layout

    public/
      index.html
      assets/
        main.js         ← UI/controls, pan/zoom, fit, export, share
        pipeline.js     ← preProcess (sanitize), postProcess (grid, tints, label chips)
        styles.css      ← layout + theme + Mermaid polish
        theme-wow.css   ← optional Eraser-ish theme presets (reference)
      vendor/
        mermaid/        ← local mermaid.min.js
        lz-string/      ← local lz-string
        monaco/         ← local Monaco (loader + workers)

    electron/
      main.js           ← Electron main process (CSP, deeplink, save dialogs)
      preload.js        ← Safe IPC exposure as window.RW.*

    package.json

> Your repo may also include helpers like `copy-monaco.js`. The above are the core files.

---

## Quick Start

### Prereqs
- Node.js 18+
- macOS / Windows / Linux supported

### Install

    npm install

### Run (Electron app)

    npm start
    # or if no script:
    npx electron .

### Run in a browser (no Electron)

Any static server works:

    npx http-server public -p 5173
    # then open http://localhost:5173

> Opening `public/index.html` straight from `file://` also works because vendors are local and a permissive CSP is set, but a tiny HTTP server is generally smoother.

---

## Usage

- **Type / paste Mermaid** in the left panel
- Press **Ctrl/⌘ + S** or click **Render**
- **Drag** the canvas to pan; **Ctrl/⌘ + wheel** to zoom at the cursor
- **Fit** centers/zooms to the viewport; **Reset** restores a sensible view
- Use **Templates…** to seed common diagram types
- **Format** trims trailing spaces and normalizes newlines

### Keyboard & Mouse

- **Ctrl/⌘ + S**: Render
- **Drag** (right pane): Pan
- **Ctrl/⌘ + Wheel**: Zoom at cursor
- **+ / −** buttons: Zoom In/Out
- **Fit**: Fit diagram to viewport (keeps padding)

---

## Export

- **Export SVG**: Native save dialog in Electron or file download in browser
- **Export PNG**: Renders the SVG to a canvas at 2× and saves a PNG  
  Background color matches the current theme.

---

## Share Links

Click **Copy Share URL** to copy a deeplink like:

    renderwow://local#t=1&c=<compressed>

- `t`: theme (1 = dark, 0 = light)
- `c`: Mermaid content compressed via LZ-String

The custom protocol is registered by the Electron app on first run.  
For web-only sharing, you can also pack/unpack content via `LZString` and append it to a regular `index.html#…` hash if you add a small router.

---

## Theming & Polish

Most of the “pretty by default” look comes from:

- `assets/styles.css` (core layout + diagram polish)
- `assets/pipeline.js` → `postProcess(svg)`:
  - Injects a subtle background grid (`<rect.rw-grid>`)
  - Adds readable “chips” behind edge labels
  - Optionally tints clusters/groups (UE-blueprint style comment boxes)

Tweak variables at the top of `styles.css`, for example:

    :root{
      --bg: #0b1220;     /* window background */
      --text: #dfe7ff;   /* label color */
      --accent: #93c5fd; /* hover/focus accent */
      --stroke: #22395f; /* node border */
      /* ... */
    }

There’s an extra preset file **`theme-wow.css`** that captures an Eraser-ish vibe (kept as a reference; not required).

---

## Mermaid Tips

- Multi-line labels: use HTML like `A["Line 1<br/>Line 2"]`
- Groups: `subgraph My Group ... end` (we tint clusters in post-process)
- Edge label readability: we draw a rounded rect “chip” behind labels

If Mermaid throws a parsing error, check for:
- Invisible/encoded characters (pasted smart quotes, weird spaces)
- Missing `end` for a `subgraph`
- Unescaped brackets/parentheses inside labels

**Fix hidden characters** by pasting into a plain-text editor and re-typing quotes/slashes.  
The error `got 'UNICODE_TEXT'` usually means a stray smart quote or non-ASCII symbol slipped in.

---

## Security Notes

- `index.html` sets a CSP that allows local scripts, workers, and data/blob URLs (for Monaco workers & SVG/PNG export).
- Electron uses `preload.js` to expose a minimal, safe API (`window.RW.saveSvg`, `window.RW.savePng`).

---

## Roadmap / Ideas

- Export presets (transparent PNG, 1×/2×/4× scale)
- Multi-tab docs & autosave
- Import from URL (`?c=` packed content)
- More chip styles + palette system
- Snaplines / align tools

---

## License

MIT — do whatever, just keep the copyright notice.

---

## Acknowledgements

- Mermaid — https://mermaid.js.org/
- Monaco Editor — https://microsoft.github.io/monaco-editor/
- Electron — https://www.electronjs.org/
- LZ-String — https://pieroxy.net/blog/pages/lz-string/index.html
