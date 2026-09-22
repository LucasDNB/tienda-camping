import test, { before, describe } from "node:test";
import assert from "node:assert";
import { initPragmas } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { CatalogService } from "../src/services/catalog.service.js";
import { CartService } from "../src/services/cart.service.js";
import { BadRequestError } from "../src/core/errors.js";

describe("Módulo 2 y 3: Catálogo, Inventario y Carrito de Compras (RF-05, RF-09, RF-10)", () => {
  before(async () => {
    await initPragmas();
    await migrate();
    await seed();
  });

  test("RF-05: Consulta de catálogo con filtros y cálculo de stock libre", async () => {
    const res = await CatalogService.getProducts({ category: "carpas" });
    assert.ok(res.items.length > 0);
    const prod = res.items[0];
    assert.strictEqual(prod.stock_free, prod.stock_available - prod.stock_reserved);
  });

  test("RF-09 & RF-10: Agregar artículo al carrito y validación de existencias", async () => {
    const userId = "usr_client_001";
    const productId = "prod_frontal_800lum"; // 50 disponibles

    const cart = await CartService.addItem(userId, productId, 2);
    const item = cart.items.find((i) => i.product_id === productId);
    assert.ok(item);
    assert.strictEqual(item.quantity, 2);
  });

  test("RF-10: Impedir agregar cantidad superior al stock libre disponible", async () => {
    const userId = "usr_client_001";
    const productId = "prod_carpa_familiar"; // 10 disponibles

    await assert.rejects(
      async () => {
        await CartService.addItem(userId, productId, 999);
      },
      (err: any) => err instanceof BadRequestError
    );
  });

  test("RF-09: Modificar cantidad y remover ítem del carrito", async () => {
    const userId = "usr_client_001";
    const productId = "prod_frontal_800lum";

    let cart = await CartService.getOrCreateCart(userId);
    const item = cart.items.find((i) => i.product_id === productId);
    assert.ok(item);

    // Actualizar cantidad a 5
    cart = await CartService.updateItemQuantity(userId, item.id, 5);
    const updated = cart.items.find((i) => i.id === item.id);
    assert.strictEqual(updated?.quantity, 5);

    // Remover ítem
    cart = await CartService.removeItem(userId, item.id);
    assert.strictEqual(cart.items.some((i) => i.id === item.id), false);
  });
});
