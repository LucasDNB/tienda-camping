import { OrderService } from "../services/order.service.js";
import { queue } from "../queue/in-memory-queue.js";
import { Logger } from "../core/logger.js";

export interface PaymentMessage {
  eventId: string;
  orderId: string;
  status: "approved" | "rejected";
}

/**
 * Worker en segundo plano que procesa eventos de pago (spec 5.3 fn-worker-processor)
 */
export async function paymentProcessor(msg: PaymentMessage): Promise<void> {
  try {
    await OrderService.handlePaymentEvent(msg);
  } catch (error) {
    Logger.error(`Error en worker paymentProcessor para orden ${msg.orderId}:`, { error, msg });
    throw error;
  }
}

/**
 * Tarea programada de limpieza de órdenes expiradas (spec 5.4 fn-cron-cleaner)
 */
export async function stockCleaner(): Promise<{ cancelledCount: number }> {
  try {
    return await OrderService.cancelExpiredOrders();
  } catch (error) {
    Logger.error("Error en cron stockCleaner:", { error });
    throw error;
  }
}

// Suscribir el worker a la cola interna de Antigravity Runtime
queue.subscribe("payment-events", paymentProcessor);
