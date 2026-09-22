import { z } from "zod";
import { BadRequestError } from "./errors.js";

// Helper para validar esquemas y rechazar discrepancias o campos desconocidos (RF-SEC-01)
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const formattedErrors = result.error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
      code: e.code,
    }));
    throw new BadRequestError("Validation failed", formattedErrors);
  }
  return result.data;
}

// 1. Autenticación
export const RegisterSchema = z
  .object({
    email: z.string().email("Formato de correo electrónico inválido"),
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres")
      .regex(/[0-9]/, "La contraseña debe contener al menos un número")
      .regex(/[^a-zA-Z0-9]/, "La contraseña debe contener al menos un carácter especial"),
    first_name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    last_name: z.string().min(2, "El apellido debe tener al menos 2 caracteres"),
  })
  .strict();

export const LoginSchema = z
  .object({
    email: z.string().email("Formato de correo electrónico inválido"),
    password: z.string().min(1, "La contraseña es requerida"),
  })
  .strict();

// 2. Catálogo y Filtros
export const ProductFilterSchema = z
  .object({
    category: z.string().optional(),
    min_price: z.coerce.number().min(0).optional(),
    max_price: z.coerce.number().min(0).optional(),
    search: z.string().optional(),
    sort: z.enum(["price_asc", "price_desc", "name_asc", "newest"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const ProductCreateSchema = z
  .object({
    category_id: z.string().min(1, "Categoría requerida"),
    name: z.string().min(3, "Nombre requerido (mínimo 3 caracteres)"),
    slug: z.string().min(3, "Slug requerido").regex(/^[a-z0-9-]+$/, "Slug en formato kebab-case"),
    description: z.string().min(5, "Descripción requerida"),
    price_cents: z.number().int().min(0, "El precio en centavos debe ser mayor o igual a 0"),
    stock_available: z.number().int().min(0, "El stock disponible debe ser mayor o igual a 0"),
    images: z.array(z.string().url("URL de imagen inválida")).default([]),
  })
  .strict();

export const ProductUpdateSchema = ProductCreateSchema.partial()
  .extend({
    is_active: z.boolean().optional(),
    stock_reserved: z.number().int().min(0).optional(),
  })
  .strict();

// 3. Carrito de Compras
export const CartItemAddSchema = z
  .object({
    product_id: z.string().min(1, "Identificador de producto requerido"),
    quantity: z.number().int().min(1, "La cantidad mínima es 1"),
  })
  .strict();

export const CartItemUpdateSchema = z
  .object({
    quantity: z.number().int().min(1, "La cantidad mínima es 1"),
  })
  .strict();

// 4. Checkout y Dirección de Envío
export const ShippingAddressSchema = z
  .object({
    street: z.string().min(3, "Calle y número requeridos"),
    city: z.string().min(2, "Ciudad requerida"),
    state: z.string().min(2, "Provincia/Estado requerido"),
    zip_code: z.string().min(3, "Código postal requerido"),
    country: z.string().min(2, "País requerido"),
    phone: z.string().min(6, "Teléfono de contacto requerido"),
  })
  .strict();

export const CheckoutSessionSchema = z
  .object({
    shipping_address: ShippingAddressSchema,
  })
  .strict();

// 5. Administración
export const AdminOrderUpdateSchema = z
  .object({
    status: z.enum(["pending", "paid", "preparing", "shipped", "delivered", "cancelled"]),
    tracking_number: z.string().optional(),
  })
  .strict();

export const AdminUserUpdateSchema = z
  .object({
    role: z.enum(["admin", "client"]).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();
