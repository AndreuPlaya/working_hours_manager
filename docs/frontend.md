# Frontend Documentation

## Overview

The frontend is a **Vue 3 SPA** built with Vite and TypeScript. It communicates with the Hono REST API via a typed `api` client. SCSS is compiled by Vite's built-in sass support — no separate build step required.

```
packages/client/src/
├── pages/              ← one file per route
├── components/
│   ├── editor/         ← editor page components
│   └── admin/          ← admin page components
├── composables/        ← shared reactive logic
├── api/client.ts       ← typed API client + all interfaces
├── router.ts           ← vue-router config + auth guard
├── styles/
│   ├── _variables.scss ← design tokens
│   └── base.scss       ← global reset + shared classes
├── App.vue             ← root: RouterView + toast teleport
└── main.ts             ← createApp, useRouter, mount
```

---

## Pages

### Login (`LoginPage.vue`)

**Route:** `/login`  **Access:** Public

Username + password form. Calls `api.auth.login()`, then `router.push('/')` on success. Displays error on failed credentials.

### Setup (`SetupPage.vue`)

**Route:** `/setup`  **Access:** Public (first-run only)

Username / password / confirm form for initial admin creation. Only reachable when `needs_setup: true` is returned by `/api/auth/config`. Calls `api.auth.setup()`.

### Editor (`EditorPage.vue`)

**Route:** `/`  **Access:** Login required

The primary daily-use interface. Two-column layout: employee sidebar on the left (admins only), main panel on the right.

On mount, four API calls run in parallel:

```ts
const [cfg, profs, evts, reports] = await Promise.all([
  api.config(), api.profiles(), api.events(), api.myReports()
])
```

A fifth call fetches `api.myPending()` after initial load.

#### Employee Sidebar (`EmployeeSidebar.vue`)

- Lists employees by alias; receives `eventKeys: string[]` (full `empId|name|dept` keys) as prop
- Pending badge per employee showing count of queued corrections
- Non-admins skip the sidebar; their own key is auto-selected

#### Session Table (`SessionTable.vue`)

- Click-to-edit datetime-local inputs on clock-in/clock-out cells
  - **Enter** or **blur**: saves via `onEditCell`, calls `api.edit()`
  - **Escape**: reverts
- Pending corrections shown inline: old value struck through, new value with amber `pending` badge
- Checkbox selection per row for bulk delete
- Delete button per row (admin only)

#### Toolbar

- **+ Add session** — opens `AddSessionModal.vue`
- **Delete (n)** — bulk delete checked rows via `api.bulkDelete()` (admin only)
- **↑/↓ sort toggle** — reverses chronological order client-side
- **View report** — RouterLink to `/reports/:stem` (opens in new tab)

#### Modals

- **`AddSessionModal.vue`** — clock-in + optional clock-out inputs; calls `api.add()` for each timestamp
- **`ChangePasswordModal.vue`** — current / new / confirm fields; calls `api.changePassword()`

### Admin (`AdminPage.vue`)

**Route:** `/admin`  **Access:** Admin only

Four-tab interface. All data loaded on mount via `Promise.all` across admin API endpoints. Tab switching shows/hides panels without network requests (except lazy preview in Pending tab). Red badge on the Pending tab label shows count.

#### `AdminEmployees.vue`

Inline-editable table sourced from `GET /api/admin/employees`. Fields: alias, full name, username, password (hidden, "Set" button reveals), enabled/disabled toggle. Save calls `PUT /api/admin/employees/:empId`.

#### `AdminAdmins.vue`

List of admin accounts with per-row password change. Add-admin form at bottom (`POST /api/admin/admins`). Delete protected: cannot delete self or the last admin.

#### `AdminDataFiles.vue`

Drag-and-drop or click-to-pick zone for `.txt` clock-export files. Upload via `FormData` to `POST /api/admin/raw-files`. Sortable file list (name / size / modified). Delete via `DELETE /api/admin/raw-files/:filename`.

#### `AdminPending.vue`

Table of queued employee corrections. Approve (`POST /api/admin/pending/:id/approve`) or reject (`POST /api/admin/pending/:id/reject`). Details toggle lazy-loads a before/after session diff from `GET /api/admin/pending/:id/preview`. Preview is cached client-side after first load.

### Report Index (`ReportIndexPage.vue`)

**Route:** `/reports`  **Access:** Admin only

Fetches `GET /api/reports` and renders year sections with RouterLinks to individual reports.

### Report (`ReportPage.vue`)

**Route:** `/reports/:stem`  **Access:** Admin or matching employee

Fetches `GET /api/reports/:stem` and renders month-grouped tables: daily session rows, day subtotals where multiple sessions exist, monthly totals, year total. Print button calls `window.print()`.

---

## API Client (`api/client.ts`)

All API calls are typed and grouped on the `api` object:

```ts
api.config()                          // GET /api/auth/config
api.auth.login(username, password)    // POST /api/auth/login
api.auth.logout()                     // POST /api/auth/logout
api.auth.setup(username, password)    // POST /api/auth/setup
api.events()                          // GET /api/events
api.profiles()                        // GET /api/profiles
api.myReports()                       // GET /api/my-reports
api.myPending()                       // GET /api/my-pending
api.add(payload)                      // POST /api/add
api.edit(payload)                     // POST /api/edit
api.delete(payload)                   // POST /api/delete
api.bulkDelete(payloads)              // POST /api/bulk-delete
api.changePassword(old, new)          // PUT /api/change-password
api.reports.index()                   // GET /api/reports
api.reports.get(stem)                 // GET /api/reports/:stem
api.admin.employees()                 // GET /api/admin/employees
api.admin.updateEmployee(id, data)    // PUT /api/admin/employees/:id
// ... admins, raw-files, pending
```

`ApiError` is thrown (with `message` and `status`) on non-2xx responses.

---

## Composables

### `useToast.ts`

Module-level singleton. `toast(msg: string)` sets a message visible for 2.5 s. Used via teleport in `App.vue`.

```ts
const { toast } = useToast()
toast('Saved.')
```

---

## CSS / SCSS

### Design tokens (`_variables.scss`)

```scss
$accent:       #2563eb   // primary blue — buttons, header, links
$accent-dark:  #1d4ed8   // button hover
$danger:       #dc2626   // destructive actions
$warning:      #d97706   // pending / amber state
$bg:           #f8fafc   // page background
$card:         #ffffff   // panel background
$text:         #1e293b   // body text
$border:       #e2e8f0   // dividers and inputs
$text-muted:   #64748b   // secondary text
```

### Shared classes (`base.scss`)

- `.btn`, `.btn-primary`, `.btn-danger`, `.btn-secondary`
- `.modal-overlay`, `.modal`
- `.toast`
- `.badge` — inline counter chip

SCSS is compiled by Vite at dev time and bundled into the production build. No separate compilation step.

---

## Adding New Features

### New API route

1. Add the route to the relevant file in `packages/server/src/routes/`
2. Apply `authMiddleware` or `adminMiddleware` from `middleware/auth.ts`
3. Add the typed call to `packages/client/src/api/client.ts`

### New admin tab

1. Create `packages/client/src/components/admin/AdminNewTab.vue`
2. Import and add it to the tab array in `AdminPage.vue`
3. Add the tab button and panel show/hide logic

### New editable field in SessionTable

1. Update the API endpoint to return the field
2. Add the column to `SessionTable.vue`'s template
3. Follow the existing click-to-edit pattern: `@click` → show `<input>` → `@blur`/`@keydown.enter` → emit event → parent calls API
