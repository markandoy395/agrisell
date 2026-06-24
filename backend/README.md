# Agrisell Backend

Server code belongs in `backend/src/`. Keep frontend code in `frontend/src/`
and communicate with this service through frontend API modules.

This backend uses Node.js with no external runtime dependencies. During local
development, it runs at `http://localhost:3001` and exposes
`GET /api/health`.

Requests that identify as mobile devices receive a `403` response with the
`MOBILE_DEVICE_NOT_ALLOWED` code before reaching any API route.

## Commands

- `npm run dev` - start the server with automatic reloads
- `npm run start` - start the server once

Set the `PORT` environment variable to use a port other than `3001`.

## Structure

- `config/` - server configuration and environment validation
- `controllers/` - HTTP request and response handlers
- `middleware/` - authentication, validation, and error middleware
- `models/` - database models and schemas
- `routes/` - API route definitions
- `services/` - business logic and external integrations
- `utils/` - server-only helper functions
