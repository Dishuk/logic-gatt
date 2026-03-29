/**
 * Shared types between frontend, backend, and plugins
 *
 * These types define the wire protocol and plugin SDK.
 * Types are derived from Zod schemas using z.infer<>.
 */

import { z } from 'zod'

// Re-export zod for use by plugins
export { z }

// ============================================================================
// BLE GATT Limits
// ============================================================================

export const BLE_LIMITS = {
  MAX_SERVICES: 10,
  MAX_CHARACTERISTICS_PER_SERVICE: 20,
  MAX_DEVICE_NAME_BYTES: 29,
  MAX_APPEARANCE: 0xffff,
  MAX_MANUFACTURER_DATA_BYTES: 24,
  MAX_BYTE_VALUE: 255,
  MAX_PLUGIN_ID_LENGTH: 50,
} as const

// ============================================================================
// Primitive Schemas
// ============================================================================

/**
 * UUID in standard format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
export const UuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'UUID must be in format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  })

/**
 * Byte value (0-255)
 */
export const ByteSchema = z
  .number()
  .int()
  .min(0, 'Value must be integer 0-255')
  .max(BLE_LIMITS.MAX_BYTE_VALUE, 'Value must be integer 0-255')

/**
 * Byte array
 */
export const ByteArraySchema = z.array(ByteSchema)

/**
 * Plugin ID: lowercase alphanumeric and hyphens only
 */
export const PluginIdSchema = z
  .string()
  .min(1, 'Plugin ID cannot be empty')
  .max(BLE_LIMITS.MAX_PLUGIN_ID_LENGTH, `Plugin ID too long (max ${BLE_LIMITS.MAX_PLUGIN_ID_LENGTH} characters)`)
  .regex(/^[a-z0-9-]+$/, 'Plugin ID must only contain lowercase letters, numbers, and hyphens')

// ============================================================================
// Schema Types (wire format)
// ============================================================================

export const CharacteristicPropertiesSchema = z.object({
  read: z.boolean(),
  write: z.boolean(),
  notify: z.boolean(),
})

export const CharacteristicDefSchema = z.object({
  uuid: UuidSchema,
  name: z.string().optional(),
  properties: CharacteristicPropertiesSchema,
  defaultValue: ByteArraySchema.optional(),
})

export const ServiceDefSchema = z.object({
  uuid: UuidSchema,
  name: z.string().optional(),
  characteristics: z
    .array(CharacteristicDefSchema)
    .max(BLE_LIMITS.MAX_CHARACTERISTICS_PER_SERVICE, `Too many characteristics (max ${BLE_LIMITS.MAX_CHARACTERISTICS_PER_SERVICE})`),
})

export const SchemaSchema = z.object({
  services: z
    .array(ServiceDefSchema)
    .max(BLE_LIMITS.MAX_SERVICES, `Too many services (max ${BLE_LIMITS.MAX_SERVICES})`),
})

export const DeviceSettingsSchema = z.object({
  deviceName: z
    .string()
    .min(1, 'deviceName cannot be empty')
    .refine(
      (name) => new TextEncoder().encode(name).length <= BLE_LIMITS.MAX_DEVICE_NAME_BYTES,
      `deviceName too long (max ${BLE_LIMITS.MAX_DEVICE_NAME_BYTES} bytes)`
    ),
  appearance: z
    .number()
    .int()
    .min(0)
    .max(BLE_LIMITS.MAX_APPEARANCE)
    .optional(),
  manufacturerData: ByteArraySchema
    .max(BLE_LIMITS.MAX_MANUFACTURER_DATA_BYTES, `manufacturerData too long (max ${BLE_LIMITS.MAX_MANUFACTURER_DATA_BYTES} bytes)`)
    .optional(),
  serviceUuids16Bit: z.array(z.string()).optional(),
})

// Derive TypeScript types from schemas
export type CharacteristicDef = z.infer<typeof CharacteristicDefSchema>
export type ServiceDef = z.infer<typeof ServiceDefSchema>
export type Schema = z.infer<typeof SchemaSchema>
export type DeviceSettings = z.infer<typeof DeviceSettingsSchema>

// ============================================================================
// Plugin Events (Backend -> Frontend via WebSocket)
// ============================================================================

export const PluginEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('char-write'), serviceUuid: z.string(), charUuid: z.string(), data: ByteArraySchema }),
  z.object({ type: z.literal('char-read'), serviceUuid: z.string(), charUuid: z.string() }),
  z.object({ type: z.literal('connected') }),
  z.object({ type: z.literal('disconnected'), reason: z.string().optional() }),
  z.object({ type: z.literal('error'), message: z.string() }),
  z.object({ type: z.literal('log'), message: z.string() }),
  z.object({ type: z.literal('schema-mismatch') }),
  z.object({ type: z.literal('adv-started') }),
  z.object({ type: z.literal('adv-failed'), stage: z.string(), errorCode: z.number() }),
])

export type PluginEvent = z.infer<typeof PluginEventSchema>

// ============================================================================
// Plugin Commands (Frontend -> Backend via WebSocket)
// ============================================================================

export const UploadSchemaCommandSchema = z.object({
  type: z.literal('upload-schema'),
  schema: SchemaSchema,
  settings: DeviceSettingsSchema,
})

export const ConnectCommandSchema = z.object({
  type: z.literal('connect'),
})

export const DisconnectCommandSchema = z.object({
  type: z.literal('disconnect'),
})

export const NotifyCommandSchema = z.object({
  type: z.literal('notify'),
  serviceUuid: UuidSchema,
  charUuid: UuidSchema,
  data: ByteArraySchema,
})

export const RespondToReadCommandSchema = z.object({
  type: z.literal('respond-to-read'),
  serviceUuid: UuidSchema,
  charUuid: UuidSchema,
  data: ByteArraySchema,
})

export const PluginCommandSchema = z.discriminatedUnion('type', [
  UploadSchemaCommandSchema,
  ConnectCommandSchema,
  DisconnectCommandSchema,
  NotifyCommandSchema,
  RespondToReadCommandSchema,
])

export type PluginCommand = z.infer<typeof PluginCommandSchema>

export const VALID_COMMAND_TYPES = ['upload-schema', 'connect', 'disconnect', 'notify', 'respond-to-read'] as const
export type CommandType = (typeof VALID_COMMAND_TYPES)[number]

// ============================================================================
// Validation
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

/**
 * Convert Zod parse result to ValidationResult format
 */
export function zodToValidationResult<T>(result: z.ZodSafeParseResult<T>): ValidationResult {
  if (result.success) {
    return { valid: true, errors: [] }
  }
  return {
    valid: false,
    errors: result.error.issues.map((issue: z.core.$ZodIssue) => {
      const path = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
      return `${path}${issue.message}`
    }),
  }
}

// ============================================================================
// Plugin Info (Backend -> Frontend via REST)
// ============================================================================

/**
 * UI metadata for plugin actions.
 * Allows plugins to declare how their actions should be rendered in the connect modal.
 */
export interface PluginActionUI {
  /**
   * How to display this action:
   * - 'hidden': Don't show in UI (internal/prerequisite actions)
   * - 'button': Show as a clickable button
   * - 'select-source': GET endpoint that returns selectable options [{value, label, description?}]
   * - 'select-target': POST endpoint called when user selects an option (linked via fieldId)
   * - 'status': GET endpoint for polling status, returns {running: boolean, ...}
   * - 'status-start': POST button shown when status.running is false
   * - 'status-stop': POST button shown when status.running is true
   */
  display: 'hidden' | 'button' | 'select-source' | 'select-target' | 'status' | 'status-start' | 'status-stop'

  /** Groups related actions (e.g., port list + port select share fieldId 'port') */
  fieldId?: string

  /** Label for the field group (shown above select/status) */
  fieldLabel?: string

  /** Polling interval in ms for status endpoints */
  refreshMs?: number

  /** If true, user must complete this action before Connect is enabled */
  requiredForConnect?: boolean
}

export interface PluginAction {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  label: string
  description?: string
  ui?: PluginActionUI
}

export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  icon?: string
  color?: string
  actions: PluginAction[]
  isAvailable: boolean
}

// ============================================================================
// Plugin Manifest
// ============================================================================

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  icon?: string
  color?: string
}

// ============================================================================
// Plugin SDK - Context and Base Class
// ============================================================================

/**
 * Context provided to plugins by the backend system.
 * The actual implementation is provided by the backend.
 */
export interface PluginContext {
  /** Unique plugin identifier */
  pluginId: string

  /** Absolute path to plugin directory */
  pluginDir: string

  /** Log a message (visible in server console and frontend) */
  log(msg: string): void

  /** Broadcast an event to all connected WebSocket clients */
  broadcast(event: PluginEvent): void
}

/**
 * Plugin route definition.
 * Handler type is generic to allow backend to specify express types.
 */
export interface PluginRoute<THandler = unknown> {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  label: string
  description?: string
  handler: THandler
  ui?: PluginActionUI
}

/**
 * Abstract base class for plugins.
 * All plugins must extend this class and implement the required callbacks.
 */
export abstract class PluginBase {
  protected ctx: PluginContext

  constructor(context: PluginContext) {
    this.ctx = context
  }

  // =========================================================================
  // REQUIRED: Operational callbacks (must implement)
  // =========================================================================

  /** Called when frontend uploads a GATT schema */
  abstract onUploadSchema(schema: Schema, settings: DeviceSettings): Promise<void>

  /** Called when frontend requests connection */
  abstract onConnect(): Promise<void>

  /** Called when frontend requests disconnection */
  abstract onDisconnect(): Promise<void>

  /** Called when frontend wants to send a BLE notification */
  abstract onNotify(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void>

  /** Called when frontend responds to a BLE read request */
  abstract onRespondToRead(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void>

  // =========================================================================
  // OPTIONAL: Lifecycle hooks (can override)
  // =========================================================================

  /** Called when plugin is loaded */
  async onLoad(): Promise<void> {}

  /** Called when plugin is unloaded */
  async onUnload(): Promise<void> {}

  // =========================================================================
  // OPTIONAL: Custom REST actions
  // =========================================================================

  /** Return custom REST routes for this plugin */
  getRoutes(): PluginRoute<unknown>[] {
    return []
  }

  // =========================================================================
  // OPTIONAL: Availability check
  // =========================================================================

  /** Check if plugin can work in current environment */
  isAvailable(): boolean {
    return true
  }
}
