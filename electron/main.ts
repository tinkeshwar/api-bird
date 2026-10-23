import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeTheme, safeStorage, shell, utilityProcess, type UtilityProcess } from "electron";
import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { portError, portFree, uriError } from "./validate.ts";

type Config = { uri: string; port: number };

const CONFIG = path.join(app.getPath("userData"), "config.json");
// ponytail: dev path only; phase 3 points this into the packaged resources.
const SERVER = path.join(__dirname, "../../.next/standalone/server.js");

let config: Config | null = null;
let server: UtilityProcess | null = null;
let setupWin: BrowserWindow | null = null;
let mainWin: BrowserWindow | null = null;

async function readConfig(): Promise<Config | null> {
  try {
    const { uri, port } = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(uri, "base64"));
    const c = { uri: result, port };
    // Key rotated: re-save under the new key; a failed write just retries next launch.
    if (shouldReEncrypt) await writeConfig(c).catch(() => {});
    return c;
  } catch {
    return null;
  }
}

async function writeConfig(c: Config) {
  const uri = (await safeStorage.encryptStringAsync(c.uri)).toString("base64");
  fs.writeFileSync(CONFIG, JSON.stringify({ uri, port: c.port }));
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

// Never pick another port: the MCP URL registered with clients would break.
async function checkPort(port: number) {
  return portError(port) ?? ((await portFree(port)) ? null : `Port ${port} is already in use`);
}

function showSetup(error?: string) {
  const query: Record<string, string> = { port: String(config?.port ?? 3939), uri: config?.uri ?? "" };
  if (error) query.error = error;
  if (!setupWin) {
    setupWin = new BrowserWindow({ width: 520, height: 400, title: "API Bird setup", webPreferences: { preload: path.join(__dirname, "preload.js") } });
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
  const error = (await dbError(c.uri)) ?? (await checkPort(c.port));
  if (error) return error;
  const child = utilityProcess.fork(SERVER, [], {
    cwd: path.dirname(SERVER),
    env: { ...process.env, MONGODB_URI: c.uri, HOSTNAME: "127.0.0.1", PORT: String(c.port) },
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

ipcMain.handle("testAndSave", async (_e, { uri, port }: Config) => {
  // The running server holds its own port, so only check a port we'd newly bind.
  const error =
    uriError(uri) ?? portError(port) ?? (await dbError(uri)) ?? (server && port === config?.port ? null : await checkPort(port));
  if (error) return error;
  try {
    await writeConfig({ uri, port });
  } catch (e) {
    return `Could not save config: ${(e as Error).message}`;
  }
  await stopServer();
  return start({ uri, port });
});

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
  app.on("will-quit", () => server?.kill());
  app.whenReady().then(async () => {
    buildMenu();
    config = await readConfig();
    if (!config) return showSetup();
    start(config).then((error) => error && showSetup(error));
  });
}
