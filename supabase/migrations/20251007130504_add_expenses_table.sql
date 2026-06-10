/*
  # Add Expenses Table

  1. New Tables
    - `expenses`
      - `id` (uuid, primary key)
      - `name` (text) - Name of the expense
      - `amount` (numeric) - Amount spent
      - `expense_date` (timestamptz) - Date of expense
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on expenses table
    - Add policies for public access (salon internal use)

  3. Notes
    - Expenses will reduce the total revenue
    - Each expense is timestamped for accurate reporting
*/

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  amount numeric(10,2) NOT NULL,
  expense_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

-- Create policies for public access
CREATE POLICY "Public can view expenses"
  ON expenses FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Public can insert expenses"
  ON expenses FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Public can delete expenses"
  ON expenses FOR DELETE
  TO public
  USING (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);