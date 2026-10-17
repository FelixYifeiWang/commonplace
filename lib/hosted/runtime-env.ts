import { connect } from "@tursodatabase/serverless";
import { createTursoD1 } from "../turso-d1.mjs";
let database: D1Database | undefined;
export const env = {
  get DB(): D1Database {
    if (!database) {
      if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN)
        throw new Error("Hosted database is not configured.");
      database = createTursoD1(
        connect({
          url: process.env.TURSO_DATABASE_URL,
          authToken: process.env.TURSO_AUTH_TOKEN,
        }),
      ) as unknown as D1Database;
    }
    return database;
  },
};
