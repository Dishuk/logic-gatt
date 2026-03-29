/**
 * Shared types between frontend, backend, and plugins
 *
 * These types define the wire protocol and plugin SDK.
 */

// ============================================================================
// Schema Types (wire format)
// ============================================================================

export interface CharacteristicDef {
  uuid: string
  name: string
  properties: {
    read: boolean
    write: boolean
    notify: boolean
  }
  defaultValue?: number[]
}

export interface ServiceDef {
  uuid: string
  name: string
  characteristics: CharacteristicDef[]
}

export interface Schema {
  services: ServiceDef[]
}

export interface DeviceSettings {
  deviceName: string
  appearance?: number
  manufacturerData?: number[]
  serviceUuids16Bit?: string[]
}

// ============================================================================
// Plugin Events (Backend → Frontend via WebSocket)
// ============================================================================

export type PluginEvent =
  | { type: 'char-write'; serviceUuid: string; charUuid: string; data: number[] }
  | { type: 'char-read'; serviceUuid: string; charUuid: string }
  | { type: 'connected' }
  | { type: 'disconnected'; reason?: string }
  | { type: 'error'; message: string }
  | { type: 'log'; message: string }
  | { type: 'schema-mismatch' }
  | { type: 'adv-started' }
  | { type: 'adv-failed'; stage: string; errorCode: number }

// ============================================================================
// Plugin Commands (Frontend → Backend via WebSocket)
// ============================================================================

export type PluginCommand =
  | { type: 'upload-schema'; schema: Schema; settings: DeviceSettings }
  | { type: 'connect' }
  | { type: 'disconnect' }
  | { type: 'notify'; serviceUuid: string; charUuid: string; data: number[] }
  | { type: 'respond-to-read'; serviceUuid: string; charUuid: string; data: number[] }

// ============================================================================
// Validation
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

// ============================================================================
// Plugin Info (Backend → Frontend via REST)
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
