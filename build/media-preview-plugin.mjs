import { randomBytes } from "node:crypto";
import { join } from "node:path";
import getRawBody from "raw-body";
import { previewUrl } from "../desktop/preview.mjs";
import { createScreenshotCache } from "../desktop/screenshot-cache.mjs";
import { createLocalFiles } from "./local-files.mjs";
// The private bridge token is compiled into server modules, never the browser.
export function mediaPreview() {
  const id = "virtual:commonplace-preview",
    resolved = "\0" + id,
    token = randomBytes(32).toString("hex");
  let dev = false,
    port = 3100,
    screenshot,
    files;
  return {
    name: "commonplace-media-preview",
    configResolved(config) {
      dev = config.command === "serve";
      port = config.server.port || 3100;
      screenshot = createScreenshotCache(
        join(config.root, ".sites-runtime/screenshots"),
      );
      files = createLocalFiles(join(config.root, ".sites-runtime/files"));
    },
    resolveId(source) {
      if (source === id) return resolved;
    },
    load(source) {
      if (source !== resolved) return;
      if (this.environment?.name === "client")
        throw new Error("Preview bridge is server-only.");
      if (!dev)
        return `export default {async preview(){return {previewStatus:'unavailable'}},async screenshot(){return new Response(null,{status:503})},async ticket(){throw new Error('Local files unavailable')},async fileInfo(){throw new Error('Local files unavailable')},async file(){return new Response(null,{status:503})}};`;
      return `async function call(op,data){return fetch(${JSON.stringify(`http://127.0.0.1:${port}/__commonplace/preview`)},{method:'POST',headers:{'Content-Type':'application/json','X-Commonplace-Preview':${JSON.stringify(token)}},body:JSON.stringify({op,...data})});}
      async function json(op,data){const r=await call(op,data);if(!r.ok)throw new Error('Local media unavailable');return r.json();}
      export default {preview:url=>json('preview',{url}),screenshot:url=>call('screenshot',{url}),ticket:ownerId=>json('ticket',{ownerId}),fileInfo:key=>json('info',{key}),file:(key,range)=>call('file',{key,range})};`;
    },
    configureServer(server) {
      server.middlewares.use("/__commonplace/files", async (req, res) => {
        if (
          req.headers.origin &&
          req.headers.origin !== `http://127.0.0.1:${port}`
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        const id = (req.url || "").slice(1);
        await files.upload(req, res, id);
      });
      server.middlewares.use("/__commonplace/preview", async (req, res) => {
        if (
          req.method !== "POST" ||
          req.headers["x-commonplace-preview"] !== token
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        try {
          const body = JSON.parse(
            await getRawBody(req, { limit: "8kb", encoding: true }),
          );
          if (body.op === "ticket") {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(files.ticket(body.ownerId)));
            return;
          }
          if (body.op === "info") {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(await files.info(body.key)));
            return;
          }
          if (body.op === "file") {
            await files.send(body.key, body.range, res);
            return;
          }
          if (typeof body.url !== "string" || body.url.length > 4096)
            throw new Error("Invalid URL");
          if (body.op === "screenshot") {
            const image = await screenshot(body.url);
            res.setHeader("Content-Type", "image/jpeg");
            res.setHeader("Cache-Control", "private, max-age=86400");
            res.end(image);
            return;
          }
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(await previewUrl(body.url)));
        } catch {
          if (!res.headersSent) {
            res.statusCode = 503;
            res.end();
          }
        }
      });
    },
  };
}
