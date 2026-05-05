# Editor — Feature Reference

The editor (`/editor`) is the primary interface for viewing and managing employee clock-in/clock-out sessions. It is shared by both admin and employee users, but the set of visible controls differs by role.

---

## 1. Roles

| Role | How they access the editor |
|---|---|
| **Admin** | Sees all employees via sidebar; can select any employee |
| **Employee** | No sidebar; own sessions are loaded automatically on page open |

---

## 2. Header

| Control | Visible to | Action |
|---|---|---|
| "Working Hours" title | Everyone | Static label |
| Admin icon button | Admin only | Navigates to `/admin` |
| Lock icon button | Everyone | Opens Change Password modal |
| Logout button | Everyone | Clears JWT cookie, redirects to `/login` |

---

## 3. Sidebar (admin only)

- Lists all employees sorted alphabetically.
- Each row shows the employee's display name (alias if configured, otherwise raw name).
- A yellow badge appears on the right showing the count of that employee's pending corrections (hidden when count is 0).
- Clicking a row selects the employee and loads their sessions into the main panel.
- The selected employee row is highlighted with an accent background and bold text.
- Non-admin users do not see the sidebar at all.

---

## 4. Month Navigation Toolbar

Appears at the top of the main panel once an employee is selected.

| Element | Description |
|---|---|
| Employee name | Displayed left-aligned |
| `←` button | Goes to previous month; wraps to December of previous year at January |
| Month/Year label | Localized display (e.g. "May 2026") |
| `→` button | Goes to next month; wraps to January of next year at December |
| `+ Add session` | Opens the Add Session modal for the current employee |
| `View report` | Link to the employee's yearly report (only shown when a report file exists) |

---

## 5. Session Table

Sessions for the selected employee and month are displayed in a grouped table.

### Columns

| Column | Content |
|---|---|
| Date | Day label (e.g. "Mon 05/15"); shown only on the first row of each calendar day |
| Clock In | Session start time in HH:MM (24-hour) |
| Clock Out | Session end time in HH:MM, or `?` for an incomplete session |
| Duration | Elapsed time in `XhYY` format (e.g. "8h30"); `—` when not calculable |
| Actions | Delete button (admin only), Add button for adding a session to that day |

### Row states

| State | Visual |
|---|---|
| **Normal** | White background, standard text |
| **Incomplete** | Yellow text; Clock Out shows `?`; no delete button |
| **Pending** | Yellow background (`#fffbeb`); original value struck-through; new value shown with a "pending" badge |

### Subtotal rows

- **Day total** — appears below the sessions of a day that has more than one session; shows the sum of durations for that day.
- **Month total** — fixed table footer row; sums all durations for the visible month; bold, with a heavier top border.

### Empty state

When no sessions exist for the selected month, a "No sessions this month." message is shown with a `+ Add session` shortcut button.

---

## 6. Inline Cell Editing

Any Clock In or Clock Out cell can be edited directly in the table without opening a modal.

- **Activate**: Click the time value in the cell.
- **Input type**: `datetime-local` (browser native date-time picker).
- **Commit**: Press **Enter** or click away (blur).
- **Cancel**: Press **Escape**.

Special cases:

| Condition | Behavior |
|---|---|
| Editing `?` (incomplete row) | Creates a new clock-out event (`ADD`) rather than modifying the clock-in |
| Editing a cell that has a pending change | Replaces the queued pending entry with the new value |
| Editing any other cell (admin) | Writes an `EDIT` correction immediately |
| Editing any other cell (employee) | Queues an `EDIT` correction for admin approval |

The Duration column recalculates automatically to reflect pending values while editing.

---

## 7. Add Session Modal

Opens from the toolbar `+ Add session` button, the per-day `+` hover button, or the empty-month shortcut button.

### Fields

| Field | Required | Notes |
|---|---|---|
| Clock In | Yes | `datetime-local`; pre-filled with the selected day at 00:00 if opened from a day button |
| Clock Out | No | `datetime-local`; pre-filled similarly when opened from a day button |

### Behavior

- The **Save** button is disabled while loading or when Clock In is empty.
- On success for an **admin**: session written immediately; toast shows "Session added."
- On success for an **employee**: session queued for approval; toast shows "Submitted for approval."
- API errors are shown as red text below the fields.
- Click the overlay background or **Cancel** to close without saving.

---

## 8. Delete Session

- A `✕` button appears on hover on each complete session row for all users.
- Incomplete rows (`?`) do not show a delete button.
- **Admin delete** — writes a `DEL` line to the corrections file immediately; toast shows "Deleted."
- **Employee delete** — queues the deletion for admin approval; toast shows "Submitted for approval."
- Rows with a pending delete are styled with a pink background, struck-through text, and a **"pending delete"** badge in the actions column. The `✕` button is hidden for those rows to prevent duplicates.
- **Bulk delete** (via SessionTable view): admin-only; checkboxes allow selecting multiple complete sessions; a single action removes all via `POST /api/bulk-delete`.

---

## 9. Pending Corrections Workflow

Employees cannot write directly to the corrections file. Their changes are queued for admin approval.

| Actor | Action | Result |
|---|---|---|
| Employee | Submits ADD or EDIT | Queued in `pending-corrections.json`; yellow row shown inline |
| Employee | Cancels own pending item | Item removed from queue |
| Admin | Approves pending item | Moves to `editor-corrections.txt`; applied immediately |
| Admin | Rejects pending item | Item removed from queue; original data unchanged |

Pending items appear inline in the session table as yellow rows with the original value struck-through and the proposed new value shown next to a "pending" badge. Editing a cell that already has a pending change replaces the pending entry rather than stacking a second one.

Admins manage pending items from the **Admin → Pending** tab.

---

## 10. Reports

- The toolbar shows a **"View report"** link when an annual report file exists for the selected employee.
- Clicking it navigates to the per-employee yearly report page (`/reports/:stem`).
- Employees can only access their own report. Admins can access any employee's report from the Admin panel.

---

## 11. Change Password Modal

Accessible to all users via the lock icon in the header.

### Fields

| Field | Notes |
|---|---|
| Current password | Required; verified server-side |
| New password | Required |
| Confirm new password | Required; must match New password (client-side check) |

### Behavior

- If the two new password fields do not match, an error "Passwords do not match." is shown without making an API call.
- On success: toast "Password changed." and modal closes.
- On API error: red error message shown; form stays open.
- Click the overlay or **Cancel** to close without saving.

---

## 12. Toast Notifications

| Trigger | Toast message |
|---|---|
| Admin saves session (add or edit) | "Saved." |
| Employee submits session (add or edit) | "Submitted for approval." |
| Session added via modal | "Session added." |
| Admin deletes session | "Deleted." |
| Employee submits delete | "Submitted for approval." |
| Password changed | "Password changed." |
| Save/edit failure | "Error saving." |
| Delete failure | "Error deleting." |
| Password change failure | "Error changing password." |

---

## 13. Access Control Summary

| Feature | Admin | Employee |
|---|---|---|
| Sidebar (employee list) | ✓ | — |
| View any employee's sessions | ✓ | — (own only) |
| Delete sessions (immediate) | ✓ | — |
| Delete sessions (pending approval) | — | ✓ |
| Bulk delete sessions | ✓ | — |
| Immediate session saves (add/edit) | ✓ | — (queued for approval) |
| Submit add/edit/delete for approval | — | ✓ |
| Cancel own pending corrections | ✓ | ✓ |
| Change own password | ✓ | ✓ |
| View own report | ✓ | ✓ |
| View all reports | ✓ | — |

---

## 14. Keyboard Shortcuts

| Shortcut | Context | Action |
|---|---|---|
| **Enter** | Inside an active cell editor | Commit the edit |
| **Escape** | Inside an active cell editor | Cancel the edit |
| **Click away** (blur) | Inside an active cell editor | Commit the edit |

No other keyboard shortcuts are currently defined in the editor.
