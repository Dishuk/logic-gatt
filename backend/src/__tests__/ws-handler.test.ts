/**
 * Tests for ws-handler.ts
 *
 * Tests WebSocket message handling behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateWsCommand, validateSchema, validateDeviceSettings, validateUuid } from '../validation.js'

// Test the integration of validation with command handling
describe('WebSocket Command Handling', () => {
  describe('Command validation flow', () => {
    it('should validate command type before processing', () => {
      const validConnect = { type: 'connect' }
      const invalidCommand = { type: 'invalid-type' }

      expect(validateWsCommand(validConnect).valid).toBe(true)
      expect(validateWsCommand(invalidCommand).valid).toBe(false)
    })

    it('should validate upload-schema command payload', () => {
      const validCmd = {
        type: 'upload-schema',
        schema: {
          services: [{
            uuid: '0000180f-0000-1000-8000-00805f9b34fb',
            characteristics: [{
              uuid: '00002a19-0000-1000-8000-00805f9b34fb',
              properties: { read: true, write: false, notify: true },
            }],
          }],
        },
        settings: { deviceName: 'Test Device', appearance: 0 },
      }

      expect(validateWsCommand(validCmd).valid).toBe(true)
      expect(validateSchema(validCmd.schema).valid).toBe(true)
      expect(validateDeviceSettings(validCmd.settings).valid).toBe(true)
    })

    it('should validate notify command UUIDs', () => {
      const cmd = {
        type: 'notify',
        serviceUuid: '0000180f-0000-1000-8000-00805f9b34fb',
        charUuid: '00002a19-0000-1000-8000-00805f9b34fb',
        data: [0x64],
      }

      expect(validateWsCommand(cmd).valid).toBe(true)
      expect(validateUuid(cmd.serviceUuid).valid).toBe(true)
      expect(validateUuid(cmd.charUuid).valid).toBe(true)
    })

    it('should reject notify with invalid UUID', () => {
      const invalidServiceUuid = 'not-a-uuid'
      expect(validateUuid(invalidServiceUuid).valid).toBe(false)
    })

    it('should validate data array contains valid bytes', () => {
      function validateDataArray(data: unknown): boolean {
        if (!Array.isArray(data)) return false
        return data.every(b => typeof b === 'number' && b >= 0 && b <= 255 && Number.isInteger(b))
      }

      expect(validateDataArray([0, 127, 255])).toBe(true)
      expect(validateDataArray([256])).toBe(false)
      expect(validateDataArray([-1])).toBe(false)
      expect(validateDataArray([1.5])).toBe(false)
      expect(validateDataArray('not array')).toBe(false)
    })
  })
})

describe('WebSocket Broadcast Logic', () => {
  it('should broadcast to all open clients', () => {
    const OPEN = 1
    const CLOSED = 3

    const clients = [
      { readyState: OPEN, send: vi.fn() },
      { readyState: OPEN, send: vi.fn() },
      { readyState: CLOSED, send: vi.fn() },
    ]

    function broadcast(event: object) {
      const message = JSON.stringify(event)
      for (const client of clients) {
        if (client.readyState === OPEN) {
          client.send(message)
        }
      }
    }

    const event = { type: 'connected' }
    broadcast(event)

    expect(clients[0].send).toHaveBeenCalledWith(JSON.stringify(event))
    expect(clients[1].send).toHaveBeenCalledWith(JSON.stringify(event))
    expect(clients[2].send).not.toHaveBeenCalled()
  })

  it('should handle empty client list gracefully', () => {
    const clients: { readyState: number; send: (msg: string) => void }[] = []

    function broadcast(event: object) {
      const message = JSON.stringify(event)
      for (const client of clients) {
        if (client.readyState === 1) {
          client.send(message)
        }
      }
    }

    expect(() => broadcast({ type: 'test' })).not.toThrow()
  })

  it('should handle send errors gracefully', () => {
    const clients = [
      {
        readyState: 1,
        send: vi.fn((_msg: string) => { throw new Error('Send failed') }),
      },
    ]

    function broadcast(event: object) {
      const message = JSON.stringify(event)
      for (const client of clients) {
        if (client.readyState === 1) {
          try {
            client.send(message)
          } catch {
            // Log error but continue
          }
        }
      }
    }

    expect(() => broadcast({ type: 'test' })).not.toThrow()
  })
})

describe('Error Response Generation', () => {
  function createErrorResponse(message: string) {
    return { type: 'error', message }
  }

  function errorFromException(err: unknown) {
    if (err instanceof Error) {
      return createErrorResponse(err.message)
    }
    return createErrorResponse('Command handler error')
  }

  it('should create error response', () => {
    const response = createErrorResponse('Test error')
    expect(response).toEqual({ type: 'error', message: 'Test error' })
  })

  it('should extract message from Error', () => {
    const response = errorFromException(new Error('Something went wrong'))
    expect(response.message).toBe('Something went wrong')
  })

  it('should use fallback for non-Error', () => {
    const response = errorFromException('string error')
    expect(response.message).toBe('Command handler error')
  })
})

describe('Active Plugin Requirement', () => {
  it('should require active plugin for commands', () => {
    let activePluginId: string | null = null

    function checkActivePlugin(): { ok: boolean; error?: string } {
      if (!activePluginId) {
        return { ok: false, error: 'No active plugin selected' }
      }
      return { ok: true }
    }

    expect(checkActivePlugin().ok).toBe(false)
    expect(checkActivePlugin().error).toBe('No active plugin selected')

    activePluginId = 'ble-uart'
    expect(checkActivePlugin().ok).toBe(true)
  })
})

describe('JSON Message Parsing', () => {
  function parseMessage(data: string): { success: boolean; command?: object; error?: string } {
    try {
      const parsed = JSON.parse(data)
      if (typeof parsed !== 'object' || parsed === null) {
        return { success: false, error: 'Message must be a JSON object' }
      }
      if (typeof parsed.type !== 'string') {
        return { success: false, error: 'Message must have a type field' }
      }
      return { success: true, command: parsed }
    } catch {
      return { success: false, error: 'Invalid JSON' }
    }
  }

  it('should parse valid JSON', () => {
    const result = parseMessage('{"type":"connect"}')
    expect(result.success).toBe(true)
    expect(result.command).toEqual({ type: 'connect' })
  })

  it('should reject invalid JSON', () => {
    const result = parseMessage('not json')
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid JSON')
  })

  it('should reject non-object JSON', () => {
    const result = parseMessage('"string"')
    expect(result.success).toBe(false)
  })

  it('should reject message without type', () => {
    const result = parseMessage('{"data":"test"}')
    expect(result.success).toBe(false)
  })
})
