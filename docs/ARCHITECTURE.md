# Architecture — Working Hours Manager

## Overview

**Working Hours Manager** is a self-hosted employee time-tracking system. It reads clock-in/out events exported from physical time-clock devices (tab-separated `.txt` files), allows manual corrections through a web UI, and generates per-employee working-hours reports.

### Deployment

```
┌──────────────────────────────────────────┐
│  Docker Container (Node.js 20-alpine)    │
│  ┌────────────────────────────────────┐  │
│  │  Hono HTTP server :5000            │  │
│  │  Serves Vue SPA + REST API         │  │
│  └────────────────────────────────────┘  │
│         /data volume mounted             │
│  ┌────────────────────────────────────┐  │
│  │  data/input_data/*.txt             │  │
│  │  data/corrections/*.txt            │  │
│  │  data/corrections/pending-*.json   │  │
│  │  data/config/settings.json         │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
        ↕  port 8080 (host)
```

---

## Monorepo Structure

```
packages/
├── server/          ← Hono REST API (Node.js, TypeScript, tsup build)
│   └── src/
│       ├── domain/
│       ├── infrastructure/
│       ├── application/
│       ├── middleware/
│       ├── routes/
│       └── index.ts
└── client/          ← Vue 3 SPA (Vite, TypeScript)
    └── src/
        ├── pages/
        ├── components/
        ├── composables/
        ├── api/
        ├── styles/
        ├── router.ts
        └── main.ts
```

---

## Server Architecture

### Layer Inventory

| Layer | Path | Responsibility |
|---|---|---|
| Domain | `domain/models.ts` | TypeScript interfaces: `ClockEvent`, `Session`, `DayRecord`, `EmployeeData` |
| Domain | `domain/parser.ts` | `parseFile()`, `parseCorrectionFile()`, `applyCorrections()`, `validateRawContent()` |
| Domain | `domain/calculator.ts` | `compute()` — groups events by employee+day, pairs timestamps into sessions |
| Infrastructure | `infrastructure/reporter.ts` | `fmtMs()`, `fmtTime()`, `fmtLocalTs()`, `buildRows()` — formatting utilities |
| Infrastructure | `infrastructure/settings.ts` | `loadSettings()`, `saveSettings()`, `findUser()`, `ensureSecretKey()` |
| Infrastructure | `infrastructure/data.ts` | `loadEvents()`, `appendCorrection()`, pending queue I/O |
| Application | `application/userService.ts` | Auth, password verification, user CRUD, werkzeug hash compatibility |
| Application | `application/correctionService.ts` | ADD/EDIT/DEL corrections, pending approval queue |
| Application | `application/reportService.ts` | Event queries, report data assembly |
| Application | `application/fileService.ts` | Raw file upload, list, delete |
| Presentation | `middleware/auth.ts` | JWT cookie verification (`authMiddleware`, `adminMiddleware`) |
| Presentation | `routes/auth.ts` | `/api/auth/*` — login, logout, setup, config |
| Presentation | `routes/editor.ts` | Editor and employee-facing API routes |
| Presentation | `routes/admin.ts` | Admin-only management routes |
| Entry | `index.ts` | App factory; mounts routes; serves client dist; SPA fallback |

### Data Flow

```
[input_data/*.txt]          [corrections/*.txt]
        │                          │
   parseFile()           parseCorrectionFile()
        │                          │
        └──────────┬───────────────┘
                   ▼
          applyCorrections()
                   │
                   ▼
              compute()
          (group by emp+day,
           pair into sessions)
                   │
          ┌────────┴────────┐
          ▼                 ▼
    JSON API response    buildRows()
    (routes layer)      (report JSON)
```

### Auth

JWT stored in an httpOnly cookie (7-day expiry). Secret key auto-generated into `config/settings.json` on first startup. `authMiddleware` in `middleware/auth.ts` calls `jwtVerify` from `jose` on every protected request.

Password hashing: new passwords use **bcrypt** (`bcryptjs`). Existing werkzeug PBKDF2-SHA256 hashes are verified via Node's `crypto.pbkdf2Sync` in `userService.ts` — no password resets required after migration from the Python version.

---

## Client Architecture

### Pages

| Page | Route | Access |
|---|---|---|
| `LoginPage.vue` | `/login` | Public |
| `SetupPage.vue` | `/setup` | Public (first-run only) |
| `EditorPage.vue` | `/` | Login required |
| `AdminPage.vue` | `/admin` | Admin only |
| `ReportIndexPage.vue` | `/reports` | Admin only |
| `ReportPage.vue` | `/reports/:stem` | Admin or matching employee |

### Components

```
components/
├── editor/
│   ├── EmployeeSidebar.vue    ← employee list for admin; emits selected key
│   ├── SessionTable.vue       ← click-to-edit datetime cells; pending inline display
│   ├── AddSessionModal.vue    ← clock-in + optional clock-out inputs
│   └── ChangePasswordModal.vue
└── admin/
    ├── AdminEmployees.vue     ← inline-editable employee table
    ├── AdminAdmins.vue        ← admin account management
    ├── AdminDataFiles.vue     ← drag-drop upload + file list
    └── AdminPending.vue       ← pending corrections with before/after preview
```

### Auth Guard

`router.ts` calls `GET /api/auth/config` in `beforeEach`. Responses:
- `401` → redirect to `/login`
- `needs_setup: true` → redirect to `/setup`
- Otherwise → proceed

### API Client

`api/client.ts` exports a typed `api` object grouping all endpoint calls. `ApiError` is thrown on non-2xx responses. All interfaces for API request/response shapes are defined here (`Config`, `EventRow`, `PendingItem`, `EmployeeReport`, etc.).

### Styling

SCSS compiled by Vite's built-in sass support. Design tokens in `styles/_variables.scss`. Global reset and shared component styles in `styles/base.scss`.

---

## Corrections System

```
corrections/*.txt
  ADD   id  name  dept  timestamp  [device]   ← append event
  DEL   id  name  dept  timestamp  [device]   ← remove by (empId, timestamp)
  EDIT  id  name  dept  old_ts  new_ts  [dev] ← replace timestamp
```

`applyCorrections()` is a pure function in `domain/parser.ts`. The web editor writes to `corrections/editor-corrections.txt`.

Employee-submitted corrections go through a pending queue in `corrections/pending-corrections.json` before applying. See [pending-corrections-feature.md](pending-corrections-feature.md).

---

## Settings Schema

`config/settings.json`:

```json
{
  "admin_users": {
    "<username>": { "password_hash": "..." }
  },
  "employees": {
    "<emp_id>": {
      "alias": "", "full_name": "", "username": "",
      "password_hash": "", "enabled": true, "is_admin": false
    }
  },
  "secret_key": "..."
}
```
