/**
 * Backend WebSocket Connection
 *
 * Implements TransportConnection interface using WebSocket communication
 * with the backend server. All commands are forwarded to the active plugin.
 */

import type { Schema, DeviceSettings } from '../../types'
import type { TransportConnection, TransportEventHandler, TransportEvent } from './types'

const WS_URL = `ws://${window.location.host}/ws`
const CONNECTION_TIMEOUT_MS = 10000

interface WsMessage {
  type: string
  [key: string]: unknown
}

export class BackendConnection implements TransportConnection {
  private ws: WebSocket | null = null
  private eventHandlers = new Set<TransportEventHandler>()
  private connected = false

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.ws) {
          this.ws.close()
          this.ws = null
        }
        reject(new Error(`WebSocket connection timed out after ${CONNECTION_TIMEOUT_MS / 1000}s`))
      }, CONNECTION_TIMEOUT_MS)

      this.ws = new WebSocket(WS_URL)

      this.ws.onopen = () => {
        clearTimeout(timeoutId)
        console.log('[ws] Connected to backend')
        this.connected = true
        resolve()
      }

      this.ws.onerror = err => {
        clearTimeout(timeoutId)
        console.error('[ws] WebSocket error:', err)
        reject(new Error('WebSocket connection failed'))
      }

      this.ws.onclose = () => {
        console.log('[ws] WebSocket closed')
        this.connected = false
        this.emit({ type: 'disconnected', reason: 'WebSocket closed' })
      }

      this.ws.onmessage = event => {
        try {
          const msg: WsMessage = JSON.parse(event.data)
          this.handleMessage(msg)
        } catch (err) {
          console.error('[ws] Failed to parse message:', err)
        }
      }
    })
  }

  private handleMessage(msg: WsMessage): void {
    switch (msg.type) {
      case 'char-write':
        this.emit({
          type: 'char-write',
          serviceUuid: msg.serviceUuid as string,
          charUuid: msg.charUuid as string,
          data: new Uint8Array(msg.data as number[]),
        })
        break

      case 'char-read':
        this.emit({
          type: 'char-read',
          serviceUuid: msg.serviceUuid as string,
          charUuid: msg.charUuid as string,
        })
        break

      case 'connected':
        this.emit({ type: 'connected' })
        break

      case 'disconnected':
        this.emit({ type: 'disconnected', reason: msg.reason as string | undefined })
        break

      case 'error':
        this.emit({ type: 'error', message: msg.message as string })
        break

      case 'schema-mismatch':
        this.emit({ type: 'schema-mismatch' })
        break

      case 'log':
        this.emit({ type: 'log', message: msg.message as string })
        break

      case 'adv-started':
        this.emit({ type: 'adv-started' })
        break

      case 'adv-failed':
        this.emit({
          type: 'adv-failed',
          stage: msg.stage as string,
          errorCode: msg.errorCode as number,
        })
        break

      default:
        console.log('[ws] Unknown message type:', msg.type)
    }
  }

  private emit(event: TransportEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event)
    }
  }

  private send(msg: WsMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else {
      throw new Error('WebSocket not connected')
    }
  }

  async uploadSchema(schema: Schema, settings: DeviceSettings, log: (msg: string) => void): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to backend')
    }

    // Convert schema to backend format (with number[] instead of Uint8Array for defaultValue)
    const backendSchema = {
      services: schema.map(svc => ({
        uuid: svc.uuid,
        name: svc.tag || svc.uuid, // Use tag as name, fallback to uuid
        characteristics: svc.characteristics.map(chr => ({
          uuid: chr.uuid,
          name: chr.tag || chr.uuid, // Use tag as name, fallback to uuid
          properties: chr.properties,
          defaultValue: chr.defaultValue ? Array.from(hexStringToBytes(chr.defaultValue)) : undefined,
        })),
      })),
    }

    // Convert settings
    const backendSettings = {
      deviceName: settings.deviceName,
      appearance: settings.appearance,
      manufacturerData: settings.manufacturerData ? Array.from(hexStringToBytes(settings.manufacturerData)) : [],
      serviceUuids16Bit: [], // Not used in current frontend settings
    }

    log('Uploading schema to backend...')
    this.send({
      type: 'upload-schema',
      schema: backendSchema,
      settings: backendSettings,
    })

    // The backend will send log messages and connected/error events
  }

  async notify(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void> {
    this.send({
      type: 'notify',
      serviceUuid,
      charUuid,
      data: Array.from(data),
    })
  }

  async respondToRead(serviceUuid: string, charUuid: string, data: Uint8Array): Promise<void> {
    this.send({
      type: 'respond-to-read',
      serviceUuid,
      charUuid,
      data: Array.from(data),
    })
  }

  onEvent(handler: TransportEventHandler): () => void {
    this.eventHandlers.add(handler)
    return () => {
      this.eventHandlers.delete(handler)
    }
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      try {
        this.send({ type: 'disconnect' })
      } catch {
        // Ignore - socket may already be closed
      }
      this.ws.close()
      this.ws = null
    }
    this.connected = false
  }

  /**
   * Send connect command to plugin
   */
  async requestConnect(): Promise<void> {
    this.send({ type: 'connect' })
  }
}

/**
 * Parse a hex string (space-separated bytes) into a Uint8Array.
 */
function hexStringToBytes(hex: string): Uint8Array {
  const trimmed = hex.trim()
  if (!trimmed) return new Uint8Array()
  const tokens = trimmed.split(/\s+/).filter(Boolean)
  return new Uint8Array(
    tokens.map(t => {
      const val = parseInt(t, 16)
      if (Number.isNaN(val)) {
        console.warn(`[hexStringToBytes] Invalid hex token: "${t}"`)
        return 0
      }
      return val & 0xff
    })
  )
}
