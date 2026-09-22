import { db, withTransaction } from "../db/client.js";
import { generateId } from "../core/crypto.js";
import { BadRequestError, ConflictError } from "../core/errors.js";
import { CartService } from "./cart.service.js";
import { ShippingAddress, Order } from "../domain/order.js";

export interface CheckoutResult {
  orderId: string;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  expiresAt: string;
  paymentUrl: string;
}

export class CheckoutService {
  /**
   * Ejecuta el caso de uso CU-13: Iniciar Checkout y Generar Orden de Compra
   * Abre una transacción atómica BEGIN IMMEDIATE, valida y reserva el stock.
   */
  static async createSession(userId: string, shippingAddress: ShippingAddress): Promise<CheckoutResult> {
    // 1. Recuperar ítems del carrito
    const cart = await CartService.getOrCreateCart(userId);
    if (cart.items.length === 0) {
      throw new BadRequestError("El carrito está vacío. Agregue productos antes de realizar el checkout.");
    }

    // 2. Liquidación de costos (CU-19):
    // Envío gratis en compras mayores a $150 USD (15000 centavos); de lo contrario $15 USD (1500 centavos).
    const subtotalCents = cart.subtotal_cents;
    const shippingCents = subtotalCents >= 15000 ? 0 : 1500;
    const totalCents = subtotalCents + shippingCents;

    const orderId = generateId("ord");
    const externalPaymentId = generateId("pay_sess");

    // 3. Abrir transacción atómica en modo escritura (BEGIN IMMEDIATE)
    await withTransaction(async (tx) => {
      // 3.1. Validar existencias de cada ítem con bloqueo y reservar
      for (const item of cart.items) {
        const prodRes = await tx.execute({
          sql: `SELECT id, name, price_cents, stock_available, stock_reserved, is_active
                FROM products WHERE id = ?`,
          args: [item.product_id],
        });

        if (prodRes.rows.length === 0 || !prodRes.rows[0].is_active) {
          throw new ConflictError(`El producto '${item.product?.name || item.product_id}' ya no está disponible.`);
        }

        const prod = prodRes.rows[0] as any;
        const stockFree = prod.stock_available - prod.stock_reserved;

        if (item.quantity > stockFree) {
          throw new ConflictError(
            `Existencias insuficientes para '${prod.name}'. Disponibles: ${stockFree}, Solicitados: ${item.quantity}.`
          );
        }

        // Incrementar reserva de stock
        await tx.execute({
          sql: `UPDATE products 
                SET stock_reserved = stock_reserved + ?, updated_at = datetime('now', 'utc')
                WHERE id = ?`,
          args: [item.quantity, item.product_id],
        });
      }

      // 3.2. Insertar orden de compra con expiración a 15 minutos
      await tx.execute({
        sql: `INSERT INTO orders (
                id, user_id, status, subtotal_cents, shipping_cents, total_cents,
                shipping_address_json, external_payment_id, created_at, updated_at, expires_at
              )
              VALUES (
                ?, ?, 'pending', ?, ?, ?,
                ?, ?, datetime('now', 'utc'), datetime('now', 'utc'), datetime('now', '+15 minutes')
              )`,
        args: [
          orderId,
          userId,
          subtotalCents,
          shippingCents,
          totalCents,
          JSON.stringify(shippingAddress),
          externalPaymentId,
        ],
      });

      // 3.3. Insertar desglose de productos (order_items)
      for (const item of cart.items) {
        await tx.execute({
          sql: `INSERT INTO order_items (id, order_id, product_id, unit_price_cents, quantity)
                VALUES (?, ?, ?, ?, ?)`,
          args: [
            generateId("oi"),
            orderId,
            item.product_id,
            item.product?.price_cents || 0,
            item.quantity,
          ],
        });
      }
    });

    // 4. Obtener orden creada para retornar detalles exactos
    const orderRes = await db.execute({
      sql: "SELECT expires_at FROM orders WHERE id = ?",
      args: [orderId],
    });

    const expiresAt = orderRes.rows[0].expires_at as string;

    // URL de redirección a la pasarela (o ventana de pago simulada)
    const paymentUrl = `/checkout.html?orderId=${orderId}&sessionId=${externalPaymentId}`;

    return {
      orderId,
      subtotalCents,
      shippingCents,
      totalCents,
      expiresAt,
      paymentUrl,
    };
  }
}
