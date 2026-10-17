import { app, BrowserWindow, session } from "electron";
import { writeFile } from "node:fs/promises";
import { screenshotResource } from "./screenshot-resource.mjs";
import { publicUrl } from "../lib/media.mjs";
const [url, output, profile] = process.argv.slice(2);
app.setName("Commonplace preview");
app.setPath("userData", profile);
app.setPath("sessionData", profile);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-quic");
let stage = "starting";
const timeout = setTimeout(() => {
  console.error(`Screenshot timed out: ${stage}`);
  app.exit(1);
}, 20000);
app.whenReady().then(async () => {
  app.dock?.hide();
  let window;
  try {
    if (!publicUrl(url) || !output)
      throw new Error("Invalid screenshot request");
    const isolated = session.fromPartition(
      `screenshot-${crypto.randomUUID()}`,
      {
        cache: false,
      },
    );
    isolated.setPermissionRequestHandler((_wc, _permission, callback) =>
      callback(false),
    );
    isolated.setPermissionCheckHandler(() => false);
    isolated.on("will-download", (event) => event.preventDefault());
    isolated.webRequest.onBeforeRequest((details, callback) =>
      callback({
        cancel:
          !publicUrl(details.url) &&
          !details.url.startsWith("data:") &&
          details.url !== "about:blank",
      }),
    );
    let mainFailed = false;
    for (const scheme of ["http", "https"])
      isolated.protocol.handle(scheme, async (request) => {
        try {
          if (!["GET", "HEAD"].includes(request.method))
            return new Response(null, { status: 403 });
          const response = await screenshotResource(request.url);
          if (request.url === url && response.status >= 400) mainFailed = true;
          return new Response(
            [204, 205, 304].includes(response.status) ? null : response.body,
            { status: response.status, headers: response.headers },
          );
        } catch {
          if (request.url === url) mainFailed = true;
          return new Response(null, { status: 502 });
        }
      });
    window = new BrowserWindow({
      width: 1280,
      height: 960,
      show: false,
      focusable: false,
      skipTaskbar: true,
      webPreferences: {
        offscreen: true,
        session: isolated,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        webgl: false,
        backgroundThrottling: false,
        disableDialogs: true,
      },
    });
    window.webContents.setFrameRate(5);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, target) => {
      if (!publicUrl(target)) event.preventDefault();
    });
    stage = "loading";
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error("Page did not become ready")),
        12000,
      );
      window.webContents.once("dom-ready", () => {
        clearTimeout(deadline);
        resolve();
      });
      void window.loadURL(url).catch((error) => {
        clearTimeout(deadline);
        reject(error);
      });
    });
    stage = "rendering";
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (mainFailed) throw new Error("Page unavailable for capture");
    const title = window.webContents.getTitle();
    if (
      /just a moment|access denied|sign in|log in|checking your browser/i.test(
        title,
      )
    )
      throw new Error("Page unavailable for capture");
    stage = "capturing";
    const capture = await new Promise((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error("Page did not paint")),
        3000,
      );
      window.webContents.once("paint", (_event, _rect, image) => {
        clearTimeout(deadline);
        resolve(image);
      });
      window.webContents.invalidate();
    });
    if (capture.isEmpty()) throw new Error("Empty capture");
    await writeFile(output, capture.resize({ width: 960 }).toJPEG(82), {
      mode: 0o600,
    });
    window.destroy();
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error.message);
    window?.destroy();
    clearTimeout(timeout);
    app.exit(1);
  }
});
