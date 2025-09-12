// public/assets/pipeline.js
/**
 * RenderWOW pipeline
 * - preProcess: normalize + ASCII sanitize + ensure %%init + spacing helpers
 * - postProcess: pad viewBox, add subtle grid, auto-tint clusters, hard-force ER dark skin, expose svgkit
 */

export function preProcess(input) {
  let code = String(input ?? "");

  // normalize newlines
  code = code.replace(/\r\n/g, "\n");

  // ASCII sanitize (smart quotes/dashes, NBSP, ligatures)
  code = code
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    .replace(/[^\S\n]+$/gm, "");

  // ensure an init block
  const hasInit = /^\s*%%\{\s*init:/m.test(code);
  const initBlock =
    '%%{init: { "theme": "base", "securityLevel":"loose", "maxTextSize": 90000, "themeVariables": {\n' +
    '  "fontFamily": "Inter, ui-sans-serif, system-ui",\n' +
    '  "primaryColor": "#0f1b34", "primaryBorderColor": "#22395f", "primaryTextColor": "#dfe7ff"\n' +
    '} } }%%\n';
  if (!hasInit) code = initBlock + code;

  // spacing helper
  code = code.replace(/^\s*%%gap%%\s*$/gm, () => `_gap${Date.now().toString().slice(-4)}([ ]):::invis`);

  return code;
}

export function postProcess(svgEl) {
  if (!svgEl) return;
  const ns = svgEl.namespaceURI;

  // root group – wrap existing contents into <g.mmd-root>
  let root = svgEl.querySelector("g.mmd-root");
  if (!root) {
    root = document.createElementNS(ns, "g");
    root.setAttribute("class", "mmd-root");
    while (svgEl.firstChild) root.appendChild(svgEl.firstChild);
    svgEl.appendChild(root);
  }

  // padded viewBox
  try {
    const pad = 24;
    const bb = root.getBBox();
    const vbX = bb.x - pad;
    const vbY = bb.y - pad;
    const vbW = Math.max(bb.width + pad * 2, 10);
    const vbH = Math.max(bb.height + pad * 2, 10);
    svgEl.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
  } catch {}

  // subtle grid
  if (!svgEl.querySelector("defs #rwGrid")) {
    const defs = svgEl.querySelector("defs") || svgEl.insertBefore(document.createElementNS(ns, "defs"), svgEl.firstChild);
    const p = document.createElementNS(ns, "pattern");
    p.setAttribute("id", "rwGrid");
    p.setAttribute("width", "24");
    p.setAttribute("height", "24");
    p.setAttribute("patternUnits", "userSpaceOnUse");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", "M 24 0 L 0 0 0 24");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#243250");
    path.setAttribute("stroke-width", "0.5");
    p.appendChild(path);
    defs.appendChild(p);
  }
  if (!svgEl.querySelector("rect.rw-grid")) {
    const vb = (svgEl.getAttribute("viewBox") || "0 0 0 0").split(/\s+/).map(Number);
    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("class", "rw-grid");
    bg.setAttribute("x", vb[0] || 0);
    bg.setAttribute("y", vb[1] || 0);
    bg.setAttribute("width", vb[2] || 0);
    bg.setAttribute("height", vb[3] || 0);
    bg.setAttribute("fill", "url(#rwGrid)");
    svgEl.insertBefore(bg, svgEl.firstChild);
  }

  // hard-force ER dark skin (inline style + attributes so exports match)
  applyErDarkSkin(svgEl);

  // auto-tint clusters by label keywords
  try {
    const clusters = svgEl.querySelectorAll("g.cluster");
    clusters.forEach((g) => {
      const label = (g.querySelector("text")?.textContent || "").toLowerCase();
      let tint = null;
      if (label.includes("middleware")) tint = "g-gold";
      else if (label.includes("router")) tint = "g-sky";
      else if (label.includes("service")) tint = "g-emerald";
      else if (label.includes("provider")) tint = "g-purple";
      else if (label.includes("mongo") || label.includes("data")) tint = "g-rose";
      if (tint) g.classList.add(tint, "rw-tinted");
    });
  } catch {}

  // chip-y edge labels
  svgEl.querySelectorAll("g.edgeLabel").forEach((g) => g.classList.add("rw-chip"));

  attachApi(svgEl);
}

/* ---------- ER dark skin (FORCED) ---------- */

function applyErDarkSkin(svg) {
  const ns = svg.namespaceURI;

  // Is this an ER diagram? (detect by typical classes)
  const hasEr = svg.querySelector(
    ".er, g[class*='er']," +
      "rect.entityBox, rect.attributeBoxOdd, rect.attributeBoxEven, rect.titleBox, rect.headerBox, rect.labelBox, rect.box"
  );
  if (!hasEr) return;

  // 1) Embed a style tag (helps in browser view)
  if (!svg.querySelector("style[data-rw-er]")) {
    const st = document.createElementNS(ns, "style");
    st.setAttribute("data-rw-er", "");
    st.textContent = `
      .er .titleBox, .er .attributeBoxOdd, .er .attributeBoxEven,
      .er .entityBox, .er .box, .er rect {
        fill: #0f172a !important;
        stroke: #38bdf8 !important;
      }
      .er path, .er line, .er .relationshipLine {
        stroke: #38bdf8 !important;
      }
      .er text, .er tspan {
        fill: #e2e8f0 !important;
      }
    `;
    const first = svg.firstChild;
    first ? svg.insertBefore(st, first) : svg.appendChild(st);
  }

  // 2) FORCE inline styles on shapes (dominates everything + survives export)
  const FILL = "#0f172a";
  const STROKE = "#38bdf8";
  const TEXT = "#e2e8f0";

  const rects = svg.querySelectorAll(
    "rect.entityBox, rect.attributeBoxOdd, rect.attributeBoxEven, rect.titleBox, rect.headerBox, rect.labelBox, rect.box, " +
      ".er rect"
  );
  rects.forEach((r) => {
    r.setAttribute("fill", FILL);
    r.setAttribute("stroke", STROKE);
    // augment existing inline style (don’t nuke other props)
    const s = r.getAttribute("style") || "";
    const next = mergeInlineStyle(s, { fill: `${FILL} !important`, stroke: `${STROKE} !important` });
    r.setAttribute("style", next);
  });

  const lines = svg.querySelectorAll(".er path, .er line, .er polyline, .er polygon");
  lines.forEach((el) => {
    el.setAttribute("stroke", STROKE);
    const s = el.getAttribute("style") || "";
    const next = mergeInlineStyle(s, { stroke: `${STROKE} !important` });
    el.setAttribute("style", next);
  });

  const texts = svg.querySelectorAll(".er text, .er tspan");
  texts.forEach((t) => {
    t.setAttribute("fill", TEXT);
    const s = t.getAttribute("style") || "";
    const next = mergeInlineStyle(s, { fill: `${TEXT} !important` });
    t.setAttribute("style", next);
  });
}

function mergeInlineStyle(styleText, kv) {
  // parse inline style into a map
  const map = {};
  styleText.split(";").forEach((pair) => {
    const [k, v] = pair.split(":");
    if (!k || !v) return;
    map[k.trim()] = v.trim();
  });
  Object.entries(kv).forEach(([k, v]) => (map[k] = v));
  return Object.entries(map)
    .map(([k, v]) => `${k}: ${v}`)
    .join("; ");
}

/* ---------- dev helpers api ---------- */

function attachApi(svgEl) {
  const kit = createSvgKit(svgEl);
  try {
    if (window.RW?.setSvgKit) window.RW.setSvgKit(kit);
  } catch {}
  try {
    window.__rw = window.__rw || {};
    window.__rw.svgkit = kit;
  } catch {}
}

function createSvgKit(svg) {
  return {
    el: svg,
    bbox() {
      try {
        return (svg.querySelector("g.mmd-root") || svg).getBBox();
      } catch {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
    },
    toSvgString() {
      return new XMLSerializer().serializeToString(svg);
    },
    async toPngDataUrl(scale = 2, bg = getComputedStyle(document.body).backgroundColor || "#0b1220") {
      const xml = new XMLSerializer().serializeToString(svg);
      const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas");
          c.width = img.width * scale;
          c.height = img.height * scale;
          const ctx = c.getContext("2d");
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/png"));
        };
        img.src = src;
      });
    },
  };
}
