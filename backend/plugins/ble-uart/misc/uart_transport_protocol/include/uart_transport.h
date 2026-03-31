/**
 * UART Transport Library
 *
 * Portable C library for UART framing protocol.
 * Handles frame parsing and building only - no application logic.
 *
 * Protocol: [0xAA] [CMD] [LEN] [PAYLOAD...] [CRC8]
 */

#ifndef UART_TRANSPORT_H
#define UART_TRANSPORT_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/* Protocol constants */
#define UART_TRANSPORT_START_BYTE   0xAA
#define UART_TRANSPORT_MAX_PAYLOAD  255

/* Commands: Frontend -> Device */
#define CMD_ADD_SERVICE     0x01
#define CMD_ADD_CHAR        0x02
#define CMD_APPLY_SCHEMA    0x03
#define CMD_SET_DEVICE_NAME 0x04
#define CMD_SET_ADV_DATA    0x05
#define CMD_SET_ADV_UUIDS   0x06

/* Commands: Device -> Frontend */
#define CMD_ACK             0x10
#define CMD_NACK            0x11
#define CMD_CHAR_WRITE_EVT  0x20
#define CMD_CHAR_READ_EVT   0x21

/* Commands: Frontend -> Device (runtime) */
#define CMD_NOTIFY          0x22
#define CMD_READ_RESPONSE   0x23

/* Heartbeat */
#define CMD_PING            0x30
#define CMD_PONG            0x31

/* Status events */
#define CMD_ADV_STARTED     0x32
#define CMD_ADV_FAILED      0x33

/* NACK error codes */
#define ERR_INVALID_CMD     0x01
#define ERR_CRC_MISMATCH    0x02
#define ERR_INVALID_PAYLOAD 0x03
#define ERR_SCHEMA_FULL     0x04
#define ERR_APPLY_FAILED    0x05

/**
 * Transport callbacks - implement these for your platform.
 */
typedef struct {
    /**
     * Send raw bytes over UART.
     * @param data  Bytes to send
     * @param len   Number of bytes
     */
    void (*send_bytes)(const uint8_t *data, size_t len);

    /**
     * Called when a valid command frame is received.
     * @param cmd      Command byte
     * @param payload  Payload data (may be NULL if len=0)
     * @param len      Payload length
     */
    void (*on_command)(uint8_t cmd, const uint8_t *payload, uint8_t len);

} uart_transport_t;

/**
 * Initialize the transport.
 * @param transport  Callbacks (must remain valid)
 */
void uart_transport_init(const uart_transport_t *transport);

/**
 * Reset the parser state.
 */
void uart_transport_reset(void);

/**
 * Feed a byte into the parser.
 * When a complete valid frame is received, on_command() is called.
 * @param byte  Received byte
 */
void uart_transport_feed_byte(uint8_t byte);

/**
 * Send a command frame.
 * @param cmd      Command byte
 * @param payload  Payload data (can be NULL if len=0)
 * @param len      Payload length
 */
void uart_transport_send_command(uint8_t cmd, const uint8_t *payload, uint8_t len);

/**
 * Send an ACK response.
 * @param acked_cmd  Command being acknowledged
 */
void uart_transport_send_ack(uint8_t acked_cmd);

/**
 * Send a NACK response.
 * @param nacked_cmd  Command being rejected
 * @param error_code  Error code (ERR_*)
 */
void uart_transport_send_nack(uint8_t nacked_cmd, uint8_t error_code);

/**
 * Compute CRC-8 (polynomial 0x31, init 0x00).
 * @param data  Data buffer
 * @param len   Data length
 * @return CRC-8 value
 */
uint8_t uart_transport_crc8(const uint8_t *data, size_t len);

#ifdef __cplusplus
}
#endif

#endif /* UART_TRANSPORT_H */
