import { fileURLToPath } from "url";
import { db, initPragmas } from "./client.js";
import { hashPassword } from "../core/crypto.js";

export async function seed(): Promise<void> {
  console.log("Iniciando semillado de datos...");
  await initPragmas();

  // 1. Usuarios
  const adminPasswordHash = await hashPassword("AdminPassword123!");
  const clientPasswordHash = await hashPassword("ClientPassword123!");

  await db.execute({
    sql: `INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active)
          VALUES 
          ('usr_admin_001', 'admin@camping.com', ?, 'Administrador', 'Camping', 'admin', 1),
          ('usr_client_001', 'cliente@camping.com', ?, 'Lucas', 'Montañista', 'client', 1)
          ON CONFLICT(id) DO UPDATE SET
            password_hash = excluded.password_hash,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            role = excluded.role,
            is_active = excluded.is_active;`,
    args: [adminPasswordHash, clientPasswordHash],
  });

  // 2. Carrito para el cliente de prueba
  await db.execute({
    sql: `INSERT INTO carts (id, user_id)
          VALUES ('cart_client_001', 'usr_client_001')
          ON CONFLICT(user_id) DO NOTHING;`,
    args: [],
  });

  // 3. Categorías
  const categories = [
    {
      id: "cat_carpas",
      name: "Carpas y Refugios",
      slug: "carpas",
      description: "Carpas estructurales, de alta montaña, ultraligeras y familiares con alta impermeabilidad.",
    },
    {
      id: "cat_bolsas",
      name: "Bolsas de Dormir",
      slug: "bolsas-de-dormir",
      description: "Bolsas de duvet y fibra sintética para climas extremos, 3 estaciones y media montaña.",
    },
    {
      id: "cat_mochilas",
      name: "Mochilas y Transporte",
      slug: "mochilas",
      description: "Mochilas ergonómicas de expedición, trekking técnico y riñoneras de travesía.",
    },
    {
      id: "cat_iluminacion",
      name: "Iluminación y Óptica",
      slug: "iluminacion",
      description: "Linternas frontales de alta potencia, faroles solares y balizas de emergencia.",
    },
    {
      id: "cat_cocina",
      name: "Cocina y Supervivencia",
      slug: "cocina-camping",
      description: "Anafes a gas, marmitas de aluminio anodizado, cubiertos plegables y filtros de agua.",
    },
  ];

  for (const cat of categories) {
    await db.execute({
      sql: `INSERT INTO categories (id, name, slug, description)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              slug = excluded.slug,
              description = excluded.description;`,
      args: [cat.id, cat.name, cat.slug, cat.description],
    });
  }

  // 4. Productos de camping con imágenes, detalles y stock
  const products = [
    {
      id: "prod_carpa_geodesica",
      category_id: "cat_carpas",
      name: "Carpa Geodésica 4 Estaciones Everest Pro",
      slug: "carpa-geodesica-4-estaciones-everest-pro",
      description: "Carpa técnica diseñada para resistir vientos de hasta 100 km/h y nevadas copiosas. Columna de agua 6.000 mm en piso y 4.000 mm en sobretecho. Varillas de duraluminio aeronáutico.",
      price_cents: 45999,
      stock_available: 15,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?auto=format&fit=crop&w=800&q=80",
        "https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=800&q=80"
      ]),
    },
    {
      id: "prod_carpa_ultralight",
      category_id: "cat_carpas",
      name: "Carpa Ultraligera 2P CloudPeak 1.8kg",
      slug: "carpa-ultraligera-2p-cloudpeak",
      description: "Carpa ultraliviana de silnylon 20D ripstop con doble entrada y ábside amplio para mochileros y travesías rápidas. Fácil armado en 3 minutos.",
      price_cents: 28999,
      stock_available: 25,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?auto=format&fit=crop&w=800&q=80"
      ]),
    },
    {
      id: "prod_carpa_familiar",
      category_id: "cat_carpas",
      name: "Carpa Familiar Dome 6 Personas con Porche",
      slug: "carpa-familiar-dome-6p",
      description: "Carpa espaciosa para campamento familiar con altura interior de 1.95m, dos dormitorios independientes y vestíbulo con mosquitero de alta densidad.",
      price_cents: 38999,
      stock_available: 10,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1537225228614-56cc3556d7ed?auto=format&fit=crop&w=800&q=80"
      ]),
    },
    {
      id: "prod_bolsa_pluma_extrema",
      category_id: "cat_bolsas",
      name: "Bolsa de Dormir Pluma -15°C Duvet 850 FP",
      slug: "bolsa-dormir-pluma-15c-duvet",
      description: "Relleno hidrofóbico de plumón ganso 850 Cuin con certificación RDS. Forma de momia ergonómica con collarín térmico y solapa antipinzamiento.",
      price_cents: 34999,
      stock_available: 20,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1517824806704-9040b037703b?auto=format&fit=crop&w=800&q=80"
      ]),
    },
    {
      id: "prod_bolsa_sintetica_3est",
      category_id: "cat_bolsas",
      name: "Bolsa de Dormir Sintética 3 Estaciones 0°C",
      slug: "bolsa-dormir-sintetica-3-estaciones",
      description: "Aislamiento de microfibra hueca SpiralFil que conserva el poder calórico incluso en condiciones de humedad elevada. Peso 1.2 kg con funda compresora.",
      price_cents: 12999,
      stock_available: 40,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1526772662000-3f88f10405ff?auto=format&fit=crop&w=800&q=80"
      ]),
    },
    {
      id: "prod_mochila_75l",
      category_id: "cat_mochilas",
      name: "Mochila Expedición Alpamayo 75+10L",
      slug: "mochila-expedicion-alpamayo-75-10l",
      description: "Estructura de suspensión de aluminio anodizado con ajuste de torso milimétrico. Cinturón lumbar preformado, acceso frontal directo y cubre-mochila integrado.",
      price_cents: 24999,
      stock_available: 18,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80"
      ]),
    },
    {
      id: "prod_mochila_45l",
      category_id: "cat_mochilas",
      name: "Mochila Trekking Ligero Trail 45L",
      slug: "mochila-trekking-ligero-trail-45l",
      description: "Mochila técnica para travesías de 2 a 3 días. Compatible con bolsa de hidratación, porta bastones de trekking y compartimento para saco de dormir.",
      price_cents: 15999,
      stock_available: 30,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1622560480605-d83c853bc5c3?auto=format&fit=crop&w=800&q=80"
      ]),
    },
    {
      id: "prod_frontal_800lum",
      category_id: "cat_iluminacion",
      name: "Linterna Frontal LED 800 Lumens IPX8 Recargable",
      slug: "linterna-frontal-led-800-lumens",
      description: "Haz de luz focalizado e inundante con alcance de hasta 140 metros. Batería de litio recargable USB-C, sensor gestual de encendido y luz roja nocturna.",
      price_cents: 6999,
      stock_available: 50,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1508873696983-2df5293cb32f?auto=format&fit=crop&w=800&q=80"
      ]),
    },
    {
      id: "prod_farol_solar",
      category_id: "cat_iluminacion",
      name: "Farol Solar Colgante LED 5000mAh Powerbank",
      slug: "farol-solar-colgante-led-5000mah",
      description: "Farol resistente a la intemperie para carpa o campamento base con 4 modos lumínicos, panel solar monocristalino integrado y función powerbank para cargar smartphones.",
      price_cents: 4999,
      stock_available: 35,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=800&q=80"
      ]),
    },
    {
      id: "prod_calentador_gas",
      category_id: "cat_cocina",
      name: "Calentador Portátil Titán Ultracompacto 25g",
      slug: "calentador-portatil-titan-ultracompacto",
      description: "Anafe a gas de titanio con encendido piezoeléctrico, soporta ollas de hasta 2 litros y hierve 1 litro de agua en 3 minutos y 10 segundos.",
      price_cents: 5499,
      stock_available: 45,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1533240332313-0db49b459ad6?auto=format&fit=crop&w=800&q=80"
      ]),
    },
    {
      id: "prod_set_marmitas",
      category_id: "cat_cocina",
      name: "Set de Cocina Anodizado Camping 2-3 Personas",
      slug: "set-cocina-anodizado-camping-2-3p",
      description: "Incluye 2 ollas con tapa, sartén antiadherente, 3 bowls libres de BPA, espátula de bambú y esponja limpiadora, todo apilable en red de transporte.",
      price_cents: 7999,
      stock_available: 28,
      stock_reserved: 0,
      images_json: JSON.stringify([
        "https://images.unsplash.com/photo-1510312305653-8ed496efae75?auto=format&fit=crop&w=800&q=80"
      ]),
    }
  ];

  for (const prod of products) {
    await db.execute({
      sql: `INSERT INTO products 
            (id, category_id, name, slug, description, price_cents, stock_available, stock_reserved, images_json, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET
              category_id = excluded.category_id,
              name = excluded.name,
              slug = excluded.slug,
              description = excluded.description,
              price_cents = excluded.price_cents,
              stock_available = excluded.stock_available,
              stock_reserved = excluded.stock_reserved,
              images_json = excluded.images_json,
              is_active = excluded.is_active;`,
      args: [
        prod.id,
        prod.category_id,
        prod.name,
        prod.slug,
        prod.description,
        prod.price_cents,
        prod.stock_available,
        prod.stock_reserved,
        prod.images_json,
      ],
    });
  }

  console.log("Semillado de datos completado exitosamente.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  seed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Error en semillado:", err);
      process.exit(1);
    });
}
