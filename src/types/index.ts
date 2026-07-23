export interface Order {
  id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  product_id?: string;
  product_name?: string;
  amount: number;
  status: string;
  delivery_status: string;
  payment_method?: string;
  payment_reference?: string;
  order_reference?: string;
  created_at?: string;
  updated_at?: string;
  logins?: string;
  logins_sent_at?: string;
  subscription_started_at?: string;
  subscription_expires_at?: string;
}

export interface Profile {
  id: string;
  clerk_id: string;
  email: string;
  fullName?: string;
  purchase_code?: string;
  balance?: number;
  total_earned?: number;
  created_at?: string;
  last_login_at?: string;
  phone?: string;
}

export interface Plan {
  id: string;
  name: string;
  price: number;
  discount_price?: number;
  discountPrice?: number;
  discount_expires_at?: string;
  duration_months?: number;
  duration_label?: string;
  features?: string[];
  is_popular?: boolean;
}

export interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_role: string;
  sender_name?: string;
  content: string;
  event?: string;
  topic?: string;
  is_from_user: boolean;
  is_bot: boolean;
  is_bot_message?: boolean;
  read_by_admin: boolean;
  read_by_user: boolean;
  created_at?: string;
  attachment_url?: string;
  attachment_type?: string;
}

export interface Chat {
  id: string;
  user_id: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string;
  user_name?: string;
  user_email?: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  amount: number;
  bank_name: string;
  account_number: string;
  account_name: string;
  status: string;
  confirmed_by?: string;
  confirmed_at?: string;
  created_at?: string;
}

export interface AdminOrder extends Order {
  chat_id?: string;
}
