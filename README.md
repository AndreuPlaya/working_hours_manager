# Working Hours Manager

A self-hosted tool for tracking employee clock-in/out times. Parses tab-separated exports from a physical time-clock device, lets you add corrections through a web UI, and generates per-employee working-hours reports.

## Documentation

All documentation lives in [docs/](docs/):

- [docs/README.md](docs/README.md) — deployment guide, data format, local development
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — module inventory, data flow, Clean Architecture analysis
- [docs/frontend.md](docs/frontend.md) — frontend feature catalogue, JS architecture, CSS/SCSS guide, migration considerations
- [docs/pending-corrections-feature.md](docs/pending-corrections-feature.md) — pending corrections approval workflow spec

## Quick start

```bash
docker compose up -d --build
```

Open `http://<server-ip>:8080`. On first run you will be prompted to create an admin account.

See [docs/README.md](docs/README.md) for full deployment instructions.
