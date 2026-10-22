// Operator-only. Load the existing hosted database credentials before running.
import { connect } from "@tursodatabase/serverless";
const db = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
try {
  const rows = await db.all(
    "SELECT reporter,report,created_at FROM setup_reports WHERE created_at>? ORDER BY created_at DESC LIMIT 20",
    [Date.now() - 30 * 24 * 60 * 60 * 1000],
  );
  for (const row of rows)
    console.log(
      JSON.stringify({
        at: new Date(row.created_at).toISOString(),
        ...JSON.parse(row.report),
      }),
    );
} finally {
  await db.close();
}
