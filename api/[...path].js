import appHandler from "../dist/server.js";

export default async function handler(req, res) {
  return appHandler(req, res);
}
