# UART Transport Protocol Library

Platform-independent C library for UART framing protocol with CRC-8 validation.

## Protocol Format

```
[START] [CMD] [LEN] [PAYLOAD...] [CRC8]
  0xAA   1B    1B    0-255 bytes   1B
```

| Field | Size | Description |
|-------|------|-------------|
| START | 1 byte | Always `0xAA` |
| CMD | 1 byte | Command identifier |
| LEN | 1 byte | Payload length (0-255) |
| PAYLOAD | 0-255 bytes | Command-specific data |
| CRC8 | 1 byte | CRC-8 over CMD + LEN + PAYLOAD |

### CRC-8 Algorithm

- Polynomial: `0x31`
- Initial value: `0x00`
- Computed over: CMD, LEN, and PAYLOAD bytes

## API Reference

### Initialization

```c
void uart_transport_init(const uart_transport_t *transport);
```
Initialize the transport with platform callbacks. The callbacks struct must remain valid for the lifetime of the transport.

```c
void uart_transport_reset(void);
```
Reset the parser state machine. Call this after communication errors or when restarting.

### Receiving Data

```c
void uart_transport_feed_byte(uint8_t byte);
```
Feed received bytes into the parser one at a time. When a complete valid frame is received, the `on_command` callback is invoked.

### Sending Data

```c
void uart_transport_send_command(uint8_t cmd, const uint8_t *payload, uint8_t len);
```
Send a command frame with optional payload.

```c
void uart_transport_send_ack(uint8_t acked_cmd);
```
Send an ACK response for a command.

```c
void uart_transport_send_nack(uint8_t nacked_cmd, uint8_t error_code);
```
Send a NACK response with an error code.

### Utility

```c
uint8_t uart_transport_crc8(const uint8_t *data, size_t len);
```
Compute CRC-8 checksum for arbitrary data.

## Platform Callbacks

Implement the `uart_transport_t` struct with your platform-specific functions:

```c
typedef struct {
    void (*send_bytes)(const uint8_t *data, size_t len);
    void (*on_command)(uint8_t cmd, const uint8_t *payload, uint8_t len);
} uart_transport_t;
```

### send_bytes
Called when the library needs to transmit data. Implement this to write bytes to your UART peripheral.

### on_command
Called when a valid command frame is received. Implement this to handle incoming commands.

## Usage Example

```c
#include "uart_transport.h"

// Platform-specific: send bytes over UART
static void my_send_bytes(const uint8_t *data, size_t len) {
    uart_write(UART_PORT, data, len);
}

// Handle received commands
static void my_on_command(uint8_t cmd, const uint8_t *payload, uint8_t len) {
    switch (cmd) {
    case CMD_PING:
        uart_transport_send_command(CMD_PONG, NULL, 0);
        break;
    // ... handle other commands
    }
}

// Initialize
static const uart_transport_t transport = {
    .send_bytes = my_send_bytes,
    .on_command = my_on_command,
};

void app_init(void) {
    uart_transport_init(&transport);
}

// In your UART RX handler or task
void uart_rx_handler(void) {
    uint8_t byte;
    while (uart_read_byte(&byte)) {
        uart_transport_feed_byte(byte);
    }
}
```

## Command Definitions

The library defines standard command bytes for a BLE UART bridge application:

### Frontend -> Device
| Command | Value | Description |
|---------|-------|-------------|
| `CMD_ADD_SERVICE` | 0x01 | Add a GATT service |
| `CMD_ADD_CHAR` | 0x02 | Add a characteristic |
| `CMD_APPLY_SCHEMA` | 0x03 | Apply the schema |
| `CMD_SET_DEVICE_NAME` | 0x04 | Set device name |
| `CMD_SET_ADV_DATA` | 0x05 | Set advertising data |
| `CMD_SET_ADV_UUIDS` | 0x06 | Set advertising UUIDs |
| `CMD_NOTIFY` | 0x22 | Send notification |
| `CMD_READ_RESPONSE` | 0x23 | Respond to read request |
| `CMD_PING` | 0x30 | Heartbeat ping |

### Device -> Frontend
| Command | Value | Description |
|---------|-------|-------------|
| `CMD_ACK` | 0x10 | Acknowledge command |
| `CMD_NACK` | 0x11 | Reject command |
| `CMD_CHAR_WRITE_EVT` | 0x20 | Characteristic write event |
| `CMD_CHAR_READ_EVT` | 0x21 | Characteristic read event |
| `CMD_PONG` | 0x31 | Heartbeat response |
| `CMD_ADV_STARTED` | 0x32 | Advertising started |
| `CMD_ADV_FAILED` | 0x33 | Advertising failed |

### NACK Error Codes
| Error | Value | Description |
|-------|-------|-------------|
| `ERR_INVALID_CMD` | 0x01 | Unknown command |
| `ERR_CRC_MISMATCH` | 0x02 | CRC validation failed |
| `ERR_INVALID_PAYLOAD` | 0x03 | Invalid payload format |
| `ERR_SCHEMA_FULL` | 0x04 | Schema capacity exceeded |
| `ERR_APPLY_FAILED` | 0x05 | Failed to apply schema |

## PlatformIO Integration

Add this library to your PlatformIO project by adding to `platformio.ini`:

```ini
lib_extra_dirs = ../uart-transport-protocol
```

Or reference by absolute/relative path:

```ini
lib_deps = file://../uart-transport-protocol
```

## ESP-IDF Integration

For ESP-IDF projects, you can use this as a component. Create a `CMakeLists.txt` in your component directory:

```cmake
idf_component_register(
    SRCS "src/uart_transport.c"
    INCLUDE_DIRS "include"
)
```
