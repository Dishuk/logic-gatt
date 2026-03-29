/**
 * Tests for validation.ts
 *
 * Tests actual validation functions rather than recreating logic.
 */

import { describe, it, expect } from 'vitest'
import {
  validateUuid,
  validateSchema,
  validateDeviceSettings,
  validateWsCommand,
  validatePluginId,
  validateCharCommand,
  VALID_COMMAND_TYPES,
} from '../validation.js'

describe('validateUuid', () => {
  it('should accept valid UUID', () => {
    const result = validateUuid('0000180f-0000-1000-8000-00805f9b34fb')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should accept uppercase UUID', () => {
    const result = validateUuid('0000180F-0000-1000-8000-00805F9B34FB')
    expect(result.valid).toBe(true)
  })

  it('should reject invalid format', () => {
    const result = validateUuid('invalid-uuid')
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('format')
  })

  it('should reject non-string', () => {
    const result = validateUuid(123 as unknown as string)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('string')
  })

  it('should reject UUID with wrong segment lengths', () => {
    const result = validateUuid('0000180f-000-1000-8000-00805f9b34fb')
    expect(result.valid).toBe(false)
  })
})

describe('validateSchema', () => {
  const validSchema = {
    services: [
      {
        uuid: '0000180f-0000-1000-8000-00805f9b34fb',
        characteristics: [
          {
            uuid: '00002a19-0000-1000-8000-00805f9b34fb',
            properties: { read: true, write: false, notify: true },
          },
        ],
      },
    ],
  }

  it('should accept valid schema', () => {
    const result = validateSchema(validSchema)
    expect(result.valid).toBe(true)
  })

  it('should reject non-object', () => {
    const result = validateSchema('not an object')
    expect(result.valid).toBe(false)
  })

  it('should reject missing services', () => {
    const result = validateSchema({})
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('services')
  })

  it('should reject service without uuid', () => {
    const result = validateSchema({
      services: [{ characteristics: [] }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('uuid'))).toBe(true)
  })

  it('should reject characteristic without properties', () => {
    const result = validateSchema({
      services: [
        {
          uuid: '0000180f-0000-1000-8000-00805f9b34fb',
          characteristics: [
            { uuid: '00002a19-0000-1000-8000-00805f9b34fb' },
          ],
        },
      ],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('properties'))).toBe(true)
  })

  it('should reject too many services', () => {
    const services = Array(11).fill(null).map((_, i) => ({
      uuid: `0000180${i.toString(16)}-0000-1000-8000-00805f9b34fb`,
      characteristics: [],
    }))
    const result = validateSchema({ services })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('Too many services'))).toBe(true)
  })

  it('should validate defaultValue bytes', () => {
    const result = validateSchema({
      services: [
        {
          uuid: '0000180f-0000-1000-8000-00805f9b34fb',
          characteristics: [
            {
              uuid: '00002a19-0000-1000-8000-00805f9b34fb',
              properties: { read: true, write: false, notify: false },
              defaultValue: [256], // Invalid: > 255
            },
          ],
        },
      ],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('0-255'))).toBe(true)
  })
})

describe('validateDeviceSettings', () => {
  it('should accept valid settings', () => {
    const result = validateDeviceSettings({
      deviceName: 'Test Device',
      appearance: 0,
    })
    expect(result.valid).toBe(true)
  })

  it('should reject missing deviceName', () => {
    const result = validateDeviceSettings({})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('deviceName'))).toBe(true)
  })

  it('should reject empty deviceName', () => {
    const result = validateDeviceSettings({ deviceName: '' })
    expect(result.valid).toBe(false)
  })

  it('should reject too long deviceName', () => {
    const result = validateDeviceSettings({
      deviceName: 'A'.repeat(30), // > 29 bytes
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('too long'))).toBe(true)
  })

  it('should reject invalid appearance', () => {
    const result = validateDeviceSettings({
      deviceName: 'Test',
      appearance: 70000, // > 65535
    })
    expect(result.valid).toBe(false)
  })

  it('should reject invalid manufacturerData', () => {
    const result = validateDeviceSettings({
      deviceName: 'Test',
      manufacturerData: [256], // Invalid byte
    })
    expect(result.valid).toBe(false)
  })
})

describe('validateWsCommand', () => {
  it('should accept valid command types', () => {
    // Commands with no extra fields
    expect(validateWsCommand({ type: 'connect' }).valid).toBe(true)
    expect(validateWsCommand({ type: 'disconnect' }).valid).toBe(true)

    // Commands requiring additional fields
    expect(validateWsCommand({
      type: 'upload-schema',
      schema: { services: [] },
      settings: { deviceName: 'Test' },
    }).valid).toBe(true)

    expect(validateWsCommand({
      type: 'notify',
      serviceUuid: '0000180f-0000-1000-8000-00805f9b34fb',
      charUuid: '00002a19-0000-1000-8000-00805f9b34fb',
      data: [0x64],
    }).valid).toBe(true)

    expect(validateWsCommand({
      type: 'respond-to-read',
      serviceUuid: '0000180f-0000-1000-8000-00805f9b34fb',
      charUuid: '00002a19-0000-1000-8000-00805f9b34fb',
      data: [],
    }).valid).toBe(true)
  })

  it('should reject invalid command type', () => {
    const result = validateWsCommand({ type: 'invalid' })
    expect(result.valid).toBe(false)
  })

  it('should reject missing type', () => {
    const result = validateWsCommand({})
    expect(result.valid).toBe(false)
  })

  it('should reject non-object', () => {
    const result = validateWsCommand('string')
    expect(result.valid).toBe(false)
  })
})

describe('validatePluginId', () => {
  it('should accept valid plugin ID', () => {
    const result = validatePluginId('ble-uart')
    expect(result.valid).toBe(true)
  })

  it('should reject uppercase', () => {
    const result = validatePluginId('BLE-UART')
    expect(result.valid).toBe(false)
  })

  it('should reject spaces', () => {
    const result = validatePluginId('ble uart')
    expect(result.valid).toBe(false)
  })

  it('should reject empty', () => {
    const result = validatePluginId('')
    expect(result.valid).toBe(false)
  })

  it('should reject too long', () => {
    const result = validatePluginId('a'.repeat(51))
    expect(result.valid).toBe(false)
  })
})

describe('validateCharCommand', () => {
  const validCommand = {
    serviceUuid: '0000180f-0000-1000-8000-00805f9b34fb',
    charUuid: '00002a19-0000-1000-8000-00805f9b34fb',
    data: [0x64, 0x00],
  }

  it('should accept valid command', () => {
    const result = validateCharCommand(validCommand)
    expect(result.valid).toBe(true)
  })

  it('should reject invalid serviceUuid', () => {
    const result = validateCharCommand({
      ...validCommand,
      serviceUuid: 'invalid',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('serviceUuid'))).toBe(true)
  })

  it('should reject invalid charUuid', () => {
    const result = validateCharCommand({
      ...validCommand,
      charUuid: 'invalid',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('charUuid'))).toBe(true)
  })

  it('should reject non-array data', () => {
    const result = validateCharCommand({
      ...validCommand,
      data: 'not an array',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('array'))).toBe(true)
  })

  it('should reject invalid byte values', () => {
    const result = validateCharCommand({
      ...validCommand,
      data: [256],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('0-255'))).toBe(true)
  })

  it('should reject negative byte values', () => {
    const result = validateCharCommand({
      ...validCommand,
      data: [-1],
    })
    expect(result.valid).toBe(false)
  })

  it('should accept empty data array', () => {
    const result = validateCharCommand({
      ...validCommand,
      data: [],
    })
    expect(result.valid).toBe(true)
  })
})
