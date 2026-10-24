import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeTheme, safeStorage, shell, utilityProcess, type UtilityProcess } from "electron";
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { isNewer, portError, portFree, uriError } from "./validate.ts";

type Config = { driver: "nedb" | "mongo"; uri?: string; port: number };

const CONFIG = path.join(app.getPath("userData"), "config.json");
// Outside the app bundle, so updates never touch it.
const DATA = path.join(app.getPath("userData"), "data");
// Packaged: electron-builder's extraResources copies .next/standalone to resources/server.
const SERVER = app.isPackaged
  ? path.join(process.resourcesPath, "server/server.js")
  : path.join(__dirname, "../../.next/standalone/server.js");

let config: Config | null = null;
let server: UtilityProcess | null = null;
let setupWin: BrowserWindow | null = null;
let mainWin: BrowserWindow | null = null;

const RELEASES = "https://git.tinkeshwar.in/api/v1/repos/HomeServer/api-bird/releases/latest";

// config.json also holds lastUpdateCheck, so writes merge into what's there.
function readRaw(): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  } catch {
    return {};
  }
}

async function readConfig(): Promise<Config | null> {
  try {
    // Configs from before the built-in store have no driver and are always mongo.
    const { driver = "mongo", uri, port } = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    if (!port) return null; // only lastUpdateCheck written so far: not set up yet
    if (!uri) return { driver, port };
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(uri, "base64"));
    const c = { driver, uri: result, port };
    // Key rotated: re-save under the new key; a failed write just retries next launch.
    if (shouldReEncrypt) await writeConfig(c).catch(() => {});
    return c;
  } catch {
    return null;
  }
}

async function writeConfig(c: Config) {
  const uri = c.uri && (await safeStorage.encryptStringAsync(c.uri)).toString("base64");
  fs.writeFileSync(CONFIG, JSON.stringify({ ...readRaw(), driver: c.driver, uri, port: c.port }));
  config = c;
}

async function dbError(uri: string): Promise<string | null> {
  let client: MongoClient | undefined;
  try {
    client = await new MongoClient(uri, { serverSelectionTimeoutMS: 5000 }).connect();
    await client.db().command({ ping: 1 });
    return null;
  } catch (e) {
    return `Could not connect: ${(e as Error).message}`;
  } finally {
    await client?.close();
  }
}

function dataDirError(): string | null {
  try {
    fs.mkdirSync(DATA, { recursive: true });
    fs.accessSync(DATA, fs.constants.W_OK);
    return null;
  } catch (e) {
    return `Cannot write to ${DATA}: ${(e as Error).message}`;
  }
}

const storeError = (c: Config) => (c.driver === "nedb" ? dataDirError() : dbError(c.uri!));

// Never pick another port: the MCP URL registered with clients would break.
async function checkPort(port: number) {
  return portError(port) ?? ((await portFree(port)) ? null : `Port ${port} is already in use`);
}

function showSetup(error?: string) {
  const query: Record<string, string> = {
    driver: config?.driver ?? "nedb",
    port: String(config?.port ?? 3939),
    uri: config?.uri ?? "",
  };
  if (error) query.error = error;
  if (!setupWin) {
    setupWin = new BrowserWindow({ width: 520, height: 480, title: "API Bird setup", webPreferences: { preload: path.join(__dirname, "preload.js") } });
    setupWin.on("closed", () => (setupWin = null));
  }
  setupWin.loadFile(path.join(__dirname, "../setup.html"), { query });
  setupWin.focus();
}

function openMain(port: number) {
  if (!mainWin) {
    const mac = process.platform === "darwin";
    mainWin = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 760,
      minHeight: 480,
      title: "API Bird",
      // Paper colours from globals.css, so no white flash before the first paint.
      backgroundColor: nativeTheme.shouldUseDarkColors ? "#141a26" : "#f6f1e7",
      // ponytail: frameless on macOS only; Windows/Linux keep the native frame, add titleBarOverlay if wanted.
      ...(mac && { titleBarStyle: "hiddenInset" as const, trafficLightPosition: { x: 14, y: 18 } }),
    });
    mainWin.on("closed", () => (mainWin = null));
    // The sidebar's top row hosts the window buttons; tell the page how far to indent.
    if (mac) mainWin.webContents.on("dom-ready", () => mainWin?.webContents.insertCSS(":root{--traffic-inset:80px}"));
    mainWin.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });
  }
  mainWin.loadURL(`http://127.0.0.1:${port}/`);
  setupWin?.close();
}

function stopServer() {
  const s = server;
  server = null; // detach first so its exit isn't treated as a crash
  if (!s) return Promise.resolve();
  return new Promise<void>((r) => {
    s.once("exit", () => r());
    s.kill();
  });
}

async function waitUp(port: number, child: UtilityProcess) {
  let exited: number | null = null;
  child.once("exit", (code) => (exited = code));
  for (let i = 0; i < 120; i++) {
    if (exited !== null) throw new Error(`Server exited with code ${exited}`);
    try {
      await fetch(`http://127.0.0.1:${port}/`, { method: "HEAD" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("Server did not respond within 30s");
}

// Resolves to an error message, or null once the main window is open.
async function start(c: Config): Promise<string | null> {
  const error = (await storeError(c)) ?? (await checkPort(c.port));
  if (error) return error;
  // Drop any inherited MONGODB_URI: db.ts prefers it over DATA_DIR.
  const { MONGODB_URI: _, DATA_DIR: __, ...env } = process.env;
  const store = c.driver === "nedb" ? { DATA_DIR: DATA } : { MONGODB_URI: c.uri };
  const child = utilityProcess.fork(SERVER, [], {
    cwd: path.dirname(SERVER),
    env: { ...env, ...store, HOSTNAME: "127.0.0.1", PORT: String(c.port) },
    stdio: "inherit",
    serviceName: "API Bird server",
  });
  server = child;
  child.once("exit", (code) => {
    if (server !== child) return;
    server = null;
    showSetup(`Server exited with code ${code}`);
    mainWin?.close();
  });
  try {
    await waitUp(c.port, child);
  } catch (e) {
    if (server === child) await stopServer();
    return (e as Error).message;
  }
  openMain(c.port);
  return null;
}

ipcMain.handle("testAndSave", async (_e, { driver, uri, port }: Config) => {
  const c: Config = driver === "nedb" ? { driver, port } : { driver: "mongo", uri: uri ?? "", port };
  // The running server holds its own port, so only check a port we'd newly bind.
  const error =
    (c.driver === "mongo" ? uriError(c.uri!) : null) ??
    portError(port) ??
    (await storeError(c)) ??
    (server && port === config?.port ? null : await checkPort(port));
  if (error) return error;
  try {
    await writeConfig(c);
  } catch (e) {
    return `Could not save config: ${(e as Error).message}`;
  }
  await stopServer();
  return start(c);
});

// Builds are unsigned, so this only points at the release page. Silent on launch; manual reports everything.
async function checkForUpdates(manual: boolean) {
  try {
    const res = await fetch(RELEASES, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { tag_name, html_url } = await res.json();
    fs.writeFileSync(CONFIG, JSON.stringify({ ...readRaw(), lastUpdateCheck: Date.now() }));
    if (isNewer(tag_name, app.getVersion())) {
      const { response } = await dialog.showMessageBox({
        message: `Update available (v${String(tag_name).replace(/^v/, "")})`,
        buttons: ["Download", "Later"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) shell.openExternal(html_url);
    } else if (manual) {
      dialog.showMessageBox({ message: "You're up to date", detail: `API Bird ${app.getVersion()}` });
    }
  } catch (e) {
    if (manual) dialog.showErrorBox("Update check failed", (e as Error).message);
  }
}

function buildMenu() {
  const mac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(mac ? [{ role: "appMenu" as const }] : []),
      {
        label: "File",
        submenu: [
          { label: "Change database…", click: () => showSetup() },
          { label: "Copy MCP URL", click: () => clipboard.writeText(`http://127.0.0.1:${config?.port ?? 3940}/api/mcp`) },
          { label: "Check for updates…", click: () => checkForUpdates(true) },
          { type: "separator" },
          { role: mac ? "close" : "quit" },
        ],
      },
      { role: "editMenu" },
      { role: "viewMenu" },
      { role: "windowMenu" },
    ]),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = mainWin ?? setupWin;
    if (w?.isMinimized()) w.restore();
    w?.focus();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => void stopServer());
  app.whenReady().then(async () => {
    buildMenu();
    if (Date.now() - Number(readRaw().lastUpdateCheck ?? 0) > 24 * 3600_000) checkForUpdates(false);
    config = await readConfig();
    if (!config) return showSetup();
    start(config).then((error) => error && showSetup(error));
  });
}
