import { randomBytes } from "node:crypto";
import getRawBody from "raw-body";
import { previewUrl } from "../desktop/preview.mjs";
// Local-only server bridge. The private token is compiled into the server module, never the browser.
export function mediaPreview() {
  const id = "virtual:commonplace-preview",
    resolved = "\0" + id,
    token = randomBytes(32).toString("hex");
  let dev = false,
    port = 3100;
  return {
    name: "commonplace-media-preview",
    configResolved(config) {
      dev = config.command === "serve";
      port = config.server.port || 3100;
    },
    resolveId(source) {
      if (source === id) return resolved;
    },
    load(source) {
      if (source !== resolved) return;
      if (this.environment?.name === "client")
        throw new Error("Preview bridge is server-only.");
      if (!dev)
        return 'export default { async preview(){ return {previewStatus:"unavailable"}; } };';
      return `export default {async preview(url){const r=await fetch(${JSON.stringify("http://127.0.0.1:" + port + "/__commonplace/preview")},{method:'POST',headers:{'Content-Type':'application/json','X-Commonplace-Preview':${JSON.stringify(token)}},body:JSON.stringify({url})});if(!r.ok)throw new Error('Preview unavailable');return r.json();}};`;
    },
    configureServer(server) {
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
          if (typeof body.url !== "string" || body.url.length > 4096)
            throw new Error("Invalid URL");
          const result = await previewUrl(body.url);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
        } catch {
          res.statusCode = 400;
          res.end();
        }
      });
    },
  };
}
