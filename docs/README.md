# Working Hours Manager

A self-hosted tool for tracking employee clock-in/out times. Parses tab-separated exports from a physical time-clock device, lets you add corrections through a web UI, and generates per-employee working-hours reports.

## Deploy with Docker (recommended)

**Requirements:** Docker and Docker Compose.

### 1. Clone and prepare the data directory

```bash
git clone <your-repo-url>
cd working_hours_manager

mkdir -p data/input_data data/corrections data/config
```

Place your `.txt` clock export files in `data/input_data/`.

### 2. Start the container

```bash
docker compose up -d --build
```

Open `http://<server-ip>:8080` in a browser. On first run you will be prompted to create an admin account.

### 3. Updating

```bash
git pull
docker compose up -d --build
```

---

## Input data format

Raw export files go in `data/input_data/` — one file per month, named `YYYY-MM.txt`. Tab-separated, one clock event per line:

```
2	Angelica	Admin	2024-01-15 09:00:00	1
```

Columns: `ID  Name  Department  Timestamp  DeviceID`. There is no in/out marker — consecutive timestamps are automatically paired as clock-in / clock-out.

## Corrections

Missing or wrong entries can be fixed without touching the original files. Place a `.txt` file in `data/corrections/` or use the web editor, which writes to `data/corrections/editor-corrections.txt` automatically.

```
# Add a missing clock-out
ADD	2	Angelica	Admin	2024-01-15 17:30:00	1

# Remove a wrong entry
DEL	2	Angelica	Admin	2024-01-15 09:05:00	1

# Fix a timestamp
EDIT	2	Angelica	Admin	2024-01-15 09:05:00	2024-01-15 09:00:00	1
```

Lines starting with `#` are ignored.

## Data directory layout

```
data/
  input_data/      ← raw .txt exports (one file per month)
  corrections/     ← correction files (web editor writes here too)
  config/          ← settings.json — auto-created on first run
```

`data/` is mounted as a Docker volume so all data persists across container rebuilds. **Do not commit this directory** — it contains employee records and password hashes.

## Transferring existing data to a remote server

```bash
rsync -av data/ user@server:/path/to/working_hours_manager/data/
```

---

## Local development

**Requirements:** Node.js 20+ and pnpm 9+.

```bash
pnpm install

# Run server and client in separate terminals
DATA_DIR=data pnpm dev:server   # Hono API on :5000
pnpm dev:client                 # Vite dev server on :5173
```

Open `http://localhost:5173` in a browser. The Vite dev server proxies all `/api/*` requests to the Hono server.
