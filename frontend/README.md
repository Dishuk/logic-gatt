# Frontend

React web application for designing GATT schemas and defining BLE device behavior.

## Features

- Visual GATT schema editor (services + characteristics)
- Scenario builder with triggers (char-write, char-read, timer, startup)
- JavaScript function editor with sandboxed execution
- Real-time terminal for BLE traffic and logs
- Schema import/export as JSON

## Setup

```bash
# From repo root
make install

# Or from this directory
npm install
```

## Development

```bash
# From repo root
make dev-frontend

# Or from this directory
npm run dev
```

Opens at http://localhost:5173

Requires backend running at http://localhost:3001 for full functionality.

## Build

```bash
# From repo root
make build

# Or from this directory
npm run build
```

Output goes to `dist/`.

## Scripts

| Script               | Description              |
| -------------------- | ------------------------ |
| `npm run dev`        | Start dev server         |
| `npm run build`      | Production build         |
| `npm run preview`    | Preview production build |
| `npm run test`       | Run tests                |
| `npm run test:watch` | Run tests in watch mode  |
| `npm run lint`       | Lint source files        |
| `npm run lint:fix`   | Lint and auto-fix        |
| `npm run format`     | Format with Prettier     |

## Browser Support

Requires Chrome 89+, Edge 89+, or Opera 75+ (Web Serial API).

## Documentation

- [docs/LOGIC_CONSTRUCTOR.md](docs/LOGIC_CONSTRUCTOR.md) — Scenario and function reference
