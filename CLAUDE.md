# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

### Development

```bash
pnpm install                  # install all workspace dependencies

pnpm dev:server               # start Hono server on :5000 (hot-reload via tsx)
pnpm dev:client               # start Vite dev server on :5173 (proxies /api → :5000)
```

Run both in separate terminals during development. The client dev server proxies all `/api/*` requests to the server.

`DATA_DIR` controls where the server reads `input_data/`, `corrections/`, and `config/`. Defaults to `.`. Set to `data` when running locally with the `data/` subdirectory layout:

```bash
DATA_DIR=data pnpm dev:server
```

### Production build

```bash
pnpm build           # builds client (Vite) then server (tsup)
pnpm start           # runs the production server
```

The production server serves the compiled Vue SPA from `packages/client/dist/` and handles all API routes.

### Docker

```bash
docker compose up --build
```

Exposed on port 8080. `DATA_DIR=/data` is set automatically. Mount `./data` as the volume.

## Architecture

Monorepo with two packages under `packages/`:

- **`packages/server`** — Hono HTTP server (Node.js, TypeScript)
- **`packages/client`** — Vue 3 SPA (Vite, TypeScript)

### Server layers

Data flows in one direction: **parse → compute → report**.

- **`domain/models.ts`** — TypeScript interfaces: `ClockEvent`, `Session`, `DayRecord`, `CorrectionItem`, `EmployeeData`
- **`domain/parser.ts`** — `parseFile()`, `parseCorrectionFile()`, `applyCorrections()`, `validateRawContent()`
- **`domain/calculator.ts`** — `compute()` groups events by employee+day, pairs consecutive timestamps as sessions
- **`infrastructure/reporter.ts`** — `fmtMs()`, `fmtTime()`, `fmtLocalTs()`, `buildRows()` — formatting helpers
- **`infrastructure/settings.ts`** — `loadSettings()`, `saveSettings()`, `findUser()`, `ensureSecretKey()`
- **`infrastructure/data.ts`** — `loadEvents()`, `appendCorrection()`, `loadPending()`, `savePending()`, `addPending()`, `removePending()`
- **`application/userService.ts`** — auth, user CRUD, werkzeug hash compatibility
- **`application/correctionService.ts`** — correction CRUD, pending approval queue
- **`application/reportService.ts`** — event data queries, report generation
- **`application/fileService.ts`** — raw file upload/delete
- **`middleware/auth.ts`** — `authMiddleware` (JWT cookie), `adminMiddleware`
- **`routes/auth.ts`** — `/api/auth/*` (login, logout, setup, config)
- **`routes/editor.ts`** — `/api/events`, `/api/add`, `/api/edit`, `/api/delete`, `/api/bulk-delete`, `/api/my-reports`, `/api/my-pending`, `/api/profiles`, `/api/change-password`
- **`routes/admin.ts`** — `/api/admin/*` (employees, admins, raw-files, pending)
- **`index.ts`** — app entry: mounts routes, serves client dist, SPA fallback

### Client structure

- **`pages/`** — `LoginPage.vue`, `SetupPage.vue`, `EditorPage.vue`, `AdminPage.vue`, `ReportIndexPage.vue`, `ReportPage.vue`
- **`components/editor/`** — `EmployeeSidebar.vue`, `SessionTable.vue`, `AddSessionModal.vue`, `ChangePasswordModal.vue`
- **`components/admin/`** — `AdminEmployees.vue`, `AdminAdmins.vue`, `AdminDataFiles.vue`, `AdminPending.vue`
- **`composables/useToast.ts`** — singleton toast state
- **`api/client.ts`** — typed `api` object with all endpoint calls; `ApiError` class
- **`router.ts`** — vue-router routes + `beforeEach` auth guard (calls `/api/auth/config`, redirects to `/login` or `/setup`)
- **`styles/`** — `_variables.scss` (design tokens), `base.scss` (global styles)

## Auth & configuration

Settings are stored in `config/settings.json` (inside `DATA_DIR`).

Two user types:
- **admin_users** — full access; no employee ID association
- **employees** — keyed by `emp_id`; restricted to own data by default. Fields: `alias`, `full_name`, `username`, `password_hash`, `is_admin`, `enabled`

Auth uses **JWT in an httpOnly cookie** (7-day expiry). The secret key is auto-generated and persisted to `config/settings.json` on first startup.

On first run with no admin accounts, the app serves a setup page at `/setup` — all other routes redirect there until an admin is created.

Password hashing: new passwords use **bcrypt**. Existing werkzeug PBKDF2-SHA256 hashes (from prior Python deployments) are verified transparently via Node's `crypto.pbkdf2Sync`.

## Corrections system

The web editor records corrections in `corrections/correction-history.json` (JSON, append-only, with metadata: who applied it, when, UUID, and an `undone` flag). This is the single source of truth for web editor corrections.

You can also place manual `.txt` files in `corrections/` using the same tab-separated format as `input_data/` — these are applied first as static imports before history corrections. Lines starting with `#` are ignored.

Three action types for manual `.txt` files (plain lines are treated as `ADD`):

```
ADD   2   Angelica   Admin   2024-01-23 17:30:00   1
DEL   2   Angelica   Admin   2024-01-23 09:05:00   1
EDIT  2   Angelica   Admin   2024-01-23 09:05:00   2024-01-23 09:00:00   1
```

## API routes

| Route | Access | Purpose |
|---|---|---|
| `GET /api/auth/config` | login required | Session user info |
| `POST /api/auth/login` | public | Authenticate, set JWT cookie |
| `POST /api/auth/logout` | public | Clear JWT cookie |
| `GET/POST /api/auth/setup` | public (first-run only) | Initial admin creation |
| `GET /api/events` | login required | Clock events (filtered to own for non-admins) |
| `POST /api/add` | login (own data) | Append ADD correction |
| `POST /api/edit` | login (own data) | Append EDIT correction |
| `POST /api/delete` | admin only | Append DEL correction |
| `POST /api/bulk-delete` | admin only | Multiple DEL corrections |
| `GET /api/my-reports` | login required | Own report URLs |
| `GET /api/my-pending` | login required | Own pending corrections |
| `GET /api/profiles` | login required | Employee alias/display list |
| `PUT /api/change-password` | login required | Self-service password change |
| `GET /api/reports` | admin only | Report index (years + stems) |
| `GET /api/reports/:stem` | admin or own emp_id | Per-employee yearly report JSON |
| `GET /api/admin/employees` | admin only | All employees with settings |
| `PUT /api/admin/employees/:empId` | admin only | Update employee |
| `GET /api/admin/admins` | admin only | All admin accounts |
| `POST /api/admin/admins` | admin only | Create admin account |
| `PUT /api/admin/admins/:username` | admin only | Update admin password |
| `DELETE /api/admin/admins/:username` | admin only | Delete admin account |
| `GET /api/admin/raw-files` | admin only | List input files |
| `POST /api/admin/raw-files` | admin only | Upload input file |
| `DELETE /api/admin/raw-files/:filename` | admin only | Delete input file |
| `GET /api/admin/pending` | admin only | All pending corrections |
| `GET /api/admin/pending/:id/preview` | admin only | Before/after diff preview |
| `POST /api/admin/pending/:id/approve` | admin only | Approve pending item |
| `POST /api/admin/pending/:id/reject` | admin only | Reject pending item |

## Deployment (Docker)

```bash
docker compose up -d --build
```

`compose.yaml` mounts `./data` as a single volume at `/data`. Before first run, create:

```
data/
  input_data/     ← raw .txt clock exports
  corrections/    ← correction files
  config/         ← settings.json (auto-created on first run)
```
