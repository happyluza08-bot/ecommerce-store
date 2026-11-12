// Shared frontend code: API helper, navbar, toast, and per-page logic
const $ = sel => document.querySelector(sel);

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function money(n) { return '$' + Number(n).toFixed(2); }
function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

function toast(text) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = text;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}
function showMsg(el, text, type = 'error') { el.textContent = text; el.className = 'msg ' + type; }

// ---------- Navbar ----------
let currentUser = null;
async function renderNav() {
  const [{ user }, cart] = await Promise.all([api('/api/auth/me'), api('/api/cart')]);
  currentUser = user;
  const count = cart.items.reduce((s, i) => s + i.quantity, 0);
  $('#nav').innerHTML = `
    <div class="inner">
      <a href="/" class="logo">Dev<span>Shop</span></a>
      <nav class="nav-links">
        <a href="/">Products</a>
        <a href="/cart.html">Cart <span class="badge" id="cart-count">${count}</span></a>
        ${user
          ? `<a href="/orders.html">My Orders</a>
             <span>Hi, ${esc(user.name)}</span>
             <a href="#" id="logout">Logout</a>`
          : `<a href="/login.html">Login</a><a href="/register.html" class="btn">Register</a>`}
      </nav>
    </div>`;
  const lo = $('#logout');
  if (lo) lo.onclick = async e => { e.preventDefault(); await api('/api/auth/logout', { method: 'POST' }); location.href = '/'; };
}
function updateCartCount(cart) {
  const c = $('#cart-count');
  if (c) c.textContent = cart.items.reduce((s, i) => s + i.quantity, 0);
}

async function addToCart(productId, quantity = 1) {
  try {
    const cart = await api('/api/cart', { method: 'POST', body: { productId, quantity } });
    updateCartCount(cart);
    toast('Added to cart ✓');
  } catch (err) { toast(err.message); }
}

// ---------- Pages ----------
const pages = {
  // Product listing
  async home() {
    const cats = await api('/api/categories');
    $('#category').innerHTML += cats.map(c => `<option>${esc(c)}</option>`).join('');
    const load = async () => {
      const q = new URLSearchParams({ search: $('#search').value, category: $('#category').value });
      const products = await api('/api/products?' + q);
      $('#products').innerHTML = products.length
        ? products.map(p => `
          <div class="card">
            <a href="/product.html?id=${p.id}" class="thumb">${p.image}</a>
            <span class="cat">${esc(p.category)}</span>
            <h3><a href="/product.html?id=${p.id}" style="color:inherit">${esc(p.name)}</a></h3>
            <div class="price">${money(p.price)}</div>
            <div class="actions">
              <a class="btn outline" href="/product.html?id=${p.id}">Details</a>
              <button class="btn" data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>
                ${p.stock === 0 ? 'Sold out' : 'Add to cart'}</button>
            </div>
          </div>`).join('')
        : '<p class="empty">No products found.</p>';
    };
    $('#products').onclick = e => { const id = e.target.dataset.add; if (id) addToCart(Number(id)); };
    $('#search').oninput = load;
    $('#category').onchange = load;
    load();
  },

  // Product details
  async product() {
    const id = new URLSearchParams(location.search).get('id');
    try {
      const p = await api('/api/products/' + id);
      document.title = p.name + ' | DevShop';
      $('#detail').innerHTML = `
        <div class="details">
          <div class="thumb">${p.image}</div>
          <div>
            <span class="cat">${esc(p.category)}</span>
            <h1>${esc(p.name)}</h1>
            <div class="price">${money(p.price)}</div>
            <p>${esc(p.description)}</p>
            <p class="stock">${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</p>
            <div class="qty-row">
              <input type="number" id="qty" value="1" min="1" max="${p.stock}">
              <button class="btn" id="add" ${p.stock === 0 ? 'disabled' : ''}>Add to cart</button>
            </div>
            <a href="/">← Back to products</a>
          </div>
        </div>`;
      $('#add').onclick = () => addToCart(p.id, Number($('#qty').value));
    } catch (err) {
      $('#detail').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    }
  },

  // Shopping cart + checkout (order processing)
  async cart() {
    const render = cart => {
      updateCartCount(cart);
      if (cart.items.length === 0) {
        $('#cart').innerHTML = '<div class="panel empty">Your cart is empty. <a href="/">Continue shopping</a></div>';
        return;
      }
      $('#cart').innerHTML = `
        <div class="cart-layout">
          <div class="panel">
            ${cart.items.map(i => `
              <div class="cart-item">
                <div class="emoji">${i.image}</div>
                <div class="info"><strong>${esc(i.name)}</strong><br><span class="stock">${money(i.price)} each</span></div>
                <input type="number" min="1" max="${i.stock}" value="${i.quantity}" data-qty="${i.product_id}">
                <strong>${money(i.subtotal)}</strong>
                <button class="btn danger" data-remove="${i.product_id}">✕</button>
              </div>`).join('')}
          </div>
          <div class="panel">
            <h3>Order Summary</h3>
            <div class="summary-row"><span>Items</span><span>${cart.items.reduce((s, i) => s + i.quantity, 0)}</span></div>
            <div class="summary-row"><span>Shipping</span><span>Free</span></div>
            <div class="summary-row total"><span>Total</span><span>${money(cart.total)}</span></div>
            <hr style="margin:16px 0;border:none;border-top:1px solid var(--border)">
            <div id="checkout-msg" class="msg"></div>
            ${currentUser ? `
              <form id="checkout">
                <div class="form-group"><label>Delivery address</label><textarea name="address" rows="2" required></textarea></div>
                <div class="form-group"><label>Phone</label><input name="phone" required></div>
                <button class="btn block">Place Order</button>
              </form>`
            : `<p>Please <a href="/login.html?next=/cart.html">log in</a> to place your order.</p>`}
          </div>
        </div>`;
    };

    $('#cart').addEventListener('change', async e => {
      const id = e.target.dataset.qty;
      if (!id) return;
      try { render(await api('/api/cart/' + id, { method: 'PUT', body: { quantity: Number(e.target.value) } })); }
      catch (err) { toast(err.message); render(await api('/api/cart')); }
    });
    $('#cart').addEventListener('click', async e => {
      const id = e.target.dataset.remove;
      if (id) render(await api('/api/cart/' + id, { method: 'DELETE' }));
    });
    $('#cart').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        const r = await api('/api/orders', { method: 'POST', body: { address: f.get('address'), phone: f.get('phone') } });
        $('#cart').innerHTML = `<div class="panel empty">
          <h2>🎉 Order #${r.orderId} placed!</h2>
          <p>Total: ${money(r.total)}</p><br>
          <a class="btn" href="/orders.html">View my orders</a></div>`;
        updateCartCount({ items: [] });
      } catch (err) { showMsg($('#checkout-msg'), err.message); }
    });

    render(await api('/api/cart'));
  },

  // Login
  login() {
    $('#form').onsubmit = async e => {
      e.preventDefault();
      const f = new FormData(e.target);
      try {
        await api('/api/auth/login', { method: 'POST', body: Object.fromEntries(f) });
        location.href = new URLSearchParams(location.search).get('next') || '/';
      } catch (err) { showMsg($('#msg'), err.message); }
    };
  },

  // Register
  register() {
    $('#form').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (f.password !== f.confirm) return showMsg($('#msg'), 'Passwords do not match.');
      try {
        await api('/api/auth/register', { method: 'POST', body: f });
        location.href = '/';
      } catch (err) { showMsg($('#msg'), err.message); }
    };
  },

  // Order history
  async orders() {
    if (!currentUser) { location.href = '/login.html?next=/orders.html'; return; }
    const orders = await api('/api/orders');
    $('#orders').innerHTML = orders.length
      ? orders.map(o => `
        <div class="panel order">
          <div class="order-head">
            <strong>Order #${o.id}</strong>
            <span class="stock">${new Date(o.created_at + 'Z').toLocaleString()}</span>
            <span class="status">${esc(o.status)}</span>
          </div>
          ${o.items.map(i => `<div class="summary-row"><span>${i.image} ${esc(i.name)} × ${i.quantity}</span><span>${money(i.unit_price * i.quantity)}</span></div>`).join('')}
          <div class="summary-row total"><span>Total</span><span>${money(o.total)}</span></div>
          <p class="stock">Ship to: ${esc(o.address)} · ${esc(o.phone)}</p>
        </div>`).join('')
      : '<div class="panel empty">You have no orders yet. <a href="/">Start shopping</a></div>';
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  await renderNav();
  const page = document.body.dataset.page;
  if (pages[page]) pages[page]();
});
