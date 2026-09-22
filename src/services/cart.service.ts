import { db } from "../db/client.js";
import { generateId } from "../core/crypto.js";
import { BadRequestError, NotFoundError } from "../core/errors.js";
import { Cart, CartItem } from "../domain/cart.js";

export class CartService {
  /**
   * Obtiene o crea el carrito de un usuario.
   */
  static async getOrCreateCart(userId: string): Promise<Cart> {
    let cartRes = await db.execute({
      sql: "SELECT id, user_id, updated_at FROM carts WHERE user_id = ?",
      args: [userId],
    });

    let cartId: string;
    if (cartRes.rows.length === 0) {
      cartId = generateId("cart");
      await db.execute({
        sql: "INSERT INTO carts (id, user_id) VALUES (?, ?)",
        args: [cartId, userId],
      });
    } else {
      cartId = cartRes.rows[0].id as string;
    }

    // Obtener ítems del carrito con detalles de producto y cálculo de stock disponible
    const itemsRes = await db.execute({
      sql: `SELECT 
              ci.id, ci.cart_id, ci.product_id, ci.quantity, ci.created_at,
              p.name as product_name, p.slug as product_slug, p.price_cents,
              p.stock_available, p.stock_reserved,
              (p.stock_available - p.stock_reserved) as stock_free,
              p.images_json, p.is_active
            FROM cart_items ci
            JOIN products p ON ci.product_id = p.id
            WHERE ci.cart_id = ?
            ORDER BY ci.created_at ASC`,
      args: [cartId],
    });

    let subtotalCents = 0;
    const items: CartItem[] = itemsRes.rows.map((row: any) => {
      const itemSubtotal = row.price_cents * row.quantity;
      subtotalCents += itemSubtotal;

      return {
        id: row.id,
        cart_id: row.cart_id,
        product_id: row.product_id,
        quantity: row.quantity,
        created_at: row.created_at,
        product: {
          id: row.product_id,
          category_id: "",
          name: row.product_name,
          slug: row.product_slug,
          description: "",
          price_cents: row.price_cents,
          stock_available: row.stock_available,
          stock_reserved: row.stock_reserved,
          stock_free: Math.max(0, row.stock_free),
          images_json: row.images_json,
          images: JSON.parse(row.images_json || "[]"),
          is_active: row.is_active,
          created_at: "",
          updated_at: "",
        },
      };
    });

    return {
      id: cartId,
      user_id: userId,
      updated_at: (cartRes.rows[0]?.updated_at as string) || new Date().toISOString(),
      items,
      subtotal_cents: subtotalCents,
    };
  }

  /**
   * Agrega un producto al carrito validando stock disponible (RF-09, RF-10).
   */
  static async addItem(userId: string, productId: string, quantity: number): Promise<Cart> {
    if (quantity <= 0) {
      throw new BadRequestError("La cantidad debe ser mayor a cero");
    }

    // 1. Obtener producto y verificar existencias
    const prodRes = await db.execute({
      sql: `SELECT id, name, price_cents, stock_available, stock_reserved, is_active
            FROM products WHERE id = ?`,
      args: [productId],
    });

    if (prodRes.rows.length === 0 || !prodRes.rows[0].is_active) {
      throw new NotFoundError("El producto no existe o se encuentra inactivo");
    }

    const prod = prodRes.rows[0] as any;
    const stockFree = prod.stock_available - prod.stock_reserved;

    // 2. Obtener carrito
    const cart = await this.getOrCreateCart(userId);
    const existingItem = cart.items.find((i) => i.product_id === productId);
    const targetQuantity = existingItem ? existingItem.quantity + quantity : quantity;

    if (targetQuantity > stockFree) {
      throw new BadRequestError(
        `Stock insuficiente para '${prod.name}'. Disponibles: ${stockFree}, Solicitados: ${targetQuantity}`
      );
    }

    if (existingItem) {
      await db.execute({
        sql: "UPDATE cart_items SET quantity = ? WHERE id = ?",
        args: [targetQuantity, existingItem.id],
      });
    } else {
      await db.execute({
        sql: "INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES (?, ?, ?, ?)",
        args: [generateId("ci"), cart.id, productId, quantity],
      });
    }

    await db.execute({
      sql: "UPDATE carts SET updated_at = datetime('now', 'utc') WHERE id = ?",
      args: [cart.id],
    });

    return this.getOrCreateCart(userId);
  }

  /**
   * Modifica la cantidad de un ítem existente en el carrito.
   */
  static async updateItemQuantity(userId: string, itemId: string, quantity: number): Promise<Cart> {
    if (quantity <= 0) {
      return this.removeItem(userId, itemId);
    }

    const cart = await this.getOrCreateCart(userId);
    const item = cart.items.find((i) => i.id === itemId);

    if (!item) {
      throw new NotFoundError("El producto no se encuentra en el carrito");
    }

    // Validar stock
    const prodRes = await db.execute({
      sql: "SELECT name, stock_available, stock_reserved FROM products WHERE id = ?",
      args: [item.product_id],
    });

    if (prodRes.rows.length === 0) {
      throw new NotFoundError("Producto no encontrado");
    }

    const prod = prodRes.rows[0] as any;
    const stockFree = prod.stock_available - prod.stock_reserved;

    if (quantity > stockFree) {
      throw new BadRequestError(
        `Stock insuficiente para '${prod.name}'. Disponibles: ${stockFree}, Solicitados: ${quantity}`
      );
    }

    await db.execute({
      sql: "UPDATE cart_items SET quantity = ? WHERE id = ?",
      args: [quantity, itemId],
    });

    await db.execute({
      sql: "UPDATE carts SET updated_at = datetime('now', 'utc') WHERE id = ?",
      args: [cart.id],
    });

    return this.getOrCreateCart(userId);
  }

  /**
   * Elimina un ítem del carrito.
   */
  static async removeItem(userId: string, itemId: string): Promise<Cart> {
    const cart = await this.getOrCreateCart(userId);

    await db.execute({
      sql: "DELETE FROM cart_items WHERE id = ? AND cart_id = ?",
      args: [itemId, cart.id],
    });

    await db.execute({
      sql: "UPDATE carts SET updated_at = datetime('now', 'utc') WHERE id = ?",
      args: [cart.id],
    });

    return this.getOrCreateCart(userId);
  }

  /**
   * Vacía el carrito.
   */
  static async clearCart(userId: string): Promise<void> {
    const cart = await this.getOrCreateCart(userId);
    await db.execute({
      sql: "DELETE FROM cart_items WHERE cart_id = ?",
      args: [cart.id],
    });
  }
}
