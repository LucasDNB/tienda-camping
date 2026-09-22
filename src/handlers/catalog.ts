import { CatalogService } from "../services/catalog.service.js";
import { validateSchema, ProductFilterSchema } from "../core/validator.js";
import { RateLimiter } from "../core/rate-limiter.js";
import { handleGlobalError, BadRequestError } from "../core/errors.js";

function getClientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "127.0.0.1";
}

export async function list(req: Request): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const ip = getClientIp(req);
    RateLimiter.checkPublic(ip);

    const url = new URL(req.url);
    const queryParams: Record<string, any> = {};
    url.searchParams.forEach((val, key) => {
      queryParams[key] = val;
    });

    const validated = validateSchema(ProductFilterSchema, queryParams);
    const result = await CatalogService.getProducts(validated);

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

export async function detail(req: Request, params?: { id: string }): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const ip = getClientIp(req);
    RateLimiter.checkPublic(ip);

    let id = params?.id;
    if (!id) {
      const url = new URL(req.url);
      const segments = url.pathname.split("/").filter(Boolean);
      id = segments[segments.length - 1];
    }

    if (!id) {
      throw new BadRequestError("Identificador de producto no especificado");
    }

    const product = await CatalogService.getProductById(id);

    return new Response(JSON.stringify(product), {
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

export async function categories(req: Request): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const ip = getClientIp(req);
    RateLimiter.checkPublic(ip);

    const cats = await CatalogService.getCategories();

    return new Response(JSON.stringify(cats), {
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
