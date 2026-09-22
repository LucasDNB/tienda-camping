import type { IncomingMessage, ServerResponse } from "http";
import { appHandler } from "../src/server.js";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  return appHandler(req, res);
}
