import { db } from "../db/client.js";
import { generateId } from "../core/crypto.js";
import { NotFoundError } from "../core/errors.js";
import { Product, Category } from "../domain/product.js";

export interface ProductFilters {
  category?: string;
  min_price?: number;
  max_price?: number;
  search?: string;
  sort?: "price_asc" | "price_desc" | "name_asc" | "newest";
  page?: number;
  limit?: number;
}

export class CatalogService {
  static async getCategories(): Promise<Category[]> {
    const res = await db.execute("SELECT id, name, slug, description FROM categories ORDER BY name ASC");
    return res.rows as unknown as Category[];
  }

  static async getProducts(filters: ProductFilters = {}): Promise<{
    items: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const conditions: string[] = ["p.is_active = 1"];
    const args: any[] = [];

    if (filters.category) {
      conditions.push("(c.slug = ? OR c.id = ?)");
      args.push(filters.category, filters.category);
    }

    if (filters.min_price !== undefined) {
      conditions.push("p.price_cents >= ?");
      args.push(Math.round(filters.min_price));
    }

    if (filters.max_price !== undefined) {
      conditions.push("p.price_cents <= ?");
      args.push(Math.round(filters.max_price));
    }

    if (filters.search) {
      conditions.push("(p.name LIKE ? OR p.description LIKE ?)");
      const term = `%${filters.search}%`;
      args.push(term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Contar total
    const countRes = await db.execute({
      sql: `SELECT COUNT(*) as total FROM products p JOIN categories c ON p.category_id = c.id ${whereClause}`,
      args,
    });
    const total = Number(countRes.rows[0].total);

    // Ordenamiento
    let orderBy = "p.created_at DESC";
    if (filters.sort === "price_asc") orderBy = "p.price_cents ASC";
    if (filters.sort === "price_desc") orderBy = "p.price_cents DESC";
    if (filters.sort === "name_asc") orderBy = "p.name ASC";
    if (filters.sort === "newest") orderBy = "p.created_at DESC";

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const offset = (page - 1) * limit;

    const queryArgs = [...args, limit, offset];
    const res = await db.execute({
      sql: `SELECT 
              p.id, p.category_id, p.name, p.slug, p.description, 
              p.price_cents, p.stock_available, p.stock_reserved, 
              (p.stock_available - p.stock_reserved) as stock_free,
              p.images_json, p.is_active, p.created_at, p.updated_at,
              c.name as category_name, c.slug as category_slug
            FROM products p
            JOIN categories c ON p.category_id = c.id
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?`,
      args: queryArgs,
    });

    const items: Product[] = res.rows.map((row: any) => ({
      ...row,
      images: JSON.parse(row.images_json || "[]"),
      stock_free: Math.max(0, row.stock_free),
    }));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  static async getProductById(idOrSlug: string): Promise<Product> {
    const res = await db.execute({
      sql: `SELECT 
              p.id, p.category_id, p.name, p.slug, p.description, 
              p.price_cents, p.stock_available, p.stock_reserved, 
              (p.stock_available - p.stock_reserved) as stock_free,
              p.images_json, p.is_active, p.created_at, p.updated_at,
              c.name as category_name
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE (p.id = ? OR p.slug = ?) AND p.is_active = 1`,
      args: [idOrSlug, idOrSlug],
    });

    if (res.rows.length === 0) {
      throw new NotFoundError("Producto no encontrado o fuera de catálogo");
    }

    const row = res.rows[0] as any;
    return {
      ...row,
      images: JSON.parse(row.images_json || "[]"),
      stock_free: Math.max(0, row.stock_free),
    };
  }

  // Métodos de Administración (RF-07, RF-08)
  static async createProduct(data: {
    category_id: string;
    name: string;
    slug: string;
    description: string;
    price_cents: number;
    stock_available: number;
    images?: string[];
  }): Promise<Product> {
    const id = generateId("prod");
    const imagesJson = JSON.stringify(data.images || []);

    await db.execute({
      sql: `INSERT INTO products 
            (id, category_id, name, slug, description, price_cents, stock_available, stock_reserved, images_json, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 1)`,
      args: [
        id,
        data.category_id,
        data.name,
        data.slug,
        data.description,
        data.price_cents,
        data.stock_available,
        imagesJson,
      ],
    });

    return this.getProductById(id);
  }

  static async updateProduct(id: string, data: Partial<Product> & { images?: string[] }): Promise<Product> {
    const updates: string[] = ["updated_at = datetime('now', 'utc')"];
    const args: any[] = [];

    if (data.name !== undefined) {
      updates.push("name = ?");
      args.push(data.name);
    }
    if (data.slug !== undefined) {
      updates.push("slug = ?");
      args.push(data.slug);
    }
    if (data.description !== undefined) {
      updates.push("description = ?");
      args.push(data.description);
    }
    if (data.price_cents !== undefined) {
      updates.push("price_cents = ?");
      args.push(data.price_cents);
    }
    if (data.stock_available !== undefined) {
      updates.push("stock_available = ?");
      args.push(data.stock_available);
    }
    if (data.images !== undefined) {
      updates.push("images_json = ?");
      args.push(JSON.stringify(data.images));
    }
    if (data.is_active !== undefined) {
      updates.push("is_active = ?");
      args.push(data.is_active ? 1 : 0);
    }

    args.push(id);

    const res = await db.execute({
      sql: `UPDATE products SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });

    if (res.rowsAffected === 0) {
      throw new NotFoundError("Producto no encontrado");
    }

    return this.getProductById(id);
  }

  static async deleteProduct(id: string): Promise<void> {
    // Baja lógica (soft delete) según RF-07
    const res = await db.execute({
      sql: `UPDATE products SET is_active = 0, updated_at = datetime('now', 'utc') WHERE id = ?`,
      args: [id],
    });

    if (res.rowsAffected === 0) {
      throw new NotFoundError("Producto no encontrado");
    }
  }

  static async adjustStock(id: string, stockAvailable: number): Promise<void> {
    const res = await db.execute({
      sql: `UPDATE products SET stock_available = ?, updated_at = datetime('now', 'utc') WHERE id = ?`,
      args: [stockAvailable, id],
    });

    if (res.rowsAffected === 0) {
      throw new NotFoundError("Producto no encontrado");
    }
  }
}
