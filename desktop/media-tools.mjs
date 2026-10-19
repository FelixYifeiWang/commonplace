// Electron side of session pictures (see lib/session-media.mjs). Kept out of collector.mjs so the
// collector stays testable without Electron.
import { MAX_MEDIA_BYTES } from "../lib/session-media.mjs";
import { pickRegion, visualBoxes } from "./artifact-region.mjs";

const LONGEST_SIDE = 1600;
const VIEW = { width: 1280, height: 800 };
// An artifact renders at twice its page pixels, so the part framed as its picture stays sharp on a card.
const SCALE = 2;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function within(promise, ms) {
  return Promise.race([
    promise,
    wait(ms).then(() => {
      throw new Error("Timed out.");
    }),
  ]);
}

export function createMediaTools({ BrowserWindow, nativeImage, session }) {
  // Artifacts render in their own in-memory session: no cookies of the app or of any site,
  // no permissions, no popups, no navigation away from the file.
  const isolated = session.fromPartition("newron-artifact-capture");
  isolated.setPermissionRequestHandler((_contents, _permission, done) =>
    done(false),
  );
  isolated.setPermissionCheckHandler(() => false);
  let queue = Promise.resolve();

  async function capture(file) {
    if (!/\.html?$/i.test(file)) return null;
    const win = new BrowserWindow({
      show: false,
      width: VIEW.width * SCALE,
      height: VIEW.height * SCALE,
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        session: isolated,
        backgroundThrottling: false,
      },
    });
    const run = (code, ms = 5000) =>
      within(win.webContents.executeJavaScript(code, true), ms);
    try {
      win.webContents.setAudioMuted(true);
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      // A still is taken as a reduced-motion visitor sees the page: intros skip and entrances land at once.
      // The setting needs a page to apply to, and it carries over to the artifact.
      try {
        await within(win.loadURL("about:blank"), 5000);
        win.webContents.debugger.attach("1.3");
        await within(
          win.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
            features: [{ name: "prefers-reduced-motion", value: "reduce" }],
          }),
          3000,
        );
      } catch {
        // Without it the page plays its motion and the waits below cover most of it.
      }
      await within(win.loadFile(file), 15000);
      win.webContents.setZoomFactor(SCALE);
      await run(
        "document.fonts ? document.fonts.ready.then(() => true) : true",
      ).catch(() => {});
      // Lazy pictures load now, so the whole page can be measured.
      await run(
        `Promise.all([...document.images].map((i) => { i.loading = "eager"; return i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }); }))`,
        4000,
      ).catch(() => {});
      // Let what still moves finish (finite animations, up to 6 s) and entrance animations settle.
      await run(
        `Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime)).map((a) => a.finished.catch(() => {})))`,
        6000,
      ).catch(() => {});
      await wait(1200);
      const rect = await frameWork(run);
      const image = await win.webContents.capturePage(rect);
      if (image.isEmpty()) return null;
      const { width, height } = image.getSize();
      const scale = Math.min(1, LONGEST_SIDE / Math.max(width, height));
      const fitted =
        scale < 1
          ? image.resize({
              width: Math.round(width * scale),
              height: Math.round(height * scale),
              quality: "best",
            })
          : image;
      return {
        data: fitted.toJPEG(85),
        mimeType: "image/jpeg",
        title: win.webContents.getTitle().slice(0, 240),
      };
    } finally {
      win.destroy();
    }
  }

  // The part of the page that shows the work (desktop/artifact-region.mjs), scrolled into view; the page top
  // when nothing on it is visual or the page doesn't scroll as a whole.
  async function frameWork(run) {
    const region = pickRegion(
      await run(`(${visualBoxes})()`).catch(() => ({
        view: VIEW,
        page: VIEW,
        boxes: [],
      })),
    );
    if (!region) return undefined;
    // Toolbars pinned over the page aren't the work, so they are hidden while the part is taken.
    const top = await run(
      `for (const el of document.querySelectorAll("body *")) if (/^(fixed|sticky)$/.test(getComputedStyle(el).position)) el.style.visibility = "hidden";
      window.scrollTo(0, ${region.y}); new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(scrollY))))`,
    ).catch(() => 0);
    const y = region.y - top;
    if (y < 0 || y + region.height > VIEW.height) {
      await run("window.scrollTo(0, 0)").catch(() => {});
      return undefined;
    }
    // Pages that reveal their work on scroll get a moment to show it.
    await wait(900);
    return {
      x: region.x * SCALE,
      y: y * SCALE,
      width: region.width * SCALE,
      height: region.height * SCALE,
    };
  }

  return {
    // One artifact at a time: each render is a full page.
    captureArtifact(file) {
      const next = queue.catch(() => {}).then(() => capture(file));
      queue = next;
      return next;
    },
    // Pasted images go up at most 1600 px on their longest side. A PNG stays a PNG, so cut-outs keep
    // their transparency; anything too large becomes a JPEG.
    prepareImage({ data, mimeType }) {
      const image =
        mimeType === "image/gif" ? null : nativeImage.createFromBuffer(data);
      if (!image || image.isEmpty())
        return data.length <= MAX_MEDIA_BYTES ? { data, mimeType } : null;
      const { width, height } = image.getSize();
      const scale = Math.min(1, LONGEST_SIDE / Math.max(width, height));
      if (scale === 1 && data.length <= MAX_MEDIA_BYTES)
        return { data, mimeType };
      const fitted =
        scale < 1
          ? image.resize({
              width: Math.round(width * scale),
              height: Math.round(height * scale),
              quality: "best",
            })
          : image;
      if (mimeType === "image/png") {
        const png = fitted.toPNG();
        if (png.length <= MAX_MEDIA_BYTES)
          return { data: png, mimeType: "image/png" };
      }
      return { data: fitted.toJPEG(85), mimeType: "image/jpeg" };
    },
  };
}
