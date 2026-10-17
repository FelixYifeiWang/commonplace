import { connect } from "@tursodatabase/serverless";
import { readdir, readFile } from "node:fs/promises";
const db = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
try {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS commonplace_migrations(name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  for (const file of (await readdir("drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (
      await db.get("SELECT name FROM commonplace_migrations WHERE name=?", [
        file,
      ])
    )
      continue;
    const statements = (await readFile("drizzle/" + file, "utf8"))
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(
      [
        ...statements,
        {
          sql: "INSERT INTO commonplace_migrations VALUES(?,?)",
          args: [file, new Date().toISOString()],
        },
      ],
      "write",
    );
    console.log("Applied", file);
  }
} finally {
  await db.close();
}
