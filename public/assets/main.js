// public/assets/main.js
import { preProcess, postProcess } from "./pipeline.js";

const $ = (s, el=document)=>el.querySelector(s);

const els = {
  editorHost: $("#editor"),
  previewWrap: $("#previewWrap"), // visible viewport
  preview: $("#preview"),         // big stage (background/grid)
  error: $("#error"),
  templatePicker: $("#templatePicker"),
  themeToggle: $("#themeToggle"),
  btnToggleEditor: $("#btnToggleEditor"),
  btnRender: $("#btnRender"),
  btnFormat: $("#btnFormat"),
  btnFit: $("#btnFit"),
  btnZoomIn: $("#btnZoomIn"),
  btnZoomOut: $("#btnZoomOut"),
  btnReset: $("#btnResetPanZoom"),
  btnExportSvg: $("#btnExportSvg"),
  btnExportPng: $("#btnExportPng"),
  btnShare: $("#btnShare"),
  docsLink: $("#docsLink"),
};

// ───────────────────────────────────────────────────────────────────────────────
// State

let editor;
let zoom = 1;
let pan  = { x: 0, y: 0 };
let lastId = 0;
let fitLock = false;

const LS_KEY_COLLAPSE = "rw:editorCollapsed";

// Stage size (just the background canvas). We only grow to the right/bottom.
let stageW = 3200;
let stageH = 2200;

function updateStageSize(){
  els.preview.style.width  = stageW + "px";
  els.preview.style.height = stageH + "px";
}

function svgEl(){ return els.preview.querySelector("svg"); }
function nextId(){ lastId++; return "mmd-"+Date.now()+"-"+lastId; }
function getCode(){ return editor.getValue(); }
function setCode(v){ editor.setValue(v); }

function showError(err){
  els.error.hidden = false;
  els.error.textContent = (err && err.message) ? err.message : String(err);
}
function clearError(){
  els.error.hidden = true;
  els.error.textContent = "";
}

// ───────────────────────────────────────────────────────────────────────────────
// Theme + vendors

function initTheme(){
  const dark = els.themeToggle.checked;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  if (window.monaco) window.monaco.editor.setTheme(dark ? "vs-dark" : "vs");
  renderNow();
}
els.themeToggle?.addEventListener("change", initTheme);

function awaitMonaco(){
  return new Promise((resolve, reject)=>{
    if (window.monaco) return resolve(window.monaco);
    if (typeof require !== "function") return reject(new Error("Monaco AMD loader missing"));
    require(["vs/editor/editor.main"], ()=> resolve(window.monaco));
  });
}
async function awaitMermaid(){
  const start = Date.now();
  while (!window.mermaid) {
    await new Promise(r=>setTimeout(r,25));
    if (Date.now()-start > 8000) throw new Error("Mermaid failed to load");
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Editor collapse helpers

function updateEditorToggleLabel(){
  const collapsed = document.body.classList.contains("editor-collapsed");
  if (els.btnToggleEditor) {
    els.btnToggleEditor.textContent = collapsed
      ? "Show Editor (Ctrl+\\)"
      : "Hide Editor (Ctrl+\\)";
  }
}

function setEditorCollapsed(on){
  document.body.classList.toggle("editor-collapsed", !!on);
  try { localStorage.setItem(LS_KEY_COLLAPSE, on ? "1" : "0"); } catch {}
  // Let CSS animate, then re-measure Monaco
  setTimeout(()=> editor?.layout?.(), 220);
  updateEditorToggleLabel();
}

// ───────────────────────────────────────────────────────────────────────────────
// Transform helpers (CSS transform on <svg>)

function applyTransform(){
  const svg = svgEl(); if(!svg) return;
  svg.style.transformOrigin = "0 0";
  svg.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
  ensureSlack(); // grow background if we approach right/bottom edges
}

/**
 * Fit content to the viewport with padding and center it IN THE VIEWPORT.
 * This is the usual "fit to screen" you expect from design tools.
 */
function fitToViewport(pad=48){
  const svg = svgEl(); if(!svg) return;

  const box  = svg.getBBox();
  const view = els.previewWrap.getBoundingClientRect();

  const sx = (view.width  - pad) / Math.max(box.width, 1);
  const sy = (view.height - pad) / Math.max(box.height, 1);

  zoom = Math.max(Math.min(sx, sy), 0.05);

  // Center the diagram inside the viewport (not the stage)
  const contentW = box.width  * zoom;
  const contentH = box.height * zoom;

  pan.x = ((view.width  - contentW) / 2) - box.x * zoom;
  pan.y = ((view.height - contentH) / 2) - box.y * zoom;

  applyTransform();
}

/**
 * Expand the stage so you don't run out of background on the right/bottom.
 * IMPORTANT: we NEVER nudge `pan` here (especially not for top/left).
 * That avoids the "snap back" when you drag high or far left.
 */
function ensureSlack(margin = 120){
  const svg = svgEl(); if(!svg) return;
  const box = svg.getBBox();

  const left   = pan.x + box.x * zoom;
  const top    = pan.y + box.y * zoom;
  const right  = left + box.width  * zoom;
  const bottom = top  + box.height * zoom;

  let changed = false;

  // Only extend the stage to the right/bottom.
  if (right  > stageW - margin) { stageW = Math.ceil(right  + margin); changed = true; }
  if (bottom > stageH - margin) { stageH = Math.ceil(bottom + margin); changed = true; }

  if (changed) updateStageSize();
}

/** Mouse-anchored zoom in CSS pixel space */
function zoomAt(clientX, clientY, factor){
  const svg = svgEl(); if(!svg) return;
  const rect = els.previewWrap.getBoundingClientRect();
  const box  = svg.getBBox();

  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  // Convert screen px → world units under current transform
  const wx = (mx - pan.x) / zoom - box.x;
  const wy = (my - pan.y) / zoom - box.y;

  const newZoom = Math.min(Math.max(zoom * factor, 0.05), 20);

  // Keep the same world point under the cursor
  pan.x = mx - (wx + box.x) * newZoom;
  pan.y = my - (wy + box.y) * newZoom;
  zoom  = newZoom;

  applyTransform();
}

// ───────────────────────────────────────────────────────────────────────────────
// Rendering

async function renderNow(){
  try{
    clearError();
    const raw = getCode();
    if (!raw.trim()) return;

    await awaitMermaid();
    window.mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "loose",
      themeVariables: {
        fontFamily: getComputedStyle(document.documentElement)
          .getPropertyValue("--mermaid-font-family")
      }
    });

    const code = preProcess(raw);
    const id = nextId();
    const r = await window.mermaid.render(id, code);

    // Inject SVG on the stage
    els.preview.innerHTML = r.svg;

    const svg = svgEl(); if (!svg) return;

    // Important: don't let Mermaid's max-width collapse the SVG
    svg.style.maxWidth = "none";
    svg.style.width = "auto";
    svg.style.height = "auto";
    svg.style.display = "block";

    // Grid + padding + wrapper
    postProcess(svg);

    // Start centered/visible every render unless the user has taken control
    if (!fitLock) fitToViewport(48); else applyTransform();
  }catch(e){
    showError(e);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Controls

els.btnRender?.addEventListener("click", renderNow);
els.btnFit.addEventListener("click", ()=>{ fitLock=false; fitToViewport(48); });
els.btnZoomIn.addEventListener("click", ()=>{
  const r = els.previewWrap.getBoundingClientRect();
  zoomAt(r.left + r.width/2, r.top + r.height/2, 1.15);
  fitLock = true;
});
els.btnZoomOut.addEventListener("click", ()=>{
  const r = els.previewWrap.getBoundingClientRect();
  zoomAt(r.left + r.width/2, r.top + r.height/2, 1/1.15);
  fitLock = true;
});
els.btnReset.addEventListener("click", ()=>{
  fitLock = false;
  fitToViewport(48);
});

// NEW: collapse/expand button
els.btnToggleEditor?.addEventListener("click", ()=>{
  const collapsed = !document.body.classList.contains("editor-collapsed");
  setEditorCollapsed(collapsed);
});

// Drag to pan (pixels)
let dragging=false,last=null;
els.previewWrap.addEventListener("mousedown", e=>{ dragging=true; last={x:e.clientX,y:e.clientY}; fitLock=true; });
window.addEventListener("mousemove", e=>{
  if(!dragging) return;
  const dx=e.clientX-last.x, dy=e.clientY-last.y; last={x:e.clientX,y:e.clientY};
  pan.x+=dx; pan.y+=dy; applyTransform();
});
window.addEventListener("mouseup", ()=> dragging=false);

// Ctrl/Cmd + wheel to zoom
els.previewWrap.addEventListener("wheel", (e)=>{
  if(!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, (e.deltaY>0)?1/1.08:1.08);
  fitLock = true;
},{passive:false});

// Keyboard: render & collapse shortcut
window.addEventListener("keydown", (e)=>{
  const k = e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey) && k==="s"){ e.preventDefault(); renderNow(); }
  if((e.ctrlKey||e.metaKey) && e.key === "\\"){
    e.preventDefault();
    const collapsed = !document.body.classList.contains("editor-collapsed");
    setEditorCollapsed(collapsed);
  }
});

// Keep your placement on resize (don’t snap unless you never moved)
window.addEventListener("resize", ()=> { if (!fitLock) fitToViewport(48); else ensureSlack(); });

// ───────────────────────────────────────────────────────────────────────────────
// Export / Share

function download(filename, text, mime){
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 250);
}

els.btnExportSvg.addEventListener("click", async ()=>{
  const svg = svgEl(); if(!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  if (window.RW?.saveSvg) { await window.RW.saveSvg(xml); return; }
  download("diagram.svg", xml, "image/svg+xml;charset=utf-8");
});

els.btnExportPng.addEventListener("click", async ()=>{
  const svg = svgEl(); if(!svg) return;
  const xml = new XMLSerializer().serializeToString(svg);
  const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
  const img = new Image();
  img.onload = async ()=>{
    const scale = 2;
    const c = document.createElement("canvas");
    c.width = img.width*scale; c.height = img.height*scale;
    const ctx = c.getContext("2d");
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#0b1220";
    ctx.fillRect(0,0,c.width,c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/png");
    if (window.RW?.savePng) { await window.RW.savePng(dataUrl); return; }
    const a = document.createElement("a"); a.href=dataUrl; a.download="diagram.png"; a.click();
  };
  img.src = src;
});

els.btnShare.addEventListener("click", ()=>{
  const packed = LZString.compressToEncodedURIComponent(getCode());
  const isDark = document.documentElement.getAttribute("data-theme")==="dark" ? "1" : "0";
  const url = `renderwow://local#t=${isDark}&c=${packed}`;
  navigator.clipboard?.writeText(url);
  els.btnShare.textContent = "Copied!";
  setTimeout(()=> els.btnShare.textContent="Copy Share URL", 1200);
});

// Templates / format
const SAMPLE = `flowchart TD
  A[Start] --> B{Ready?}
  B -- Yes --> C[Render Mermaid]
  B -- No  --> D[/Fix Syntax/]
  C --> E((Export))
  D --> B`;

const templates = {
  flow: SAMPLE,
  sequence: `sequenceDiagram
participant User
participant Server
User->>Server: GET /preview
Server-->>User: 200 OK
User->>Server: POST /export (svg)
Server-->>User: 201 Created`,
  class: `classDiagram
class Vehicle {
  +String make
  +String model
  +move()
}
class Car { +int doors }
Vehicle <|-- Car`,
  er: `erDiagram
CUSTOMER ||--o{ ORDER : places
ORDER ||--|{ ORDER_ITEM : contains
PRODUCT ||--o{ ORDER_ITEM : referenced`,
  gantt: `gantt
title Roadmap
dateFormat  YYYY-MM-DD
section Build
Scaffold :active, a1, 2025-01-01, 7d
Polish   :a2, after a1, 10d`,
  state: `stateDiagram-v2
[*] --> Idle
Idle --> Rendering : codeChanged
Rendering --> Idle  : success
Rendering --> Error : invalid`,
  journey: `journey
title Checkout
section Browse
User: 4: search items
User: 3: add to cart
section Pay
User: 2: choose crypto
User: 5: confirm`
};

els.templatePicker.addEventListener("change", (e)=>{
  const v = e.target.value;
  if(templates[v]){ setCode(templates[v]); renderNow(); }
  e.target.value = "none";
});
els.btnFormat.addEventListener("click", ()=>{
  const lines = getCode().replace(/\r\n/g,"\n").split("\n");
  const formatted = lines.map(l=>l.replace(/\s+$/,"")).join("\n").trim()+"\n";
  setCode(formatted);
});

// Drag-drop onto the editor panel
function handleDrop(){
  const left = document.querySelector(".pane.left");
  left.addEventListener("dragover", (e)=>{ e.preventDefault(); left.classList.add("drag"); });
  left.addEventListener("dragleave", ()=> left.classList.remove("drag"));
  left.addEventListener("drop", async (e)=>{
    e.preventDefault(); left.classList.remove("drag");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) return;
    const text = await f.text();
    setCode(text); renderNow();
  });
}
function wireDocs(){
  const url = "https://mermaid.js.org";
  if (!els.docsLink) return;
  els.docsLink.href = url;
}

// ───────────────────────────────────────────────────────────────────────────────
// Boot

async function boot(){
  await awaitMonaco();
  await awaitMermaid();

  updateStageSize();

  editor = monaco.editor.create(els.editorHost, {
    value: SAMPLE,
    language: "markdown",
    theme: (document.documentElement.getAttribute("data-theme")==="dark") ? "vs-dark" : "vs",
    automaticLayout: true,
    minimap: { enabled: false },
    wordWrap: "on",
    fontSize: 14,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace"
  });
  editor.onDidChangeModelContent(()=> setTimeout(renderNow, 250));

  handleDrop();
  wireDocs();
  initTheme();

  // Restore collapsed state
  const startCollapsed = (localStorage.getItem(LS_KEY_COLLAPSE) === "1");
  if (startCollapsed) document.body.classList.add("editor-collapsed");
  updateEditorToggleLabel();

  renderNow(); // centers in viewport on first paint
}
boot();
