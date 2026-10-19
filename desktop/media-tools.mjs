// Electron side of session pictures (see lib/session-media.mjs). Kept out of collector.mjs so the
// collector stays testable without Electron.
import { MAX_MEDIA_BYTES } from "../lib/session-media.mjs";

const LONGEST_SIDE = 1600;
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
      width: 1280,
      height: 800,
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        session: isolated,
        backgroundThrottling: false,
      },
    });
    try {
      win.webContents.setAudioMuted(true);
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (event) => event.preventDefault());
      await within(win.loadFile(file), 15000);
      await within(
        win.webContents.executeJavaScript(
          "document.fonts ? document.fonts.ready.then(() => true) : true",
          true,
        ),
        5000,
      ).catch(() => {});
      // Let entrance animations settle before the picture is taken.
      await wait(1200);
      const image = await win.webContents.capturePage();
      if (image.isEmpty()) return null;
      const { width } = image.getSize();
      const fitted = width > 1280 ? image.resize({ width: 1280 }) : image;
      return {
        data: fitted.toJPEG(82),
        mimeType: "image/jpeg",
        title: win.webContents.getTitle().slice(0, 240),
      };
    } finally {
      win.destroy();
    }
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
