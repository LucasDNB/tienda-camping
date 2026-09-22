import { db, withTransaction } from "../db/client.js";
import { NotFoundError, BadRequestError } from "../core/errors.js";
import { Logger } from "../core/logger.js";
import { Order, OrderStatus } from "../domain/order.js";

export class OrderService {
  static async getUserOrders(userId: string): Promise<Order[]> {
    const ordersRes = await db.execute({
      sql: `SELECT id, user_id, status, subtotal_cents, shipping_cents, total_cents,
                   shipping_address_json, external_payment_id, created_at, updated_at, expires_at
            FROM orders
            WHERE user_id = ?
            ORDER BY created_at DESC`,
      args: [userId],
    });

    const orders: Order[] = [];
    for (const row of ordersRes.rows as any[]) {
      const itemsRes = await db.execute({
        sql: `SELECT oi.id, oi.order_id, oi.product_id, oi.unit_price_cents, oi.quantity,
                     p.name as product_name, p.slug as product_slug, p.images_json
              FROM order_items oi
              JOIN products p ON oi.product_id = p.id
              WHERE oi.order_id = ?`,
        args: [row.id],
      });

      orders.push({
        ...row,
        shipping_address: JSON.parse(row.shipping_address_json || "{}"),
        items: itemsRes.rows.map((i: any) => ({
          ...i,
          product: {
            id: i.product_id,
            name: i.product_name,
            slug: i.product_slug,
            images: JSON.parse(i.images_json || "[]"),
          },
        })),
      });
    }

    return orders;
  }

  static async getOrderById(orderId: string, userId?: string): Promise<Order> {
    const conditions = ["id = ?"];
    const args: any[] = [orderId];

    if (userId) {
      conditions.push("user_id = ?");
      args.push(userId);
    }

    const res = await db.execute({
      sql: `SELECT id, user_id, status, subtotal_cents, shipping_cents, total_cents,
                   shipping_address_json, external_payment_id, created_at, updated_at, expires_at
            FROM orders WHERE ${conditions.join(" AND ")}`,
      args,
    });

    if (res.rows.length === 0) {
      throw new NotFoundError("Orden de compra no encontrada");
    }

    const row = res.rows[0] as any;
    const itemsRes = await db.execute({
      sql: `SELECT oi.id, oi.order_id, oi.product_id, oi.unit_price_cents, oi.quantity,
                   p.name as product_name, p.slug as product_slug, p.images_json
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?`,
      args: [orderId],
    });

    return {
      ...row,
      shipping_address: JSON.parse(row.shipping_address_json || "{}"),
      items: itemsRes.rows.map((i: any) => ({
        ...i,
        product: {
          id: i.product_id,
          name: i.product_name,
          slug: i.product_slug,
          images: JSON.parse(i.images_json || "[]"),
        },
      })),
    };
  }

  static async getAdminOrders(statusFilter?: string): Promise<Order[]> {
    const conditions: string[] = [];
    const args: any[] = [];

    if (statusFilter) {
      conditions.push("o.status = ?");
      args.push(statusFilter);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const res = await db.execute({
      sql: `SELECT o.id, o.user_id, o.status, o.subtotal_cents, o.shipping_cents, o.total_cents,
                   o.shipping_address_json, o.external_payment_id, o.created_at, o.updated_at, o.expires_at,
                   u.email as user_email, u.first_name as user_first_name, u.last_name as user_last_name
            FROM orders o
            JOIN users u ON o.user_id = u.id
            ${whereClause}
            ORDER BY o.created_at DESC`,
      args,
    });

    return res.rows.map((row: any) => ({
      ...row,
      shipping_address: JSON.parse(row.shipping_address_json || "{}"),
    }));
  }

  static async updateOrderStatus(orderId: string, status: OrderStatus, trackingNumber?: string): Promise<Order> {
    const validTransitions: Record<string, OrderStatus[]> = {
      pending: ["paid", "cancelled"],
      paid: ["preparing", "cancelled"],
      preparing: ["shipped", "cancelled"],
      shipped: ["delivered"],
      delivered: [],
      cancelled: [],
    };

    const current = await this.getOrderById(orderId);
    const allowed = validTransitions[current.status] || [];

    if (!allowed.includes(status)) {
      throw new BadRequestError(`Transición no válida de '${current.status}' a '${status}'`);
    }

    await db.execute({
      sql: `UPDATE orders SET status = ?, updated_at = datetime('now', 'utc') WHERE id = ?`,
      args: [status, orderId],
    });

    Logger.info(`Orden ${orderId} actualizada a estado ${status}`, { trackingNumber });
    return this.getOrderById(orderId);
  }

  /**
   * Procesa el evento de pago asíncrono recibido desde el webhook (spec 5.3)
   */
  static async handlePaymentEvent(msg: {
    eventId: string;
    orderId: string;
    status: "approved" | "rejected";
  }): Promise<void> {
    Logger.info(`Procesando evento de pago en segundo plano: ${msg.status} para orden ${msg.orderId}`);

    if (msg.status === "approved") {
      await withTransaction(async (tx) => {
        // 1. Marcar la orden como abonada
        await tx.execute({
          sql: `UPDATE orders SET status = 'paid', updated_at = datetime('now', 'utc') WHERE id = ?`,
          args: [msg.orderId],
        });

        // 2. Consolidar inventario: deducir reservas y existencias físicas
        await tx.execute({
          sql: `UPDATE products
                SET stock_available = MAX(0, stock_available - oi.quantity),
                    stock_reserved = MAX(0, stock_reserved - oi.quantity),
                    updated_at = datetime('now', 'utc')
                FROM order_items oi
                WHERE oi.order_id = ? AND products.id = oi.product_id`,
          args: [msg.orderId],
        });

        // 3. Limpiar carrito del cliente
        await tx.execute({
          sql: `DELETE FROM cart_items 
                WHERE cart_id = (SELECT c.id FROM carts c JOIN orders o ON o.user_id = c.user_id WHERE o.id = ?)`,
          args: [msg.orderId],
        });

        // 4. Marcar evento de webhook como procesado
        await tx.execute({
          sql: `UPDATE webhook_events SET processed = 1 WHERE id = ?`,
          args: [msg.eventId],
        });
      });

      Logger.info(`Orden ${msg.orderId} consolidada como 'paid' con inventario actualizado`);
    } else {
      await withTransaction(async (tx) => {
        // 1. Cancelar orden
        await tx.execute({
          sql: `UPDATE orders SET status = 'cancelled', updated_at = datetime('now', 'utc') WHERE id = ?`,
          args: [msg.orderId],
        });

        // 2. Liberar stock reservado
        await tx.execute({
          sql: `UPDATE products
                SET stock_reserved = MAX(0, stock_reserved - oi.quantity),
                    updated_at = datetime('now', 'utc')
                FROM order_items oi
                WHERE oi.order_id = ? AND products.id = oi.product_id`,
          args: [msg.orderId],
        });

        // 3. Marcar evento como procesado
        await tx.execute({
          sql: `UPDATE webhook_events SET processed = 1 WHERE id = ?`,
          args: [msg.eventId],
        });
      });

      Logger.info(`Orden ${msg.orderId} cancelada y reserva de stock liberada`);
    }
  }

  /**
   * Cron Job (spec 5.4): Limpieza de reservas vencidas cada 5 minutos
   */
  static async cancelExpiredOrders(): Promise<{ cancelledCount: number }> {
    Logger.info("Ejecutando fn-cron-cleaner: comprobando órdenes expiradas...");

    let cancelledCount = 0;
    await withTransaction(async (tx) => {
      // 1. Restituir el stock reservado de órdenes pendientes expiradas
      await tx.execute(`
        UPDATE products
        SET stock_reserved = MAX(0, stock_reserved - expired.total_quantity),
            updated_at = datetime('now', 'utc')
        FROM (
            SELECT oi.product_id, SUM(oi.quantity) AS total_quantity
            FROM order_items oi
            JOIN orders o ON oi.order_id = o.id
            WHERE o.status = 'pending' 
              AND datetime(o.expires_at) < datetime('now', 'utc')
            GROUP BY oi.product_id
        ) AS expired
        WHERE products.id = expired.product_id;
      `);

      // 2. Transicionar las órdenes pendientes vencidas a 'cancelled'
      const updateRes = await tx.execute(`
        UPDATE orders
        SET status = 'cancelled',
            updated_at = datetime('now', 'utc')
        WHERE status = 'pending' 
          AND datetime(expires_at) < datetime('now', 'utc');
      `);

      cancelledCount = updateRes.rowsAffected || 0;
    });

    Logger.info(`fn-cron-cleaner finalizado. Órdenes canceladas por vencimiento: ${cancelledCount}`);
    return { cancelledCount };
  }
}
