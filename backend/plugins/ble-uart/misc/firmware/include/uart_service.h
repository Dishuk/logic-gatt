#pragma once
#include "esp_err.h"

esp_err_t uart_init(void);
esp_err_t uart_write_bytes_raw(uint8_t *data, size_t len);
void uart_rx_task(void *args);