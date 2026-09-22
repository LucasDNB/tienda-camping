import { AuthService } from "../services/auth.service.js";
import { validateSchema, RegisterSchema, LoginSchema } from "../core/validator.js";
import { RateLimiter } from "../core/rate-limiter.js";
import { handleGlobalError } from "../core/errors.js";

function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
}

export async function register(req: Request): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const ip = getClientIp(req);
    const body = (await req.json()) as any;

    // RNF-SEC-08: Rate limit 5 peticiones / 15 min
    RateLimiter.checkAuth(ip, body.email || "anonymous");

    // RF-SEC-01: Validación estricta
    const validated = validateSchema(RegisterSchema, body);
    const result = await AuthService.register(validated);

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

export async function login(req: Request): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const ip = getClientIp(req);
    const body = (await req.json()) as any;

    RateLimiter.checkAuth(ip, body.email || "anonymous");

    const validated = validateSchema(LoginSchema, body);
    const result = await AuthService.login(validated);

    return new Response(JSON.stringify(result), {
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
