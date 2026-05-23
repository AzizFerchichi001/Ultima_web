# ULTIMA Web

ULTIMA Web is a demo padel arena platform with a React frontend, an Express API, PostgreSQL persistence, live Socket.IO updates, local email testing, and optional SmartPlay AI integration.

## Tech Stack

- Frontend: Vite, React, TypeScript, Tailwind CSS, shadcn/Radix UI
- Backend: Node.js, Express, JWT authentication, Socket.IO
- Database: PostgreSQL
- Cache/service layer: Redis is included in Docker and exposed through `REDIS_URL`
- Email: Nodemailer with Mailpit for local/demo email inboxes
- Payments: Stripe payment scaffolding for court and coach payments
- AI: SmartPlay AI endpoints are scaffolded and can connect to an external AI service

## Main Features

- Player, coach, and admin authentication
- Email verification and forgot-password flows
- Multi-arena court browsing and reservations
- Competition listing and registration
- Coach profiles, coaching requests, and coach/player relationships
- Live match scoring through Socket.IO
- Admin dashboards for users, courts, reservations, logs, stats, scoring, billing, and platform status
- Reservation ticket/QR verification support
- SmartPlay AI analysis queue endpoints

## Project Structure

```text
Ultima_web/
  src/                      React frontend
  server/                   Express API and database adapters
  database/                 PostgreSQL schema/seed files and legacy migration files
  scripts/                  Utility and migration scripts
  docker-compose.yml        Full demo stack: web, API, PostgreSQL, Redis, Mailpit
  docker-compose.postgres.yml
                            PostgreSQL-only helper stack
```

## Requirements

- Node.js 22 or newer recommended
- npm
- Docker Desktop, if you want the recommended full local stack
- PostgreSQL, only if running the database without Docker

## Environment

Create a `.env` file from `.env.example`.

Important variables:

```env
DB_CLIENT=postgres
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=
PG_DATABASE=ultima_web
JWT_SECRET=change-me
PORT=3001
PUBLIC_WEB_BASE_URL=http://localhost:5173
REDIS_URL=redis://127.0.0.1:6379
SMARTPLAY_AI_URL=
```

`DB_CLIENT=postgres` is the current default runtime path. The repository still contains older MySQL migration/adapter files from the migration history, but the README and Docker demo stack are PostgreSQL-based.

## Run With Docker

The easiest way to run the full demo is:

```bash
docker compose up -d --build
```

Services:

- Web app: `http://localhost:5173`
- API: `http://localhost:3001`
- API health: `http://localhost:3001/api/health`
- PostgreSQL: host port `5433`, container port `5432`
- Redis: `localhost:6379`
- Mailpit inbox: `http://localhost:8025`
- Mailpit SMTP: `localhost:1025`

The main Docker stack initializes PostgreSQL with:

- `database/postgres_init.sql`
- `database/smartplay_upgrade.sql`

Stop the stack:

```bash
docker compose down
```

Remove persisted demo database/cache volumes:

```bash
docker compose down -v
```

## Run Locally Without Docker

Install dependencies:

```bash
npm install
```

Create and seed a PostgreSQL database. The default database name is `ultima_web`:

```bash
createdb -U postgres ultima_web
psql -U postgres -d ultima_web -f database/postgres_init.sql
psql -U postgres -d ultima_web -f database/smartplay_upgrade.sql
```

Start the API:

```bash
npm run server
```

Start the frontend in a second terminal:

```bash
npm run dev
```

The Vite dev server proxies `/api`, `/public`, and `/socket.io` requests to `http://localhost:3001`.

## Local PostgreSQL Helper

To start only PostgreSQL with Docker:

```bash
docker compose -f docker-compose.postgres.yml up -d
```

Then point your env file at:

```env
PG_HOST=127.0.0.1
PG_PORT=5432
PG_USER=postgres
PG_PASSWORD=admin
PG_DATABASE=ultima_demo
```

Seed that helper database after the container is ready:

```bash
psql -h 127.0.0.1 -U postgres -d ultima_demo -f database/postgres_init.sql
psql -h 127.0.0.1 -U postgres -d ultima_demo -f database/smartplay_upgrade.sql
```

## Redis

Redis is included in the full Docker stack as `ultima-redis` and is available at:

```env
REDIS_URL=redis://127.0.0.1:6379
```

In this project Redis is an optional supporting service. Core API/database flows do not require Redis, but the Docker stack starts it so cache/queue-style features can be enabled consistently through `REDIS_URL` as the backend grows.

The Redis container uses:

- image: `redis:7-alpine`
- append-only persistence
- `128mb` memory limit
- `allkeys-lru` eviction policy
- persisted volume: `redis_data`

## Email Flows

The project supports real email-link/code flows:

- `POST /api/auth/forgot-password`
- `GET /api/auth/verify-email?token=...`
- `POST /api/auth/resend-verification`

For Docker demos, Mailpit is already included:

- SMTP host inside Docker: `mailpit`
- SMTP host from your machine: `127.0.0.1`
- SMTP port: `1025`
- Inbox UI: `http://localhost:8025`

To send real emails, configure:

```env
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_account@example.com
SMTP_PASS=your_app_password
SMTP_FROM=your_account@example.com
```

When running through Docker, `docker-compose.yml` also supports `SMTP_HOST_DOCKER`.

## Demo Accounts

- Admin: `aziz@email.com` / `demo12345`
- Player: `ahmed@email.com` / `demo12345`
- Coach: `sami@email.com` / `demo12345`

Some test seed scripts may also create arena test accounts when `ENABLE_TEST_SEED=1`.

## Useful Scripts

```bash
npm run dev                  # Start Vite frontend
npm run server               # Start Express API with .env
npm run server:dev           # Start API in watch mode with .env
npm run server:localdb       # Start API with .env.localdb
npm run server:localdb:dev   # Watch mode with .env.localdb
npm run server:dockerdb      # Start API with .env.dockerdb
npm run server:dockerdb:dev  # Watch mode with .env.dockerdb
npm run build                # Production frontend build
npm run preview              # Preview built frontend
npm run lint                 # Run ESLint
npm run test                 # Run Vitest
```

## Database Notes

- The runtime backend expects PostgreSQL when `DB_CLIENT=postgres`.
- Main schema/seed file: `database/postgres_init.sql`
- SmartPlay schema upgrade: `database/smartplay_upgrade.sql`
- The old MySQL dump files are kept for migration/reference history only.
- New signups, reservations, competitions, performance data, logs, coaching data, and billing records are stored in PostgreSQL in the current demo stack.
- Inactive users are blocked from logging in.

## SmartPlay AI

SmartPlay AI endpoints are available in the API, but the AI microservice is optional.

Set this when the AI backend is deployed:

```env
SMARTPLAY_AI_URL=http://your-ai-service
```

Without `SMARTPLAY_AI_URL`, the platform continues to run normally and reports the AI service as not connected.

## Stripe

Stripe variables are optional for local demo work unless you are testing payment flows:

```env
STRIPE_SECRET_KEY=sk_test_
STRIPE_WEBHOOK_SECRET=whsec_
```

The current payment code converts TND display amounts to EUR because TND is not a native Stripe currency.

## API Health Check

Check API and selected database adapter:

```bash
curl http://localhost:3001/api/health
```

Expected shape:

```json
{
  "status": "ok",
  "db": {
    "requested": "postgres",
    "selected": "postgres"
  }
}
```
