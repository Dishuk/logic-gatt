
#include "esp_log.h"
#include "esp_err.h"

#define TRY_INIT(fn)                                             \
  do                                                             \
  {                                                              \
    esp_err_t err = fn;                                          \
    if (err != ESP_OK)                                           \
    {                                                            \
      ESP_LOGE("INIT", #fn " failed: %s", esp_err_to_name(err)); \
      rc = err;                                                  \
    }                                                            \
  } while (0)

void handler_thread(void);