/**
 * BLE UART plugin validation utilities
 */

import { z, type ValidationResult, zodToValidationResult } from '@logic-gatt/shared'

/**
 * Serial port path schema.
 * Validates Windows COM ports and Unix /dev/tty* paths.
 */
export const SerialPortPathSchema = z
  .string()
  .min(1, 'Path cannot be empty')
  .refine((path) => !path.includes('..'), 'Path cannot contain ".."')
  .refine((path) => {
    // Windows COM port pattern
    const windowsPattern = /^COM\d+$/i
    // Unix serial port patterns (ttyUSB, ttyACM, ttyS, ttyAMA, ttyXR, etc.)
    const unixPattern = /^\/dev\/(tty[A-Za-z]+\d*|cu\.[a-zA-Z0-9_-]+)$/

    return windowsPattern.test(path) || unixPattern.test(path)
  }, 'Invalid serial port path format. Expected COM* (Windows) or /dev/tty* (Unix)')

/**
 * Validate a serial port path.
 */
export function validateSerialPortPath(path: string): ValidationResult {
  return zodToValidationResult(SerialPortPathSchema.safeParse(path))
}
