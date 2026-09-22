import test, { before, describe } from "node:test";
import assert from "node:assert";
import { initPragmas } from "../src/db/client.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { AuthService } from "../src/services/auth.service.js";
import { ConflictError, UnauthorizedError, BadRequestError } from "../src/core/errors.js";
import { validateSchema, RegisterSchema } from "../src/core/validator.js";

describe("Módulo 1: Autenticación y Control de Acceso (RF-01, RF-02, RNF-SEC-01)", () => {
  before(async () => {
    await initPragmas();
    await migrate();
    await seed();
  });

  test("RF-01: Registro exitoso de nuevo cliente con hash seguro", async () => {
    const email = `test_${Date.now()}@outdoor.com`;
    const res = await AuthService.register({
      email,
      password: "StrongPassword123!",
      first_name: "Aventurero",
      last_name: "Patagónico",
    });

    assert.ok(res.user.id);
    assert.strictEqual(res.user.email, email);
    assert.strictEqual(res.user.role, "client");
    assert.ok(res.token);
  });

  test("RF-01: Rechazo de email duplicado", async () => {
    await assert.rejects(
      async () => {
        await AuthService.register({
          email: "cliente@camping.com",
          password: "AnotherPassword123!",
          first_name: "Otro",
          last_name: "Usuario",
        });
      },
      (err: any) => err instanceof ConflictError
    );
  });

  test("RF-SEC-01: Validación de complejidad de contraseña en esquema Zod", () => {
    assert.throws(
      () => {
        validateSchema(RegisterSchema, {
          email: "valid@email.com",
          password: "simple", // Muy corta, sin números ni caracteres especiales
          first_name: "Test",
          last_name: "User",
        });
      },
      (err: any) => err instanceof BadRequestError
    );
  });

  test("RF-02: Inicio de sesión exitoso y emisión de token JWT", async () => {
    const res = await AuthService.login({
      email: "cliente@camping.com",
      password: "ClientPassword123!",
    });

    assert.ok(res.token);
    assert.strictEqual(res.user.email, "cliente@camping.com");
    assert.strictEqual(res.user.role, "client");
  });

  test("RF-02: Rechazo de inicio de sesión con contraseña incorrecta", async () => {
    await assert.rejects(
      async () => {
        await AuthService.login({
          email: "cliente@camping.com",
          password: "WrongPassword!",
        });
      },
      (err: any) => err instanceof UnauthorizedError
    );
  });
});
