import { Product } from "./product.js";

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  product?: Product;
}

export interface Cart {
  id: string;
  user_id: string;
  updated_at: string;
  items: CartItem[];
  subtotal_cents: number;
}
