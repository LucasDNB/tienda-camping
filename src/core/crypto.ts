import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/env.js";

const BCRYPT_SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: "admin" | "client";
  [key: string]: any;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: "24h",
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Valida la firma HMAC en tiempo constante para evitar ataques de temporización (timing attacks).
 */
export function verifyHmacTimingSafe(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) {
    return false;
  }

  const computedHmac = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const computedBuffer = Buffer.from(computedHmac, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");

  if (computedBuffer.length !== signatureBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, signatureBuffer);
}

export function generateHmac(rawBody: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
}

export function generateId(prefix: string = ""): string {
  const uuid = crypto.randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}
