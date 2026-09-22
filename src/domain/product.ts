export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface Product {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  stock_available: number;
  stock_reserved: number;
  images_json: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  // Campos calculados
  stock_free?: number;
  category_name?: string;
  images?: string[];
}
