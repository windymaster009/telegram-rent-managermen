# Telegram Rental Building Management System

Production-ready Node.js + Express + MongoDB + Telegraf bot for managing a 100-room rental building, with **button-first Telegram UX**.

## Highlights
- Button-first experience (reply keyboard main menus + inline action keyboards)
- Guided multi-step flows with session state (no complex command typing needed)
- Admin and Tenant role separation
- Room/tenant/payment lifecycle management
- Automated reminders (3 days before, due date, overdue admin alert)
- REST API for dashboard/frontend extension

## Stack
- Node.js
- Express.js
- MongoDB + Mongoose
- Telegraf
- node-cron
- dotenv

## Project structure
```
src/
  app.js
  server.js
  bot/
  commands/
  config/
  flows/
  handlers/
  jobs/
  keyboards/
  middleware/
  models/
  routes/
  seed/
  services/
  utils/
```

## Telegram UX
### Admin main menu (Reply Keyboard)
- 🏠 Rooms
- 💰 Payments
- 📊 Dashboard
- 👤 Tenants
- ⚠️ Late Rent
- ⚙️ Settings

### Tenant main menu (Reply Keyboard)
- 🏠 My Room
- 💰 My Payment
- 📞 Contact Admin
- (If not linked) 🔗 Link My Room

### Guided flows
- Assign Tenant (step-by-step)
- Record Payment (step-by-step)
- Vacate Room (with confirmation)
- Search Room / Search Tenant
- Link Tenant Telegram account

Slash commands are kept as fallback for admins/developers (`/rooms`, `/addroom`, `/addtenant`, `/pay`, `/dashboard`, etc.).

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment file:
   ```bash
   cp .env.example .env
   ```
3. Configure `.env` values.
4. Seed base rooms:
   ```bash
   npm run seed:rooms
   ```
5. Run app:
   ```bash
   npm run dev
   ```

## Seed scripts
- `npm run seed:rooms` → creates 100 rooms (`001` to `100`)
- `npm run seed:sample` → creates sample rooms/tenant

## REST API
Base path: `/api`
- `GET /health`
- `GET /dashboard`
- `GET /search?q=<query>`
- `GET /tenants/unlinked`
- `GET /rooms?status=free|rented`
- `GET /payments?status=unpaid|overdue|paid`

## Security
- Admin commands/actions restricted to `ADMIN_TELEGRAM_IDS`
- Tenants can view only their linked room/payment
- Input validation in service layer
- Secrets in `.env`
