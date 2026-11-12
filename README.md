# DevShop — Simple E-commerce Store

Task 1: basic e-commerce site with product listings.

- **Frontend:** HTML, CSS, JavaScript (no framework) — `public/`
- **Backend:** Express.js (Node.js) — `server.js`
- **Database:** SQLite (`store.db`, created automatically) — `db.js`

## Features
| Feature | Where |
|---|---|
| Product listings (search + category filter) | `index.html`, `GET /api/products` |
| Product details page | `product.html?id=1`, `GET /api/products/:id` |
| Shopping cart (add, change qty, remove) | `cart.html`, `/api/cart` |
| Order processing (checkout, stock check, stock reduced) | `POST /api/orders` |
| Order history | `orders.html`, `GET /api/orders` |
| User registration / login / logout (bcrypt-hashed passwords, sessions) | `register.html`, `login.html`, `/api/auth/*` |

## Database tables
`users`, `products`, `orders`, `order_items` (one order → many items). 8 sample products are seeded on first run.

## Run it
```bash
npm install
npm start
```
Open http://localhost:3000

Delete `store.db` to reset the database.

## Project structure
```
ecommerce-store/
├── server.js        # Express routes (auth, products, cart, orders)
├── db.js            # SQLite schema + seed data
├── package.json
└── public/
    ├── index.html   product.html   cart.html
    ├── login.html   register.html  orders.html
    ├── css/style.css
    └── js/app.js    # fetch API calls + page logic
```

## API summary
| Method | Route | Auth |
|---|---|---|
| POST | /api/auth/register, /api/auth/login, /api/auth/logout | – |
| GET | /api/auth/me | – |
| GET | /api/products, /api/products/:id, /api/categories | – |
| GET/POST | /api/cart | – |
| PUT/DELETE | /api/cart/:productId | – |
| GET/POST | /api/orders | login required |
