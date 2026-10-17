// Keep the existing SQLite queries and atomic D1 batches on hosted Turso.
export function createTursoD1(connection) {
  const result = (r) => ({
    success: true,
    results: r.rows || [],
    meta: { changes: r.rowsAffected || 0 },
  });
  const statement = (sql, args = []) => ({
    sql,
    args,
    bind: (...values) => statement(sql, values),
    async all() {
      return result((await connection.batch([{ sql, args }]))[0]);
    },
    async first(column) {
      const row = (await this.all()).results[0];
      return column ? (row?.[column] ?? null) : (row ?? null);
    },
    async raw() {
      return (await connection.batch([{ sql, args }], { raw: true }))[0].rows;
    },
    async run() {
      return this.all();
    },
  });
  return {
    prepare: statement,
    async batch(statements) {
      return (
        await connection.batch(
          statements.map(({ sql, args }) => ({ sql, args })),
          "write",
        )
      ).map(result);
    },
  };
}
