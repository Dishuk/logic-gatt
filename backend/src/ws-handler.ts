/**
 * WebSocket Handler
 *
 * Handles WebSocket connections for real-time communication between
 * frontend and plugins. All operational events flow through here.
 *
 * Protocol:
 * - Frontend → Backend: { type: 'upload-schema' | 'connect' | 'disconnect' | 'notify' | 'respond-to-read', ... }
 * - Backend → Frontend: { type: 'char-write' | 'char-read' | 'connected' | 'disconnected' | 'error' | 'log', ... }
 */

import { Server as HttpServer } from 'http'
import { WebSocket, WebSocketServer } from 'ws'

import { getPlugin, setBroadcastFunction, getActivePluginId } from './plugin-loader.js'
import { validateWsCommand, validateSchema, validateDeviceSettings, validateCharCommand } from './validation.js'
import type { PluginCommand, PluginEvent } from '@logic-gatt/shared'

const connectedClients = new Set<WebSocket>()

function broadcast(event: PluginEvent): void {
  const message = JSON.stringify(event)

  for (const client of connectedClients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(message)
      } catch (err) {
        console.error('[ws] Failed to send to client:', err)
      }
    }
  }
}

async function handleCommand(ws: WebSocket, command: PluginCommand): Promise<void> {
  const cmdValidation = validateWsCommand(command)
  if (!cmdValidation.valid) {
    ws.send(JSON.stringify({ type: 'error', message: `Invalid command: ${cmdValidation.errors.join(', ')}` }))
    return
  }

  const activePluginId = getActivePluginId()
  const plugin = activePluginId ? getPlugin(activePluginId) : null
  if (!plugin) {
    ws.send(JSON.stringify({ type: 'error', message: 'No active plugin selected' }))
    return
  }

  try {
    switch (command.type) {
      case 'upload-schema': {
        const schemaValidation = validateSchema(command.schema)
        if (!schemaValidation.valid) {
          ws.send(JSON.stringify({ type: 'error', message: `Invalid schema: ${schemaValidation.errors.slice(0, 3).join(', ')}${schemaValidation.errors.length > 3 ? '...' : ''}` }))
          return
        }

        const settingsValidation = validateDeviceSettings(command.settings)
        if (!settingsValidation.valid) {
          ws.send(JSON.stringify({ type: 'error', message: `Invalid settings: ${settingsValidation.errors.join(', ')}` }))
          return
        }

        await plugin.onUploadSchema(command.schema, command.settings)
        break
      }

      case 'connect':
        await plugin.onConnect()
        break

      case 'disconnect':
        await plugin.onDisconnect()
        break

      case 'notify': {
        const charValidation = validateCharCommand(command)
        if (!charValidation.valid) {
          ws.send(JSON.stringify({ type: 'error', message: charValidation.errors.join(', ') }))
          return
        }

        await plugin.onNotify(command.serviceUuid, command.charUuid, new Uint8Array(command.data))
        break
      }

      case 'respond-to-read': {
        const charValidation = validateCharCommand(command)
        if (!charValidation.valid) {
          ws.send(JSON.stringify({ type: 'error', message: charValidation.errors.join(', ') }))
          return
        }

        await plugin.onRespondToRead(command.serviceUuid, command.charUuid, new Uint8Array(command.data))
        break
      }

      default:
        console.warn(`[ws] Unknown command type: ${(command as { type: string }).type}`)
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown command type' }))
    }
  } catch (err) {
    console.error(`[ws] Command handler error:`, err)
    ws.send(
      JSON.stringify({
        type: 'error',
        message: err instanceof Error ? err.message : 'Command handler error',
      })
    )
  }
}

export function setupWebSocket(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/ws' })

  setBroadcastFunction(broadcast)

  wss.on('connection', (ws: WebSocket) => {
    console.log('[ws] Client connected')
    connectedClients.add(ws)

    ws.on('message', async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        console.log(`[ws] Received: ${message.type}`)
        await handleCommand(ws, message as PluginCommand)
      } catch (err) {
        console.error('[ws] Failed to parse message:', err)
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }))
      }
    })

    ws.on('close', () => {
      console.log('[ws] Client disconnected')
      connectedClients.delete(ws)
    })

    ws.on('error', (err) => {
      console.error('[ws] WebSocket error:', err)
      // Don't delete from connectedClients here - close event handles cleanup
    })

    ws.send(
      JSON.stringify({
        type: 'log',
        message: `Connected to backend. Active plugin: ${getActivePluginId() ?? 'none'}`,
      })
    )
  })

  console.log('[ws] WebSocket server listening on /ws')
}
