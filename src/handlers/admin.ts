import { CatalogService } from "../services/catalog.service.js";
import { OrderService } from "../services/order.service.js";
import { AuthService } from "../services/auth.service.js";
import {
  validateSchema,
  ProductCreateSchema,
  ProductUpdateSchema,
  AdminOrderUpdateSchema,
  AdminUserUpdateSchema,
} from "../core/validator.js";
import { extractAuthUser } from "./cart.js";
import { handleGlobalError, ForbiddenError, BadRequestError } from "../core/errors.js";

function requireAdmin(req: Request) {
  const user = extractAuthUser(req);
  if (user.role !== "admin") {
    // RNF-SEC-04: Control Estricto de Autorización (HTTP 403)
    throw new ForbiddenError("Acceso denegado: se requieren privilegios de Administrador");
  }
  return user;
}

export async function products(req: Request, params?: { id: string }): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    requireAdmin(req);

    let id = params?.id;
    if (!id && req.method !== "POST" && req.method !== "GET") {
      const url = new URL(req.url);
      const segments = url.pathname.split("/").filter(Boolean);
      id = segments[segments.length - 1];
    }

    if (req.method === "GET") {
      const result = await CatalogService.getProducts({ limit: 100 });
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const validated = validateSchema(ProductCreateSchema, body);
      const created = await CatalogService.createProduct(validated);
      return new Response(JSON.stringify(created), {
        status: 201,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      if (!id) throw new BadRequestError("Identificador de producto requerido");
      const body = await req.json();
      const validated = validateSchema(ProductUpdateSchema, body);
      const updated = await CatalogService.updateProduct(id, validated as any);
      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    if (req.method === "DELETE") {
      if (!id) throw new BadRequestError("Identificador de producto requerido");
      await CatalogService.deleteProduct(id);
      return new Response(JSON.stringify({ message: "Producto dado de baja lógica correctamente" }), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    throw new BadRequestError(`Método HTTP ${req.method} no soportado`);
  } catch (error) {
    const err = handleGlobalError(error, correlationId);
    return new Response(JSON.stringify(err.body), {
      status: err.statusCode,
      headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
    });
  }
}

export async function orders(req: Request, params?: { id: string }): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    requireAdmin(req);

    let id = params?.id;
    if (!id && req.method !== "GET") {
      const url = new URL(req.url);
      const segments = url.pathname.split("/").filter(Boolean);
      id = segments[segments.length - 1];
    }

    if (req.method === "GET") {
      const url = new URL(req.url);
      const statusFilter = url.searchParams.get("status") || undefined;
      const list = await OrderService.getAdminOrders(statusFilter);
      return new Response(JSON.stringify(list), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    if (req.method === "PATCH") {
      if (!id) throw new BadRequestError("Identificador de orden requerido");
      const body = await req.json();
      const validated = validateSchema(AdminOrderUpdateSchema, body);
      const updated = await OrderService.updateOrderStatus(id, validated.status, validated.tracking_number);
      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    throw new BadRequestError(`Método HTTP ${req.method} no soportado`);
  } catch (error) {
    const err = handleGlobalError(error, correlationId);
    return new Response(JSON.stringify(err.body), {
      status: err.statusCode,
      headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
    });
  }
}

export async function users(req: Request, params?: { id: string }): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    requireAdmin(req);

    let id = params?.id;
    if (!id && req.method !== "GET") {
      const url = new URL(req.url);
      const segments = url.pathname.split("/").filter(Boolean);
      id = segments[segments.length - 1];
    }

    if (req.method === "GET") {
      const list = await AuthService.getAllUsers();
      return new Response(JSON.stringify(list), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    if (req.method === "PATCH") {
      if (!id) throw new BadRequestError("Identificador de usuario requerido");
      const body = await req.json();
      const validated = validateSchema(AdminUserUpdateSchema, body);
      const updated = await AuthService.updateUser(id, validated);
      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    throw new BadRequestError(`Método HTTP ${req.method} no soportado`);
  } catch (error) {
    const err = handleGlobalError(error, correlationId);
    return new Response(JSON.stringify(err.body), {
      status: err.statusCode,
      headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
    });
  }
}
