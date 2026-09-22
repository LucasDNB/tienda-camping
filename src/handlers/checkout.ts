import { CheckoutService } from "../services/checkout.service.js";
import { OrderService } from "../services/order.service.js";
import { validateSchema, CheckoutSessionSchema } from "../core/validator.js";
import { extractAuthUser } from "./cart.js";
import { RateLimiter } from "../core/rate-limiter.js";
import { handleGlobalError } from "../core/errors.js";

export async function session(req: Request): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const user = extractAuthUser(req);

    // RNF-SEC-08: 30 peticiones/minuto por usuario autenticado
    RateLimiter.checkTransactional(user.userId);

    const body = await req.json();
    const validated = validateSchema(CheckoutSessionSchema, body);

    const result = await CheckoutService.createSession(user.userId, validated.shipping_address);

    return new Response(JSON.stringify(result), {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": correlationId,
      },
    });
  } catch (error) {
    const err = handleGlobalError(error, correlationId);
    return new Response(JSON.stringify(err.body), {
      status: err.statusCode,
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": correlationId,
      },
    });
  }
}

export async function orders(req: Request): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const user = extractAuthUser(req);
    RateLimiter.checkTransactional(user.userId);

    const list = await OrderService.getUserOrders(user.userId);

    return new Response(JSON.stringify(list), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": correlationId,
      },
    });
  } catch (error) {
    const err = handleGlobalError(error, correlationId);
    return new Response(JSON.stringify(err.body), {
      status: err.statusCode,
      headers: {
        "Content-Type": "application/json",
        "X-Correlation-ID": correlationId,
      },
    });
  }
}
