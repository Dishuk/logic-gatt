#include "ble_server.h"
#include "uart_transport.h"
#include "esp_nimble_hci.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "host/ble_hs.h"
#include "host/util/util.h"

static const char *TAG = "ble_service";

#define SM_IO_CAP_NO_INPUT_OUTPUT 0x03

static uint8_t own_addr_type;

// Device name and advertising data storage
static char device_name[BLE_DEVICE_NAME_MAX + 1] = "BLE-EMU";
static uint16_t adv_appearance = 0;
static uint8_t mfr_data[BLE_MANUFACTURER_DATA_MAX];
static uint8_t mfr_data_len = 0;
static ble_uuid16_t adv_uuids[BLE_ADV_UUIDS_MAX];
static uint8_t adv_uuids_count = 0;

esp_err_t ble_set_device_name(const char *name, uint8_t len)
{
  if (len > BLE_DEVICE_NAME_MAX)
  {
    ESP_LOGE(TAG, "Device name too long: %d > %d", len, BLE_DEVICE_NAME_MAX);
    return ESP_ERR_INVALID_ARG;
  }
  memcpy(device_name, name, len);
  device_name[len] = '\0';
  ESP_LOGI(TAG, "Device name set to: %s", device_name);
  return ESP_OK;
}

esp_err_t ble_set_adv_data(uint16_t appearance, const uint8_t *data, uint8_t len)
{
  if (len > BLE_MANUFACTURER_DATA_MAX)
  {
    ESP_LOGE(TAG, "Manufacturer data too long: %d > %d", len, BLE_MANUFACTURER_DATA_MAX);
    return ESP_ERR_INVALID_ARG;
  }
  adv_appearance = appearance;
  if (data && len > 0)
  {
    memcpy(mfr_data, data, len);
    mfr_data_len = len;
  }
  else
  {
    mfr_data_len = 0;
  }
  ESP_LOGI(TAG, "Adv data set: appearance=0x%04X, mfr_len=%d", appearance, mfr_data_len);
  return ESP_OK;
}

esp_err_t ble_set_adv_uuids(const uint16_t *uuids, uint8_t count)
{
  if (count > BLE_ADV_UUIDS_MAX)
  {
    ESP_LOGE(TAG, "Too many UUIDs: %d > %d", count, BLE_ADV_UUIDS_MAX);
    return ESP_ERR_INVALID_ARG;
  }
  adv_uuids_count = count;
  for (uint8_t i = 0; i < count; i++)
  {
    adv_uuids[i].u.type = BLE_UUID_TYPE_16;
    adv_uuids[i].value = uuids[i];
    ESP_LOGI(TAG, "Adv UUID[%d]: 0x%04X", i, uuids[i]);
  }
  return ESP_OK;
}

void ble_start_advertising(void)
{
  struct ble_gap_adv_params adv_params;
  struct ble_hs_adv_fields fields;
  int rc;

  // Update GAP device name from stored value
  rc = ble_svc_gap_device_name_set(device_name);
  if (rc != 0)
  {
    ESP_LOGE(TAG, "Failed to set GAP device name: %d", rc);
  }

  memset(&fields, 0, sizeof(fields));
  fields.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
  fields.tx_pwr_lvl_is_present = 1;
  fields.tx_pwr_lvl = BLE_HS_ADV_TX_PWR_LVL_AUTO;
  fields.name = (uint8_t *)device_name;
  fields.name_len = strlen(device_name);
  fields.name_is_complete = 1;

  // Set appearance if configured
  if (adv_appearance != 0)
  {
    fields.appearance = adv_appearance;
    fields.appearance_is_present = 1;
  }

  // Set manufacturer data if configured
  if (mfr_data_len > 0)
  {
    fields.mfg_data = mfr_data;
    fields.mfg_data_len = mfr_data_len;
  }

  // Set 16-bit service UUIDs if configured
  if (adv_uuids_count > 0)
  {
    fields.uuids16 = adv_uuids;
    fields.num_uuids16 = adv_uuids_count;
    fields.uuids16_is_complete = 1;
  }

  rc = ble_gap_adv_set_fields(&fields);
  if (rc != 0)
  {
    ESP_LOGE(TAG, "Error setting adv fields; rc=%d", rc);
    uint8_t err_payload[2] = {0x01, (uint8_t)rc}; /* 0x01 = set_fields failed */
    uart_transport_send_command(CMD_ADV_FAILED, err_payload, 2);
    return;
  }

  memset(&adv_params, 0, sizeof(adv_params));
  adv_params.conn_mode = BLE_GAP_CONN_MODE_UND;
  adv_params.disc_mode = BLE_GAP_DISC_MODE_GEN;

  rc = ble_gap_adv_start(own_addr_type, NULL, BLE_HS_FOREVER,
                         &adv_params, NULL, NULL);
  if (rc != 0)
  {
    ESP_LOGE(TAG, "Error starting adv; rc=%d", rc);
    uint8_t err_payload[2] = {0x02, (uint8_t)rc}; /* 0x02 = adv_start failed */
    uart_transport_send_command(CMD_ADV_FAILED, err_payload, 2);
  }
  else
  {
    ESP_LOGI(TAG, "Advertising started as '%s'", device_name);
    uart_transport_send_command(CMD_ADV_STARTED, NULL, 0);
  }
}

static void
bleprph_on_reset(int reason)
{
  MODLOG_DFLT(ERROR, "Resetting state; reason=%d\n", reason);
}

static void
bleprph_on_sync(void)
{
  int rc;
  rc = ble_hs_util_ensure_addr(0);
  if (rc != ESP_OK)
  {
    ESP_LOGE(TAG, "ble_hs_util_ensure_addr() failed with error: %d", rc);
    return;
  }

  rc = ble_hs_id_infer_auto(0, &own_addr_type);
  if (rc != ESP_OK)
  {
    ESP_LOGE(TAG, "ble_hs_id_infer_auto() failed with error: %d", rc);
    return;
  }

  uint8_t addr_val[6] = {0};
  rc = ble_hs_id_copy_addr(own_addr_type, addr_val, NULL);
  ESP_LOGI(TAG, "Device Address: %02X:%02X:%02X:%02X:%02X:%02X",
           addr_val[5], addr_val[4], addr_val[3],
           addr_val[2], addr_val[1], addr_val[0]);

  // Schema is already registered — start advertising
  ble_start_advertising();
}

static esp_err_t nimble_host_config_init(void)
{
  ble_hs_cfg.reset_cb = bleprph_on_reset;
  ble_hs_cfg.sync_cb = bleprph_on_sync;
  ble_hs_cfg.store_status_cb = ble_store_util_status_rr;
  ble_hs_cfg.sm_io_cap = SM_IO_CAP_NO_INPUT_OUTPUT;

  return ESP_OK;
}

static void bleprph_host_task(void *param)
{
  ESP_LOGI(TAG, "BLE Host Task Started");
  nimble_port_run();
  nimble_port_freertos_deinit();
}

esp_err_t ble_init(void)
{
  ESP_LOGI(TAG, "----------ble_init started----------");

  esp_err_t ret;

  ret = nimble_port_init();
  if (ret != ESP_OK)
  {
    ESP_LOGE(TAG, "nimble_port_init() failed with error: %d", ret);
    return ret;
  }

  ret = nimble_host_config_init();
  if (ret != ESP_OK)
  {
    ESP_LOGE(TAG, "nimble_host_config_init() failed with error: %d", ret);
    return ret;
  }

  // Initialize GAP/GATT base services only — no custom services yet
  ble_svc_gap_init();
  ble_svc_gatt_init();

  int rc = ble_svc_gap_device_name_set(device_name);
  if (rc != ESP_OK)
  {
    ESP_LOGE(TAG, "ble_svc_gap_device_name_set() failed with error: %d", rc);
  }

  ESP_LOGI(TAG, "----------ble_init finished (host not started yet)----------");

  return ESP_OK;
}

void ble_start_host(void)
{
  nimble_port_freertos_init(bleprph_host_task);
  ESP_LOGI(TAG, "BLE host task launched");
}

void ble_stop_host(void)
{
  int rc = nimble_port_stop();
  if (rc != 0)
  {
    ESP_LOGE(TAG, "nimble_port_stop failed: %d", rc);
  }
  nimble_port_deinit();
  ESP_LOGI(TAG, "BLE host stopped and deinitialized");
}

esp_err_t ble_reinit(void)
{
  esp_err_t ret = nimble_port_init();
  if (ret != ESP_OK)
  {
    ESP_LOGE(TAG, "nimble_port_init() failed on reinit: %d", ret);
    return ret;
  }

  nimble_host_config_init();
  ble_svc_gap_init();
  ble_svc_gatt_init();
  ble_svc_gap_device_name_set(device_name);

  ESP_LOGI(TAG, "BLE reinitialized (ready for new schema)");
  return ESP_OK;
}
