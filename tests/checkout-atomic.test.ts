import test, { before, describe } from "node:test";
import assert from "node:assert";
import { initPragmas, db } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { CartService } from "../src/services/cart.service.js";
import { CheckoutService } from "../src/services/checkout.service.js";
import { ConflictError } from "../src/core/errors.js";

describe("Módulo 4: Checkout, Transacción BEGIN IMMEDIATE y Reserva Atómica (CU-13, RF-12, RNF-REL-02)", () => {
  before(async () => {
    await initPragmas();
    await migrate();
    await seed();
  });

  test("CU-13: Creación de sesión de checkout con reserva atómica de stock a 15 minutos", async () => {
    const userId = "usr_client_001";
    const productId = "prod_mochila_45l";

    // 1. Obtener stock inicial
    const prodBefore = await db.execute({
      sql: "SELECT stock_available, stock_reserved FROM products WHERE id = ?",
      args: [productId],
    });
    const reservedBefore = prodBefore.rows[0].stock_reserved as number;

    // 2. Agregar 2 mochilas al carrito
    await CartService.addItem(userId, productId, 2);

    // 3. Iniciar checkout
    const result = await CheckoutService.createSession(userId, {
      street: "Ruta 40 Km 1200",
      city: "El Chaltén",
      state: "Santa Cruz",
      zip_code: "9301",
      country: "Argentina",
      phone: "+54 2966 123456",
    });

    assert.ok(result.orderId);
    assert.strictEqual(result.totalCents, result.subtotalCents + result.shippingCents);
    assert.ok(new Date(result.expiresAt) > new Date());

    // 4. Verificar que el stock_reserved aumentó en 2
    const prodAfter = await db.execute({
      sql: "SELECT stock_available, stock_reserved FROM products WHERE id = ?",
      args: [productId],
    });
    const reservedAfter = prodAfter.rows[0].stock_reserved as number;
    assert.strictEqual(reservedAfter, reservedBefore + 2);

    // 5. Verificar que la orden quedó en 'pending'
    const orderRes = await db.execute({
      sql: "SELECT status, expires_at FROM orders WHERE id = ?",
      args: [result.orderId],
    });
    assert.strictEqual(orderRes.rows[0].status, "pending");
  });

  test("CU-13: Prevención de sobreventa (overselling) cuando se agota el stock libre", async () => {
    // Configurar un producto de prueba con sólo 1 unidad física
    const testProdId = "prod_calentador_gas";
    await db.execute({
      sql: "UPDATE products SET stock_available = 1, stock_reserved = 0 WHERE id = ?",
      args: [testProdId],
    });

    // Cliente 1 agrega la única unidad al carrito y crea sesión
    const user1 = "usr_client_001";
    await CartService.addItem(user1, testProdId, 1);
    await CheckoutService.createSession(user1, {
      street: "Calle 1",
      city: "Ciudad",
      state: "Provincia",
      zip_code: "1000",
      country: "Argentina",
      phone: "+54 11 12345678",
    });

    // En este punto, stock_available = 1 y stock_reserved = 1 -> stock_free = 0
    // Cliente 2 intenta agregar o reservar
    const user2 = "usr_admin_001";
    await assert.rejects(
      async () => {
        await CartService.addItem(user2, testProdId, 1);
      },
      (err: any) => err.statusCode === 400 || err.statusCode === 409
    );
  });
});
