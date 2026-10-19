import { readFileSync } from "node:fs";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { get, put } from "@vercel/blob";
import { screenshotResource } from "../../desktop/screenshot-resource.mjs";
import { hasVisualContent } from "../../desktop/capture-quality.mjs";
import { publicUrl } from "../media.mjs";
import { pageReadiness } from "./screenshot-readiness.mjs";
import { createScreenshotCache } from "./screenshot-cache.mjs";

async function capture(url) {
  const browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: "shell",
    pipe: true,
    // The renderer cannot reach the network directly. Every HTTP resource goes
    // through our DNS-pinned, credential-free transport, including redirects.
    args: [
      ...chromium.args,
      "--proxy-server=http://127.0.0.1:9",
      "--proxy-bypass-list=<-loopback>",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    ],
    defaultViewport: { width: 1280, height: 960, deviceScaleFactor: 1 },
  });
  let stage = "navigation";
  const started = Date.now();
  const deadline = setTimeout(() => {
    let cpuTicks = null;
    try {
      const stat = readFileSync(`/proc/${browser.process().pid}/stat`, "utf8");
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      cpuTicks = Number(fields[11]) + Number(fields[12]);
    } catch {
      /* The renderer may already have exited. */
    }
    console.warn("Preview capture deadline", {
      stage,
      elapsedMs: Date.now() - started,
      cpuTicks,
    });
    void browser.close().catch(() => {});
  }, 90000);
  try {
    const page = await browser.newPage();
    const client = await page.createCDPSession();
    await client.send("Browser.setDownloadBehavior", { behavior: "deny" });
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    let resources = 0;
    page.on("request", async (request) => {
      try {
        const target = request.url();
        if (target.startsWith("data:") || target === "about:blank")
          return await request.continue();
        if (
          !publicUrl(target) ||
          !["GET", "HEAD"].includes(request.method()) ||
          ++resources > 160 ||
          ["media", "websocket"].includes(request.resourceType())
        )
          return await request.abort();
        const result = await screenshotResource(target);
        await request.respond({
          status: result.status,
          headers: result.headers,
          body: result.body,
        });
      } catch {
        if (!request.isInterceptResolutionHandled())
          await request.abort().catch(() => {});
      }
    });
    page.on("dialog", (dialog) => {
      void dialog.dismiss();
    });
    page.on("popup", (popup) => {
      void popup.close();
    });
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    if (!response?.ok()) throw Error("Page unavailable for preview.");
    stage = "readiness";
    let stableSince = 0,
      signature = "",
      ready = false;
    const until = Date.now() + 12000;
    while (Date.now() < until) {
      const state = await page.evaluate(pageReadiness);
      if (state.blocked) throw Error("Page requires sign-in or verification.");
      if (state.ready) {
        if (state.signature !== signature) {
          signature = state.signature;
          stableSince = Date.now();
        } else if (Date.now() - stableSince >= 1200) {
          ready = true;
          break;
        }
      } else {
        signature = "";
        stableSince = 0;
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    if (!ready) throw Error("Page stayed blank or loading.");
    console.info("Preview page ready", { elapsedMs: Date.now() - started });
    stage = "screenshot";
    const png = Buffer.from(await page.screenshot({ type: "png" }));
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (!hasVisualContent(data, info.width, info.height))
      throw Error("Page has no visible content.");
    return sharp(png).jpeg({ quality: 82 }).toBuffer();
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}
const cachedCapture = createScreenshotCache({
  capture,
  read: async (key) => {
    const result = await get(key, { access: "private" });
    return result?.statusCode === 200
      ? Buffer.from(await new Response(result.stream).arrayBuffer())
      : null;
  },
  write: (key, bytes) =>
    put(key, bytes, {
      access: "private",
      contentType: "image/jpeg",
      addRandomSuffix: false,
      allowOverwrite: true,
    }),
});
export async function hostedScreenshot(url) {
  if (!publicUrl(url)) return new Response(null, { status: 404 });
  try {
    return new Response(await cachedCapture(url), {
      headers: { "Content-Type": "image/jpeg" },
    });
  } catch (error) {
    console.warn(
      "Page preview unavailable:",
      error instanceof Error ? error.message : "Capture failed",
    );
    return new Response(null, { status: 503 });
  }
}
