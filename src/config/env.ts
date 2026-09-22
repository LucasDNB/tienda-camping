import dotenv from "dotenv";
dotenv.config();

export const config = {
  env: process.env.APP_ENV || "development",
  port: parseInt(process.env.PORT || "3000", 10),
  databaseUrl: process.env.DATABASE_URL || "file:local.db",
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || "",
  jwtSecret: process.env.JWT_SECRET || "camping-secret-key-change-in-production-min32chars",
  jwtExpiresIn: "24h",
  paymentSecret: process.env.PAYMENT_SECRET || "payment-webhook-secret-key-camping-outdoor",
  orderExpiryMinutes: 15,
};
