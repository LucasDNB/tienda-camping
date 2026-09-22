import { PaymentService } from "../services/payment.service.js";
import { handleGlobalError, BadRequestError } from "../core/errors.js";

export async function handler(req: Request): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const signature = req.headers.get("x-signature-hmac") || "";
    const rawBody = await req.text();

    const result = await PaymentService.handleWebhook(rawBody, signature);

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

/**
 * Endpoint de utilidad para simular una respuesta de la pasarela desde el frontend o pruebas.
 */
export async function simulate(req: Request): Promise<Response> {
  const correlationId = req.headers.get("x-correlation-id") || crypto.randomUUID();
  try {
    const body = (await req.json()) as any;
    if (!body.order_id || !body.status) {
      throw new BadRequestError("Se requiere 'order_id' y 'status' ('approved' | 'rejected')");
    }

    const { rawBody, signature } = PaymentService.generateSimulatedPayload(body.order_id, body.status);
    const result = await PaymentService.handleWebhook(rawBody, signature);

    return new Response(JSON.stringify({ ...result, simulated: true }), {
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
