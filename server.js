// Simple E-commerce Store — Express.js backend
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'change-this-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }, // 1 day
  })
);
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in first.' });
  next();
}
function getCart(req) {
  if (!req.session.cart) req.session.cart = {}; // { productId: quantity }
  return req.session.cart;
}
function cartDetails(cart) {
  const ids = Object.keys(cart);
  if (ids.length === 0) return { items: [], total: 0 };
  const rows = db
    .prepare(`SELECT * FROM products WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids);
  const items = rows.map(p => ({
    product_id: p.id,
    name: p.name,
    image: p.image,
    price: p.price,
    stock: p.stock,
    quantity: cart[p.id],
    subtotal: +(p.price * cart[p.id]).toFixed(2),
  }));
  const total = +items.reduce((s, i) => s + i.subtotal, 0).toFixed(2);
  return { items, total };
}

// ---------- AUTH ----------
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Email is already registered.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase().trim(), hash);
  req.session.user = { id: info.lastInsertRowid, name: name.trim(), email: email.toLowerCase() };
  res.status(201).json({ user: req.session.user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  req.session.user = { id: user.id, name: user.name, email: user.email };
  res.json({ user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// ---------- PRODUCTS ----------
app.get('/api/products', (req, res) => {
  const { search = '', category = '' } = req.query;
  let sql = 'SELECT * FROM products WHERE name LIKE ?';
  const params = [`%${search}%`];
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  res.json(db.prepare(sql + ' ORDER BY id').all(...params));
});

app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all().map(r => r.category));
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found.' });
  res.json(p);
});

// ---------- CART (stored in session) ----------
app.get('/api/cart', (req, res) => res.json(cartDetails(getCart(req))));

app.post('/api/cart', (req, res) => {
  const productId = Number(req.body.productId);
  const qty = Math.max(1, Number(req.body.quantity) || 1);
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!p) return res.status(404).json({ error: 'Product not found.' });

  const cart = getCart(req);
  const newQty = (cart[productId] || 0) + qty;
  if (newQty > p.stock) return res.status(400).json({ error: `Only ${p.stock} in stock.` });
  cart[productId] = newQty;
  res.json(cartDetails(cart));
});

app.put('/api/cart/:productId', (req, res) => {
  const cart = getCart(req);
  const id = req.params.productId;
  const qty = Number(req.body.quantity);
  if (!cart[id]) return res.status(404).json({ error: 'Item not in cart.' });
  const p = db.prepare('SELECT stock FROM products WHERE id = ?').get(id);
  if (qty <= 0) delete cart[id];
  else if (qty > p.stock) return res.status(400).json({ error: `Only ${p.stock} in stock.` });
  else cart[id] = qty;
  res.json(cartDetails(cart));
});

app.delete('/api/cart/:productId', (req, res) => {
  const cart = getCart(req);
  delete cart[req.params.productId];
  res.json(cartDetails(cart));
});

// ---------- ORDERS ----------
app.post('/api/orders', requireLogin, (req, res) => {
  const { address, phone } = req.body || {};
  if (!address || !phone) return res.status(400).json({ error: 'Address and phone are required.' });

  const { items, total } = cartDetails(getCart(req));
  if (items.length === 0) return res.status(400).json({ error: 'Your cart is empty.' });

  const placeOrder = db.transaction(() => {
    // re-check stock inside the transaction
    for (const i of items) {
      const p = db.prepare('SELECT stock, name FROM products WHERE id = ?').get(i.product_id);
      if (p.stock < i.quantity) throw new Error(`Not enough stock for ${p.name}.`);
    }
    const order = db
      .prepare('INSERT INTO orders (user_id, total, address, phone) VALUES (?, ?, ?, ?)')
      .run(req.session.user.id, total, address.trim(), phone.trim());
    const addItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
    );
    const reduce = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
    for (const i of items) {
      addItem.run(order.lastInsertRowid, i.product_id, i.quantity, i.price);
      reduce.run(i.quantity, i.product_id);
    }
    return order.lastInsertRowid;
  });

  try {
    const orderId = placeOrder();
    req.session.cart = {};
    res.status(201).json({ orderId, total });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/orders', requireLogin, (req, res) => {
  const orders = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC')
    .all(req.session.user.id);
  const itemsStmt = db.prepare(`
    SELECT oi.quantity, oi.unit_price, p.name, p.image
    FROM order_items oi JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?`);
  res.json(orders.map(o => ({ ...o, items: itemsStmt.all(o.id) })));
});

app.listen(PORT, () => console.log(`Store running at http://localhost:${PORT}`));
