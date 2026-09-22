import { createClient, Client, Transaction } from "@libsql/client";
import { config } from "../config/env.js";

export const db: Client = createClient({
  url: config.databaseUrl,
  authToken: config.databaseAuthToken || undefined,
});

export async function initPragmas(): Promise<void> {
  // Configurar PRAGMAs en modo WAL (spec 5.1)
  await db.execute("PRAGMA foreign_keys = ON;");
  await db.execute("PRAGMA journal_mode = WAL;");
  await db.execute("PRAGMA synchronous = NORMAL;");
  await db.execute("PRAGMA busy_timeout = 5000;");
}

export type DatabaseTransaction = Transaction;

/**
 * Ejecuta una transacción atómica bajo BEGIN IMMEDIATE (por defecto mode='write')
 * garantizando ACID (RNF-REL-02) con commit y rollback seguro.
 */
export async function withTransaction<T>(
  fn: (tx: Transaction) => Promise<T>,
  mode: "write" | "read" | "deferred" = "write"
): Promise<T> {
  const tx = await db.transaction(mode);
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // Ignorar error si la transacción ya fue abortada
    }
    throw error;
  } finally {
    tx.close();
  }
}
