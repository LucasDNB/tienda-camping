# Tienda Online de Artículos de Camping 🏕️

Plataforma transaccional de comercio electrónico especializada en equipamiento de camping y vida al aire libre, desarrollada bajo una arquitectura Serverless desacoplada sobre **Antigravity Runtime** y persistencia relacional ligera **LibSQL / SQLite en modo WAL**.

Diseñado bajo la metodología de ingeniería de software de Roger S. Pressman / IEEE 830 (SRS) y el estándar FURPS+.

---

## 🚀 Características Principales

* **Arquitectura Serverless Desacoplada**: Funciones serverless independientes para autenticación, catálogo, carrito, checkout, webhooks y tareas programadas (`antigravity.yaml`).
* **Persistencia Ligera & ACID**: Base de datos SQLite / LibSQL en modo WAL (`journal_mode = WAL`, `synchronous = NORMAL`, `foreign_keys = ON`), transacciones atómicas con `BEGIN IMMEDIATE` para prevención estricta de sobreventa (*overselling*).
* **Seguridad Activa y Defensiva**:
  * Validación estricta de esquemas de entrada con **Zod** (`.strict()`) que rechaza campos desconocidos con `HTTP 400 Bad Request`.
  * Cifrado de credenciales con **bcrypt** (costo $\ge$ 12).
  * Sesiones basadas en **JWT** y control de acceso basado en roles (**RBAC**: `admin` y `client`).
  * Validación de webhook con **HMAC-SHA256 timing-safe** (`crypto.timingSafeEqual`).
  * Idempotencia en eventos de webhook (`INSERT OR IGNORE`).
  * Rate Limiting en memoria para catálogo (60 req/min), autenticación (5 req/15 min) y rutas transaccionales (30 req/min).
  * Ofuscación de errores internos con `Correlation ID` (`HTTP 500`).
* **Checkout Optimizado en 3 Pasos (RNF-USA-02)**:
  1. Dirección y despacho logístico.
  2. Resumen y reserva atómica de stock por 15 minutos.
  3. Pasarela de pagos externa con simulación y notificaciones webhook.
* **Workers Asíncronos & Tareas Programadas**:
  * `fn-worker-processor`: Consumo en segundo plano de eventos de pago aprobados/rechazados.
  * `fn-cron-cleaner`: Ejecución cada 5 minutos para liberar reservas vencidas y cancelar órdenes pendientes.
* **Frontend Responsivo**: Interfaz moderna y adaptable a partir de 360px de ancho con paleta temática outdoor y panel de administración operativo.

---

## 🛠️ Tecnologías

* **Lenguaje:** TypeScript 5.8 (NodeNext)
* **Entorno de Ejecución:** Node.js v22+
* **Motor de Base de Datos:** LibSQL / SQLite (`@libsql/client`)
* **Validación de Esquemas:** Zod
* **Criptografía y Autenticación:** bcrypt, jsonwebtoken, Node.js Crypto (HMAC timing-safe)
* **Testing:** Node.js Native Test Runner (`tsx --test`)

---

## 📦 Instalación y Puesta en Marcha

### 1. Clonar el repositorio
```bash
git clone <URL_DEL_REPOSITORIO>
cd tienda-camping
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Inicializar la base de datos (Migraciones y Semillado)
```bash
npm run db:migrate
npm run db:seed
```

### 4. Iniciar el servidor en modo desarrollo
```bash
npm run dev
```
La aplicación estará disponible en: **`http://localhost:3000`**

---

## 🧪 Pruebas Automatizadas

El proyecto cuenta con una suite completa de pruebas unitarias y de integración que validan el 100% de los requisitos:

```bash
npm test
```

### Cobertura de Pruebas:
* `tests/auth.test.ts`: Registro, complejidad de contraseña, rechazo de duplicados, login JWT.
* `tests/catalog-cart.test.ts`: Filtros, cálculo de stock libre, agregado y validación física de inventario.
* `tests/checkout-atomic.test.ts`: Transacciones `BEGIN IMMEDIATE`, reserva a 15 min, prevención de sobreventa concurrente.
* `tests/webhook-idempotency.test.ts`: Verificación HMAC timing-safe, idempotencia y procesamiento asíncrono.
* `tests/cron-cleaner.test.ts`: Liberación automática de stock reservado en pedidos expirados.

---

## 👤 Credenciales de Prueba

| Rol | Correo Electrónico | Contraseña | Acceso |
| --- | --- | --- | --- |
| **Administrador** | `admin@camping.com` | `AdminPassword123!` | `/admin.html` |
| **Cliente** | `cliente@camping.com` | `ClientPassword123!` | `/index.html` |

---

## 📄 Licencia

ISC
