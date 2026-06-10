/*
  # Barber Lounge - Salon Management System

  1. New Tables
    - `services`
      - `id` (uuid, primary key)
      - `name` (text) - Name of the service (e.g., "Taper", "Dégradé")
      - `base_price` (numeric) - Base price without teinture
      - `with_teinture_price` (numeric) - Price with teinture
      - `category` (text) - Category of service
      - `created_at` (timestamptz)
    
    - `transactions`
      - `id` (uuid, primary key)
      - `service_id` (uuid, foreign key to services)
      - `service_name` (text) - Service name snapshot
      - `amount` (numeric) - Amount paid
      - `with_teinture` (boolean) - Whether teinture was included
      - `transaction_date` (timestamptz) - Date of transaction
      - `created_at` (timestamptz)
    
    - `receipts`
      - `id` (uuid, primary key)
      - `transaction_id` (uuid, foreign key to transactions)
      - `receipt_number` (text) - Unique receipt number
      - `is_printed` (boolean) - Whether receipt was viewed
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for public access (salon internal use)

  3. Notes
    - All prices are stored in decimal format
    - Transactions are timestamped for accurate reporting
    - Receipts are generated automatically after each transaction
*/

-- Create services table
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  base_price numeric(10,2) NOT NULL,
  with_teinture_price numeric(10,2) NOT NULL,
  category text DEFAULT 'coupe',
  created_at timestamptz DEFAULT now()
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid REFERENCES services(id),
  service_name text NOT NULL,
  amount numeric(10,2) NOT NULL,
  with_teinture boolean DEFAULT false,
  transaction_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create receipts table
CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES transactions(id) ON DELETE CASCADE,
  receipt_number text UNIQUE NOT NULL,
  is_printed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (internal salon use)
CREATE POLICY "Public can view services"
  ON services FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert services"
  ON services FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can view transactions"
  ON transactions FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert transactions"
  ON transactions FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can view receipts"
  ON receipts FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert receipts"
  ON receipts FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can update receipts"
  ON receipts FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- Insert default services
INSERT INTO services (name, base_price, with_teinture_price, category) VALUES
  ('Taper', 25.00, 40.00, 'coupe'),
  ('Dégradé', 25.00, 40.00, 'coupe'),
  ('Coupe Classique', 20.00, 35.00, 'coupe'),
  ('Barbe', 15.00, 25.00, 'soin'),
  ('Coupe + Barbe', 35.00, 50.00, 'combo'),
  ('Teinture Seule', 20.00, 20.00, 'teinture'),
  ('Shampoing', 10.00, 10.00, 'soin')
ON CONFLICT DO NOTHING;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_transaction ON receipts(transaction_id);