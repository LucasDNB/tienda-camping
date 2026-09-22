import { db } from "../db/client.js";
import { config } from "../config/env.js";
import { verifyHmacTimingSafe, generateHmac, generateId } from "../core/crypto.js";
import { UnauthorizedError, BadRequestError } from "../core/errors.js";
import { Logger } from "../core/logger.js";
import { queue } from "../queue/in-memory-queue.js";

export interface WebhookEventPayload {
  id: string;
  type: string;
  data: {
    order_id: string;
    status: "approved" | "rejected";
    [key: string]: any;
  };
}

export class PaymentService {
  /**
   * Procesa la notificación de la pasarela de pago según CU-15 y spec 5.3
   */
  static async handleWebhook(rawBody: string, signature: string): Promise<{ status: string; message?: string }> {
    // 1. Validación de HMAC en tiempo constante (CU-15, RNF-SEC-03)
    const isValid = verifyHmacTimingSafe(rawBody, signature, config.paymentSecret);
    if (!isValid) {
      Logger.warn("Firma HMAC de webhook inválida o ausente");
      throw new UnauthorizedError("Firma criptográfica inválida");
    }

    let event: WebhookEventPayload;
    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new BadRequestError("Payload JSON malformado");
    }

    if (!event.id || !event.data || !event.data.order_id || !event.data.status) {
      throw new BadRequestError("Estructura de evento incompleta");
    }

    // 2. Registro idempotente: si el id ya existe, no duplica
    const res = await db.execute({
      sql: `INSERT OR IGNORE INTO webhook_events (id, source, event_type, payload_json, processed)
            VALUES (?, 'payment_provider', ?, ?, 0)`,
      args: [event.id, event.type || "payment.status", rawBody],
    });

    if (res.rowsAffected === 0) {
      Logger.info(`Evento duplicado ignorado de forma idempotente: ${event.id}`);
      return { status: "ignored", message: "Duplicate event ignored" };
    }

    // 3. Encolamiento asíncrono para liberar la conexión HTTP de inmediato (RF-SEC-02)
    await queue.publish("payment-events", {
      eventId: event.id,
      orderId: event.data.order_id,
      status: event.data.status,
    });

    Logger.info(`Evento de webhook ${event.id} encolado para orden ${event.data.order_id}`);
    return { status: "received" };
  }

  /**
   * Helper para simulación de pagos desde el frontend de desarrollo o pruebas
   */
  static generateSimulatedPayload(orderId: string, status: "approved" | "rejected"): {
    rawBody: string;
    signature: string;
  } {
    const payload: WebhookEventPayload = {
      id: generateId("evt"),
      type: "payment.status",
      data: {
        order_id: orderId,
        status,
        timestamp: new Date().toISOString(),
      },
    };

    const rawBody = JSON.stringify(payload);
    const signature = generateHmac(rawBody, config.paymentSecret);

    return { rawBody, signature };
  }
}
