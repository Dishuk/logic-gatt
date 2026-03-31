# UART Transport Protocol Library

Platform-independent C library for UART framing protocol with CRC-8 validation. See [PROTOCOL.md](PROTOCOL.md) for the complete protocol specification.

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
