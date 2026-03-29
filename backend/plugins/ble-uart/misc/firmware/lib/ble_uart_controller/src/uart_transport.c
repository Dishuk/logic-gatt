/**
 * UART Transport Library - Implementation
 *
 * Pure transport layer: frame parsing and building only.
 */

#include "uart_transport.h"
#include <string.h>

/* --------------------------------------------------------------------------
 * Internal state
 * -------------------------------------------------------------------------- */

static const uart_transport_t *g_transport = NULL;

/* Frame parser state machine */
typedef enum {
    STATE_WAIT_START,
    STATE_READ_CMD,
    STATE_READ_LEN,
    STATE_READ_PAYLOAD,
    STATE_READ_CRC,
} parser_state_t;

static parser_state_t g_state = STATE_WAIT_START;
static uint8_t g_frame_cmd;
static uint8_t g_frame_len;
static uint8_t g_frame_payload[UART_TRANSPORT_MAX_PAYLOAD];
static uint8_t g_frame_idx;

/* --------------------------------------------------------------------------
 * CRC-8 (polynomial 0x31, init 0x00)
 * -------------------------------------------------------------------------- */

uint8_t uart_transport_crc8(const uint8_t *data, size_t len)
{
    uint8_t crc = 0x00;
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int j = 0; j < 8; j++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ 0x31;
            } else {
                crc <<= 1;
            }
        }
    }
    return crc;
}

/* Continue CRC from existing state */
static uint8_t crc8_continue(uint8_t crc, const uint8_t *data, size_t len)
{
    for (size_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (int j = 0; j < 8; j++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ 0x31;
            } else {
                crc <<= 1;
            }
        }
    }
    return crc;
}

/* --------------------------------------------------------------------------
 * Frame sending
 * -------------------------------------------------------------------------- */

void uart_transport_send_command(uint8_t cmd, const uint8_t *payload, uint8_t len)
{
    if (!g_transport || !g_transport->send_bytes) {
        return;
    }

    uint8_t frame[4 + UART_TRANSPORT_MAX_PAYLOAD];
    frame[0] = UART_TRANSPORT_START_BYTE;
    frame[1] = cmd;
    frame[2] = len;
    if (len > 0 && payload) {
        memcpy(&frame[3], payload, len);
    }
    /* CRC over cmd + len + payload */
    frame[3 + len] = uart_transport_crc8(&frame[1], 2 + len);

    g_transport->send_bytes(frame, 4 + len);
}

void uart_transport_send_ack(uint8_t acked_cmd)
{
    uart_transport_send_command(CMD_ACK, &acked_cmd, 1);
}

void uart_transport_send_nack(uint8_t nacked_cmd, uint8_t error_code)
{
    uint8_t payload[2] = {nacked_cmd, error_code};
    uart_transport_send_command(CMD_NACK, payload, 2);
}

/* --------------------------------------------------------------------------
 * Frame parsing
 * -------------------------------------------------------------------------- */

void uart_transport_feed_byte(uint8_t byte)
{
    switch (g_state) {
    case STATE_WAIT_START:
        if (byte == UART_TRANSPORT_START_BYTE) {
            g_state = STATE_READ_CMD;
        }
        break;

    case STATE_READ_CMD:
        g_frame_cmd = byte;
        g_state = STATE_READ_LEN;
        break;

    case STATE_READ_LEN:
        g_frame_len = byte;
        g_frame_idx = 0;
        if (g_frame_len == 0) {
            g_state = STATE_READ_CRC;
        } else {
            g_state = STATE_READ_PAYLOAD;
        }
        break;

    case STATE_READ_PAYLOAD:
        g_frame_payload[g_frame_idx++] = byte;
        if (g_frame_idx >= g_frame_len) {
            g_state = STATE_READ_CRC;
        }
        break;

    case STATE_READ_CRC:
    {
        /* Compute expected CRC */
        uint8_t header[2] = {g_frame_cmd, g_frame_len};
        uint8_t expected_crc = uart_transport_crc8(header, 2);
        if (g_frame_len > 0) {
            expected_crc = crc8_continue(expected_crc, g_frame_payload, g_frame_len);
        }

        if (byte == expected_crc) {
            /* Valid frame - dispatch to callback */
            if (g_transport && g_transport->on_command) {
                g_transport->on_command(g_frame_cmd, g_frame_payload, g_frame_len);
            }
        } else {
            /* CRC error - send NACK */
            uart_transport_send_nack(g_frame_cmd, ERR_CRC_MISMATCH);
        }
        g_state = STATE_WAIT_START;
        break;
    }
    }
}

/* --------------------------------------------------------------------------
 * Initialization
 * -------------------------------------------------------------------------- */

void uart_transport_init(const uart_transport_t *transport)
{
    g_transport = transport;
    uart_transport_reset();
}

void uart_transport_reset(void)
{
    g_state = STATE_WAIT_START;
    g_frame_idx = 0;
}
