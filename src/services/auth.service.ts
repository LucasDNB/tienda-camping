import { db, withTransaction } from "../db/client.js";
import { hashPassword, comparePassword, signToken, generateId } from "../core/crypto.js";
import { BadRequestError, ConflictError, UnauthorizedError, NotFoundError } from "../core/errors.js";
import { User, UserPublic } from "../domain/user.js";

export class AuthService {
  static async register(data: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }): Promise<{ user: UserPublic; token: string }> {
    // 1. Verificar si el email ya existe
    const existing = await db.execute({
      sql: "SELECT id FROM users WHERE email = ? COLLATE NOCASE",
      args: [data.email],
    });

    if (existing.rows.length > 0) {
      throw new ConflictError("El correo electrónico ya se encuentra registrado");
    }

    // 2. Hash de contraseña seguro (bcrypt costo 12)
    const passwordHash = await hashPassword(data.password);
    const userId = generateId("usr");

    // 3. Insertar usuario y crear su carrito persistente en una transacción
    await withTransaction(async (tx) => {
      await tx.execute({
        sql: `INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
              VALUES (?, ?, ?, ?, ?, 'client', 1)`,
        args: [userId, data.email, passwordHash, data.first_name, data.last_name],
      });

      await tx.execute({
        sql: `INSERT INTO carts (id, user_id) VALUES (?, ?)`,
        args: [generateId("cart"), userId],
      });
    });

    const user: UserPublic = {
      id: userId,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      role: "client",
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return { user, token };
  }

  static async login(data: {
    email: string;
    password: string;
  }): Promise<{ user: UserPublic; token: string }> {
    const res = await db.execute({
      sql: `SELECT id, email, password_hash, first_name, last_name, role, is_active, created_at, updated_at
            FROM users WHERE email = ? COLLATE NOCASE`,
      args: [data.email],
    });

    if (res.rows.length === 0) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const row = res.rows[0];
    const user = row as unknown as User;

    if (!user.is_active) {
      throw new UnauthorizedError("Cuenta deshabilitada. Contacte al administrador");
    }

    const isMatch = await comparePassword(data.password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const userPublic: UserPublic = {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return { user: userPublic, token };
  }

  static async getUserById(userId: string): Promise<UserPublic> {
    const res = await db.execute({
      sql: `SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at
            FROM users WHERE id = ?`,
      args: [userId],
    });

    if (res.rows.length === 0) {
      throw new NotFoundError("Usuario no encontrado");
    }

    return res.rows[0] as unknown as UserPublic;
  }

  static async getAllUsers(): Promise<UserPublic[]> {
    const res = await db.execute({
      sql: `SELECT id, email, first_name, last_name, role, is_active, created_at, updated_at
            FROM users ORDER BY created_at DESC`,
      args: [],
    });

    return res.rows as unknown as UserPublic[];
  }

  static async updateUser(userId: string, data: { role?: "admin" | "client"; is_active?: boolean }): Promise<UserPublic> {
    const updates: string[] = ["updated_at = datetime('now', 'utc')"];
    const args: any[] = [];

    if (data.role !== undefined) {
      updates.push("role = ?");
      args.push(data.role);
    }
    if (data.is_active !== undefined) {
      updates.push("is_active = ?");
      args.push(data.is_active ? 1 : 0);
    }

    args.push(userId);

    const res = await db.execute({
      sql: `UPDATE users SET ${updates.join(", ")} WHERE id = ? RETURNING id, email, first_name, last_name, role, is_active, created_at, updated_at`,
      args,
    });

    if (res.rows.length === 0) {
      throw new NotFoundError("Usuario no encontrado");
    }

    return res.rows[0] as unknown as UserPublic;
  }
}
