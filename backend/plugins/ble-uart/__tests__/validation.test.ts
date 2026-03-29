/**
 * Tests for BLE UART plugin validation
 */

import { describe, it, expect } from 'vitest'
import { validateSerialPortPath } from '../validation.js'

describe('validateSerialPortPath', () => {
  it('should accept Windows COM port', () => {
    const result = validateSerialPortPath('COM3')
    expect(result.valid).toBe(true)
  })

  it('should accept lowercase COM', () => {
    const result = validateSerialPortPath('com3')
    expect(result.valid).toBe(true)
  })

  it('should accept Unix ttyUSB', () => {
    const result = validateSerialPortPath('/dev/ttyUSB0')
    expect(result.valid).toBe(true)
  })

  it('should accept Unix ttyACM', () => {
    const result = validateSerialPortPath('/dev/ttyACM0')
    expect(result.valid).toBe(true)
  })

  it('should reject path traversal', () => {
    const result = validateSerialPortPath('/dev/../etc/passwd')
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('..'))).toBe(true)
  })

  it('should reject empty path', () => {
    const result = validateSerialPortPath('')
    expect(result.valid).toBe(false)
  })

  it('should reject arbitrary paths', () => {
    const result = validateSerialPortPath('/etc/passwd')
    expect(result.valid).toBe(false)
  })
})
