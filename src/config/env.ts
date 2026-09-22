import dotenv from "dotenv";
import os from "os";
import path from "path";

dotenv.config();

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  // En Vercel o AWS Lambda, /var/task es de solo lectura (error SQLite 14: SQLITE_CANTOPEN).
  // Usamos el directorio temporal /tmp que sí tiene permisos de lectura y escritura.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NODE_ENV === "production") {
    const tmpPath = path.join(os.tmpdir(), "camping.db").replace(/\\/g, "/");
    return `file:${tmpPath}`;
  }
  return "file:local.db";
}

export const config = {
  env: process.env.APP_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  databaseUrl: getDatabaseUrl(),
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || "",
  jwtSecret: process.env.JWT_SECRET || "camping-secret-key-change-in-production-min32chars",
  jwtExpiresIn: "24h",
  paymentSecret: process.env.PAYMENT_SECRET || "payment-webhook-secret-key-camping-outdoor",
  orderExpiryMinutes: 15,
};
