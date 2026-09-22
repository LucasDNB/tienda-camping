import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "./config/env.js";
import { Logger } from "./core/logger.js";
import { initPragmas } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { seed } from "./db/seed.js";
import * as authHandlers from "./handlers/auth.js";
import * as catalogHandlers from "./handlers/catalog.js";
import * as cartHandlers from "./handlers/cart.js";
import * as checkoutHandlers from "./handlers/checkout.js";
import * as webhookHandlers from "./handlers/webhook.js";
import * as adminHandlers from "./handlers/admin.js";
import { stockCleaner } from "./handlers/workers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, "public"))
  ? path.join(__dirname, "public")
  : path.join(__dirname, "../src/public");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/**
 * Convierte un IncomingMessage de Node.js a un Request estándar Web API
 */
async function createWebRequest(req: http.IncomingMessage, bodyLimitBytes: number): Promise<Request> {
  const url = `http://${req.headers.host || "localhost"}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      if (Array.isArray(value)) {
        value.forEach((v) => headers.append(key, v));
      } else {
        headers.set(key, value);
      }
    }
  }

  const method = req.method || "GET";
  if (method === "GET" || method === "HEAD") {
    return new Request(url, { method, headers });
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    // RNF-SEC-09: Verificación de límite de payload
    if (totalBytes > bodyLimitBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks);
  return new Request(url, { method, headers, body });
}

/**
 * Envía un Response estándar Web API de vuelta al ServerResponse de Node.js
 */
async function sendWebResponse(res: http.ServerResponse, webRes: Response): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((val, key) => {
    res.setHeader(key, val);
  });

  const arrayBuffer = await webRes.arrayBuffer();
  res.end(Buffer.from(arrayBuffer));
}

let isInitialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureDbInitialized(): Promise<void> {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      await initPragmas();
      await migrate();
      await seed();
      isInitialized = true;
    })();
  }
  await initPromise;
}

export async function appHandler(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  await ensureDbInitialized();

  const origin = req.headers.origin || "*";
  // Configuración de CORS según antigravity.yaml
  res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-signature-hmac, x-correlation-id");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // RNF-SEC-09: Límites de Payload (2MB general, 8MB admin products)
    const isImageUpload = pathname.startsWith("/api/v1/admin/products");
    const bodyLimit = isImageUpload ? 8 * 1024 * 1024 : 2 * 1024 * 1024;

    try {
      // 1. Despacho de API
      if (pathname.startsWith("/api/v1/")) {
        const webReq = await createWebRequest(req, bodyLimit);

        // Rutas de Autenticación
        if (pathname === "/api/v1/auth/register" && req.method === "POST") {
          return sendWebResponse(res, await authHandlers.register(webReq));
        }
        if (pathname === "/api/v1/auth/login" && req.method === "POST") {
          return sendWebResponse(res, await authHandlers.login(webReq));
        }

        // Rutas de Catálogo
        if (pathname === "/api/v1/products/categories" && req.method === "GET") {
          return sendWebResponse(res, await catalogHandlers.categories(webReq));
        }
        if (pathname === "/api/v1/products" && req.method === "GET") {
          return sendWebResponse(res, await catalogHandlers.list(webReq));
        }
        const productDetailMatch = pathname.match(/^\/api\/v1\/products\/([^/]+)$/);
        if (productDetailMatch && req.method === "GET") {
          return sendWebResponse(res, await catalogHandlers.detail(webReq, { id: productDetailMatch[1] }));
        }

        // Rutas de Carrito
        if (pathname === "/api/v1/cart" && (req.method === "GET" || req.method === "POST")) {
          return sendWebResponse(res, await cartHandlers.sync(webReq));
        }
        const cartItemMatch = pathname.match(/^\/api\/v1\/cart\/items\/([^/]+)$/);
        if (cartItemMatch && (req.method === "PATCH" || req.method === "DELETE")) {
          return sendWebResponse(res, await cartHandlers.mutate(webReq, { id: cartItemMatch[1] }));
        }

        // Rutas de Checkout y Pedidos del Cliente
        if (pathname === "/api/v1/checkout/session" && req.method === "POST") {
          return sendWebResponse(res, await checkoutHandlers.session(webReq));
        }
        if (pathname === "/api/v1/orders" && req.method === "GET") {
          return sendWebResponse(res, await checkoutHandlers.orders(webReq));
        }

        // Rutas de Webhook y Simulación de Pago
        if (pathname === "/api/v1/payments/webhook" && req.method === "POST") {
          return sendWebResponse(res, await webhookHandlers.handler(webReq));
        }
        if (pathname === "/api/v1/payments/simulate" && req.method === "POST") {
          return sendWebResponse(res, await webhookHandlers.simulate(webReq));
        }

        // Rutas de Administración
        if (pathname === "/api/v1/admin/products" && (req.method === "GET" || req.method === "POST")) {
          return sendWebResponse(res, await adminHandlers.products(webReq));
        }
        const adminProductMatch = pathname.match(/^\/api\/v1\/admin\/products\/([^/]+)$/);
        if (adminProductMatch && (req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE")) {
          return sendWebResponse(res, await adminHandlers.products(webReq, { id: adminProductMatch[1] }));
        }

        if (pathname === "/api/v1/admin/orders" && req.method === "GET") {
          return sendWebResponse(res, await adminHandlers.orders(webReq));
        }
        const adminOrderMatch = pathname.match(/^\/api\/v1\/admin\/orders\/([^/]+)$/);
        if (adminOrderMatch && req.method === "PATCH") {
          return sendWebResponse(res, await adminHandlers.orders(webReq, { id: adminOrderMatch[1] }));
        }

        if (pathname === "/api/v1/admin/users" && req.method === "GET") {
          return sendWebResponse(res, await adminHandlers.users(webReq));
        }
        const adminUserMatch = pathname.match(/^\/api\/v1\/admin\/users\/([^/]+)$/);
        if (adminUserMatch && req.method === "PATCH") {
          return sendWebResponse(res, await adminHandlers.users(webReq, { id: adminUserMatch[1] }));
        }

        // Disparador manual del cron para pruebas
        if (pathname === "/api/v1/cron/clean-stock" && req.method === "POST") {
          const result = await stockCleaner();
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(result));
          return;
        }

        // 404 para endpoints de API no encontrados
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Endpoint no encontrado" }));
        return;
      }

      // 2. Servidor de Archivos Estáticos (Frontend)
      let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

      // Prevenir Path Traversal
      if (!filePath.startsWith(PUBLIC_DIR)) {
        res.statusCode = 403;
        res.end("Forbidden");
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        res.statusCode = 200;
        res.setHeader("Content-Type", MIME_TYPES[ext] || "application/octet-stream");
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      // Fallback a index.html si no tiene extensión (SPA / rutas limpias)
      const indexFallback = path.join(PUBLIC_DIR, "index.html");
      if (fs.existsSync(indexFallback)) {
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        fs.createReadStream(indexFallback).pipe(res);
        return;
      }

      res.statusCode = 404;
      res.end("404 Not Found");
    } catch (err: any) {
      if (err?.message === "PAYLOAD_TOO_LARGE") {
        res.statusCode = 413;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Payload Too Large" }));
        return;
      }

      Logger.error("Error no atrapado en servidor HTTP:", { error: err?.message, stack: err?.stack });
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
}

export function createServer(): http.Server {
  return http.createServer(appHandler);
}

export async function startServer(): Promise<http.Server> {
  await ensureDbInitialized();

  const server = createServer();
  server.listen(config.port, () => {
    Logger.info(`Servidor Serverless Tienda Camping iniciado en http://localhost:${config.port}`);
  });

  // Configurar ejecución periódica de fn-cron-cleaner cada 5 minutos (spec 5.4)
  setInterval(async () => {
    try {
      await stockCleaner();
    } catch (err) {
      Logger.error("Error ejecutando intervalo de stockCleaner:", { err });
    }
  }, 5 * 60 * 1000).unref();

  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().catch((err) => {
    Logger.error("Fallo crítico iniciando el servidor:", { err });
    process.exit(1);
  });
}
