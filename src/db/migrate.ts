import { fileURLToPath } from "url";
import { db, initPragmas } from "./client.js";
import { SCHEMA_SQL } from "./schema.js";

export async function migrate(): Promise<void> {
  await initPragmas();

  const statements = SCHEMA_SQL
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.execute(statement);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error en migración:", err);
      process.exit(1);
    });
}
