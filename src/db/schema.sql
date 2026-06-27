-- FarmConnect Ghana schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('farmer', 'aggregator', 'restaurant', 'school', 'driver')),
  region TEXT,
  district TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  category TEXT
);

CREATE TABLE IF NOT EXISTS market_prices (
  id TEXT PRIMARY KEY,
  crop_id TEXT NOT NULL REFERENCES crops(id),
  market TEXT NOT NULL,
  price_ghs REAL NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  source TEXT DEFAULT 'FarmConnect'
);

CREATE TABLE IF NOT EXISTS buyer_orders (
  id TEXT PRIMARY KEY,
  buyer_id TEXT NOT NULL REFERENCES users(id),
  crop_id TEXT NOT NULL REFERENCES crops(id),
  quantity REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  max_price_ghs REAL,
  needed_by TEXT NOT NULL,
  delivery_location TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'matched', 'fulfilled', 'cancelled')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS harvest_commitments (
  id TEXT PRIMARY KEY,
  farmer_id TEXT NOT NULL REFERENCES users(id),
  crop_id TEXT NOT NULL REFERENCES crops(id),
  quantity REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  harvest_date TEXT NOT NULL,
  asking_price_ghs REAL NOT NULL,
  order_id TEXT REFERENCES buyer_orders(id),
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'reserved', 'harvested', 'delivered')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transport_runs (
  id TEXT PRIMARY KEY,
  route_name TEXT NOT NULL,
  origin_region TEXT NOT NULL,
  destination TEXT NOT NULL,
  departure_date TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  vehicle_capacity_kg REAL DEFAULT 500,
  status TEXT DEFAULT 'forming' CHECK(status IN ('forming', 'confirmed', 'in_transit', 'completed')),
  driver_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transport_bookings (
  id TEXT PRIMARY KEY,
  transport_run_id TEXT NOT NULL REFERENCES transport_runs(id),
  farmer_id TEXT NOT NULL REFERENCES users(id),
  commitment_id TEXT REFERENCES harvest_commitments(id),
  quantity_kg REAL NOT NULL,
  pickup_location TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'picked_up', 'delivered')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sms_log (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  direction TEXT CHECK(direction IN ('outbound', 'inbound')),
  status TEXT DEFAULT 'sent',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ussd_sessions (
  session_id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'main',
  data TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prices_crop ON market_prices(crop_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON buyer_orders(status);
CREATE INDEX IF NOT EXISTS idx_commitments_farmer ON harvest_commitments(farmer_id);
CREATE INDEX IF NOT EXISTS idx_transport_date ON transport_runs(departure_date);
