/**
 * Input validation utilities
 *
 * Validates inputs for security and correctness.
 */

import type { ValidationResult } from '@logic-gatt/shared'

// BLE GATT limits
const MAX_SERVICES = 10
const MAX_CHARACTERISTICS_PER_SERVICE = 20
const MAX_DEVICE_NAME_BYTES = 29
const MAX_APPEARANCE = 0xffff
const MAX_MANUFACTURER_DATA_BYTES = 24
const MAX_BYTE_VALUE = 255
const MAX_PLUGIN_ID_LENGTH = 50

export const VALID_COMMAND_TYPES = ['upload-schema', 'connect', 'disconnect', 'notify', 'respond-to-read'] as const
export type CommandType = (typeof VALID_COMMAND_TYPES)[number]

/**
 * Validate a UUID string format.
 */
export function validateUuid(uuid: string): ValidationResult {
  const errors: string[] = []

  if (typeof uuid !== 'string') {
    return { valid: false, errors: ['UUID must be a string'] }
  }

  // Standard UUID format: 8-4-4-4-12
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(uuid)) {
    errors.push('UUID must be in format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate schema structure.
 */
export function validateSchema(schema: unknown): ValidationResult {
  const errors: string[] = []

  if (!schema || typeof schema !== 'object') {
    return { valid: false, errors: ['Schema must be an object'] }
  }

  const s = schema as { services?: unknown }

  if (!Array.isArray(s.services)) {
    return { valid: false, errors: ['Schema must have a services array'] }
  }

  // BLE GATT practical limit
  if (s.services.length > MAX_SERVICES) {
    errors.push(`Too many services (max ${MAX_SERVICES})`)
  }

  // Validate each service
  for (let i = 0; i < s.services.length; i++) {
    const service = s.services[i] as { uuid?: string; characteristics?: unknown[] }

    if (!service || typeof service !== 'object') {
      errors.push(`Service ${i}: must be an object`)
      continue
    }

    // Validate service UUID
    if (!service.uuid) {
      errors.push(`Service ${i}: missing uuid`)
    } else {
      const uuidResult = validateUuid(service.uuid)
      if (!uuidResult.valid) {
        errors.push(`Service ${i}: ${uuidResult.errors.join(', ')}`)
      }
    }

    // Validate characteristics
    if (!Array.isArray(service.characteristics)) {
      errors.push(`Service ${i}: must have characteristics array`)
      continue
    }

    if (service.characteristics.length > MAX_CHARACTERISTICS_PER_SERVICE) {
      errors.push(`Service ${i}: too many characteristics (max ${MAX_CHARACTERISTICS_PER_SERVICE})`)
    }

    for (let j = 0; j < service.characteristics.length; j++) {
      const char = service.characteristics[j] as {
        uuid?: string
        properties?: { read?: boolean; write?: boolean; notify?: boolean }
        defaultValue?: number[]
      }

      if (!char || typeof char !== 'object') {
        errors.push(`Service ${i}, Char ${j}: must be an object`)
        continue
      }

      // Validate char UUID
      if (!char.uuid) {
        errors.push(`Service ${i}, Char ${j}: missing uuid`)
      } else {
        const uuidResult = validateUuid(char.uuid)
        if (!uuidResult.valid) {
          errors.push(`Service ${i}, Char ${j}: ${uuidResult.errors.join(', ')}`)
        }
      }

      // Validate properties
      if (!char.properties || typeof char.properties !== 'object') {
        errors.push(`Service ${i}, Char ${j}: missing or invalid properties`)
      } else {
        if (typeof char.properties.read !== 'boolean') {
          errors.push(`Service ${i}, Char ${j}: properties.read must be boolean`)
        }
        if (typeof char.properties.write !== 'boolean') {
          errors.push(`Service ${i}, Char ${j}: properties.write must be boolean`)
        }
        if (typeof char.properties.notify !== 'boolean') {
          errors.push(`Service ${i}, Char ${j}: properties.notify must be boolean`)
        }
      }

      // Validate defaultValue if present
      if (char.defaultValue !== undefined) {
        if (!Array.isArray(char.defaultValue)) {
          errors.push(`Service ${i}, Char ${j}: defaultValue must be an array`)
        } else {
          for (let k = 0; k < char.defaultValue.length; k++) {
            const byte = char.defaultValue[k]
            if (typeof byte !== 'number' || byte < 0 || byte > MAX_BYTE_VALUE || !Number.isInteger(byte)) {
              errors.push(`Service ${i}, Char ${j}: defaultValue[${k}] must be integer 0-${MAX_BYTE_VALUE}`)
            }
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate device settings.
 */
export function validateDeviceSettings(settings: unknown): ValidationResult {
  const errors: string[] = []

  if (!settings || typeof settings !== 'object') {
    return { valid: false, errors: ['Settings must be an object'] }
  }

  const s = settings as {
    deviceName?: string
    appearance?: number
    manufacturerData?: number[]
  }

  // Validate deviceName
  if (typeof s.deviceName !== 'string') {
    errors.push('deviceName must be a string')
  } else if (s.deviceName.length === 0) {
    errors.push('deviceName cannot be empty')
  } else if (new TextEncoder().encode(s.deviceName).length > MAX_DEVICE_NAME_BYTES) {
    errors.push(`deviceName too long (max ${MAX_DEVICE_NAME_BYTES} bytes)`)
  }

  // Validate appearance
  if (s.appearance !== undefined) {
    if (typeof s.appearance !== 'number' || !Number.isInteger(s.appearance)) {
      errors.push('appearance must be an integer')
    } else if (s.appearance < 0 || s.appearance > MAX_APPEARANCE) {
      errors.push(`appearance must be 0-${MAX_APPEARANCE}`)
    }
  }

  // Validate manufacturerData
  if (s.manufacturerData !== undefined) {
    if (!Array.isArray(s.manufacturerData)) {
      errors.push('manufacturerData must be an array')
    } else {
      if (s.manufacturerData.length > MAX_MANUFACTURER_DATA_BYTES) {
        errors.push(`manufacturerData too long (max ${MAX_MANUFACTURER_DATA_BYTES} bytes)`)
      }
      for (let i = 0; i < s.manufacturerData.length; i++) {
        const byte = s.manufacturerData[i]
        if (typeof byte !== 'number' || byte < 0 || byte > MAX_BYTE_VALUE || !Number.isInteger(byte)) {
          errors.push(`manufacturerData[${i}] must be integer 0-${MAX_BYTE_VALUE}`)
        }
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate a WebSocket command.
 */
export function validateWsCommand(command: unknown): ValidationResult {
  const errors: string[] = []

  if (!command || typeof command !== 'object') {
    return { valid: false, errors: ['Command must be an object'] }
  }

  const cmd = command as { type?: string }

  if (typeof cmd.type !== 'string') {
    return { valid: false, errors: ['Command must have a type string'] }
  }

  if (!VALID_COMMAND_TYPES.includes(cmd.type as CommandType)) {
    errors.push(`Unknown command type: ${cmd.type}`)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate plugin ID format.
 */
export function validatePluginId(pluginId: string): ValidationResult {
  const errors: string[] = []

  if (typeof pluginId !== 'string') {
    return { valid: false, errors: ['Plugin ID must be a string'] }
  }

  if (!pluginId) {
    return { valid: false, errors: ['Plugin ID cannot be empty'] }
  }

  // Only allow lowercase alphanumeric and hyphens
  if (!/^[a-z0-9-]+$/.test(pluginId)) {
    errors.push('Plugin ID must only contain lowercase letters, numbers, and hyphens')
  }

  if (pluginId.length > MAX_PLUGIN_ID_LENGTH) {
    errors.push(`Plugin ID too long (max ${MAX_PLUGIN_ID_LENGTH} characters)`)
  }

  return { valid: errors.length === 0, errors }
}

/**
 * Validate characteristic command fields (notify/respond-to-read).
 */
export function validateCharCommand(command: {
  serviceUuid: unknown
  charUuid: unknown
  data: unknown
}): ValidationResult {
  const errors: string[] = []

  if (typeof command.serviceUuid !== 'string') {
    return { valid: false, errors: ['serviceUuid must be a string'] }
  }
  const svcResult = validateUuid(command.serviceUuid)
  if (!svcResult.valid) {
    errors.push(`Invalid serviceUuid: ${svcResult.errors.join(', ')}`)
  }

  if (typeof command.charUuid !== 'string') {
    return { valid: false, errors: ['charUuid must be a string'] }
  }
  const charResult = validateUuid(command.charUuid)
  if (!charResult.valid) {
    errors.push(`Invalid charUuid: ${charResult.errors.join(', ')}`)
  }

  if (!Array.isArray(command.data)) {
    errors.push('data must be an array of bytes')
  } else {
    for (let i = 0; i < command.data.length; i++) {
      const byte = command.data[i]
      if (typeof byte !== 'number' || byte < 0 || byte > MAX_BYTE_VALUE || !Number.isInteger(byte)) {
        errors.push(`data[${i}] must be integer 0-${MAX_BYTE_VALUE}`)
        break // Only report first error
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

