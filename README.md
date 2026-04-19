# Telegram Rental Building Management System

Production-ready Node.js + Express + MongoDB + Telegraf bot for managing a 100-room rental building, with a **clean button-first Telegram UX**.

## Highlights
- Persistent top-level reply keyboard (admin/tenant)
- Inline submenu navigation with message editing (reduced chat clutter)
- Compact paginated lists (rooms/payments/tenants)
- Polished card-style detail messages for room, payment, tenant, and dashboard
- Guided step-by-step flows with session state and explicit cancel/confirm
- Existing backend logic/services preserved (room, tenant, payment, reminders, API)
- Room photo support using Telegram `file_id` (no local file storage)

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
  formatters/
  handlers/
  jobs/
  keyboards/
  middleware/
  models/
  navigation/
  routes/
  seed/
  services/
  utils/
```

## Telegram UX behavior
### Main menu (reply keyboard only)
Admin:
- 🏠 Rooms
- 💳 Payments
- 📊 Dashboard
- 👥 Tenants
- ⚠️ Late Rent
- ⚙️ Settings

Tenant:
- 🏠 My Room
- 💳 My Payment
- 📞 Contact Admin
- (if unlinked) 🔗 Link My Room

### Nested screens (inline only)
- Rooms / Payments / Tenants / Settings use compact inline menus
- Pagination and drill-down views edit the same panel message when possible
- Back returns to previous panel; Cancel is used for active input flows only

### Card-style formatting
- Room card with grouped blocks: status, tenant, stay info, payment
- Tenant card with linked status and current payment
- Payment card with room/tenant/amount/due/status
- Dashboard card with grouped summary sections
- Room detail supports image display when `photoFileId` exists; otherwise text fallback

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
- Admin actions restricted to `ADMIN_TELEGRAM_IDS`
- Tenants can only view linked room/payment
- Input validation in service layer
- Secrets in `.env`
