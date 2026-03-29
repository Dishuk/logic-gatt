#pragma once

#include <stdint.h>
#include <stdbool.h>

/**
 * Initialize the BLE UART platform layer.
 * Must be called after ble_init() and uart_init().
 */
void ble_platform_init(void);

/**
 * Call from BLE stack when a characteristic is written.
 * Sends CHAR_WRITE_EVENT to the frontend.
 *
 * @param svc_idx   Service index
 * @param chr_idx   Characteristic index
 * @param data      Written data
 * @param len       Data length
 */
void ble_platform_on_write(uint8_t svc_idx, uint8_t chr_idx,
                           const uint8_t *data, uint8_t len);

/**
 * Call from BLE stack when a characteristic read is requested.
 * Sends CHAR_READ_EVENT to the frontend.
 * Returns immediately - caller must poll for response.
 *
 * @param svc_idx   Service index
 * @param chr_idx   Characteristic index
 */
void ble_platform_on_read(uint8_t svc_idx, uint8_t chr_idx);

/**
 * Check if a read response has been received.
 *
 * @param out_data  Buffer to receive response data
 * @param out_len   Pointer to receive response length
 * @return true if response received
 */
bool ble_platform_check_read_response(uint8_t *out_data, uint8_t *out_len);

/**
 * Get the default value for a characteristic.
 *
 * @param svc_idx   Service index
 * @param chr_idx   Characteristic index
 * @param out_data  Buffer to receive default value
 * @param out_len   Pointer to receive length
 * @return true if characteristic exists
 */
bool ble_platform_get_default_value(uint8_t svc_idx, uint8_t chr_idx,
                                    uint8_t *out_data, uint8_t *out_len);
