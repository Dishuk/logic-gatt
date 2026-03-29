/**
 * Input validation utilities
 *
 * Validates inputs using Zod schemas from @logic-gatt/shared.
 */

import {
  type ValidationResult,
  UuidSchema,
  SchemaSchema,
  DeviceSettingsSchema,
  PluginCommandSchema,
  PluginIdSchema,
  NotifyCommandSchema,
  RespondToReadCommandSchema,
  zodToValidationResult,
  VALID_COMMAND_TYPES,
  type CommandType,
} from '@logic-gatt/shared'

// Re-export for backwards compatibility
export { VALID_COMMAND_TYPES, type CommandType }

/**
 * Validate a UUID string format.
 */
export function validateUuid(uuid: string): ValidationResult {
  return zodToValidationResult(UuidSchema.safeParse(uuid))
}

/**
 * Validate schema structure.
 */
export function validateSchema(schema: unknown): ValidationResult {
  return zodToValidationResult(SchemaSchema.safeParse(schema))
}

/**
 * Validate device settings.
 */
export function validateDeviceSettings(settings: unknown): ValidationResult {
  return zodToValidationResult(DeviceSettingsSchema.safeParse(settings))
}

/**
 * Validate a WebSocket command.
 */
export function validateWsCommand(command: unknown): ValidationResult {
  return zodToValidationResult(PluginCommandSchema.safeParse(command))
}

/**
 * Validate plugin ID format.
 */
export function validatePluginId(pluginId: string): ValidationResult {
  return zodToValidationResult(PluginIdSchema.safeParse(pluginId))
}

/**
 * Validate characteristic command fields (notify/respond-to-read).
 */
export function validateCharCommand(command: {
  serviceUuid: unknown
  charUuid: unknown
  data: unknown
}): ValidationResult {
  // Use the notify schema structure for validation (same as respond-to-read)
  const parseResult = NotifyCommandSchema.omit({ type: true }).safeParse(command)
  return zodToValidationResult(parseResult)
}
