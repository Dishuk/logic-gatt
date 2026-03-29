# Plugins

LogicGATT uses a plugin architecture to support different BLE connectivity backends. Each plugin bridges the frontend with a BLE GATT server implementation.

## How It Works

```
┌──────────────────────────────────────────────────────────────────┐
│                         Backend Server                            │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────────┐  │
│  │  Frontend   │◄──►│  WebSocket   │◄──►│   Plugin Manager    │  │
│  │  (browser)  │    │   Handler    │    │                     │  │
│  └─────────────┘    └──────────────┘    └──────────┬──────────┘  │
└──────────────────────────────────────────────────────────────────┘
                                                     │
                    ┌────────────────────────────────┼────────────────────────────────┐
                    │                                │                                │
             ┌──────▼──────┐                  ┌──────▼──────┐                  ┌──────▼──────┐
             │  ble-uart   │                  │   usb-ble   │                  │   future    │
             │   Plugin    │                  │   Plugin    │                  │   plugins   │
             └──────┬──────┘                  └──────┬──────┘                  └─────────────┘
                    │                                │
             ┌──────▼──────┐                  ┌──────▼──────┐
             │    ESP32    │                  │   Python    │
             │  (serial)   │                  │  (WinRT)    │
             └──────┬──────┘                  └──────┬──────┘
                    │                                │
             ┌──────▼──────┐                  ┌──────▼──────┐
             │  BLE Radio  │                  │  PC BLE     │
             └─────────────┘                  │  Adapter    │
                                              └─────────────┘
```

## Plugin Lifecycle

1. **Discovery** — Backend scans `backend/plugins/` for directories with `manifest.json`
2. **Loading** — Backend loads plugin's compiled code and calls `onLoad()`
3. **Activation** — User selects plugin in frontend, backend routes messages to it
4. **Operation** — Plugin receives commands, sends events back to frontend
5. **Deactivation** — User switches plugin or disconnects, backend calls `onUnload()`

## Plugin Interface

Every plugin extends `PluginBase` from `@logic-gatt/shared`:

```typescript
import { PluginBase } from '@logic-gatt/shared'

export default class MyPlugin extends PluginBase {
  // Required: handle schema upload
  async onUploadSchema(schema: Schema, settings: DeviceSettings): Promise<void>

  // Required: start BLE advertising
  async onConnect(): Promise<void>

  // Required: stop BLE advertising
  async onDisconnect(): Promise<void>

  // Required: send BLE notification
  async onNotify(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void>

  // Required: respond to BLE read request
  async onRespondToRead(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void>

  // Optional: custom initialization
  async onLoad(): Promise<void>

  // Optional: cleanup
  async onUnload(): Promise<void>

  // Optional: expose REST endpoints
  getRoutes(): PluginRoute[]

  // Optional: check if plugin can work
  isAvailable(): boolean
}
```

## Sending Events to Frontend

Plugins use `this.ctx.broadcast()` to send events:

```typescript
// BLE client wrote to a characteristic
this.ctx.broadcast({
  type: 'char-write',
  serviceUuid: '0000180f-0000-1000-8000-00805f9b34fb',
  charUuid: '00002a19-0000-1000-8000-00805f9b34fb',
  data: [0x64]
})

// BLE client read from a characteristic
this.ctx.broadcast({
  type: 'char-read',
  serviceUuid: '...',
  charUuid: '...'
})

// Connection state
this.ctx.broadcast({ type: 'connected' })
this.ctx.broadcast({ type: 'disconnected', reason: 'timeout' })

// Logging
this.ctx.broadcast({ type: 'log', message: 'Something happened' })
this.ctx.broadcast({ type: 'error', message: 'Something failed' })
```

## Plugin Structure

```
backend/plugins/<plugin-id>/
├── manifest.json       # Plugin metadata (copied to build)
├── index.ts            # Main plugin class (extends PluginBase)
├── *.ts                # Additional TypeScript modules
├── python/             # Optional: Python backend (copied to build)
└── misc/               # Optional: dev-only (firmware, docs, examples)
```

## manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "Description shown in frontend",
  "icon": "bluetooth",
  "color": "#3B82F6",
  "dependencies": {
    "some-package": "^1.0.0"
  }
}
```

Dependencies are automatically merged into `backend/package.json` during `make install`.

## Available Plugins

| Plugin | Description | Hardware |
|--------|-------------|----------|
| [ble-uart](ble-uart/) | MCU via USB-UART serial | ESP32, nRF52, etc. |
| [usb-ble](usb-ble/) | PC Bluetooth adapter | BT 5.0+ dongle |

## Quick Start

### BLE UART (ESP32)

```bash
cd backend/plugins/ble-uart/misc/firmware

# Flash ESP32 firmware (requires PlatformIO)
pio run -t upload

# Then in the frontend, select "BLE UART" and pick the serial port
```

**Hardware wiring:**

| ESP32 Pin | Function |
|-----------|----------|
| GPIO 16 | UART RX (→ adapter TX) |
| GPIO 17 | UART TX (→ adapter RX) |
| GND | Common ground |

Baud rate: 460800. Protocol docs: [ble-uart/misc/firmware/docs/](ble-uart/misc/firmware/docs/)

### USB BLE (PC Adapter)

```bash
cd backend/plugins/usb-ble/python

# Setup Python environment
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# Then in frontend, select "USB BLE Dongle" and click "Start Backend"
```

**Compatibility:**
- Windows 10/11
- Bluetooth 5.0+ adapters with peripheral mode
- USB BT5.0 dongles generally work; built-in laptop Bluetooth often does not

## Creating a New Plugin

1. Create directory: `backend/plugins/my-plugin/`
2. Add `manifest.json` with plugin metadata and dependencies
3. Create `index.ts` extending `PluginBase`
4. Run `make install` (merges dependencies, installs them)
5. Run `make build` (compiles plugin with backend)

## Plugin Assets

Plugins can include non-TypeScript assets (Python backends, native binaries, config files). Declare them in `manifest.json`:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "assets": ["python", "config.yaml"]
}
```

### Build Behavior

During `make build`:
- `manifest.json` is always copied
- Directories/files listed in `assets` are copied recursively
- Everything else (TypeScript, `misc/`, etc.) is NOT copied

Use `misc/` for dev-only content like firmware source, docs, or debug tools.
