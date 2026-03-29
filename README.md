# LogicGATT

A programmable BLE device emulator. Design GATT schemas in a web UI and define custom logic to respond to BLE operations—without reflashing firmware.

## Features

- **Dynamic GATT Schema** — Define services and characteristics with custom UUIDs
- **Scenario-based Logic** — Event-driven pipelines triggered by BLE reads, writes, timers
- **Sandboxed Functions** — JavaScript functions execute in a secure Web Worker
- **Multiple Backends** — Connect via ESP32 (UART) or PC Bluetooth adapter

## Architecture

```
BLE Client  <--BLE-->  Plugin Backend  <--WS-->  Frontend (Web UI)
                        (ESP32/USB)
```

## Quick Start

```bash
# Install dependencies
make install

# Start dev servers (run in separate terminals)
make dev-backend    # http://localhost:3001
make dev-frontend   # http://localhost:5173
```

Open http://localhost:5173 in Chrome/Edge.

## Project Structure

```
logic-gatt/
├── frontend/              # React web app (Vite)
├── backend/               # Node.js server
│   └── plugins/           # Connection backends
│       ├── ble-uart/      # ESP32 via USB-UART (includes firmware/)
│       └── usb-ble/       # PC Bluetooth adapter (includes python/)
└── shared/                # Shared TypeScript types
```

See component READMEs for details:
- [frontend/README.md](frontend/README.md)
- [backend/README.md](backend/README.md)
- [shared/README.md](shared/README.md)
- [backend/plugins/README.md](backend/plugins/README.md)

## Make Targets

| Target | Description |
|--------|-------------|
| `make install` | Install all dependencies |
| `make build` | Build for production |
| `make dev-backend` | Start backend dev server |
| `make dev-frontend` | Start frontend dev server |
| `make start` | Run production server |
| `make clean` | Clean build artifacts |

## Documentation

- [backend/plugins/README.md](backend/plugins/README.md) — Plugin system and setup
- [frontend/docs/](frontend/docs/) — Frontend documentation

## Browser Support

Requires Web Serial API: Chrome 89+, Edge 89+, Opera 75+

## License

MIT
