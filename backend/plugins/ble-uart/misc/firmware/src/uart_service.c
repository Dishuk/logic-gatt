#include "uart_service.h"
#include "uart_transport.h"
#include "driver/uart.h"
#include "esp_log.h"

#define RX_BUF_SIZE 1024
#define OPERATIONAL_UART UART_NUM_0

static const char *TAG = "uart_service";

esp_err_t uart_init(void)
{
  ESP_LOGI(TAG, "----------uart_init started----------");

  esp_err_t ret;

  const uart_config_t uart_config = {
      .baud_rate = 115200,
      .data_bits = UART_DATA_8_BITS,
      .parity = UART_PARITY_DISABLE,
      .stop_bits = UART_STOP_BITS_1,
      .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
      .source_clk = UART_SCLK_APB,
  };

  ret = uart_driver_install(OPERATIONAL_UART, RX_BUF_SIZE * 2, 0, 0, NULL, 0);
  if (ret != ESP_OK)
  {
    ESP_LOGE(TAG, "uart_driver_install() failed with error: %d", ret);
    return ret;
  }

  ret = uart_param_config(OPERATIONAL_UART, &uart_config);
  if (ret != ESP_OK)
  {
    ESP_LOGE(TAG, "uart_param_config() failed with error: %d", ret);
    return ret;
  }

  // UART0 uses default pins (TX=GPIO1, RX=GPIO3), no need for uart_set_pin()

  ESP_LOGI(TAG, "----------uart_init finished----------");

  return ESP_OK;
}

esp_err_t uart_write_bytes_raw(uint8_t *data, size_t len)
{
  if (!data || len == 0)
  {
    return ESP_ERR_INVALID_ARG;
  }

  int bytes_written = uart_write_bytes(OPERATIONAL_UART, (const char *)data, len);
  if (bytes_written < 0)
  {
    return ESP_FAIL;
  }

  return ESP_OK;
}

void uart_rx_task(void *args)
{
  uint8_t rx_buf[64];
  while (1)
  {
    int len = uart_read_bytes(OPERATIONAL_UART, rx_buf, sizeof(rx_buf), 100 / portTICK_PERIOD_MS);
    if (len > 0)
    {
      for (int i = 0; i < len; i++)
      {
        uart_transport_feed_byte(rx_buf[i]);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}
