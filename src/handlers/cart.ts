import { CartService } from "../services/cart.service.js";
import { validateSchema, CartItemAddSchema, CartItemUpdateSchema } from "../core/validator.js";
import { verifyToken, TokenPayload } from "../core/crypto.js";
import { RateLimiter } from "../core/rate-limiter.js";
import { handleGlobalError, UnauthorizedError, BadRequestError } from "../core/errors.js";

export function extractAuthUser(req: Request): TokenPayload {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new UnauthorizedError("Token de autenticación requerido");
  }

  const token = authHeader.substring(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    throw new UnauthorizedError("Token inválido o expirado");
  }

  return payload;
}

export async function sync(req: Request): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const user = extractAuthUser(req);
    RateLimiter.checkTransactional(user.userId);

    if (req.method === "GET") {
      const cart = await CartService.getOrCreateCart(user.userId);
      return new Response(JSON.stringify(cart), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const validated = validateSchema(CartItemAddSchema, body);
      const cart = await CartService.addItem(user.userId, validated.product_id, validated.quantity);

      return new Response(JSON.stringify(cart), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    throw new BadRequestError(`Método HTTP ${req.method} no soportado en esta ruta`);
  } catch (error) {
    const err = handleGlobalError(error, correlationId);
    return new Response(JSON.stringify(err.body), {
      status: err.statusCode,
      headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
    });
  }
}

export async function mutate(req: Request, params?: { id: string }): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const user = extractAuthUser(req);
    RateLimiter.checkTransactional(user.userId);

    let itemId = params?.id;
    if (!itemId) {
      const url = new URL(req.url);
      const segments = url.pathname.split("/").filter(Boolean);
      itemId = segments[segments.length - 1];
    }

    if (!itemId) {
      throw new BadRequestError("Identificador de ítem no especificado");
    }

    if (req.method === "PATCH") {
      const body = await req.json();
      const validated = validateSchema(CartItemUpdateSchema, body);
      const cart = await CartService.updateItemQuantity(user.userId, itemId, validated.quantity);

      return new Response(JSON.stringify(cart), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    if (req.method === "DELETE") {
      const cart = await CartService.removeItem(user.userId, itemId);
      return new Response(JSON.stringify(cart), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
      });
    }

    throw new BadRequestError(`Método HTTP ${req.method} no soportado en esta ruta`);
  } catch (error) {
    const err = handleGlobalError(error, correlationId);
    return new Response(JSON.stringify(err.body), {
      status: err.statusCode,
      headers: { "Content-Type": "application/json", "X-Correlation-ID": correlationId },
    });
  }
}
