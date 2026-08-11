# Agrisell Backend

Server code belongs in `backend/src/`. Keep frontend code in `frontend/src/`
and communicate with this service through frontend API modules.

This backend uses Node.js with no external runtime dependencies. During local
development, it runs at `http://localhost:3001` and exposes
`GET /api/health`.

Requests that identify as mobile phones receive a `403` response with the
`MOBILE_PHONE_NOT_ALLOWED` code before reaching any API route.

Authentication is enforced in the backend. The login endpoint verifies either
database-backed Supabase administrator credentials or the legacy environment
credentials, then issues a signed `HttpOnly` cookie.
All `/api/*` routes are protected by default except health and auth routes.

The protected `GET /api/admin/dashboard` endpoint reads marketplace data from
the same Supabase project used by the Agrisell application. It is available
only to a signed-in admin and keeps the Supabase service-role key on the server.

## Commands

- `npm run dev` - start the server with automatic reloads
- `npm run hash-password` - generate an `ADMIN_PASSWORD_HASH` value
- `npm run provision-admins` - create the initial database-backed admin accounts
- `npm run start` - start the server once

Set the `PORT` environment variable to use a port other than `3001`.

## Security configuration

For local development, copy `.env.example` to `.env.local` inside `backend/`
and set real values there. The server loads `backend/.env.local`
automatically, and the file is ignored by Git. You can also provide the same
values through your shell or hosting environment.

- `ADMIN_EMAIL` - admin account email allowed to sign in
- `ADMIN_PASSWORD_HASH` - scrypt hash generated with `npm run hash-password`
- `ADMIN_SESSION_SECRET` - long random secret used to sign session cookies
- `ALLOWED_ORIGINS` - comma-separated frontend origins allowed to use cookies
- `ADMIN_SESSION_TTL_SECONDS` - optional session lifetime, defaults to 8 hours
- `SESSION_COOKIE_SAMESITE` - `Strict`, `Lax`, or `None`; defaults to `Strict`
- `REQUIRE_HTTPS` - set to `true` locally if you want to reject HTTP requests
- `SECURE_COOKIES` - set to `true` only when the frontend uses HTTPS
- `SUPABASE_URL` - the Agrisell Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - server-only key used for protected admin reads
- `SUPABASE_QUERY_LIMIT` - optional per-table dashboard read limit, defaults to `1000`

In production, `ADMIN_SESSION_SECRET` is required along with either
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, or the legacy `ADMIN_EMAIL`
and `ADMIN_PASSWORD_HASH`. Raw `ADMIN_PASSWORD` is only accepted in
non-production development and should not be used for deployment.
Use `SESSION_COOKIE_SAMESITE=None` only when the frontend and API are on
different sites, and only with HTTPS plus `SECURE_COOKIES=true`.

Copy the existing Agrisell application's `SUPABASE_URL` into this backend's
environment. Obtain `SUPABASE_SERVICE_ROLE_KEY` from the Supabase project
settings and keep it only in `backend/.env.local` or the production host's
secret store; it must never be included in the Flutter or Vite application.

## Database-backed administrator accounts

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured, admin
login checks Supabase Auth credentials and the matching `public.admins` role.
The one-time provisioning command creates `admin@agrisell.local` with the
`admin` role and `superadmin@agrisell.local` with the `super_admin` role.

Provide the two passwords only through temporary process environment variables
when running `npm run provision-admins`; do not add bootstrap passwords to
`.env.local` or source control. The command is deliberately separate from
server startup so default accounts are never recreated automatically.

## Password recovery codes

The admin sign-in page sends and verifies a six-digit password-recovery code.
In the Supabase Dashboard, open **Authentication > Email Templates > Reset
Password** and replace the default `{{ .ConfirmationURL }}` link with
`{{ .Token }}`. For example:

```html
<h2>Reset your Agrisell Admin password</h2>
<p>Enter this 6-digit recovery code in Agrisell Admin:</p>
<h1>{{ .Token }}</h1>
<p>Do not share this code with anyone.</p>
```

Also set the Supabase **Authentication > URL Configuration > Site URL** to the
deployed admin URL. For local development, add `http://localhost:5173` to the
allowed Redirect URLs instead of the default `http://localhost:3000`.

## Structure

- `config/` - server configuration and environment validation
- `controllers/` - HTTP request and response handlers
- `middleware/` - authentication, validation, and error middleware
- `models/` - database models and schemas
- `routes/` - API route definitions
- `services/` - business logic and external integrations
- `utils/` - server-only helper functions
