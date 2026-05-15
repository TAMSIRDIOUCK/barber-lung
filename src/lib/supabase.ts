// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Service {
  id: string;
  name: string;
  base_price: number;
  with_teinture_price: number;
  category: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  service_id: string;
  service_name: string;
  amount: number;
  with_teinture: boolean;
  with_soin?: boolean; 
  transaction_date: string;
  created_at: string;
}

export interface Receipt {
  id: string;
  transaction_id: string;
  receipt_number: string;
  is_printed: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  name: string;
  amount: number;
  expense_date: string;
  created_at: string;
}