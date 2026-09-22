import crypto from "crypto";
import { Logger } from "./logger.js";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class BadRequestError extends AppError {
  constructor(message: string = "Bad Request", details?: any) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Not Found") {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Conflict", details?: any) {
    super(409, message, details);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message: string = "Payload Too Large") {
    super(413, message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message: string = "Too Many Requests") {
    super(429, message);
  }
}

export interface ErrorResponse {
  statusCode: number;
  body: {
    error: string;
    correlationId?: string;
    details?: any;
  };
}

/**
 * RNF-SEC-07: Ofuscación de errores internos a nivel global.
 * Respuestas 500 se limitan a "Internal Server Error" con correlationId.
 */
export function handleGlobalError(error: unknown, correlationId: string = crypto.randomUUID()): ErrorResponse {
  if (error instanceof AppError) {
    Logger.warn(`AppError [${error.statusCode}]: ${error.message}`, { details: error.details }, correlationId);
    return {
      statusCode: error.statusCode,
      body: {
        error: error.message,
        correlationId,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }

  // Error inesperado / motor de base de datos
  const err = error instanceof Error ? error : new Error(String(error));
  Logger.error(`InternalServerError: ${err.message}`, { stack: err.stack }, correlationId);

  return {
    statusCode: 500,
    body: {
      error: "Internal Server Error",
      correlationId,
    },
  };
}
