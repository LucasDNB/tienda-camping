import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db, initPragmas } from "./client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function migrate(): Promise<void> {
  console.log("Aplicando PRAGMAs y migraciones...");
  await initPragmas();

  const schemaPath = fs.existsSync(path.join(__dirname, "schema.sql"))
    ? path.join(__dirname, "schema.sql")
    : path.join(__dirname, "../../src/db/schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf-8");

  // Dividir por punto y coma ignorando líneas vacías
  const statements = schemaSql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await db.execute(statement);
  }

  console.log("Migraciones aplicadas con éxito.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error en migración:", err);
      process.exit(1);
    });
}
