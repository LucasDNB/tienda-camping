import test, { before, describe } from "node:test";
import assert from "node:assert";
import { initPragmas, db } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { OrderService } from "../src/services/order.service.js";
import { generateId } from "../src/core/crypto.js";

describe("Módulo 4: Limpieza de Reservas Vencidas - Cron Job (spec 5.4 fn-cron-cleaner)", () => {
  before(async () => {
    await initPragmas();
    await migrate();
    await seed();
  });

  test("spec 5.4: fn-cron-cleaner restituye stock reservado y cancela órdenes vencidas", async () => {
    const prodId = "prod_bolsa_pluma_extrema";

    // 1. Obtener estado de stock actual
    const prodBefore = await db.execute({
      sql: "SELECT stock_available, stock_reserved FROM products WHERE id = ?",
      args: [prodId],
    });
    const reservedInitial = prodBefore.rows[0].stock_reserved as number;

    // 2. Insertar directamente una orden pendiente simulada como vencida (hace 20 minutos)
    const expiredOrderId = generateId("ord_exp");
    const quantity = 3;

    // Aumentar stock_reserved artificialmente para simular la reserva previa
    await db.execute({
      sql: "UPDATE products SET stock_reserved = stock_reserved + ? WHERE id = ?",
      args: [quantity, prodId],
    });

    const expiredPaymentId = generateId("pay_exp");

    await db.execute({
      sql: `INSERT INTO orders (
              id, user_id, status, subtotal_cents, shipping_cents, total_cents,
              shipping_address_json, external_payment_id, created_at, updated_at, expires_at
            )
            VALUES (
              ?, 'usr_client_001', 'pending', 104997, 0, 104997,
              '{}', ?, datetime('now', '-25 minutes'), datetime('now', '-25 minutes'), datetime('now', '-10 minutes')
            )`,
      args: [expiredOrderId, expiredPaymentId],
    });

    await db.execute({
      sql: `INSERT INTO order_items (id, order_id, product_id, unit_price_cents, quantity)
            VALUES (?, ?, ?, 34999, ?)`,
      args: [generateId("oi"), expiredOrderId, prodId, quantity],
    });

    // 3. Ejecutar la función fn-cron-cleaner
    const { cancelledCount } = await OrderService.cancelExpiredOrders();
    assert.ok(cancelledCount >= 1);

    // 4. Verificar que la orden vencida pasó a estado 'cancelled'
    const orderRes = await db.execute({
      sql: "SELECT status FROM orders WHERE id = ?",
      args: [expiredOrderId],
    });
    assert.strictEqual(orderRes.rows[0].status, "cancelled");

    // 5. Verificar que el stock reservado fue restituido al nivel inicial
    const prodAfter = await db.execute({
      sql: "SELECT stock_available, stock_reserved FROM products WHERE id = ?",
      args: [prodId],
    });
    assert.strictEqual(prodAfter.rows[0].stock_reserved, reservedInitial);
  });
});
