# UART Protocol Specification

## Frame Format

All communication between the frontend/script and the ESP32 firmware uses this frame format:

```
┌───────┬─────┬─────┬─────────────────┬──────┐
│ START │ CMD │ LEN │    PAYLOAD      │ CRC8 │
│ 0xAA  │ 1B  │ 1B  │   0-255 bytes   │ 1B   │
└───────┴─────┴─────┴─────────────────┴──────┘
```

| Field   | Size    | Description                                    |
|---------|---------|------------------------------------------------|
| START   | 1 byte  | Sync marker, always `0xAA`                     |
| CMD     | 1 byte  | Command identifier                             |
| LEN     | 1 byte  | Payload length (0–255)                         |
| PAYLOAD | 0–255 B | Command-specific data                          |
| CRC8    | 1 byte  | CRC-8 over CMD + LEN + PAYLOAD                 |

**Max frame size:** 259 bytes (1 + 1 + 1 + 255 + 1)

## CRC-8 Algorithm

- Polynomial: `0x31` (x^8 + x^5 + x^4 + 1)
- Initial value: `0x00`
- Input/output reflection: none

```
crc = 0x00
for each byte in (CMD, LEN, PAYLOAD...):
    crc ^= byte
    repeat 8 times:
        if crc & 0x80:
            crc = (crc << 1) ^ 0x31
        else:
            crc = crc << 1
        crc &= 0xFF
```

## Commands

### Script → Firmware

#### `0x01` ADD_SERVICE

Add a GATT service to the schema.

| Offset | Size | Field    | Description                          |
|--------|------|----------|--------------------------------------|
| 0      | 1    | svc_idx  | Service index (0–7)                  |
| 1      | 16   | uuid_128 | Service UUID, 128-bit, little-endian |

**Payload length:** 17 bytes

#### `0x02` ADD_CHAR

Add a characteristic to a previously added service.

| Offset | Size | Field         | Description                              |
|--------|------|---------------|------------------------------------------|
| 0      | 1    | svc_idx       | Parent service index                     |
| 1      | 1    | chr_idx       | Characteristic index within service (0–15)|
| 2      | 1    | props         | Property bitmask (see below)             |
| 3      | 16   | uuid_128      | Characteristic UUID, little-endian       |
| 19     | 0–N  | default_value | Default value returned on BLE READ       |

**Payload length:** 19 + length of default_value

**Property bitmask:**

| Bit | Value | Flag   |
|-----|-------|--------|
| 0   | 0x01  | READ   |
| 1   | 0x02  | WRITE  |
| 2   | 0x04  | NOTIFY |

#### `0x03` APPLY_SCHEMA

Finalize the schema. Firmware registers all services/characteristics with the NimBLE stack and starts BLE advertising.

**Payload length:** 0 bytes

#### `0x04` SET_DEVICE_NAME

Set the BLE device name used in advertising and the GAP service. Must be sent before APPLY_SCHEMA.

| Offset | Size | Field | Description                        |
|--------|------|-------|------------------------------------|
| 0      | 1–29 | name  | UTF-8 device name (no null term)   |

**Payload length:** 1–29 bytes

#### `0x05` SET_ADV_DATA

Set additional advertising data (appearance and manufacturer-specific data). Must be sent before APPLY_SCHEMA.

| Offset | Size | Field      | Description                                  |
|--------|------|------------|----------------------------------------------|
| 0      | 2    | appearance | BLE appearance code, little-endian (0=none)  |
| 2      | 0–24 | mfr_data   | Manufacturer-specific data (optional)        |

**Payload length:** 2–26 bytes

**Common appearance codes:**

| Code   | Description     |
|--------|-----------------|
| 0x0000 | Unknown/None    |
| 0x0040 | Generic Phone   |
| 0x0080 | Generic Computer|
| 0x00C0 | Generic Watch   |
| 0x0180 | Generic Display |
| 0x0340 | Generic Sensor  |

#### `0x06` SET_ADV_UUIDS

Set 16-bit service UUIDs to include in advertising data. Allows BLE clients to filter by service. Must be sent before APPLY_SCHEMA.

| Offset | Size | Field    | Description                                  |
|--------|------|----------|----------------------------------------------|
| 0      | 2–8  | uuids    | 1–4 16-bit UUIDs, each little-endian         |

**Payload length:** 2–8 bytes (must be even)

**Example:** To advertise Heart Rate (0x180D) and Battery (0x180F):
```
Payload: [0D 18 0F 18]  (4 bytes = 2 UUIDs)
```

### Firmware → Script

#### `0x10` ACK

Positive acknowledgment.

| Offset | Size | Field     | Description                  |
|--------|------|-----------|------------------------------|
| 0      | 1    | acked_cmd | The command being acknowledged|

#### `0x11` NACK

Negative acknowledgment.

| Offset | Size | Field      | Description                  |
|--------|------|------------|------------------------------|
| 0      | 1    | nacked_cmd | The command being rejected   |
| 1      | 1    | error_code | Error reason (see below)     |

**Error codes:**

| Code | Name              | Description                                |
|------|-------------------|--------------------------------------------|
| 0x01 | INVALID_CMD       | Unknown command byte                       |
| 0x02 | CRC_MISMATCH      | Frame CRC check failed                     |
| 0x03 | INVALID_PAYLOAD   | Payload length or content is wrong         |
| 0x04 | SCHEMA_FULL       | Max services or characteristics exceeded   |
| 0x05 | APPLY_FAILED      | NimBLE registration failed                 |

### Runtime Events (Firmware → Script)

These are sent by the firmware when BLE clients interact with characteristics.

#### `0x20` CHAR_WRITE_EVENT

Sent when a BLE client writes to a characteristic.

| Offset | Size | Field   | Description                          |
|--------|------|---------|--------------------------------------|
| 0      | 1    | svc_idx | Service index                        |
| 1      | 1    | chr_idx | Characteristic index                 |
| 2      | N    | data    | Written data                         |

#### `0x21` CHAR_READ_EVENT

Sent when a BLE client reads a characteristic. The frontend should respond with READ_RESPONSE within 200ms, or the firmware will return the characteristic's default value.

| Offset | Size | Field   | Description                          |
|--------|------|---------|--------------------------------------|
| 0      | 1    | svc_idx | Service index                        |
| 1      | 1    | chr_idx | Characteristic index                 |

### Runtime Commands (Script → Firmware)

#### `0x22` NOTIFY_CMD

Send a BLE notification to connected clients.

| Offset | Size | Field   | Description                          |
|--------|------|---------|--------------------------------------|
| 0      | 1    | svc_idx | Service index                        |
| 1      | 1    | chr_idx | Characteristic index                 |
| 2      | N    | data    | Notification data                    |

#### `0x23` READ_RESPONSE

Response to a CHAR_READ_EVENT. Must be sent within 200ms of receiving the read event.

| Offset | Size | Field   | Description                          |
|--------|------|---------|--------------------------------------|
| 0      | 1    | svc_idx | Service index                        |
| 1      | 1    | chr_idx | Characteristic index                 |
| 2      | N    | data    | Value to return to BLE client        |

### Heartbeat

#### `0x30` PING (Script → Firmware)

Request schema hash from firmware for verification.

**Payload length:** 0 bytes

#### `0x31` PONG (Firmware → Script)

Response to PING containing the current schema hash. If no schema is applied, returns all zeros.

| Offset | Size | Field | Description                                |
|--------|------|-------|--------------------------------------------|
| 0      | 4    | hash  | 4-byte schema hash (CRC-8 based)           |

## Example Exchange

Upload a schema with one service and one characteristic:

```
Script → FW:  [AA] [01] [11] [00 <16 bytes uuid>] [CRC]     ADD_SERVICE idx=0
FW → Script:  [AA] [10] [01] [01] [CRC]                      ACK cmd=0x01

Script → FW:  [AA] [02] [18] [00 00 07 <16 bytes uuid> <5 bytes default>] [CRC]   ADD_CHAR
FW → Script:  [AA] [10] [01] [02] [CRC]                      ACK cmd=0x02

Script → FW:  [AA] [03] [00] [CRC]                           APPLY_SCHEMA
FW → Script:  [AA] [10] [01] [03] [CRC]                      ACK cmd=0x03
```

## Limits

| Resource                     | Max        |
|------------------------------|------------|
| Services per schema          | 8          |
| Characteristics per service  | 16         |
| Default value size           | 128 bytes  |
| Frame payload                | 255 bytes  |
