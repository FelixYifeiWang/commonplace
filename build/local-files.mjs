import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm, stat } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
const validKey = /^[0-9a-f-]{36}$/;
export function createLocalFiles(root) {
  const tickets = new Map();
  async function info(key) {
    if (!validKey.test(key)) throw new Error("Invalid file");
    return JSON.parse(await readFile(join(root, key + ".json"), "utf8"));
  }
  return {
    ticket(ownerId) {
      for (const [key, value] of tickets)
        if (value.expires < Date.now()) tickets.delete(key);
      const id = randomUUID();
      tickets.set(id, { ownerId, expires: Date.now() + 10 * 60 * 1000 });
      return { url: `/__commonplace/files/${id}` };
    },
    info,
    // A file the server received itself (a companion's picture), stored like an upload.
    async write({ ownerId, name, mimeType, bytes }) {
      const key = randomUUID(),
        file = join(root, key);
      await mkdir(root, { recursive: true, mode: 0o700 });
      await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
      await writeFile(
        file + ".json",
        JSON.stringify({ key, name, mimeType, ownerId, size: bytes.length }),
        { mode: 0o600 },
      );
      return key;
    },
    async upload(req, res, id) {
      const ticket = tickets.get(id);
      tickets.delete(id);
      if (req.method !== "PUT" || !ticket || ticket.expires < Date.now()) {
        res.statusCode = 403;
        res.end();
        return;
      }
      const key = randomUUID(),
        file = join(root, key),
        temp = file + ".tmp";
      try {
        await mkdir(root, { recursive: true, mode: 0o700 });
        const name =
          decodeURIComponent(String(req.headers["x-file-name"] || "File"))
            .replace(/[\x00-\x1f]/g, "")
            .slice(0, 240) || "File";
        const raw = String(
          req.headers["content-type"] || "application/octet-stream",
        );
        const mimeType = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(raw)
          ? raw
          : "application/octet-stream";
        let size = 0;
        const limit = new Transform({
          transform(chunk, _enc, cb) {
            size += chunk.length;
            cb(
              size > 250 * 1024 * 1024
                ? new Error("File exceeds 250 MB.")
                : null,
              chunk,
            );
          },
        });
        await pipeline(
          req,
          limit,
          createWriteStream(temp, { flags: "wx", mode: 0o600 }),
        );
        await rename(temp, file);
        await writeFile(
          file + ".json",
          JSON.stringify({
            key,
            name,
            mimeType,
            ownerId: ticket.ownerId,
            size,
          }),
          { mode: 0o600 },
        );
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ key, name, mimeType, size }));
      } catch {
        await rm(temp, { force: true });
        await rm(file, { force: true });
        if (!res.headersSent) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Could not upload file." }));
        }
      }
    },
    async send(key, range, res) {
      const meta = await info(key),
        file = join(root, key),
        { size } = await stat(file);
      res.setHeader("Content-Type", meta.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      const inline = /^(image\/|audio\/|video\/|application\/pdf$)/.test(
        meta.mimeType,
      );
      res.setHeader(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
      );
      let start = 0,
        end = size - 1;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) {
          res.statusCode = 416;
          res.end();
          return;
        }
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
        if (start > end || start >= size) {
          res.statusCode = 416;
          res.end();
          return;
        }
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      }
      res.setHeader("Content-Length", Math.max(0, end - start + 1));
      res.setHeader("Cache-Control", "private, max-age=3600");
      if (!size) {
        res.end();
        return;
      }
      await pipeline(createReadStream(file, { start, end }), res);
    },
  };
}
