// Sparkling for macOS. Loads the hosted app; Liquid Glass styling comes from the web layer (html.pf-glass),
// and the window uses a hidden inset title bar so the frosted nav bar reaches the top edge.
const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const URL_HOME = process.env.SPARKLING_URL || "https://sparkling-dev.q1f0730.workers.dev/?source=mac";
const HOST = new URL(URL_HOME).host;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 420, minHeight: 600,
    title: "Sparkling", backgroundColor: "#f3eee3",
    titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 },
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true },
  });
  win.webContents.setUserAgent(win.webContents.getUserAgent() + " SparklingApp/0.1 (macOS)");
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (new URL(url).host !== HOST) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on("did-fail-load", (_e, code, _d, url, isMain) => { if (isMain && code !== -3) win.loadFile(path.join(__dirname, "offline.html")); });
  win.loadURL(URL_HOME);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" }, { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload" }, { role: "togglefullscreen" }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }] },
    { role: "windowMenu" },
  ]));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
