# Backend

Node.js server that bridges the frontend with connection plugins.

## Responsibilities

- Serves frontend static files in production
- Loads and manages plugins from `../plugins/`
- Routes WebSocket messages between frontend and active plugin
- Provides REST API for plugin management

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
make dev-backend

# Or from this directory
npm run dev
```

Runs at http://localhost:3001

## Production

```bash
# From repo root
make build && make start

# Or manually
npm run build
cd ../  # repo root
node backend/build/backend/index.js
```

## API Endpoints

### REST

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins` | List available plugins |
| POST | `/api/plugins/:id/activate` | Activate a plugin |
| POST | `/api/plugins/:id/deactivate` | Deactivate a plugin |
| GET | `/api/session` | Get current session state |

### WebSocket

Connect to `ws://localhost:3001` for real-time communication.

**Frontend → Backend:**
- `upload-schema` — Upload GATT schema to plugin
- `connect` — Start BLE advertising
- `disconnect` — Stop BLE advertising
- `notify` — Send BLE notification
- `respond-to-read` — Respond to BLE read request

**Backend → Frontend:**
- `char-write` — BLE client wrote to characteristic
- `char-read` — BLE client read from characteristic
- `connected` / `disconnected` — Connection state changes
- `error` / `log` — Plugin messages

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start with tsx (hot reload) |
| `npm run build` | Compile TypeScript |
| `npm run clean` | Remove dist folder |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `NODE_ENV` | - | Set to `production` for prod mode |
