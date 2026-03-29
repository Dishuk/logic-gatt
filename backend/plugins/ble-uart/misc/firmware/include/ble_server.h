#pragma once
#include "esp_err.h"
#include <stdint.h>

#define BLE_DEVICE_NAME_MAX 16
#define BLE_MANUFACTURER_DATA_MAX 16
#define BLE_ADV_UUIDS_MAX 2

esp_err_t ble_init(void);
void ble_start_host(void);
void ble_stop_host(void);
esp_err_t ble_reinit(void);
void ble_start_advertising(void);

/**
 * Set the BLE device name (used in advertising and GAP service).
 * Must be called before ble_start_advertising() or after ble_reinit().
 * @param name UTF-8 device name (max 29 bytes)
 * @param len Length of name
 * @return ESP_OK on success, ESP_ERR_INVALID_ARG if too long
 */
esp_err_t ble_set_device_name(const char *name, uint8_t len);

/**
 * Set advertising appearance and manufacturer data.
 * @param appearance BLE appearance code (0 = not advertised)
 * @param mfr_data Manufacturer-specific data (NULL if none)
 * @param mfr_len Length of manufacturer data (max 24 bytes)
 * @return ESP_OK on success
 */
esp_err_t ble_set_adv_data(uint16_t appearance, const uint8_t *mfr_data, uint8_t mfr_len);

/**
 * Set 16-bit service UUIDs to advertise.
 * These are included in advertising data so apps can filter by service.
 * @param uuids Array of 16-bit UUIDs (e.g., 0x180D for Heart Rate)
 * @param count Number of UUIDs (max 4)
 * @return ESP_OK on success
 */
esp_err_t ble_set_adv_uuids(const uint16_t *uuids, uint8_t count);
