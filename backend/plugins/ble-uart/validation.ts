/**
 * BLE UART plugin validation utilities
 */

import type { ValidationResult } from '@logic-gatt/shared'

/**
 * Validate a serial port path.
 */
export function validateSerialPortPath(path: string): ValidationResult {
  const errors: string[] = []

  if (typeof path !== 'string') {
    return { valid: false, errors: ['Path must be a string'] }
  }

  if (!path) {
    return { valid: false, errors: ['Path cannot be empty'] }
  }

  // Check for path traversal attempts
  if (path.includes('..')) {
    errors.push('Path cannot contain ".."')
  }

  // Windows COM port pattern
  const windowsPattern = /^COM\d+$/i
  // Unix serial port patterns (ttyUSB, ttyACM, ttyS, ttyAMA, ttyXR, etc.)
  const unixPattern = /^\/dev\/(tty[A-Za-z]+\d*|cu\.[a-zA-Z0-9_-]+)$/

  const isWindowsPort = windowsPattern.test(path)
  const isUnixPort = unixPattern.test(path)

  if (!isWindowsPort && !isUnixPort) {
    errors.push('Invalid serial port path format. Expected COM* (Windows) or /dev/tty* (Unix)')
  }

  return { valid: errors.length === 0, errors }
}
