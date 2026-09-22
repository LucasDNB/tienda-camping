export type UserRole = "admin" | "client";

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type UserPublic = Omit<User, "password_hash">;
