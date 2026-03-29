import { describe, it, expect } from 'vitest'
import {
  crc8,
  buildFrame,
  uuidStrToBytes,
  extractShortUuid,
  hexStringToBytes,
  computeSchemaHash,
  buildSetDeviceNameFrame,
  buildSetAdvDataFrame,
  buildSetAdvUuidsFrame,
  FrameParser,
  START_BYTE,
  CMD_ADD_SERVICE,
  CMD_ACK,
  CMD_PING,
  MAX_DEVICE_NAME_BYTES,
  MAX_MANUFACTURER_DATA_BYTES,
  MAX_ADVERTISED_UUIDS,
} from '../protocol.js'

describe('crc8', () => {
  it('should return 0 for empty data', () => {
    expect(crc8(new Uint8Array([]))).toBe(0)
  })

  it('should compute CRC for single byte', () => {
    const result = crc8(new Uint8Array([0x01]))
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(255)
  })

  it('should compute consistent CRC for same data', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04])
    const crc1 = crc8(data)
    const crc2 = crc8(data)
    expect(crc1).toBe(crc2)
  })

  it('should compute different CRC for different data', () => {
    const data1 = new Uint8Array([0x01, 0x02])
    const data2 = new Uint8Array([0x02, 0x01])
    expect(crc8(data1)).not.toBe(crc8(data2))
  })
})

describe('buildFrame', () => {
  it('should build frame with no payload', () => {
    const frame = buildFrame(CMD_PING)
    expect(frame[0]).toBe(START_BYTE)
    expect(frame[1]).toBe(CMD_PING)
    expect(frame[2]).toBe(0) // length
    expect(frame.length).toBe(4) // START + CMD + LEN + CRC
  })

  it('should build frame with payload', () => {
    const payload = new Uint8Array([0x01, 0x02, 0x03])
    const frame = buildFrame(CMD_ADD_SERVICE, payload)
    expect(frame[0]).toBe(START_BYTE)
    expect(frame[1]).toBe(CMD_ADD_SERVICE)
    expect(frame[2]).toBe(3) // length
    expect(frame[3]).toBe(0x01)
    expect(frame[4]).toBe(0x02)
    expect(frame[5]).toBe(0x03)
    expect(frame.length).toBe(7) // START + CMD + LEN + 3 payload + CRC
  })

  it('should include valid CRC', () => {
    const payload = new Uint8Array([0x01, 0x02])
    const frame = buildFrame(CMD_ACK, payload)
    const crcData = new Uint8Array([CMD_ACK, 2, 0x01, 0x02])
    const expectedCrc = crc8(crcData)
    expect(frame[frame.length - 1]).toBe(expectedCrc)
  })
})

describe('uuidStrToBytes', () => {
  it('should convert standard UUID to 16 bytes', () => {
    const uuid = '0000180f-0000-1000-8000-00805f9b34fb'
    const bytes = uuidStrToBytes(uuid)
    expect(bytes.length).toBe(16)
  })

  it('should convert UUID to little-endian', () => {
    // BLE uses little-endian, so bytes should be reversed
    const uuid = '00001234-0000-1000-8000-00805f9b34fb'
    const bytes = uuidStrToBytes(uuid)
    // Last bytes of original UUID should be first in little-endian
    expect(bytes[0]).toBe(0xfb)
    expect(bytes[1]).toBe(0x34)
  })

  it('should handle UUID without dashes', () => {
    const uuid1 = '0000180f-0000-1000-8000-00805f9b34fb'
    const uuid2 = '0000180f00001000800000805f9b34fb'
    const bytes1 = uuidStrToBytes(uuid1)
    const bytes2 = uuidStrToBytes(uuid2)
    expect(bytes1).toEqual(bytes2)
  })
})

describe('extractShortUuid', () => {
  it('should extract 16-bit UUID from standard Bluetooth UUID', () => {
    expect(extractShortUuid('0000180f-0000-1000-8000-00805f9b34fb')).toBe(0x180f)
    expect(extractShortUuid('00001800-0000-1000-8000-00805f9b34fb')).toBe(0x1800)
  })

  it('should return null for non-standard UUID', () => {
    expect(extractShortUuid('12345678-1234-1234-1234-123456789012')).toBeNull()
  })

  it('should be case-insensitive', () => {
    expect(extractShortUuid('0000180F-0000-1000-8000-00805F9B34FB')).toBe(0x180f)
  })
})

describe('hexStringToBytes', () => {
  it('should parse space-separated hex string', () => {
    const bytes = hexStringToBytes('01 02 03')
    expect(bytes).toEqual(new Uint8Array([0x01, 0x02, 0x03]))
  })

  it('should handle multiple spaces', () => {
    const bytes = hexStringToBytes('01  02   03')
    expect(bytes).toEqual(new Uint8Array([0x01, 0x02, 0x03]))
  })

  it('should handle leading/trailing whitespace', () => {
    const bytes = hexStringToBytes('  01 02  ')
    expect(bytes).toEqual(new Uint8Array([0x01, 0x02]))
  })

  it('should handle empty string', () => {
    const bytes = hexStringToBytes('')
    expect(bytes.length).toBe(0)
  })
})

describe('computeSchemaHash', () => {
  it('should compute 4-byte hash', () => {
    const schema = [
      {
        uuid: '0000180f-0000-1000-8000-00805f9b34fb',
        characteristics: [
          {
            uuid: '00002a19-0000-1000-8000-00805f9b34fb',
            properties: { read: true, write: false, notify: true },
          },
        ],
      },
    ]
    const hash = computeSchemaHash(schema)
    expect(hash.length).toBe(4)
  })

  it('should produce consistent hash for same schema', () => {
    const schema = [
      {
        uuid: '0000180f-0000-1000-8000-00805f9b34fb',
        characteristics: [
          {
            uuid: '00002a19-0000-1000-8000-00805f9b34fb',
            properties: { read: true, write: false, notify: false },
          },
        ],
      },
    ]
    const hash1 = computeSchemaHash(schema)
    const hash2 = computeSchemaHash(schema)
    expect(hash1).toEqual(hash2)
  })

  it('should produce different hash for different properties', () => {
    const schema1 = [
      {
        uuid: '0000180f-0000-1000-8000-00805f9b34fb',
        characteristics: [
          {
            uuid: '00002a19-0000-1000-8000-00805f9b34fb',
            properties: { read: true, write: false, notify: false },
          },
        ],
      },
    ]
    const schema2 = [
      {
        uuid: '0000180f-0000-1000-8000-00805f9b34fb',
        characteristics: [
          {
            uuid: '00002a19-0000-1000-8000-00805f9b34fb',
            properties: { read: false, write: true, notify: false },
          },
        ],
      },
    ]
    const hash1 = computeSchemaHash(schema1)
    const hash2 = computeSchemaHash(schema2)
    expect(hash1).not.toEqual(hash2)
  })

  it('should handle empty schema', () => {
    const hash = computeSchemaHash([])
    expect(hash.length).toBe(4)
  })
})

describe('buildSetDeviceNameFrame', () => {
  it('should build frame with device name', () => {
    const frame = buildSetDeviceNameFrame('Test')
    expect(frame[0]).toBe(START_BYTE)
    expect(frame[1]).toBe(0x04) // CMD_SET_DEVICE_NAME
    expect(frame[2]).toBe(4) // length of "Test"
  })

  it('should throw for name exceeding max length', () => {
    const longName = 'a'.repeat(MAX_DEVICE_NAME_BYTES + 1)
    expect(() => buildSetDeviceNameFrame(longName)).toThrow()
  })

  it('should allow name at max length', () => {
    const maxName = 'a'.repeat(MAX_DEVICE_NAME_BYTES)
    expect(() => buildSetDeviceNameFrame(maxName)).not.toThrow()
  })
})

describe('buildSetAdvDataFrame', () => {
  it('should build frame with appearance only', () => {
    const frame = buildSetAdvDataFrame(0x0340) // Generic Remote Control
    expect(frame[0]).toBe(START_BYTE)
    expect(frame[1]).toBe(0x05) // CMD_SET_ADV_DATA
    expect(frame[2]).toBe(2) // 2 bytes for appearance
    expect(frame[3]).toBe(0x40) // low byte
    expect(frame[4]).toBe(0x03) // high byte
  })

  it('should build frame with manufacturer data', () => {
    const mfrData = new Uint8Array([0x01, 0x02, 0x03])
    const frame = buildSetAdvDataFrame(0x0000, mfrData)
    expect(frame[2]).toBe(5) // 2 bytes appearance + 3 bytes mfr data
  })

  it('should throw for manufacturer data exceeding max length', () => {
    const longData = new Uint8Array(MAX_MANUFACTURER_DATA_BYTES + 1)
    expect(() => buildSetAdvDataFrame(0x0000, longData)).toThrow()
  })
})

describe('buildSetAdvUuidsFrame', () => {
  it('should build frame with UUIDs', () => {
    const uuids = [0x180f, 0x1800]
    const frame = buildSetAdvUuidsFrame(uuids)
    expect(frame[0]).toBe(START_BYTE)
    expect(frame[1]).toBe(0x06) // CMD_SET_ADV_UUIDS
    expect(frame[2]).toBe(4) // 2 UUIDs * 2 bytes each
    expect(frame[3]).toBe(0x0f) // 0x180f low byte
    expect(frame[4]).toBe(0x18) // 0x180f high byte
    expect(frame[5]).toBe(0x00) // 0x1800 low byte
    expect(frame[6]).toBe(0x18) // 0x1800 high byte
  })

  it('should throw for too many UUIDs', () => {
    const tooManyUuids = new Array(MAX_ADVERTISED_UUIDS + 1).fill(0x1800)
    expect(() => buildSetAdvUuidsFrame(tooManyUuids)).toThrow()
  })

  it('should handle empty UUID array', () => {
    const frame = buildSetAdvUuidsFrame([])
    expect(frame[2]).toBe(0) // length 0
  })
})

describe('FrameParser', () => {
  it('should parse single complete frame', () => {
    const parser = new FrameParser()
    const payload = new Uint8Array([0x01, 0x02])
    const frame = buildFrame(CMD_ACK, payload)
    parser.push(frame)
    const frames = parser.pull()
    expect(frames.length).toBe(1)
    expect(frames[0].cmd).toBe(CMD_ACK)
    expect(frames[0].payload).toEqual(payload)
  })

  it('should parse multiple frames', () => {
    const parser = new FrameParser()
    const frame1 = buildFrame(CMD_ACK, new Uint8Array([0x01]))
    const frame2 = buildFrame(CMD_PING, new Uint8Array([]))
    const combined = new Uint8Array([...frame1, ...frame2])
    parser.push(combined)
    const frames = parser.pull()
    expect(frames.length).toBe(2)
    expect(frames[0].cmd).toBe(CMD_ACK)
    expect(frames[1].cmd).toBe(CMD_PING)
  })

  it('should handle fragmented frames', () => {
    const parser = new FrameParser()
    const frame = buildFrame(CMD_ACK, new Uint8Array([0x01, 0x02, 0x03]))

    // Push first half
    parser.push(frame.slice(0, 3))
    let frames = parser.pull()
    expect(frames.length).toBe(0)

    // Push second half
    parser.push(frame.slice(3))
    frames = parser.pull()
    expect(frames.length).toBe(1)
    expect(frames[0].cmd).toBe(CMD_ACK)
  })

  it('should skip bytes before start byte', () => {
    const parser = new FrameParser()
    const frame = buildFrame(CMD_ACK, new Uint8Array([0x01]))
    const withGarbage = new Uint8Array([0x00, 0x00, 0x00, ...frame])
    parser.push(withGarbage)
    const frames = parser.pull()
    expect(frames.length).toBe(1)
    expect(frames[0].cmd).toBe(CMD_ACK)
  })

  it('should reject frames with invalid CRC', () => {
    const parser = new FrameParser()
    // Build a valid frame then corrupt CRC
    const frame = buildFrame(CMD_ACK, new Uint8Array([0x01]))
    frame[frame.length - 1] ^= 0xff // Corrupt CRC
    parser.push(frame)
    const frames = parser.pull()
    expect(frames.length).toBe(0)
  })

  it('should handle frame with no payload', () => {
    const parser = new FrameParser()
    const frame = buildFrame(CMD_PING)
    parser.push(frame)
    const frames = parser.pull()
    expect(frames.length).toBe(1)
    expect(frames[0].cmd).toBe(CMD_PING)
    expect(frames[0].payload.length).toBe(0)
  })
})
