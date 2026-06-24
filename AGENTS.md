# Agrisell Admin - Agent Rules

These instructions apply to every agent working in this repository unless the
user explicitly gives a conflicting instruction.

## Working rules

- Read the relevant code before editing it. Follow the existing patterns,
  naming, component structure, and styling conventions.
- Keep each change focused on the user's request. Do not refactor, rename, or
  reformat unrelated code.
- Preserve existing user changes. Never overwrite, discard, reset, or revert
  work that the agent did not create unless the user explicitly asks.
- Prefer small, maintainable React and TypeScript changes. Do not introduce
  dependencies, configuration changes, or new architecture without a clear
  need and the user's approval.
- Use accessible, semantic UI: label controls, support keyboard interaction,
  provide meaningful text alternatives, and keep sufficient color contrast.
- Source icons in this order: first reuse a matching asset from
  `frontend/src/assets/icons/`, then reuse the local `Icon` component. Only
  when no suitable local icon exists may an icon library be used. Keep one
  visually consistent icon style, and do not add an icon dependency unless it
  is needed for a missing icon.
- Keep TypeScript strict: avoid `any`, unsafe casts, and ignored errors. Reuse
  existing types and components where appropriate.
- Use `camelCase` for variables, functions, props, hooks, utility names, and
  non-component filenames. Keep React components, classes, and TypeScript
  types/interfaces in `PascalCase`; use `UPPER_SNAKE_CASE` only for true
  constants.
- Do not expose secrets, tokens, credentials, private data, or environment
  values in source code, logs, commits, or responses.
- Do not run destructive commands (`git reset --hard`, broad deletion, force
  pushes, etc.) or deploy/publish changes unless the user explicitly requests
  it.
- Before finishing an implementation, run the most relevant available checks.
  For normal application changes, run `npm run lint` and `npm run build` when
  practical; clearly report any check that cannot be run or fails.
- Report the outcome concisely: files changed, what changed, and validation
  performed. Call out assumptions, trade-offs, and blockers plainly.

## Project conventions

- This repository contains two separate applications: the React + TypeScript +
  Vite dashboard in `frontend/` and the Node.js server application in
  `backend/`.
- Keep frontend application code inside `frontend/` and backend application
  code inside `backend/`. Follow the required folder structure below.
- Prefer reusable components over duplicated UI markup when the same behavior
  or layout is needed more than once.
- Keep user-facing dashboard copy clear and consistent with existing Agrisell
  terminology.

## Required project structure

Always choose the correct location below before adding a file. Do not place
new source files at the root of `frontend/src/` unless they are an application
entry file such as `App.tsx` or `main.tsx`.

```text
frontend/               React + TypeScript + Vite dashboard
  public/               Static files served as-is by Vite
  src/
    api/                API clients, endpoint calls, and API configuration
    assets/             Imported images, fonts, icons, and other media
    components/
      layout/            Reusable application layout components
      ui/                Small, reusable presentational UI components
    context/             React Context providers and context hooks
    data/                Static, fixture, and mock application data
    hooks/               Reusable custom React hooks
    pages/               Route-level screens and page components
    redux/               Redux store, slices, selectors, and middleware
    services/            Business logic and frontend service modules
    types/               Shared TypeScript types and interfaces
    utils/               Pure reusable helper and utility functions
    App.tsx              Root application component
    main.tsx             Application bootstrap
backend/                Node.js server application
  src/
    config/             Server configuration and environment validation
    controllers/        HTTP request and response handlers
    middleware/         Authentication, validation, error, and request middleware
    models/             Database models and persistence schemas
    routes/             API route definitions
    services/           Business logic and external integrations
    utils/              Server-only helper functions
```

### Placement and dependency rules

- API request code belongs in `frontend/src/api/`; API modules must not be
  embedded in components or pages.
- Put page-level orchestration in `frontend/src/pages/`. Extract shared UI to
  `frontend/src/components/`, using `layout/` for structural components and
  `ui/` for small generic controls.
- Put global frontend state in `frontend/src/context/` or
  `frontend/src/redux/`. Use Context for focused, lightweight shared state;
  use Redux only when advanced centralized state is genuinely needed. Do not
  add Redux merely to match this structure.
- Keep static/mock data in `frontend/src/data/`, frontend business rules in
  `frontend/src/services/`, reusable React behavior in `frontend/src/hooks/`,
  and framework-independent helpers in `frontend/src/utils/`.
- Keep TypeScript domain models and shared interfaces in `frontend/src/types/`.
- `frontend/public/` is only for files referenced by a stable public URL.
  Prefer `frontend/src/assets/` for files imported by application code.
- Keep server code in the root-level `backend/` directory, never inside the
  frontend `src/` directory. The frontend communicates with it only through
  `frontend/src/api/` modules.
- Preserve existing files in their current location unless the user explicitly
  requests a migration. All newly created files and all moved files must use
  this structure.
