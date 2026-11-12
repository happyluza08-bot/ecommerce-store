// Database setup: SQLite (file: store.db) — products, users, orders, order_items
// Uses Node's built-in SQLite (Node 22.5+), so no native build tools are needed.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'store.db'));
db.exec('PRAGMA foreign_keys = ON');

// Small helper: run fn inside a transaction (rolls back on error)
db.transaction = fn => (...args) => {
  db.exec('BEGIN');
  try {
    const result = fn(...args);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  category TEXT,
  image TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL
);
`);

// Seed sample products the first time
const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
if (count === 0) {
  const insert = db.prepare(
    'INSERT INTO products (name, description, price, stock, category, image) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const seed = [
    ['Wireless Headphones', 'Over-ear Bluetooth headphones with 30-hour battery life and noise isolation.', 49.99, 25, 'Electronics', '🎧'],
    ['Smart Watch', 'Fitness tracking, heart-rate monitor and phone notifications on your wrist.', 89.0, 15, 'Electronics', '⌚'],
    ['Laptop Backpack', 'Water-resistant backpack that fits laptops up to 15.6 inches.', 29.5, 40, 'Accessories', '🎒'],
    ['Running Shoes', 'Lightweight, breathable running shoes with cushioned soles.', 64.0, 30, 'Fashion', '👟'],
    ['Coffee Maker', '12-cup drip coffee maker with programmable timer.', 39.99, 12, 'Home', '☕'],
    ['Desk Lamp', 'LED desk lamp with 3 brightness levels and USB charging port.', 19.99, 50, 'Home', '💡'],
    ['Sunglasses', 'Polarized UV400 sunglasses with a lightweight frame.', 15.0, 60, 'Fashion', '🕶️'],
    ['Power Bank', '20,000 mAh fast-charging power bank with two USB ports.', 24.99, 35, 'Electronics', '🔋'],
  ];
  const tx = db.transaction(rows => rows.forEach(r => insert.run(...r)));
  tx(seed);
  console.log('Seeded sample products.');
}

module.exports = db;
