/**
 * BLE UART Platform - ESP32 Implementation
 *
 * Implements command handling and BLE registration using NimBLE.
 * Uses uart_transport.h for framing - all application logic is here.
 */

#include "ble_platform.h"
#include "uart_transport.h"
#include "ble_server.h"
#include "uart_service.h"
#include "esp_log.h"
#include "host/ble_hs.h"
#include "host/ble_uuid.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"
#include "os/os_mbuf.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>

static const char *TAG = "ble_platform";

/* --------------------------------------------------------------------------
 * Schema limits and property flags
 * -------------------------------------------------------------------------- */

#define MAX_SERVICES        8
#define MAX_CHARS_PER_SVC   16
#define MAX_DEFAULT_VALUE   128
#define MAX_DEVICE_NAME     29
#define MAX_MFR_DATA        24
#define MAX_ADV_UUIDS       4

#define PROP_READ   0x01
#define PROP_WRITE  0x02
#define PROP_NOTIFY 0x04

/* --------------------------------------------------------------------------
 * Schema storage
 * -------------------------------------------------------------------------- */

typedef struct {
    uint8_t svc_idx;
    uint8_t chr_idx;
    uint8_t properties;
    uint8_t uuid128[16];
    uint8_t default_value[MAX_DEFAULT_VALUE];
    uint8_t default_len;
} char_def_t;

typedef struct {
    uint8_t svc_idx;
    uint8_t uuid128[16];
    char_def_t chars[MAX_CHARS_PER_SVC];
    uint8_t char_count;
} service_def_t;

typedef struct {
    service_def_t services[MAX_SERVICES];
    uint8_t service_count;
} schema_t;

static schema_t g_schema;
static uint8_t g_schema_hash[4] = {0};

/* Read response synchronization */
static volatile bool g_read_resp_ready = false;
static uint8_t g_read_resp_buf[MAX_DEFAULT_VALUE];
static uint8_t g_read_resp_len = 0;
static uint8_t g_read_resp_svc_idx = 0;
static uint8_t g_read_resp_chr_idx = 0;

/* --------------------------------------------------------------------------
 * NimBLE GATT structures (must remain valid while BLE is running)
 * -------------------------------------------------------------------------- */

static struct ble_gatt_svc_def gatt_svcs[MAX_SERVICES + 1];
static struct ble_gatt_chr_def gatt_chrs[MAX_SERVICES][MAX_CHARS_PER_SVC + 1];
static ble_uuid128_t svc_uuids[MAX_SERVICES];
static ble_uuid128_t chr_uuids[MAX_SERVICES][MAX_CHARS_PER_SVC];
static uint16_t chr_val_handles[MAX_SERVICES][MAX_CHARS_PER_SVC];

typedef struct {
    uint8_t svc_idx;
    uint8_t chr_idx;
} chr_context_t;
static chr_context_t chr_contexts[MAX_SERVICES][MAX_CHARS_PER_SVC];

static bool host_running = false;

/* --------------------------------------------------------------------------
 * Schema hash computation
 * -------------------------------------------------------------------------- */

static void compute_schema_hash(void)
{
    uint8_t buf[MAX_SERVICES * (16 + MAX_CHARS_PER_SVC * 17)];
    size_t pos = 0;

    for (uint8_t s = 0; s < g_schema.service_count; s++) {
        service_def_t *svc = &g_schema.services[s];

        memcpy(&buf[pos], svc->uuid128, 16);
        pos += 16;

        for (uint8_t c = 0; c < svc->char_count; c++) {
            char_def_t *chr = &svc->chars[c];

            memcpy(&buf[pos], chr->uuid128, 16);
            pos += 16;

            buf[pos++] = chr->properties;
        }
    }

    /* Compute 4-byte hash using CRC8 on quarters of the data */
    size_t chunk_size = (pos + 3) / 4;
    for (int i = 0; i < 4; i++) {
        size_t start = i * chunk_size;
        size_t len = 0;
        if (start < pos) {
            len = (start + chunk_size > pos) ? (pos - start) : chunk_size;
        }
        g_schema_hash[i] = (len > 0) ? uart_transport_crc8(&buf[start], len) : 0;
    }
}

/* --------------------------------------------------------------------------
 * BLE characteristic access callback
 * -------------------------------------------------------------------------- */

static int chr_access_cb(uint16_t conn_handle, uint16_t attr_handle,
                         struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    chr_context_t *ctx = (chr_context_t *)arg;
    if (!ctx) {
        return BLE_ATT_ERR_UNLIKELY;
    }

    uint8_t svc_idx = ctx->svc_idx;
    uint8_t chr_idx = ctx->chr_idx;

    switch (ctxt->op) {
    case BLE_GATT_ACCESS_OP_READ_CHR: {
        /* Send read event to frontend and wait for response */
        ble_platform_on_read(svc_idx, chr_idx);

        /* Poll for response with timeout */
        uint8_t resp_buf[MAX_DEFAULT_VALUE];
        uint8_t resp_len = 0;
        int remaining = 200; /* ms */

        while (remaining > 0) {
            if (ble_platform_check_read_response(resp_buf, &resp_len)) {
                int rc = os_mbuf_append(ctxt->om, resp_buf, resp_len);
                return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
            }
            vTaskDelay(pdMS_TO_TICKS(10));
            remaining -= 10;
        }

        /* Timeout - use default value from schema */
        if (ble_platform_get_default_value(svc_idx, chr_idx, resp_buf, &resp_len)) {
            if (resp_len > 0) {
                int rc = os_mbuf_append(ctxt->om, resp_buf, resp_len);
                return rc == 0 ? 0 : BLE_ATT_ERR_INSUFFICIENT_RES;
            }
        }
        return 0;
    }

    case BLE_GATT_ACCESS_OP_WRITE_CHR: {
        uint16_t om_len = OS_MBUF_PKTLEN(ctxt->om);
        uint8_t write_buf[UART_TRANSPORT_MAX_PAYLOAD - 2];
        if (om_len > sizeof(write_buf)) {
            om_len = sizeof(write_buf);
        }

        uint16_t copied = 0;
        int rc = ble_hs_mbuf_to_flat(ctxt->om, write_buf, om_len, &copied);
        if (rc != 0) {
            ESP_LOGE(TAG, "mbuf_to_flat failed: %d", rc);
            return BLE_ATT_ERR_UNLIKELY;
        }

        ble_platform_on_write(svc_idx, chr_idx, write_buf, (uint8_t)copied);
        return 0;
    }

    default:
        return BLE_ATT_ERR_UNLIKELY;
    }
}

/* --------------------------------------------------------------------------
 * BLE registration
 * -------------------------------------------------------------------------- */

static bool register_ble_schema(void)
{
    if (g_schema.service_count == 0) {
        ESP_LOGE(TAG, "No services to register");
        return false;
    }

    /* If BLE host is already running, stop it and reinitialize */
    if (host_running) {
        ESP_LOGI(TAG, "Schema already applied — resetting BLE stack");
        ble_stop_host();
        esp_err_t ret = ble_reinit();
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "BLE reinit failed: %d", ret);
            return false;
        }
        host_running = false;
    }

    /* Clear previous structures */
    memset(gatt_svcs, 0, sizeof(gatt_svcs));
    memset(gatt_chrs, 0, sizeof(gatt_chrs));

    /* Build NimBLE service definition array */
    uint8_t svc_out = 0;
    for (uint8_t s = 0; s < g_schema.service_count; s++) {
        service_def_t *svc = &g_schema.services[s];
        if (svc->char_count == 0) continue;

        /* Copy UUID */
        svc_uuids[s].u.type = BLE_UUID_TYPE_128;
        memcpy(svc_uuids[s].value, svc->uuid128, 16);

        /* Build characteristic array */
        uint8_t chr_out = 0;
        for (uint8_t c = 0; c < svc->char_count; c++) {
            char_def_t *chr = &svc->chars[c];

            /* Copy UUID */
            chr_uuids[s][c].u.type = BLE_UUID_TYPE_128;
            memcpy(chr_uuids[s][c].value, chr->uuid128, 16);

            /* Store context for callback */
            chr_contexts[s][c].svc_idx = s;
            chr_contexts[s][c].chr_idx = c;

            /* Build flags */
            ble_gatt_chr_flags flags = 0;
            if (chr->properties & PROP_READ)   flags |= BLE_GATT_CHR_F_READ;
            if (chr->properties & PROP_WRITE)  flags |= BLE_GATT_CHR_F_WRITE;
            if (chr->properties & PROP_NOTIFY) flags |= BLE_GATT_CHR_F_NOTIFY;

            gatt_chrs[s][chr_out] = (struct ble_gatt_chr_def){
                .uuid = &chr_uuids[s][c].u,
                .access_cb = chr_access_cb,
                .arg = &chr_contexts[s][c],
                .val_handle = &chr_val_handles[s][c],
                .flags = flags,
            };
            chr_out++;
        }
        /* Terminate characteristic array */
        memset(&gatt_chrs[s][chr_out], 0, sizeof(struct ble_gatt_chr_def));

        gatt_svcs[svc_out] = (struct ble_gatt_svc_def){
            .type = BLE_GATT_SVC_TYPE_PRIMARY,
            .uuid = &svc_uuids[s].u,
            .characteristics = gatt_chrs[s],
        };
        svc_out++;
    }
    /* Terminate service array */
    memset(&gatt_svcs[svc_out], 0, sizeof(struct ble_gatt_svc_def));

    /* Register with NimBLE */
    int rc = ble_gatts_count_cfg(gatt_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_count_cfg failed: %d", rc);
        return false;
    }

    rc = ble_gatts_add_svcs(gatt_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_add_svcs failed: %d", rc);
        return false;
    }

    /* Start NimBLE host task */
    ble_start_host();
    host_running = true;

    ESP_LOGI(TAG, "Schema registered: %d services", svc_out);
    return true;
}

/* --------------------------------------------------------------------------
 * BLE notification
 * -------------------------------------------------------------------------- */

static bool send_ble_notify(uint8_t svc_idx, uint8_t chr_idx,
                            const uint8_t *data, uint8_t len)
{
    if (svc_idx >= MAX_SERVICES || chr_idx >= MAX_CHARS_PER_SVC) {
        ESP_LOGE(TAG, "notify: invalid indices %d:%d", svc_idx, chr_idx);
        return false;
    }

    uint16_t val_handle = chr_val_handles[svc_idx][chr_idx];
    if (val_handle == 0) {
        ESP_LOGE(TAG, "notify: no handle for %d:%d", svc_idx, chr_idx);
        return false;
    }

    struct os_mbuf *om = ble_hs_mbuf_from_flat(data, len);
    if (!om) {
        ESP_LOGE(TAG, "notify: mbuf alloc failed");
        return false;
    }

    int rc = ble_gatts_notify_custom(0, val_handle, om);
    if (rc != 0) {
        ESP_LOGE(TAG, "notify: ble_gatts_notify_custom failed: %d", rc);
        return false;
    }

    ESP_LOGI(TAG, "notify: sent %d bytes on %d:%d", len, svc_idx, chr_idx);
    return true;
}

/* --------------------------------------------------------------------------
 * Command handlers
 * -------------------------------------------------------------------------- */

static void handle_add_service(const uint8_t *payload, uint8_t len)
{
    /* Payload: [svc_idx(1)] [uuid_128(16)] */
    if (len != 17) {
        ESP_LOGE(TAG, "ADD_SERVICE: invalid payload length");
        uart_transport_send_nack(CMD_ADD_SERVICE, ERR_INVALID_PAYLOAD);
        return;
    }

    uint8_t svc_idx = payload[0];
    if (svc_idx >= MAX_SERVICES) {
        ESP_LOGE(TAG, "ADD_SERVICE: index out of range");
        uart_transport_send_nack(CMD_ADD_SERVICE, ERR_SCHEMA_FULL);
        return;
    }

    service_def_t *svc = &g_schema.services[svc_idx];
    svc->svc_idx = svc_idx;
    memcpy(svc->uuid128, &payload[1], 16);
    svc->char_count = 0;

    if (svc_idx >= g_schema.service_count) {
        g_schema.service_count = svc_idx + 1;
    }

    ESP_LOGI(TAG, "ADD_SERVICE: idx=%d", svc_idx);
    uart_transport_send_ack(CMD_ADD_SERVICE);
}

static void handle_add_char(const uint8_t *payload, uint8_t len)
{
    /* Payload: [svc_idx(1)] [chr_idx(1)] [props(1)] [uuid_128(16)] [default_value(0-N)] */
    if (len < 19) {
        ESP_LOGE(TAG, "ADD_CHAR: invalid payload length");
        uart_transport_send_nack(CMD_ADD_CHAR, ERR_INVALID_PAYLOAD);
        return;
    }

    uint8_t svc_idx = payload[0];
    uint8_t chr_idx = payload[1];
    uint8_t props = payload[2];
    const uint8_t *uuid = &payload[3];
    const uint8_t *default_val = (len > 19) ? &payload[19] : NULL;
    uint8_t default_len = (len > 19) ? (len - 19) : 0;

    if (svc_idx >= g_schema.service_count) {
        ESP_LOGE(TAG, "ADD_CHAR: invalid service index");
        uart_transport_send_nack(CMD_ADD_CHAR, ERR_INVALID_PAYLOAD);
        return;
    }

    if (chr_idx >= MAX_CHARS_PER_SVC) {
        ESP_LOGE(TAG, "ADD_CHAR: char index out of range");
        uart_transport_send_nack(CMD_ADD_CHAR, ERR_SCHEMA_FULL);
        return;
    }

    if (default_len > MAX_DEFAULT_VALUE) {
        ESP_LOGE(TAG, "ADD_CHAR: default value too long");
        uart_transport_send_nack(CMD_ADD_CHAR, ERR_INVALID_PAYLOAD);
        return;
    }

    service_def_t *svc = &g_schema.services[svc_idx];
    char_def_t *chr = &svc->chars[chr_idx];

    chr->svc_idx = svc_idx;
    chr->chr_idx = chr_idx;
    chr->properties = props;
    memcpy(chr->uuid128, uuid, 16);
    chr->default_len = default_len;
    if (default_val && default_len > 0) {
        memcpy(chr->default_value, default_val, default_len);
    }

    if (chr_idx >= svc->char_count) {
        svc->char_count = chr_idx + 1;
    }

    ESP_LOGI(TAG, "ADD_CHAR: svc=%d chr=%d", svc_idx, chr_idx);
    uart_transport_send_ack(CMD_ADD_CHAR);
}

static void handle_apply_schema(void)
{
    /* Compute schema hash before registration */
    compute_schema_hash();

    if (!register_ble_schema()) {
        uart_transport_send_nack(CMD_APPLY_SCHEMA, ERR_APPLY_FAILED);
        return;
    }

    ESP_LOGI(TAG, "APPLY_SCHEMA: success");
    uart_transport_send_ack(CMD_APPLY_SCHEMA);
}

static void handle_set_device_name(const uint8_t *payload, uint8_t len)
{
    if (len == 0 || len > MAX_DEVICE_NAME) {
        ESP_LOGE(TAG, "SET_DEVICE_NAME: invalid length");
        uart_transport_send_nack(CMD_SET_DEVICE_NAME, ERR_INVALID_PAYLOAD);
        return;
    }

    esp_err_t rc = ble_set_device_name((const char *)payload, len);
    if (rc != ESP_OK) {
        uart_transport_send_nack(CMD_SET_DEVICE_NAME, ERR_INVALID_PAYLOAD);
        return;
    }

    uart_transport_send_ack(CMD_SET_DEVICE_NAME);
}

static void handle_set_adv_data(const uint8_t *payload, uint8_t len)
{
    if (len < 2) {
        ESP_LOGE(TAG, "SET_ADV_DATA: invalid length");
        uart_transport_send_nack(CMD_SET_ADV_DATA, ERR_INVALID_PAYLOAD);
        return;
    }

    uint16_t appearance = payload[0] | (payload[1] << 8);
    const uint8_t *mfr = (len > 2) ? &payload[2] : NULL;
    uint8_t mfr_len = (len > 2) ? (len - 2) : 0;

    if (mfr_len > MAX_MFR_DATA) {
        uart_transport_send_nack(CMD_SET_ADV_DATA, ERR_INVALID_PAYLOAD);
        return;
    }

    esp_err_t rc = ble_set_adv_data(appearance, mfr, mfr_len);
    if (rc != ESP_OK) {
        uart_transport_send_nack(CMD_SET_ADV_DATA, ERR_INVALID_PAYLOAD);
        return;
    }

    uart_transport_send_ack(CMD_SET_ADV_DATA);
}

static void handle_set_adv_uuids(const uint8_t *payload, uint8_t len)
{
    if (len == 0 || len % 2 != 0 || len > MAX_ADV_UUIDS * 2) {
        ESP_LOGE(TAG, "SET_ADV_UUIDS: invalid length");
        uart_transport_send_nack(CMD_SET_ADV_UUIDS, ERR_INVALID_PAYLOAD);
        return;
    }

    uint8_t count = len / 2;
    uint16_t uuids[MAX_ADV_UUIDS];
    for (uint8_t i = 0; i < count; i++) {
        uuids[i] = payload[i * 2] | (payload[i * 2 + 1] << 8);
    }

    esp_err_t rc = ble_set_adv_uuids(uuids, count);
    if (rc != ESP_OK) {
        uart_transport_send_nack(CMD_SET_ADV_UUIDS, ERR_INVALID_PAYLOAD);
        return;
    }

    uart_transport_send_ack(CMD_SET_ADV_UUIDS);
}

static void handle_ping(void)
{
    uart_transport_send_command(CMD_PONG, g_schema_hash, 4);
}

static void handle_notify_cmd(const uint8_t *payload, uint8_t len)
{
    /* Payload: [svc_idx(1)] [chr_idx(1)] [data...] */
    if (len < 2) {
        ESP_LOGE(TAG, "NOTIFY_CMD: invalid length");
        uart_transport_send_nack(CMD_NOTIFY, ERR_INVALID_PAYLOAD);
        return;
    }

    uint8_t svc_idx = payload[0];
    uint8_t chr_idx = payload[1];
    const uint8_t *data = &payload[2];
    uint8_t data_len = len - 2;

    send_ble_notify(svc_idx, chr_idx, data, data_len);
}

static void handle_read_response(const uint8_t *payload, uint8_t len)
{
    /* Payload: [svc_idx(1)] [chr_idx(1)] [data...] */
    if (len < 2) {
        ESP_LOGE(TAG, "READ_RESPONSE: invalid length");
        return;
    }

    uint8_t svc_idx = payload[0];
    uint8_t chr_idx = payload[1];
    uint8_t data_len = len - 2;

    /* Check if this response matches the pending read */
    if (svc_idx != g_read_resp_svc_idx || chr_idx != g_read_resp_chr_idx) {
        return;
    }

    if (data_len > MAX_DEFAULT_VALUE) {
        data_len = MAX_DEFAULT_VALUE;
    }

    memcpy(g_read_resp_buf, &payload[2], data_len);
    g_read_resp_len = data_len;
    g_read_resp_ready = true;
}

/* --------------------------------------------------------------------------
 * Transport callback: command handler
 * -------------------------------------------------------------------------- */

static void on_command(uint8_t cmd, const uint8_t *payload, uint8_t len)
{
    switch (cmd) {
    case CMD_ADD_SERVICE:
        handle_add_service(payload, len);
        break;
    case CMD_ADD_CHAR:
        handle_add_char(payload, len);
        break;
    case CMD_APPLY_SCHEMA:
        handle_apply_schema();
        break;
    case CMD_SET_DEVICE_NAME:
        handle_set_device_name(payload, len);
        break;
    case CMD_SET_ADV_DATA:
        handle_set_adv_data(payload, len);
        break;
    case CMD_SET_ADV_UUIDS:
        handle_set_adv_uuids(payload, len);
        break;
    case CMD_PING:
        handle_ping();
        break;
    case CMD_NOTIFY:
        handle_notify_cmd(payload, len);
        break;
    case CMD_READ_RESPONSE:
        handle_read_response(payload, len);
        break;
    default:
        ESP_LOGE(TAG, "Unknown command: 0x%02X", cmd);
        uart_transport_send_nack(cmd, ERR_INVALID_CMD);
        break;
    }
}

/* --------------------------------------------------------------------------
 * Transport callback: send bytes
 * -------------------------------------------------------------------------- */

static void send_bytes(const uint8_t *data, size_t len)
{
    uart_write_bytes_raw((uint8_t *)data, len);
}

/* --------------------------------------------------------------------------
 * Transport configuration
 * -------------------------------------------------------------------------- */

static const uart_transport_t g_transport = {
    .send_bytes = send_bytes,
    .on_command = on_command,
};

/* --------------------------------------------------------------------------
 * Public API
 * -------------------------------------------------------------------------- */

void ble_platform_init(void)
{
    memset(&g_schema, 0, sizeof(g_schema));
    memset(g_schema_hash, 0, sizeof(g_schema_hash));
    g_read_resp_ready = false;

    uart_transport_init(&g_transport);
    ESP_LOGI(TAG, "BLE platform initialized");
}

void ble_platform_on_write(uint8_t svc_idx, uint8_t chr_idx,
                           const uint8_t *data, uint8_t len)
{
    /* Send write event: [svc_idx][chr_idx][data...] */
    uint8_t payload[UART_TRANSPORT_MAX_PAYLOAD];
    payload[0] = svc_idx;
    payload[1] = chr_idx;

    uint8_t copy_len = len;
    if (copy_len > UART_TRANSPORT_MAX_PAYLOAD - 2) {
        copy_len = UART_TRANSPORT_MAX_PAYLOAD - 2;
    }
    if (data && copy_len > 0) {
        memcpy(&payload[2], data, copy_len);
    }

    uart_transport_send_command(CMD_CHAR_WRITE_EVT, payload, 2 + copy_len);

    /* Also update default value in schema for subsequent reads */
    if (svc_idx < g_schema.service_count) {
        service_def_t *svc = &g_schema.services[svc_idx];
        if (chr_idx < svc->char_count) {
            char_def_t *chr = &svc->chars[chr_idx];
            if (copy_len <= MAX_DEFAULT_VALUE) {
                memcpy(chr->default_value, data, copy_len);
                chr->default_len = copy_len;
            }
        }
    }
}

void ble_platform_on_read(uint8_t svc_idx, uint8_t chr_idx)
{
    g_read_resp_ready = false;
    g_read_resp_svc_idx = svc_idx;
    g_read_resp_chr_idx = chr_idx;

    uint8_t payload[2] = {svc_idx, chr_idx};
    uart_transport_send_command(CMD_CHAR_READ_EVT, payload, 2);
}

bool ble_platform_check_read_response(uint8_t *out_data, uint8_t *out_len)
{
    if (!g_read_resp_ready) {
        return false;
    }

    if (out_data && g_read_resp_len > 0) {
        memcpy(out_data, g_read_resp_buf, g_read_resp_len);
    }
    if (out_len) {
        *out_len = g_read_resp_len;
    }

    g_read_resp_ready = false;
    return true;
}

bool ble_platform_get_default_value(uint8_t svc_idx, uint8_t chr_idx,
                                    uint8_t *out_data, uint8_t *out_len)
{
    if (svc_idx >= g_schema.service_count) {
        return false;
    }

    service_def_t *svc = &g_schema.services[svc_idx];
    if (chr_idx >= svc->char_count) {
        return false;
    }

    char_def_t *chr = &svc->chars[chr_idx];
    if (out_data && chr->default_len > 0) {
        memcpy(out_data, chr->default_value, chr->default_len);
    }
    if (out_len) {
        *out_len = chr->default_len;
    }

    return true;
}
