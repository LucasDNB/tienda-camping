import { Logger } from "../core/logger.js";

type MessageHandler = (message: any) => Promise<void>;

export class InMemoryQueue {
  private handlers: Map<string, MessageHandler[]> = new Map();

  subscribe(topic: string, handler: MessageHandler): void {
    const list = this.handlers.get(topic) || [];
    list.push(handler);
    this.handlers.set(topic, list);
  }

  async publish(topic: string, message: any): Promise<void> {
    const list = this.handlers.get(topic) || [];
    if (list.length === 0) {
      Logger.warn(`No hay consumidores suscritos al tópico '${topic}'`);
      return;
    }

    // Despacho asíncrono para no bloquear la respuesta HTTP (RF-SEC-02)
    setImmediate(async () => {
      for (const handler of list) {
        try {
          await handler(message);
        } catch (error) {
          Logger.error(`Error procesando mensaje en tópico '${topic}'`, { error, message });
        }
      }
    });
  }
}

export const queue = new InMemoryQueue();
