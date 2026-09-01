# Supabase Edge Functions deployment

This folder replaces the deployed Node backend with the `admin-api` Supabase Edge Function. The Node backend can remain for local development, but it is not required after this function is deployed.

## 1. Protect your Supabase data

Keep Row Level Security enabled for all public tables. The function uses Supabase's server-only `SUPABASE_SERVICE_ROLE_KEY`, which is never added to GitHub or frontend environment files.

An admin must meet both conditions to use this dashboard:

1. Have a valid Supabase Auth email/password account.
2. Have a matching email in `public.users` and an `admin` or `super_admin` record in `public.admins`.

## 2. Set secrets and allowed origins

Run these commands locally after logging into the Supabase CLI. Use your exact GitHub Pages URL; add local Vite URLs only when needed for development.

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set ALLOWED_ORIGINS=https://YOUR_GITHUB_USERNAME.github.io,http://localhost:5173
supabase secrets set SUPABASE_QUERY_LIMIT=1000
supabase functions deploy admin-api
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically supplied to deployed Edge Functions. Do not put a service-role key in GitHub Actions, GitHub Pages variables, or a frontend `.env` file.

## 3. Configure the GitHub Pages frontend

In the environment used to build the frontend, set only these public variables:

```text
VITE_API_BASE_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-api
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Build and deploy the `frontend` directory to GitHub Pages. Administrators can then sign in using their Supabase Auth credentials. The browser sends the short-lived access token to the Edge Function; the function validates the token and checks the `users` and `admins` database records before responding.

## 4. Add administrators

A signed-in `super_admin` can create regular administrators from **Settings**, including their feature privileges. Privileges are stored with the administrator's existing `admin_roles` record, so no additional database column is required. The API deliberately does not allow a superadmin to grant the `admin:manage` privilege to a new regular administrator.

The existing local command `npm run provision-admins` remains the bootstrap path for the initial admin and superadmin accounts while the Node backend configuration is available.
