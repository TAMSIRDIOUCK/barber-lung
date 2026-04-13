import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vzhcjvvgpbtfolxnpapy.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6aGNqdnZncGJ0Zm9seG5wYXB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMDM2NjQsImV4cCI6MjA2ODc3OTY2NH0.8u-z9iou6prxy_yk1S_49-kFRwLCm8gTDiWAa18lS3g'

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
