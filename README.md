# Ally Monorepo (MVP)

This repository contains:

- Product web app (Next.js)
- Backend API in Go (Chi)
- Services (webhook ingress, workers)

## Getting started (API)

Prerequisites: Go 1.22+, Postgres, Redis (to be wired later)

Run API locally:

```bash
cd backend/api
# set envs as needed (defaults: APP_ENV=development, API_ADDRESS=:8080)
go run .
```

Health endpoints:

```bash
curl -s http://localhost:8080/healthz
curl -s http://localhost:8080/readyz
```

## Tech choices (backend)

- Router: Chi
- Logging: zerolog
- DB: Postgres (sqlc planned)
- Queues: Redis + asynq (planned)
- Migrations: golang-migrate (planned)

## Next steps

- Scaffold Next.js app for the product UI
- Add webhook ingress service (Go)
- Add SQL migrations and sqlc
- Introduce Redis + asynq worker

