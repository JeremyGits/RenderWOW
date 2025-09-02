// Main process for RenderWOW (CommonJS)

"use strict";

const path = require("path");
const fs = require("fs");
const {
  app,
  BrowserWindow,
  protocol,
  dialog,
  ipcMain,
  nativeImage,
  shell,
} = require("electron");

// Optional Windows installer helper (avoid crash if not installed)
try {
  if (require("electron-squirrel-startup")) app.quit();
} catch (_) { /* no-op */ }

// Keep a reference so GC doesn't close the window.
let mainWindow = null;

const PROTOCOL = "renderwow"; // for links like renderwow://local#...

// Ensure single instance (so protocol links focus the same window)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deeplink = argv.find(a => typeof a === "string" && a.startsWith(`${PROTOCOL}://`));
    if (deeplink && mainWindow) {
      mainWindow.webContents.send("deeplink-open", deeplink);
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// macOS protocol handler (first launch and subsequent opens)
app.on("open-url", (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.webContents.send("deeplink-open", url);
  } else {
    app.once("browser-window-created", () =>
      mainWindow.webContents.send("deeplink-open", url)
    );
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0b1220",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.removeMenu?.();

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Auto-retry in dev on transient load hiccups
  mainWindow.webContents.on("did-fail-load", () => {
    if (!app.isPackaged) setTimeout(() => mainWindow && mainWindow.reload(), 300);
  });

  mainWindow.loadFile(path.join(__dirname, "..", "public", "index.html"));

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  // Optional local file protocol (rw://...) if you decide to use it
  protocol.registerFileProtocol("rw", (request, cb) => {
    const url = request.url.replace("rw://", "");
    cb({ path: path.normalize(path.join(__dirname, "..", url)) });
  });

  // Register app as handler for custom scheme (share URLs)
  if (process.platform === "win32") {
    if (process.defaultApp) {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* -------------------- IPC: Native save dialogs -------------------- */

// Save SVG string to disk
ipcMain.handle("save-svg", async (_evt, svg) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save SVG",
    defaultPath: "diagram.svg",
    filters: [{ name: "SVG", extensions: ["svg"] }],
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, String(svg ?? ""), "utf8");
  return { ok: true, filePath };
});

// Save PNG from renderer-provided data URL (e.g., canvas.toDataURL())
ipcMain.handle("save-png", async (_evt, dataUrl) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save PNG",
    defaultPath: "diagram.png",
    filters: [{ name: "PNG", extensions: ["png"] }],
  });
  if (canceled || !filePath) return { ok: false };
  const image = nativeImage.createFromDataURL(String(dataUrl ?? ""));
  fs.writeFileSync(filePath, image.toPNG());
  return { ok: true, filePath };
});
