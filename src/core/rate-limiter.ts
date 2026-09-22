import { TooManyRequestsError } from "./errors.js";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export class RateLimiter {
  private static store: Map<string, RateLimitRecord> = new Map();

  /**
   * Limpia registros antiguos periódicamente para evitar fugas de memoria.
   */
  private static cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Verifica el límite de peticiones para una clave dada.
   * @param key Identificador (IP, IP:email, o userId)
   * @param maxRequests Máximo de peticiones permitidas en la ventana
   * @param windowMs Tamaño de la ventana en milisegundos
   */
  static check(key: string, maxRequests: number, windowMs: number): void {
    const now = Date.now();
    const record = this.store.get(key);

    if (!record || now > record.resetTime) {
      this.store.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return;
    }

    if (record.count >= maxRequests) {
      throw new TooManyRequestsError(
        `Límite de peticiones excedido. Intente nuevamente en ${Math.ceil((record.resetTime - now) / 1000)} segundos.`
      );
    }

    record.count += 1;
  }

  /**
   * Limita rutas públicas: 60 peticiones / minuto por IP
   */
  static checkPublic(ip: string): void {
    this.check(`pub:${ip}`, 60, 60 * 1000);
  }

  /**
   * Limita autenticación (Login/Registro): 5 intentos / 15 minutos por IP y cuenta
   */
  static checkAuth(ip: string, email: string = "anonymous"): void {
    this.check(`auth:${ip}:${email}`, 5, 15 * 60 * 1000);
  }

  /**
   * Limita rutas transaccionales: 30 peticiones / minuto por usuario autenticado
   */
  static checkTransactional(userId: string): void {
    this.check(`tx:${userId}`, 30, 60 * 1000);
  }

  /**
   * Resetea el contador (útil en pruebas)
   */
  static reset(): void {
    this.store.clear();
  }
}

// Limpiar cada 5 minutos
setInterval(() => {
  RateLimiter["cleanup"]();
}, 5 * 60 * 1000).unref();
