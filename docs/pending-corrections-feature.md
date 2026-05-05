# Pending Changes Approval Feature

Employees can submit clock-time corrections through the editor UI. Instead of applying immediately, these corrections enter a **pending queue** where an admin reviews and approves or rejects them before they take effect.

---

## User flows

### Employee

1. Opens the editor and selects **Edit Sessions**.
2. Clicks on a clock-out cell (or fills in a missing `?` clock-out) and saves the new time.
3. Receives a toast: **"Submitted for approval."**
4. The edited session row turns amber immediately, showing the pending value inline:
   - For a clock-out edit: ~~old time~~ **new time** `pending`
   - For a missing clock-out: the `?` cell shows **new time** `pending`
5. The correction takes effect in the reported data only after an admin approves it.

### Admin

1. Opens `/admin` and clicks the **Pending** tab (a red badge shows the count when items exist).
2. Sees a table of all queued corrections with columns: Employee · Action · From · To · Submitted by · Submitted at.
3. Clicks **Approve** to write the correction to `corrections/editor-corrections.txt` (it is applied immediately to all reports and the editor), or **Reject** to discard it silently.
4. Admin-submitted corrections (via the editor) bypass the queue and apply immediately.

---

## Action types

| Action | From column | To column | Description |
|--------|-------------|-----------|-------------|
| ADD    | —           | new timestamp | Adds a missing clock-out (or a new session from the modal) |
| EDIT   | original timestamp | corrected timestamp | Changes an existing clock-in or clock-out |

DEL and bulk-delete are admin-only operations and are never queued.

---

## Storage

Pending corrections are stored in `corrections/pending-corrections.json`. Each item has the shape:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "action": "ADD",
  "emp_id": "2",
  "name": "Angelica",
  "dept": "Admin",
  "timestamp": "2024-01-23 17:30:00",
  "new_timestamp": null,
  "submitted_at": "2026-05-03T10:30:00",
  "submitted_by": "angelica_username"
}
```

- `timestamp` — the event timestamp for ADD, or the **old** timestamp for EDIT.
- `new_timestamp` — the replacement timestamp for EDIT; `null` for ADD.

The file is written atomically (write to `.tmp`, then rename) to avoid corruption.

---

## API endpoints

| Method | Route | Access | Description |
|--------|-------|--------|-------------|
| `GET`  | `/api/my-pending` | login required | Returns pending items for the current employee (admins receive all) |
| `GET`  | `/api/admin/pending` | admin only | Returns all pending items |
| `GET`  | `/api/admin/pending/:id/preview` | admin only | Before/after session diff for one item |
| `POST` | `/api/admin/pending/:id/approve` | admin only | Approves one item by UUID |
| `POST` | `/api/admin/pending/:id/reject`  | admin only | Rejects one item by UUID |

The `/api/add` and `/api/edit` routes return `{ ok: true, pending: true }` when the caller is a non-admin employee, signalling the client to show the "Submitted for approval" toast.

---

## Code locations

| Layer | File | What it does |
|-------|------|--------------|
| Infrastructure | `packages/server/src/infrastructure/data.ts` | `loadPending()`, `savePending()`, `addPending()`, `removePending()` |
| Application | `packages/server/src/application/correctionService.ts` | `queueCorrection()`, `getPending()`, `approvePending()`, `rejectPending()` |
| Application | `packages/server/src/application/reportService.ts` | `getPendingPreview()` — builds before/after diff data |
| Routes | `packages/server/src/routes/editor.ts` | `/api/add` and `/api/edit` branch on admin vs employee; `/api/my-pending` route |
| Routes | `packages/server/src/routes/admin.ts` | `/api/admin/pending/*` routes |
| Component | `packages/client/src/components/admin/AdminPending.vue` | Pending tab: table, approve/reject, lazy preview |
| Component | `packages/client/src/components/editor/SessionTable.vue` | Inline amber highlighting of pending session rows |
