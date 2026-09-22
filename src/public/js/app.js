// Estado Global de la Aplicación Frontend
const state = {
  user: JSON.parse(localStorage.getItem("camping_user") || "null"),
  token: localStorage.getItem("camping_token") || null,
  cart: null,
  categories: [],
  filters: {
    category: "",
    min_price: "",
    max_price: "",
    search: "",
    sort: "newest",
    page: 1,
  },
};

// Helper para llamadas a la API con encabezados de seguridad
async function apiCall(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "x-correlation-id": crypto.randomUUID(),
    ...(options.headers || {}),
  };

  if (state.token) {
    headers["Authorization"] = `Bearer ${state.token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Error ${res.status}: ${res.statusText}`);
  }

  return data;
}

// Formateador de moneda (centavos a USD)
function formatMoney(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Inicialización de la Interfaz y Eventos Comunes
document.addEventListener("DOMContentLoaded", () => {
  updateNavUser();
  if (state.token) {
    loadCart();
  }

  const currentPage = window.location.pathname;
  if (currentPage.endsWith("index.html") || currentPage === "/") {
    initCatalogPage();
  } else if (currentPage.endsWith("cart.html")) {
    initCartPage();
  } else if (currentPage.endsWith("checkout.html")) {
    initCheckoutPage();
  } else if (currentPage.endsWith("orders.html")) {
    initOrdersPage();
  } else if (currentPage.endsWith("admin.html")) {
    initAdminPage();
  }
});

// 1. Gestión de Usuario y Navegación
function updateNavUser() {
  const authContainer = document.getElementById("nav-auth");
  if (!authContainer) return;

  if (state.user) {
    authContainer.innerHTML = `
      <span style="font-size: 0.9rem; color: #cbd5e1;">Hola, <strong>${state.user.first_name}</strong></span>
      ${state.user.role === "admin" ? '<a href="admin.html" class="nav-links">⚙️ Admin</a>' : ""}
      <a href="orders.html" class="nav-links">📦 Mis Pedidos</a>
      <button class="nav-btn" onclick="logout()">Salir</button>
    `;
  } else {
    authContainer.innerHTML = `
      <button class="nav-btn" onclick="openAuthModal('login')">Ingresar</button>
      <button class="btn btn-sm btn-accent" onclick="openAuthModal('register')">Registrarse</button>
    `;
  }
}

function logout() {
  localStorage.removeItem("camping_user");
  localStorage.removeItem("camping_token");
  state.user = null;
  state.token = null;
  window.location.href = "index.html";
}

// 2. Carrito de Compras
async function loadCart() {
  try {
    const cart = await apiCall("/api/v1/cart");
    state.cart = cart;
    updateCartBadge();
  } catch (err) {
    console.error("Error cargando carrito:", err);
  }
}

function updateCartBadge() {
  const badge = document.getElementById("cart-count-badge");
  if (!badge) return;
  const count = state.cart?.items?.reduce((sum, i) => sum + i.quantity, 0) || 0;
  badge.textContent = count;
  badge.style.display = count > 0 ? "inline-block" : "none";
}

async function addToCart(productId, quantity = 1) {
  if (!state.user) {
    openAuthModal("login");
    return;
  }
  try {
    const cart = await apiCall("/api/v1/cart", {
      method: "POST",
      body: JSON.stringify({ product_id: productId, quantity }),
    });
    state.cart = cart;
    updateCartBadge();
    showToast("Producto agregado al carrito con éxito", "success");
  } catch (err) {
    showToast(err.message, "danger");
  }
}

// 3. Catálogo y Filtros (index.html)
async function initCatalogPage() {
  try {
    const categories = await apiCall("/api/v1/products/categories");
    state.categories = categories;

    const select = document.getElementById("filter-category");
    if (select) {
      categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat.slug;
        opt.textContent = cat.name;
        select.appendChild(opt);
      });
    }

    loadProducts();

    // Listeners de filtros
    document.getElementById("filter-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      state.filters.search = document.getElementById("filter-search").value;
      state.filters.category = document.getElementById("filter-category").value;
      state.filters.sort = document.getElementById("filter-sort").value;
      state.filters.min_price = document.getElementById("filter-min-price").value ? Number(document.getElementById("filter-min-price").value) * 100 : "";
      state.filters.max_price = document.getElementById("filter-max-price").value ? Number(document.getElementById("filter-max-price").value) * 100 : "";
      state.filters.page = 1;
      loadProducts();
    });
  } catch (err) {
    console.error("Error iniciando catálogo:", err);
  }
}

async function loadProducts() {
  const grid = document.getElementById("products-grid");
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">Cargando equipamiento...</div>';

  try {
    const params = new URLSearchParams();
    if (state.filters.category) params.set("category", state.filters.category);
    if (state.filters.search) params.set("search", state.filters.search);
    if (state.filters.sort) params.set("sort", state.filters.sort);
    if (state.filters.min_price) params.set("min_price", state.filters.min_price);
    if (state.filters.max_price) params.set("max_price", state.filters.max_price);
    params.set("page", state.filters.page);
    params.set("limit", 12);

    const res = await apiCall(`/api/v1/products?${params.toString()}`);
    if (res.items.length === 0) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #64748b;">No se encontraron artículos con los filtros seleccionados.</div>';
      return;
    }

    grid.innerHTML = res.items
      .map((p) => {
        const stockStatus =
          p.stock_free > 5
            ? '<span class="stock-tag stock-ok">En stock</span>'
            : p.stock_free > 0
            ? `<span class="stock-tag stock-low">¡Últimas ${p.stock_free} unidades!</span>`
            : '<span class="stock-tag stock-out">Agotado</span>';

        const imgUrl = p.images?.[0] || "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600";

        return `
          <div class="product-card">
            <img src="${imgUrl}" alt="${p.name}" class="product-img" loading="lazy" />
            <div class="product-body">
              <span class="product-category">${p.category_name || "Camping"}</span>
              <h3 class="product-title">${p.name}</h3>
              <p class="product-desc">${p.description}</p>
              <div class="product-meta">
                <div>
                  <div class="product-price">${formatMoney(p.price_cents)}</div>
                  ${stockStatus}
                </div>
                <button class="btn btn-sm btn-primary" onclick="openProductDetail('${p.id}')" ${p.stock_free === 0 ? "disabled" : ""}>
                  Ver Detalle
                </button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    grid.innerHTML = `<div class="alert alert-danger" style="grid-column: 1/-1;">Error cargando catálogo: ${err.message}</div>`;
  }
}

async function openProductDetail(productId) {
  try {
    const p = await apiCall(`/api/v1/products/${productId}`);
    const modal = document.getElementById("product-detail-modal");
    if (!modal) return;

    const imgUrl = p.images?.[0] || "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600";
    modal.innerHTML = `
      <div class="modal-backdrop" onclick="closeProductDetail(event)">
        <div class="modal-content" onclick="event.stopPropagation()">
          <button class="modal-close" onclick="closeProductDetail()">&times;</button>
          <img src="${imgUrl}" alt="${p.name}" style="width: 100%; height: 260px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: 1rem;" />
          <span class="product-category">${p.category_name}</span>
          <h2 style="margin: 0.25rem 0 0.75rem; color: var(--primary-dark);">${p.name}</h2>
          <p style="color: var(--text-dark); margin-bottom: 1rem; line-height: 1.6;">${p.description}</p>
          <div style="background: #f8fafc; padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <span>Precio Unitario:</span>
              <strong style="font-size: 1.3rem; color: var(--primary);">${formatMoney(p.price_cents)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span>Stock libre en tiempo real:</span>
              <strong style="color: ${p.stock_free > 0 ? 'var(--success)' : 'var(--danger)'};">${p.stock_free} disponibles (${p.stock_reserved} reservados)</strong>
            </div>
          </div>
          <div style="display: flex; gap: 0.75rem;">
            <input type="number" id="detail-quantity" value="1" min="1" max="${p.stock_free}" style="width: 70px; padding: 0.5rem; text-align: center; border: 1px solid var(--border-dark); border-radius: var(--radius-sm);" ${p.stock_free === 0 ? 'disabled' : ''} />
            <button class="btn btn-accent btn-block" onclick="addToCart('${p.id}', parseInt(document.getElementById('detail-quantity').value, 10)); closeProductDetail();" ${p.stock_free === 0 ? "disabled" : ""}>
              🛒 Agregar al Carrito
            </button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    showToast(err.message, "danger");
  }
}

function closeProductDetail() {
  const modal = document.getElementById("product-detail-modal");
  if (modal) modal.innerHTML = "";
}

// 4. Página del Carrito (cart.html)
async function initCartPage() {
  const container = document.getElementById("cart-page-content");
  if (!container) return;

  if (!state.user) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem;">
        <h2>Debes iniciar sesión para consultar tu carrito</h2>
        <button class="btn btn-primary" style="margin-top: 1rem;" onclick="openAuthModal('login')">Ingresar a mi cuenta</button>
      </div>
    `;
    return;
  }

  await renderCartPage();
}

async function renderCartPage() {
  const container = document.getElementById("cart-page-content");
  if (!container) return;

  try {
    const cart = await apiCall("/api/v1/cart");
    state.cart = cart;
    updateCartBadge();

    if (cart.items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem;">
          <h2>Tu carrito de camping está vacío 🏕️</h2>
          <p style="color: var(--text-muted); margin: 0.5rem 0 1.5rem;">Explora nuestro catálogo para equipar tu próxima aventura.</p>
          <a href="index.html" class="btn btn-primary">Ver Catálogo</a>
        </div>
      `;
      return;
    }

    const shipping = cart.subtotal_cents >= 15000 ? 0 : 1500;
    const total = cart.subtotal_cents + shipping;

    container.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 340px; gap: 2rem; align-items: start;">
        <div>
          <table class="cart-table">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Precio</th>
                <th style="text-align: center;">Cantidad</th>
                <th>Subtotal</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${cart.items
                .map(
                  (item) => `
                <tr>
                  <td>
                    <strong>${item.product?.name || "Artículo"}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Stock libre: ${item.product?.stock_free}</div>
                  </td>
                  <td>${formatMoney(item.product?.price_cents || 0)}</td>
                  <td style="text-align: center;">
                    <div style="display: inline-flex; align-items: center; gap: 0.4rem;">
                      <button class="btn btn-sm btn-outline" onclick="updateCartQuantity('${item.id}', ${item.quantity - 1})">-</button>
                      <span style="font-weight: 700; width: 25px; display: inline-block;">${item.quantity}</span>
                      <button class="btn btn-sm btn-outline" onclick="updateCartQuantity('${item.id}', ${item.quantity + 1})">+</button>
                    </div>
                  </td>
                  <td style="font-weight: 700;">${formatMoney((item.product?.price_cents || 0) * item.quantity)}</td>
                  <td>
                    <button class="btn btn-sm btn-danger" onclick="removeCartItem('${item.id}')">&times;</button>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="cart-summary">
          <h3 style="margin-bottom: 1rem; color: var(--primary-dark);">Resumen de Compra</h3>
          <div class="summary-row">
            <span>Subtotal de productos:</span>
            <span>${formatMoney(cart.subtotal_cents)}</span>
          </div>
          <div class="summary-row">
            <span>Envío:</span>
            <span>${shipping === 0 ? '<strong style="color: var(--success);">Gratis</strong>' : formatMoney(shipping)}</span>
          </div>
          <div class="summary-row total">
            <span>Total:</span>
            <span>${formatMoney(total)}</span>
          </div>
          <a href="checkout.html" class="btn btn-accent btn-block" style="margin-top: 1rem;">
            Proceder al Checkout (Paso 1 de 3) &rarr;
          </a>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

async function updateCartQuantity(itemId, quantity) {
  try {
    await apiCall(`/api/v1/cart/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    });
    renderCartPage();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

async function removeCartItem(itemId) {
  try {
    await apiCall(`/api/v1/cart/items/${itemId}`, {
      method: "DELETE",
    });
    renderCartPage();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

// 5. Checkout y Pasarela (checkout.html - RNF-USA-02 en <= 3 pasos)
let currentCheckoutStep = 1;
let currentCheckoutSession = null;

async function initCheckoutPage() {
  if (!state.user) {
    window.location.href = "cart.html";
    return;
  }

  const form = document.getElementById("shipping-form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await createCheckoutSession();
  });
}

async function createCheckoutSession() {
  const address = {
    street: document.getElementById("ship-street").value,
    city: document.getElementById("ship-city").value,
    state: document.getElementById("ship-state").value,
    zip_code: document.getElementById("ship-zip").value,
    country: document.getElementById("ship-country").value,
    phone: document.getElementById("ship-phone").value,
  };

  try {
    const sessionData = await apiCall("/api/v1/checkout/session", {
      method: "POST",
      body: JSON.stringify({ shipping_address: address }),
    });

    currentCheckoutSession = sessionData;
    goToStep(2);
    renderStep2Summary(sessionData);
  } catch (err) {
    showToast(err.message, "danger");
  }
}

function renderStep2Summary(session) {
  const container = document.getElementById("step-2-summary");
  if (!container) return;

  container.innerHTML = `
    <div class="alert alert-info">
      ⏱️ <strong>Stock reservado con éxito por 15 minutos</strong> (Vence: ${new Date(session.expiresAt).toLocaleTimeString()}).
    </div>
    <div class="cart-summary" style="margin-bottom: 1.5rem;">
      <div class="summary-row">
        <span>Subtotal:</span>
        <strong>${formatMoney(session.subtotalCents)}</strong>
      </div>
      <div class="summary-row">
        <span>Costo de Envío:</span>
        <strong>${session.shippingCents === 0 ? "Gratis" : formatMoney(session.shippingCents)}</strong>
      </div>
      <div class="summary-row total">
        <span>Total a Pagar:</span>
        <span>${formatMoney(session.totalCents)}</span>
      </div>
    </div>
    <button class="btn btn-accent btn-block" onclick="goToStep(3)">
      Continuar a la Pasarela de Pago (Paso 3) &rarr;
    </button>
  `;
}

function goToStep(step) {
  currentCheckoutStep = step;
  document.querySelectorAll(".step-item").forEach((el, index) => {
    el.classList.remove("active", "done");
    if (index + 1 < step) el.classList.add("done");
    if (index + 1 === step) el.classList.add("active");
  });

  document.getElementById("step-1-container").style.display = step === 1 ? "block" : "none";
  document.getElementById("step-2-container").style.display = step === 2 ? "block" : "none";
  document.getElementById("step-3-container").style.display = step === 3 ? "block" : "none";
}

async function simulatePaymentAction(status) {
  if (!currentCheckoutSession) return;
  const statusContainer = document.getElementById("payment-status-result");
  statusContainer.innerHTML = '<div style="text-align: center; padding: 1rem;">Procesando transacción con pasarela externa...</div>';

  try {
    const res = await apiCall("/api/v1/payments/simulate", {
      method: "POST",
      body: JSON.stringify({
        order_id: currentCheckoutSession.orderId,
        status,
      }),
    });

    if (status === "approved") {
      statusContainer.innerHTML = `
        <div class="alert alert-success" style="text-align: center; padding: 2rem;">
          <h2>🎉 ¡Pago Aprobado y Orden Confirmada!</h2>
          <p>Identificador de Pedido: <strong>${currentCheckoutSession.orderId}</strong></p>
          <p>Tu orden se encuentra en preparación y el inventario ha sido consolidado.</p>
          <div style="margin-top: 1.5rem;">
            <a href="orders.html" class="btn btn-primary">Ver Mis Pedidos</a>
            <a href="index.html" class="btn btn-outline">Volver a la Tienda</a>
          </div>
        </div>
      `;
      loadCart(); // Actualizar carrito vacío
    } else {
      statusContainer.innerHTML = `
        <div class="alert alert-danger" style="text-align: center; padding: 2rem;">
          <h2>❌ Pago Rechazado por la Pasarela</h2>
          <p>La orden <strong>${currentCheckoutSession.orderId}</strong> ha sido cancelada y la reserva de stock fue liberada.</p>
          <div style="margin-top: 1.5rem;">
            <a href="cart.html" class="btn btn-primary">Volver al Carrito</a>
          </div>
        </div>
      `;
    }
  } catch (err) {
    statusContainer.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// 6. Mis Pedidos (orders.html)
async function initOrdersPage() {
  const container = document.getElementById("orders-list");
  if (!container) return;

  if (!state.user) {
    container.innerHTML = '<div style="text-align: center; padding: 2rem;">Inicia sesión para consultar tus pedidos.</div>';
    return;
  }

  try {
    const orders = await apiCall("/api/v1/orders");
    if (orders.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--text-muted);">Aún no tienes órdenes registradas.</div>';
      return;
    }

    container.innerHTML = orders
      .map((ord) => {
        const badgeClass = `badge-${ord.status}`;
        return `
        <div class="cart-summary" style="margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
            <div>
              <strong>Orden #${ord.id}</strong>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${new Date(ord.created_at).toLocaleString()}</div>
            </div>
            <div>
              <span class="badge ${badgeClass}">${ord.status.toUpperCase()}</span>
            </div>
          </div>
          <div style="margin-bottom: 0.75rem;">
            ${ord.items
              ?.map(
                (i) => `
              <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.3rem;">
                <span>${i.quantity}x ${i.product?.name || "Artículo"}</span>
                <span>${formatMoney(i.unit_price_cents * i.quantity)}</span>
              </div>
            `
              )
              .join("")}
          </div>
          <div style="display: flex; justify-content: space-between; font-weight: 700; border-top: 1px solid var(--border); padding-top: 0.5rem;">
            <span>Total Pagado:</span>
            <span>${formatMoney(ord.total_cents)}</span>
          </div>
        </div>
      `;
      })
      .join("");
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// 7. Panel de Administración (admin.html - RF-04, RF-07, RF-08, RF-16)
async function initAdminPage() {
  if (!state.user || state.user.role !== "admin") {
    window.location.href = "index.html";
    return;
  }

  loadAdminProducts();
  loadAdminOrders();
  loadAdminUsers();
}

async function loadAdminProducts() {
  const container = document.getElementById("admin-products-table");
  if (!container) return;

  try {
    const res = await apiCall("/api/v1/admin/products");
    container.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoría</th>
            <th>Precio</th>
            <th>Stock Físico</th>
            <th>Reservado</th>
            <th>Libre</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${res.items
            .map(
              (p) => `
            <tr>
              <td><strong>${p.name}</strong></td>
              <td>${p.category_name}</td>
              <td>${formatMoney(p.price_cents)}</td>
              <td>${p.stock_available}</td>
              <td>${p.stock_reserved}</td>
              <td><strong>${p.stock_free}</strong></td>
              <td>
                <button class="btn btn-sm btn-outline" onclick="promptAdjustStock('${p.id}', ${p.stock_available})">Ajustar Stock</button>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')">Baja Lógica</button>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

async function promptAdjustStock(productId, currentStock) {
  const newStock = prompt("Ingrese nuevo stock físico disponible:", currentStock);
  if (newStock === null) return;
  const parsed = parseInt(newStock, 10);
  if (isNaN(parsed) || parsed < 0) {
    alert("Cantidad de stock inválida");
    return;
  }

  try {
    await apiCall(`/api/v1/admin/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify({ stock_available: parsed }),
    });
    showToast("Stock físico actualizado", "success");
    loadAdminProducts();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

async function deleteProduct(productId) {
  if (!confirm("¿Confirma dar de baja lógica este producto?")) return;
  try {
    await apiCall(`/api/v1/admin/products/${productId}`, {
      method: "DELETE",
    });
    showToast("Producto dado de baja lógica", "success");
    loadAdminProducts();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

async function loadAdminOrders() {
  const container = document.getElementById("admin-orders-table");
  if (!container) return;

  try {
    const orders = await apiCall("/api/v1/admin/orders");
    container.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>ID Orden</th>
            <th>Cliente</th>
            <th>Fecha</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${orders
            .map(
              (o) => `
            <tr>
              <td><strong>#${o.id.substring(0, 8)}...</strong></td>
              <td>${o.user_first_name} ${o.user_last_name} (${o.user_email})</td>
              <td>${new Date(o.created_at).toLocaleDateString()}</td>
              <td>${formatMoney(o.total_cents)}</td>
              <td><span class="badge badge-${o.status}">${o.status.toUpperCase()}</span></td>
              <td>
                <select onchange="updateOrderStatusAdmin('${o.id}', this.value)" style="padding: 0.2rem; border-radius: var(--radius-sm);">
                  <option value="">Cambiar...</option>
                  <option value="preparing">Preparando</option>
                  <option value="shipped">Despachado</option>
                  <option value="delivered">Entregado</option>
                  <option value="cancelled">Cancelar</option>
                </select>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

async function updateOrderStatusAdmin(orderId, status) {
  if (!status) return;
  try {
    await apiCall(`/api/v1/admin/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    showToast(`Orden actualizada a ${status}`, "success");
    loadAdminOrders();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

async function loadAdminUsers() {
  const container = document.getElementById("admin-users-table");
  if (!container) return;

  try {
    const users = await apiCall("/api/v1/admin/users");
    container.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${users
            .map(
              (u) => `
            <tr>
              <td>${u.first_name} ${u.last_name}</td>
              <td>${u.email}</td>
              <td><strong>${u.role}</strong></td>
              <td>${u.is_active ? '<span class="badge badge-paid">Activo</span>' : '<span class="badge badge-cancelled">Inactivo</span>'}</td>
              <td>
                <button class="btn btn-sm btn-outline" onclick="toggleUserActive('${u.id}', ${!u.is_active})">
                  ${u.is_active ? "Suspender" : "Activar"}
                </button>
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

async function toggleUserActive(userId, is_active) {
  try {
    await apiCall(`/api/v1/admin/users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active }),
    });
    showToast("Estado de usuario actualizado", "success");
    loadAdminUsers();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

async function triggerCronCleaner() {
  try {
    const res = await apiCall("/api/v1/cron/clean-stock", { method: "POST" });
    showToast(`fn-cron-cleaner ejecutado. Órdenes expiradas canceladas: ${res.cancelledCount}`, "info");
    loadAdminProducts();
    loadAdminOrders();
  } catch (err) {
    showToast(err.message, "danger");
  }
}

// 8. Modales de Autenticación
function openAuthModal(mode = "login") {
  let modal = document.getElementById("auth-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "auth-modal";
    document.body.appendChild(modal);
  }

  const isLogin = mode === "login";
  modal.innerHTML = `
    <div class="modal-backdrop" onclick="closeAuthModal(event)">
      <div class="modal-content" onclick="event.stopPropagation()">
        <button class="modal-close" onclick="closeAuthModal()">&times;</button>
        <h2 style="color: var(--primary-dark); margin-bottom: 1rem;">
          ${isLogin ? "Iniciar Sesión" : "Crear Nueva Cuenta"}
        </h2>
        <form id="auth-form" onsubmit="submitAuthForm(event, '${mode}')">
          ${
            !isLogin
              ? `
            <div class="filter-group">
              <label>Nombre:</label>
              <input type="text" id="auth-fname" required minlength="2" placeholder="Lucas" />
            </div>
            <div class="filter-group">
              <label>Apellido:</label>
              <input type="text" id="auth-lname" required minlength="2" placeholder="Montañista" />
            </div>
          `
              : ""
          }
          <div class="filter-group">
            <label>Correo Electrónico:</label>
            <input type="email" id="auth-email" required placeholder="tu@email.com" value="${isLogin ? "cliente@camping.com" : ""}" />
          </div>
          <div class="filter-group">
            <label>Contraseña:</label>
            <input type="password" id="auth-pass" required minlength="8" placeholder="••••••••" value="${isLogin ? "ClientPassword123!" : ""}" />
          </div>
          <button type="submit" class="btn btn-primary btn-block" style="margin-top: 1rem;">
            ${isLogin ? "Ingresar" : "Registrarse"}
          </button>
          <div style="margin-top: 1rem; text-align: center; font-size: 0.85rem;">
            ${
              isLogin
                ? '¿No tienes cuenta? <a href="#" onclick="openAuthModal(\'register\')">Regístrate aquí</a>'
                : '¿Ya tienes cuenta? <a href="#" onclick="openAuthModal(\'login\')">Inicia sesión</a>'
            }
          </div>
        </form>
      </div>
    </div>
  `;
}

function closeAuthModal() {
  const modal = document.getElementById("auth-modal");
  if (modal) modal.innerHTML = "";
}

async function submitAuthForm(e, mode) {
  e.preventDefault();
  const email = document.getElementById("auth-email").value;
  const password = document.getElementById("auth-pass").value;

  try {
    let res;
    if (mode === "login") {
      res = await apiCall("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
    } else {
      const first_name = document.getElementById("auth-fname").value;
      const last_name = document.getElementById("auth-lname").value;
      res = await apiCall("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, first_name, last_name }),
      });
    }

    state.user = res.user;
    state.token = res.token;
    localStorage.setItem("camping_user", JSON.stringify(res.user));
    localStorage.setItem("camping_token", res.token);

    closeAuthModal();
    updateNavUser();
    loadCart();
    showToast(`Bienvenido, ${res.user.first_name}!`, "success");

    // Recargar página actual para reflejar permisos
    if (window.location.pathname.endsWith("admin.html") && res.user.role === "admin") {
      initAdminPage();
    }
  } catch (err) {
    showToast(err.message, "danger");
  }
}

// Helper para notificaciones Toast
function showToast(message, type = "info") {
  let toast = document.getElementById("app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 999; max-width: 350px;";
    document.body.appendChild(toast);
  }

  const alert = document.createElement("div");
  alert.className = `alert alert-${type}`;
  alert.style.boxShadow = "var(--shadow-lg)";
  alert.innerHTML = message;
  toast.appendChild(alert);

  setTimeout(() => {
    alert.remove();
  }, 4000);
}
