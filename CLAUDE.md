# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

```bash
python -m working_hours                        # process all files (default)
python -m working_hours input_data/2024-01.txt  # specific file
python -m working_hours input_data/        # specific directory
```

Reads `input_data/` and `corrections/` automatically; prints a summary to the terminal.

### Install as CLI tools

```bash
pip install -e .                    # working-hours (CLI summary)
pip install -e ".[display]"         # with rich for coloured terminal output
pip install -e ".[watch]"           # working-hours-watch (auto-reruns on file changes)
pip install -e ".[editor]"          # working-hours-editor (Flask web UI)
pip install -e ".[editor,display]"  # all of the above
pip install -e ".[dev]"             # add pytest for running tests
```

### Run the web editor

```bash
DATA_DIR=data working-hours-editor  # serves on http://0.0.0.0:5000
```

`DATA_DIR` controls where the server looks for `input_data/`, `corrections/`, and `config/`. Defaults to `.` (current directory). Set to `data` when running locally with the `data/` subdirectory layout.

Or via Docker Compose:

```bash
docker compose up --build
```

Exposed on port 8080 by default. Set `ADMIN_PASSWORD` and `SECRET_KEY` environment variables before first run (see `compose.yaml`).

### Run tests

```bash
pytest
pytest --cov   # with coverage report
```

## Architecture

Data flows in one direction: **parse → compute → report**.

- **`models.py`** — `ClockEvent`, `Session`, `DayRecord`, `CorrectionItem` as `NamedTuple`s.
- **`parser.py`** — reads raw `.txt` exports and `corrections/` files into `ClockEvent` / `CorrectionItem` lists. Input files are tab-separated (`ID  Name  Dept  Timestamp  DeviceID`), one row per clock event with no in/out marker. `apply_corrections()` applies ADD/DEL/EDIT items to a raw event list.
- **`calculator.py`** — groups `ClockEvent`s by employee+day, pairs consecutive timestamps as clock-in/clock-out (1st→2nd, 3rd→4th, …). An odd count on a day yields an incomplete `DayRecord` with a `dangling` timestamp.
- **`reporter.py`** — formats `DayRecord` data into plain-text tables sectioned by month. `display()` prints to terminal (rich if available, plain-text fallback). `format_report()` returns a plain-text string. `_build_rows()` is also used by the web report views.
- **`server.py`** — Flask web editor (~690 lines). Handles auth, corrections editing, per-employee reports, admin panel, and raw file upload. Served by waitress in production.
- **`watcher.py`** — watchdog-based file watcher; reruns the CLI on any `.txt` change in `input_data/` or `corrections/` with a 1 s debounce.
- **`__main__.py`** — CLI entry point: computes all events and calls `display()`.

## Auth & configuration

Settings are stored in `config/settings.json` and managed through the `/admin` web panel.

Two user types:
- **admin_users** — full access; no employee ID association.
- **employees** — keyed by `emp_id`; restricted to their own data by default. Fields: `alias`, `full_name`, `username`, `password_hash`, `is_admin`, `enabled`.

On first run with no admin accounts in `config/settings.json`, the app redirects all requests to `/setup` — a form that creates the initial admin account. The app is fully blocked until an admin is created. No environment variables are required.

A `secret_key` is auto-generated and persisted to `config/settings.json` on first startup, so sessions survive restarts without any manual configuration.

## Corrections system

Place `.txt` files in `corrections/` using the same tab-separated format as `input_data/`. Lines starting with `#` are ignored. The web editor writes to `corrections/editor-corrections.txt` automatically.

Three action types (plain lines with no prefix are treated as `ADD`):

```
# Add a missing clock event
ADD	2	Angelica	Admin	2024-01-23 17:30:00	1

# Delete a wrong clock event
DEL	2	Angelica	Admin	2024-01-23 09:05:00	1

# Edit a timestamp (old_timestamp → new_timestamp)
EDIT	2	Angelica	Admin	2024-01-23 09:05:00	2024-01-23 09:00:00	1
```

## Web editor routes

| Route | Access | Purpose |
|---|---|---|
| `/` | login required | Editor UI |
| `/login`, `/logout` | public | Auth |
| `/admin` | admin only | Manage employees, admin accounts, raw files |
| `/reports/` | admin only | Report index by year/employee |
| `/reports/<stem>` | admin or own emp_id | Per-employee yearly report (on-demand) |
| `/api/events` | login required | Clock events (filtered to own for non-admins) |
| `/api/add`, `/api/edit` | login (own data only) | Write ADD/EDIT corrections |
| `/api/delete`, `/api/bulk-delete` | admin only | Write DEL corrections |
| `/api/my-reports` | login required | Own report links |
| `/api/change-password` | login required | Self-service password change |
| `/api/admin/employees` | admin only | CRUD employee records |
| `/api/admin/admins` | admin only | CRUD admin accounts |
| `/api/admin/raw-files` | admin only | Upload / delete raw data files |

## Deployment (Docker)

```bash
docker compose up -d --build
```

`compose.yaml` mounts `./data` as a single volume at `/data` inside the container. Before first run, create the directory structure on the host:

```
data/
  input_data/     ← raw .txt exports
  corrections/    ← correction files
  config/         ← settings.json (auto-created on first run)
```
