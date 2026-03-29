#include <stdio.h>
#include "app.h"
#include "nvs_flash.h"
#include "ble_server.h"
#include "ble_platform.h"
#include "uart_service.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "app";

esp_err_t nvs_init()
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND)
    {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }

    return ret;
}

void handler_thread(void)
{
    esp_err_t rc = ESP_OK;

    TRY_INIT(nvs_init());
    TRY_INIT(ble_init());
    TRY_INIT(uart_init());
    if (rc == ESP_OK)
    {
        /* Initialize BLE UART platform (portable library) */
        ble_platform_init();

        xTaskCreate(uart_rx_task, "uart_rx_task", 8192, NULL, 10, NULL);

        ESP_LOGI(TAG, "All subsystems initialized successfully");
    }
    else
    {
        assert(0 && "Failed to initialize subsystems");
    }
}