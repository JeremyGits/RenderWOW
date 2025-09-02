// public/assets/pipeline.js
/**
 * RenderWOW pipeline
 * - preProcess: normalize + ASCII sanitize + ensure %%init + spacing helpers
 * - postProcess: pad viewBox, add subtle grid, auto-tint clusters, expose svgkit
 */

export function preProcess(input) {
  let code = String(input ?? "");

  // 1) Normalize newlines
  code = code.replace(/\r\n/g, "\n");

  // 2) ASCII sanitize: strip/convert ligatures & “smart” punctuation that break Mermaid
  code = code
    // quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    // dashes & minus
    .replace(/[\u2013\u2014\u2212]/g, "-")
    // non-breaking space
    .replace(/\u00A0/g, " ")
    // common text-ligature codepoints → plain ascii
    .replace(/\uFB00/g, "ff")
    .replace(/\uFB01/g, "fi")
    .replace(/\uFB02/g, "fl")
    .replace(/\uFB03/g, "ffi")
    .replace(/\uFB04/g, "ffl")
    // trim trailing spaces per line
    .replace(/[^\S\n]+$/gm, "");

  // 3) Ensure an init block near the top (before the diagram header is fine)
  const hasInit = /^\s*%%\{\s*init:/m.test(code);
  const initBlock =
    '%%{init: { "theme": "base", "maxTextSize": 90000, "themeVariables": {\n' +
    '  "fontFamily": "Inter, ui-sans-serif, system-ui",\n' +
    '  "primaryColor": "#0f1b34", "primaryBorderColor": "#22395f", "primaryTextColor": "#dfe7ff"\n' +
    '} } }%%\n';
  if (!hasInit) code = initBlock + code;

  // 4) Spacing helpers: "%%gap%%" → invisible node
  code = code.replace(
    /^\s*%%gap%%\s*$/gm,
    () => `_gap${Date.now().toString().slice(-4)}([ ]):::invis`
  );

  // NOTE: We DO NOT inject any classDef or linkStyle here anymore.
  // All visuals are handled via CSS to avoid parser issues.

  return code;
}

export function postProcess(svgEl) {
  if (!svgEl) return;

  const ns = svgEl.namespaceURI;

  // 1) Ensure a root group for targeting
  let root = svgEl.querySelector("g.mmd-root");
  if (!root) {
    root = document.createElementNS(ns, "g");
    root.setAttribute("class", "mmd-root");
    while (svgEl.firstChild) root.appendChild(svgEl.firstChild);
    svgEl.appendChild(root);
  }

  // 2) Padded viewBox (makes export look nice)
  try {
    const pad = 24;
    const bb = root.getBBox();
    const vbX = bb.x - pad;
    const vbY = bb.y - pad;
    const vbW = Math.max(bb.width + pad * 2, 10);
    const vbH = Math.max(bb.height + pad * 2, 10);
    svgEl.setAttribute("viewBox", `${vbX} ${vbY} ${vbW} ${vbH}`);
  } catch (_) {}

  // 3) Subtle background grid pattern
  if (!svgEl.querySelector("defs #rwGrid")) {
    const defs =
      svgEl.querySelector("defs") ||
      svgEl.insertBefore(document.createElementNS(ns, "defs"), svgEl.firstChild);

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

  // 4) Auto-tint clusters (UE-style comment boxes) by keywords in label
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
  } catch (_) {}

  // 5) Edge labels as chips (CSS targets .rw-chip)
  svgEl.querySelectorAll("g.edgeLabel").forEach((g) => g.classList.add("rw-chip"));

  // 6) Expose helpers
  attachApi(svgEl);
}

/* ------------------- dev helpers api ------------------- */

function attachApi(svgEl) {
  const kit = createSvgKit(svgEl);

  try {
    if (window.RW && typeof window.RW.setSvgKit === "function") {
      window.RW.setSvgKit(kit);
    }
  } catch (_) {}

  try {
    window.__rw = window.__rw || {};
    window.__rw.svgkit = kit;
  } catch (_) {}
}

function createSvgKit(svg) {
  return {
    el: svg,
    bbox() {
      try { return (svg.querySelector("g.mmd-root") || svg).getBBox(); }
      catch { return { x:0, y:0, width:0, height:0 }; }
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
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/png"));
        };
        img.src = src;
      });
    }
  };
}
