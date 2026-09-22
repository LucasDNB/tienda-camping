import { Product } from "./product.js";

export type OrderStatus =
  | "pending"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

export interface ShippingAddress {
  street: string;
  city: string;
  state: string;
  zip_code: string;
  country: string;
  phone: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  unit_price_cents: number;
  quantity: number;
  product?: Product;
}

export interface Order {
  id: string;
  user_id: string;
  status: OrderStatus;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  shipping_address_json: string;
  external_payment_id: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  items?: OrderItem[];
  shipping_address?: ShippingAddress;
}
