# Agrisell Code Structure and 200-Line Policy

## Purpose

Use this document when adding features or refactoring existing code. The goal is to keep the codebase modular, reusable, testable, and easy to navigate without changing existing behavior.

## Hard file-size rule

* Every authored `.js`, `.mjs`, `.ts`, `.tsx`, and `.css` file must contain no more than 200 physical lines.
* The limit includes blank lines and comments. Keeping the physical file below the limit makes the rule objective and easy to automate.
* Apply the rule to production code, tests, scripts, and Supabase Edge Functions.
* Start splitting a file near 170 lines; do not wait until it reaches 200 lines.
* Do not satisfy the limit by removing useful spacing, compressing statements, or moving unrelated code into a generic dumping-ground file.

### Exclusions

The following files are excluded:

* SQL files and historical migrations under `supabase/migrations/`
* Generated lockfiles such as `package-lock.json`
* Generated output such as `dist/`, `build/`, and `coverage/`
* Vendored dependencies under `node_modules/`
* Binary assets, fonts, and images

An excluded file must not be manually modified merely to reduce its line count.

## General design rules

1. Each file must have one clear responsibility.
2. Routes map URLs to middleware and controllers; they do not contain business logic.
3. Controllers validate request-level input, call a service, and format the response.
4. Services contain business operations and coordinate repositories or external clients.
5. Repository or data-access modules contain database queries and persistence details.
6. React pages compose components and hooks; they should not own large UI sections or API implementations.
7. Hooks own reusable stateful behavior. Pure transformations belong in utility modules.
8. Shared types, constants, and schemas must be extracted instead of duplicated.
9. CSS must be split by component or responsibility, not by arbitrary line ranges.
10. Public module APIs should be small. Export only what another module needs.

## Folder-size guideline

There is no strict maximum number of files allowed in a folder. Folder organization should be based primarily on responsibility and feature ownership rather than an arbitrary file-count limit.

Use the following guideline:

* **1–10 files:** Perfectly acceptable in a single folder.
* **10–15 files:** Still acceptable when the files are closely related and easy to navigate.
* **15–20 files:** Consider introducing meaningful subfolders based on responsibility.
* **More than 20 files:** The folder should normally be reviewed and divided into responsibility-based or feature-based subfolders when appropriate.

Prefer roughly **5–15 closely related files per folder**.

Do not create subfolders solely to reduce the number of files in a directory. A new folder must represent a meaningful responsibility, component group, feature, or architectural boundary.

For example, instead of keeping many unrelated files directly under a feature:

```text
orders/
  orderApi.ts
  OrderFilters.tsx
  OrderFilters.css
  OrderTable.tsx
  OrderTable.css
  OrderDetailsModal.tsx
  OrderDetailsModal.css
  useOrders.ts
  useOrderFilters.ts
  OrderWorkspace.tsx
  OrderWorkspace.css
  order.constants.ts
  order.schema.ts
  order.types.ts
  order.utils.ts
```

Prefer responsibility-based organization:

```text
orders/
  api/
    orderApi.ts

  components/
    OrderFilters.tsx
    OrderFilters.css
    OrderTable.tsx
    OrderTable.css
    OrderDetailsModal.tsx
    OrderDetailsModal.css

  hooks/
    useOrders.ts
    useOrderFilters.ts

  pages/
    OrderWorkspace.tsx
    OrderWorkspace.css

  order.constants.ts
  order.schema.ts
  order.types.ts
  order.utils.ts
```

If one component develops several closely related implementation files, group them under the component's own folder when that improves navigation:

```text
components/
  OrderTable/
    OrderTable.tsx
    OrderTableRow.tsx
    OrderTableHeader.tsx
    OrderTablePagination.tsx
    OrderTableActions.tsx
    OrderTableEmptyState.tsx
    OrderTable.css
```

Folder depth should remain reasonable. Do not introduce unnecessary structures such as:

```text
components/
  tables/
    orders/
      table/
        rows/
          components/
```

Prefer the shallowest structure that still communicates clear ownership.

The **200-line rule is a hard limit for individual source files**. The **5–15 file recommendation is only an organizational guideline for folders** and must not be enforced as a hard numerical rule.

## Naming conventions

* React components and component files: `PascalCase.tsx`
* Hooks: `useFeatureName.ts`
* Utilities, services, controllers, and routes: `camelCase.ts` or `camelCase.js`
* Types: `feature.types.ts`
* Constants: `feature.constants.ts`
* Validators: `feature.validation.ts` or `feature.schema.ts`
* API modules: `featureApi.ts`
* Component styles: `ComponentName.css`
* Tests: `moduleName.test.ts`, `moduleName.test.tsx`, or `moduleName.test.mjs`

Avoid vague filenames such as `helpers.ts`, `common.ts`, `misc.ts`, or `utils2.ts`. Name a module after its specific responsibility.

## Frontend structure

Prefer feature-oriented folders while retaining genuinely shared UI under `components/ui`.

```text
frontend/src/
  api/
    client.ts

  components/
    layout/
    ui/

  features/
    orders/
      api/
        orderApi.ts

      components/
        OrderFilters.tsx
        OrderTable.tsx

      hooks/
        useOrders.ts

      pages/
        OrderWorkspace.tsx

      styles/
        orderFilters.css
        orderTable.css

      order.constants.ts
      order.types.ts
      order.utils.ts

  context/
  types/
  utils/
```

### React component rules

* A page should mainly compose feature components and connect page-level state.
* Extract a child component when a JSX section has its own purpose, props, interaction, or repeated markup.
* Extract a hook when effects, loading state, filters, pagination, or mutations can be named as one behavior.
* Keep API calls outside components.
* Keep pure filtering, mapping, formatting, and sorting outside components.
* Prefer composition over a component controlled by many boolean props.
* Do not create index barrels if they hide dependency cycles or make ownership unclear.

### CSS rules

Split styles according to the component that owns them:

```text
OrderWorkspace.tsx       -> OrderWorkspace.css
OrderFilters.tsx         -> OrderFilters.css
OrderTable.tsx           -> OrderTable.css
OrderDetailsModal.tsx    -> OrderDetailsModal.css
```

* Shared tokens belong in a small theme or variables file.
* Reusable table, button, form, modal, and status styles belong with the shared component.
* Page CSS should contain only page layout and page-specific overrides.
* Do not duplicate large selector blocks across workspaces.
* Preserve responsive rules with the component they affect.

## Backend structure

Organize backend behavior by domain as it grows:

```text
backend/src/
  config/
  middleware/

  modules/
    admin/
      admin.routes.js
      admin.controller.js
      admin.service.js
      admin.repository.js
      admin.validation.js

    auth/
      auth.routes.js
      auth.controller.js
      auth.service.js
      auth.repository.js
      auth.validation.js

  services/
    supabaseClient.js

  utils/
  server.js
```

### Backend responsibility boundaries

* `*.routes.js`: route declarations and middleware composition only
* `*.controller.js`: HTTP request and response handling only
* `*.validation.js`: request parsing and validation
* `*.service.js`: business rules and use-case orchestration
* `*.repository.js`: Supabase/database operations
* `middleware/`: reusable Express middleware
* `utils/`: small, pure, domain-independent utilities

Controllers must not build complex database queries. Repositories must not know about Express request or response objects.

## Supabase Edge Function structure

Keep `supabase/functions/admin-api/index.ts` as a thin entry point:

```text
supabase/functions/admin-api/
  index.ts
  router.ts
  config.ts

  middleware/
    authenticate.ts
    cors.ts

  handlers/
    accounts.ts
    deliveries.ts
    orders.ts
    payments.ts
    sales.ts

  services/
  repositories/
  schemas/
  types/
  utils/
```

The entry point should load configuration, apply shared middleware, dispatch the request, and return the response. Domain logic belongs in handlers and services.

## Safe refactoring procedure

For each file over 200 lines:

1. Identify its responsibilities and external exports.
2. Record existing behavior with tests before moving logic.
3. Extract types and constants first.
4. Extract pure utilities and validation.
5. Extract data access or API operations.
6. Extract hooks or UI components.
7. Leave the original module as a small coordinator.
8. Run lint, type checking, builds, and relevant tests.
9. Check every new or changed source file against the 200-line limit.

Refactor one domain at a time. Do not combine a structural refactor with unrelated behavior or visual changes.

## Verification

Run this PowerShell check from the repository root:

```powershell
$roots = @('frontend/src', 'frontend/tests', 'backend/src', 'backend/tests', 'supabase/functions')

$extensions = @('.js', '.mjs', '.ts', '.tsx', '.css')

$files = Get-ChildItem -LiteralPath $roots -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() }

$violations = foreach ($file in $files) {

  $lines = (Get-Content -LiteralPath $file.FullName | Measure-Object -Line).Lines

  if ($lines -gt 200) {

    [PSCustomObject]@{
      Lines = $lines
      File = $file.FullName
    }
  }
}

$violations |
  Sort-Object Lines -Descending |
  Format-Table -AutoSize

if ($violations) {
  throw 'Source files exceeding 200 lines were found.'
}
```

The command must exit successfully before a refactoring task is considered complete. It should eventually run in CI as a required check.

Also run the relevant project checks:

```powershell
Set-Location frontend

npm run lint
npm run build
```

Run the applicable frontend tests and backend smoke tests whenever behavior is moved.

## Definition of done

A feature or refactor is complete only when:

* Every authored source file is at most 200 physical lines.
* SQL and generated files remain excluded.
* Existing public behavior and API contracts are preserved unless a change was requested.
* Responsibilities follow the folder and module boundaries above.
* Repeated logic and styles are shared from an appropriately named module.
* No circular dependency or generic dumping-ground module was introduced.
* Folder organization remains clear and responsibility-based.
* Large folders are reviewed when they approach or exceed approximately 15–20 files.
* Subfolders are introduced only when they represent meaningful responsibilities or feature boundaries.
* Lint, build, type checks, and relevant tests pass.
* New modules have focused tests for extracted business logic.
