import { pool } from './db';

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#acc6e9',
      balance NUMERIC(18,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cities (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      continent TEXT NOT NULL DEFAULT 'Other',
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      population INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL DEFAULT 'standard',
      mayor_price NUMERIC(18,2) NOT NULL DEFAULT 500,
      mayor_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      mayor_purchased_at TIMESTAMPTZ,
      activity_score INTEGER NOT NULL DEFAULT 0,
      total_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
      slug TEXT UNIQUE NOT NULL,
      available BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS districts (
      id SERIAL PRIMARY KEY,
      city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      index INTEGER NOT NULL,
      price NUMERIC(18,2) NOT NULL DEFAULT 100,
      owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      purchased_at TIMESTAMPTZ,
      available BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(city_id, index)
    );

    CREATE TABLE IF NOT EXISTS listings (
      id SERIAL PRIMARY KEY,
      asset_type TEXT NOT NULL CHECK (asset_type IN ('mayor','district')),
      asset_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      price NUMERIC(18,2) NOT NULL,
      lease_monthly NUMERIC(18,2),
      is_lease BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','sold','cancelled','leased')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS leases (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      tenant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset_type TEXT NOT NULL,
      asset_id INTEGER NOT NULL,
      monthly_rent NUMERIC(18,2) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ,
      active BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS offers (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount NUMERIC(18,2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      description TEXT NOT NULL,
      ref_id INTEGER,
      ref_type TEXT,
      balance_after NUMERIC(18,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS revenue_splits (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT 'default',
      platform_pct INTEGER NOT NULL DEFAULT 10,
      mayor_pct INTEGER NOT NULL DEFAULT 20,
      district_pct INTEGER NOT NULL DEFAULT 70,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO revenue_splits (name, platform_pct, mayor_pct, district_pct)
    VALUES ('default', 10, 20, 70)
    ON CONFLICT DO NOTHING;
  `);
  console.log('[migrate] schema ready');
}
