-- Migration: Add vip_orders table for automated SePay VIP purchases

CREATE TABLE IF NOT EXISTS vip_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_code VARCHAR(12) UNIQUE NOT NULL,
  expected_amount INTEGER NOT NULL,
  months INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled', 'expired')),
  bank_transaction_id VARCHAR(100) UNIQUE,
  paid_amount INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vip_orders_user ON vip_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_vip_orders_code ON vip_orders(order_code) WHERE status = 'pending';
