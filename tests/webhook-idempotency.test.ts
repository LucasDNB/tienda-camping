import test, { before, describe } from "node:test";
import assert from "node:assert";
import { initPragmas, db } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { CartService } from "../src/services/cart.service.js";
import { CheckoutService } from "../src/services/checkout.service.js";
import { PaymentService } from "../src/services/payment.service.js";
import { OrderService } from "../src/services/order.service.js";
import { UnauthorizedError } from "../src/core/errors.js";

describe("Módulo 4: Webhooks, HMAC Timing-Safe e Idempotencia (CU-15, RF-14, spec 5.3)", () => {
  let testOrderId: string;
  const userId = "usr_client_001";
  const productId = "prod_set_marmitas";

  before(async () => {
    await initPragmas();
    await migrate();
    await seed();

    // Crear una orden previa para las pruebas de webhook
    await CartService.addItem(userId, productId, 1);
    const session = await CheckoutService.createSession(userId, {
      street: "Calle Bosque 123",
      city: "Ushuaia",
      state: "Tierra del Fuego",
      zip_code: "9410",
      country: "Argentina",
      phone: "+54 2901 998877",
    });
    testOrderId = session.orderId;
  });

  test("CU-15: Rechazo de webhook con firma HMAC inválida", async () => {
    const { rawBody } = PaymentService.generateSimulatedPayload(testOrderId, "approved");

    await assert.rejects(
      async () => {
        await PaymentService.handleWebhook(rawBody, "invalid_hmac_signature_hex");
      },
      (err: any) => err instanceof UnauthorizedError
    );
  });

  test("CU-15: Recepción e inserción idempotente de evento de webhook (INSERT OR IGNORE)", async () => {
    const { rawBody, signature } = PaymentService.generateSimulatedPayload(testOrderId, "approved");

    // Primera llamada: debe recibir y encolar
    const res1 = await PaymentService.handleWebhook(rawBody, signature);
    assert.strictEqual(res1.status, "received");

    // Segunda llamada con el mismo payload/id: debe ser ignorada de forma idempotente
    const res2 = await PaymentService.handleWebhook(rawBody, signature);
    assert.strictEqual(res2.status, "ignored");
  });

  test("spec 5.3: Worker consolidando pago aprobado (status = paid, deducción de stock y vaciado de carrito)", async () => {
    const eventId = `test_evt_${Date.now()}`;
    const prodBefore = await db.execute({
      sql: "SELECT stock_available, stock_reserved FROM products WHERE id = ?",
      args: [productId],
    });
    const availBefore = prodBefore.rows[0].stock_available as number;
    const resrvBefore = prodBefore.rows[0].stock_reserved as number;

    // Procesar evento como worker
    await OrderService.handlePaymentEvent({
      eventId,
      orderId: testOrderId,
      status: "approved",
    });

    // 1. Estado de orden debe ser 'paid'
    const order = await OrderService.getOrderById(testOrderId);
    assert.strictEqual(order.status, "paid");

    // 2. Inventario consolidado (stock_available y stock_reserved decrementados en 1)
    const prodAfter = await db.execute({
      sql: "SELECT stock_available, stock_reserved FROM products WHERE id = ?",
      args: [productId],
    });
    assert.strictEqual(prodAfter.rows[0].stock_available, availBefore - 1);
    assert.strictEqual(prodAfter.rows[0].stock_reserved, resrvBefore - 1);

    // 3. Carrito del cliente vaciado
    const cart = await CartService.getOrCreateCart(userId);
    assert.strictEqual(cart.items.length, 0);
  });
});
