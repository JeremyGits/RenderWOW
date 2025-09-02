// Expose a safe, read-only API to the renderer.

const { contextBridge, ipcRenderer } = require("electron");

// Internal slot to hold the latest svgkit (if you want to introspect from DevTools)
let _svgkit = null;

const api = Object.freeze({
  version: "0.1.0",

  // Native save dialogs (handled in electron/main.js)
  saveSvg: (svg) => ipcRenderer.invoke("save-svg", String(svg ?? "")),
  savePng: (dataUrl) => ipcRenderer.invoke("save-png", String(dataUrl ?? "")),

  // Optional: receive the current svgkit from the renderer without mutating window.RW
  setSvgKit: (kit) => { _svgkit = kit ?? null; },

  // Optional: let you grab it from DevTools if you want to poke it
  getSvgKit: () => _svgkit,

  // Deep-links from the main process
  onDeeplink: (handler) => {
    if (typeof handler !== "function") return () => {};
    const listener = (_ev, url) => handler(url);
    ipcRenderer.on("deeplink-open", listener);
    // return unsubscribe
    return () => ipcRenderer.off("deeplink-open", listener);
  }
});

// IMPORTANT: This defines a non-writable property on window.
contextBridge.exposeInMainWorld("RW", api);
