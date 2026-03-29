# ESP32 Firmware

NimBLE GATT server that receives schema definitions from the frontend over UART and exposes them as a BLE peripheral.

**Note:** This firmware requires the frontend (in `frontend/`) to be running for full operation. The frontend sends schema definitions and handles BLE events forwarded by the ESP32.

## Prerequisites

- [PlatformIO CLI](https://platformio.org/install/cli) or VS Code with PlatformIO extension
- ESP32 DevKit board
- USB cable

## Setup

No additional setup required. PlatformIO downloads dependencies on first build.

```bash
# From plugin directory (plugins/ble-uart)
make flash

# Or from this directory
pio run --target upload
```

## Hardware Configuration

| Setting | Value |
|---------|-------|
| Board | ESP32 DevKit |
| UART0 TX | GPIO 1 (default) |
| UART0 RX | GPIO 3 (default) |
| Baud rate | 115200 |
| BLE name | "logic-gatt-emu" |
| Upload port | COM8 (edit `platformio.ini` to change) |

## Build Commands

Run from this directory:

```bash
pio run                              # Build
pio run --target upload              # Flash
pio run --target monitor             # Serial monitor (115200 baud)
pio run --target upload --target monitor  # Flash and monitor
pio run --target clean               # Clean build
```

Or use `make` from plugin directory (`plugins/ble-uart/`): `make fw-build`, `make flash`, `make monitor`, `make flash-monitor`, `make fw-clean`.

## Architecture

```
src/
├── main.c             # Entry point
├── app.c              # Init orchestrator (NVS, BLE, UART)
├── protocol.c         # Frame parsing, CRC-8, command dispatch
├── schema_service.c   # Dynamic GATT schema management
├── uart_service.c     # UART0 driver with RX task
└── ble_service/
    └── ble_server.c   # NimBLE stack wrapper, advertising
```

## Documentation

- [docs/PROTOCOL.md](docs/PROTOCOL.md) — UART protocol specification

## Debug Serial Utility

Python script that echoes UART data (useful for testing without the full frontend).

See [utils/debug_serial/README.md](utils/debug_serial/README.md) for setup instructions.
