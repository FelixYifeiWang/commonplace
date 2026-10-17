import {
  app,
  BrowserWindow,
  ipcMain,
  safeStorage,
  shell,
  screen,
  net,
  Tray,
  Menu,
  nativeImage,
} from "electron";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveLocalTarget } from "./target.mjs";
import { createDragController } from "./drag.mjs";
const exec = promisify(execFile);
import fs from "node:fs/promises";
import { pathToFileURL, fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = process.env.COMMONPLACE_ORIGIN || "http://127.0.0.1:3100";
let win,
  feedbackWindow,
  feedbackTimer,
  feedbackPoint = { x: 50, y: 50 },
  tray,
  collector,
  connection = null,
  subscriptions = [],
  cursors = {},
  dragController,
  expanded = false,
  targetTitle = "",
  busy = false,
  status = "waiting",
  lastError = "";
const configPath = () => path.join(app.getPath("userData"), "connection.enc");
const statePath = () =>
  path.join(app.getPath("userData"), "subscriptions.json");
function senderAllowed(event) {
  return new URL(event.senderFrame.url).origin === ORIGIN;
}
function register(name, handler) {
  ipcMain.handle(name, async (event, ...args) => {
    if (!senderAllowed(event)) throw new Error("Untrusted window.");
    return handler(...args);
  });
}
async function persist() {
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(statePath(), JSON.stringify({ subscriptions, cursors }), {
    mode: 0o600,
  });
}
async function pair({ token, origin }) {
  if (origin !== ORIGIN || !/^[a-f0-9]{64}$/.test(token))
    throw new Error("This connection does not belong to the configured space.");
  if (!safeStorage.isEncryptionAvailable())
    throw new Error(
      "Secure credential storage is unavailable on this computer.",
    );
  connection = { origin, token };
  await fs.mkdir(app.getPath("userData"), { recursive: true });
  await fs.writeFile(
    configPath(),
    safeStorage.encryptString(JSON.stringify(connection)),
    { mode: 0o600 },
  );
  lastError = "";
  status = "waiting";
}
async function request(url, options) {
  return net.fetch(url, {
    signal: AbortSignal.timeout(15000),
    ...options,
    credentials: "include",
  });
}
async function tick() {
  if (!connection || busy || dragController?.isDragging()) return;
  busy = true;
  try {
    for (const subscription of subscriptions.filter(
      (s) => !s.paused && !s.done,
    )) {
      if (dragController?.isDragging()) break;
      try {
        const result = await collector.syncTranscript({
          connection,
          subscription,
          cursors,
          request,
        });
        subscription.turns = result.total;
        subscription.lastSynced = new Date().toISOString();
        subscription.error = "";
        if (subscription.mode === "once") subscription.done = true;
        if (!dragController?.isDragging()) {
          lastError = "";
          status = "following";
        }
        await persist();
      } catch (error) {
        subscription.error = error.message;
        if (!dragController?.isDragging()) {
          lastError = error.message;
          status = error.status === 409 ? "paused" : "error";
        }
        if (error.status === 401) subscription.paused = true;
      }
    }
  } finally {
    busy = false;
  }
}
function setExpanded(value) {
  expanded = value;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const width = value ? 320 : 104,
    height = value ? 390 : 112;
  win.setBounds(
    {
      x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
      y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
      width,
      height,
    },
    false,
  );
}
function showDropFeedback(value) {
  status = value.state;
  if (value.error !== undefined) lastError = value.error;
  if (value.target !== undefined) targetTitle = value.target;
  if (!feedbackWindow) return;
  if (value.state === "reading") {
    clearTimeout(feedbackTimer);
    feedbackWindow.hide();
    return;
  }
  clearTimeout(feedbackTimer);
  if (!feedbackWindow.isVisible()) {
    const point = value.point || screen.getCursorScreenPoint(),
      display = screen.getDisplayNearestPoint(point);
    feedbackPoint = {
      x: ((point.x - display.bounds.x) / display.bounds.width) * 100,
      y: ((point.y - display.bounds.y) / display.bounds.height) * 100,
    };
    feedbackWindow.setBounds(display.bounds);
    feedbackWindow.showInactive();
  }
  if (["following", "error"].includes(value.state))
    feedbackTimer = setTimeout(
      () => feedbackWindow?.hide(),
      value.state === "error" ? 2400 : 1800,
    );
}
async function subscribeSource(source) {
  if (!connection) {
    const response = await request(`${ORIGIN}/api/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Desktop buddy" }),
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw new Error("Sign in to your space, then drop again.");
    const device = await response.json();
    await pair({ origin: ORIGIN, token: device.token });
  }
  const response = await request(`${ORIGIN}/api/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${connection.token}`,
    },
    body: JSON.stringify({
      sessionId: source.sessionId,
      title: source.title,
      provider: source.provider,
      mode: "follow",
    }),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("Sign in to your space, then drop again.");
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Could not connect this conversation.");
  const existing = subscriptions.find((s) => s.id === result.subscriptionId);
  if (existing)
    Object.assign(existing, {
      paused: false,
      done: false,
      mode: "follow",
      file: source.file,
    });
  else
    subscriptions.push({
      id: result.subscriptionId,
      title: source.title,
      provider: source.provider,
      file: source.file,
      mode: "follow",
      paused: false,
      done: false,
    });
  await persist();
  return subscriptions.find((s) => s.id === result.subscriptionId);
}
async function handleProtocol(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "commonplace:" || url.hostname !== "pair") return;
    await pair({
      origin: url.searchParams.get("origin"),
      token: url.hash.slice(1),
    });
    win?.show();
    win?.focus();
  } catch (error) {
    lastError = error.message;
    win?.show();
  }
}
const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const link = argv.find((a) => a.startsWith("commonplace://"));
    if (link) void handleProtocol(link);
    win?.show();
  });
  app.on("open-url", (event, url) => {
    event.preventDefault();
    void handleProtocol(url);
  });
  app
    .whenReady()
    .then(async () => {
      collector = await import(
        pathToFileURL(path.join(__dirname, "collector.mjs")).href
      );
      try {
        const encrypted = await fs.readFile(configPath());
        connection = JSON.parse(safeStorage.decryptString(encrypted));
        if (connection.origin !== ORIGIN) connection = null;
      } catch (error) {
        if (error.code !== "ENOENT")
          lastError =
            "Saved connection could not be restored. Please reconnect.";
      }
      try {
        const saved = JSON.parse(await fs.readFile(statePath(), "utf8"));
        subscriptions = saved.subscriptions || [];
        cursors = saved.cursors || {};
      } catch (error) {
        if (error.code !== "ENOENT")
          lastError = "Saved subscriptions could not be restored.";
      }
      if (process.defaultApp) {
        app.setAsDefaultProtocolClient("commonplace", process.execPath, [
          path.resolve(__dirname),
        ]);
      } else app.setAsDefaultProtocolClient("commonplace");
      const area = screen.getPrimaryDisplay().workArea;
      win = new BrowserWindow({
        width: 104,
        height: 112,
        x: area.x + area.width - 128,
        y: area.y + area.height - 136,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        hasShadow: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith(ORIGIN)) void shell.openExternal(url);
        return { action: "deny" };
      });
      win.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== ORIGIN) {
          event.preventDefault();
          void shell.openExternal(url);
        }
      });
      register("companion:snapshot", () => {
        const cursor = screen.getCursorScreenPoint(),
          bounds = win.getBounds();
        const gaze = {
          x: Math.max(-2, Math.min(2, (cursor.x - bounds.x - 52) / 180)),
          y: Math.max(-1.5, Math.min(1.5, (cursor.y - bounds.y - 54) / 180)),
        };
        return {
          gaze,
          connected: !!connection,
          expanded,
          targetTitle,
          feedbackPoint,
          feedbackActive: !!feedbackWindow?.isVisible(),
          subscriptions: subscriptions.map((s) => ({
            id: s.id,
            title: s.title,
            provider: s.provider,
            mode: s.mode,
            paused: s.paused,
            done: s.done,
            turns: s.turns,
            error: s.error,
          })),
          state: status,
          error: lastError,
          origin: ORIGIN,
        };
      });
      register("companion:pair", pair);
      dragController = createDragController({
        window: win,
        cursor: () => screen.getCursorScreenPoint(),
        inspect: async (point) => {
          const { stdout } = await exec(
            path.join(__dirname, "native/bin/commonplace-target"),
            [String(point.x), String(point.y), String(process.pid)],
            { timeout: 8000, maxBuffer: 64 * 1024 },
          );
          return JSON.parse(stdout);
        },
        resolve: resolveLocalTarget,
        subscribe: subscribeSource,
        capture: async (_source, subscription) => {
          while (busy) await new Promise((resolve) => setTimeout(resolve, 50));
          try {
            const result = await collector.syncTranscript({
              connection,
              subscription,
              cursors,
              request,
            });
            subscription.turns = result.total;
            subscription.lastSynced = new Date().toISOString();
            subscription.error = "";
          } finally {
            await persist();
          }
        },
        report: showDropFeedback,
      });
      register("companion:drag-start", () => dragController.start());
      register("companion:drag-end", async () => {
        const result = await dragController.end();
        if (result.click) setExpanded(!expanded);
        else if (!result.moved) setExpanded(!result.connected);
        return result;
      });
      register("companion:drag-cancel", () => dragController.cancel());
      register("companion:toggle", () => setExpanded(!expanded));
      register("companion:pause", async (id) => {
        const source = subscriptions.find((s) => s.id === id);
        if (!source) throw new Error("Session not found.");
        const paused = !source.paused;
        const response = await request(
          `${connection.origin}/api/device-session`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${connection.token}`,
            },
            body: JSON.stringify({
              subscriptionId: id,
              action: paused ? "pause" : "resume",
            }),
          },
        );
        if (!response.ok)
          throw new Error("Could not change session state. Try again.");
        source.paused = paused;
        status = paused ? "paused" : "following";
        await persist();
        if (!source.paused) void tick();
        return { ok: true };
      });
      register("companion:open-space", () => shell.openExternal(ORIGIN));
      register("companion:hide", () => win.hide());
      win.on("closed", () => dragController?.cancel());
      feedbackWindow = new BrowserWindow({
        ...screen.getPrimaryDisplay().bounds,
        frame: false,
        transparent: true,
        backgroundColor: "#00000000",
        hasShadow: false,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        show: false,
        focusable: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      feedbackWindow.setIgnoreMouseEvents(true);
      feedbackWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
      feedbackWindow.webContents.setWindowOpenHandler(() => ({
        action: "deny",
      }));
      feedbackWindow.webContents.on("will-navigate", (event) =>
        event.preventDefault(),
      );
      await feedbackWindow.loadURL(`${ORIGIN}/buddy/feedback`);
      const authCheck = await net.fetch(`${ORIGIN}/api/workspace`, {
        redirect: "manual",
      });
      if (
        authCheck.status === 401 ||
        authCheck.status === 302 ||
        authCheck.status === 303
      ) {
        const login = new BrowserWindow({
          width: 900,
          height: 700,
          title: "Sign in to Commonplace",
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        login.webContents.on("did-finish-load", async () => {
          const url = login.webContents.getURL();
          if (
            url.startsWith(ORIGIN) &&
            !url.includes("signin") &&
            !url.includes("callback")
          ) {
            try {
              const check = await net.fetch(`${ORIGIN}/api/workspace`);
              if (
                check.ok &&
                check.headers.get("content-type")?.includes("application/json")
              ) {
                login.close();
                await win.loadURL(`${ORIGIN}/buddy`);
                win.show();
              }
            } catch (error) {
              lastError = error.message;
            }
          }
        });
        await login.loadURL(`${ORIGIN}/signin-with-chatgpt?return_to=%2F`);
      } else {
        await win.loadURL(`${ORIGIN}/buddy`);
        win.show();
      }
      const icon = nativeImage.createFromDataURL(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGElEQVQ4T2NkaGD4z0ABYBxVMGoAagAAj18CEf5T+nMAAAAASUVORK5CYII=",
      );
      tray = new Tray(icon);
      tray.setToolTip("Commonplace");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "Show companion", click: () => win.show() },
          { label: "Open my space", click: () => shell.openExternal(ORIGIN) },
          { type: "separator" },
          { label: "Quit", click: () => app.quit() },
        ]),
      );
      tray.on("click", () => win.show());
      setInterval(() => void tick(), 15000);
      void tick();
    })
    .catch((error) => {
      console.error("Companion could not start:", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
}
