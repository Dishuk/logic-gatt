"""
GATT Schema Upload Script

Define a BLE GATT schema and upload it to the ESP32 firmware over UART.
The firmware will create the services/characteristics and start advertising.

Usage:
    python upload_schema.py [COM_PORT]
"""

import sys
import time
import struct
import serial

# Protocol constants
START_BYTE = 0xAA
CMD_ADD_SERVICE = 0x01
CMD_ADD_CHAR = 0x02
CMD_APPLY_SCHEMA = 0x03
CMD_ACK = 0x10
CMD_NACK = 0x11

# Characteristic properties
PROP_READ = 0x01
PROP_WRITE = 0x02
PROP_NOTIFY = 0x04

BAUD_RATE = 115200
ACK_TIMEOUT = 2.0


def crc8(data: bytes) -> int:
    """CRC-8 with polynomial 0x31, init 0x00."""
    crc = 0x00
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ 0x31) & 0xFF
            else:
                crc = (crc << 1) & 0xFF
    return crc


def build_frame(cmd: int, payload: bytes = b"") -> bytes:
    """Build a protocol frame: [START] [CMD] [LEN] [PAYLOAD] [CRC8]."""
    length = len(payload)
    crc_data = bytes([cmd, length]) + payload
    crc = crc8(crc_data)
    return bytes([START_BYTE, cmd, length]) + payload + bytes([crc])


def uuid_str_to_bytes(uuid_str: str) -> bytes:
    """Convert UUID string (e.g. 'b2bb0000-46da-11ed-b878-0242ac120002') to 16 bytes little-endian."""
    hex_str = uuid_str.replace("-", "")
    uuid_bytes = bytes.fromhex(hex_str)
    # UUID is big-endian in string form, NimBLE expects little-endian
    return uuid_bytes[::-1]


def wait_for_ack(ser: serial.Serial, expected_cmd: int) -> bool:
    """Wait for an ACK/NACK frame from firmware. Returns True on ACK."""
    deadline = time.time() + ACK_TIMEOUT
    buf = b""
    while time.time() < deadline:
        data = ser.read(ser.in_waiting or 1)
        if data:
            buf += data
        # Look for a complete frame in buffer
        while len(buf) >= 4:
            start = buf.find(bytes([START_BYTE]))
            if start == -1:
                buf = b""
                break
            if start > 0:
                buf = buf[start:]
            if len(buf) < 4:
                break
            cmd = buf[1]
            length = buf[2]
            frame_size = 4 + length
            if len(buf) < frame_size:
                break
            payload = buf[3 : 3 + length]
            frame_crc = buf[3 + length]
            crc_data = bytes([cmd, length]) + payload
            if crc8(crc_data) != frame_crc:
                buf = buf[1:]
                continue
            buf = buf[frame_size:]
            if cmd == CMD_ACK and len(payload) >= 1 and payload[0] == expected_cmd:
                return True
            if cmd == CMD_NACK and len(payload) >= 2 and payload[0] == expected_cmd:
                err = payload[1]
                print(f"  NACK received for cmd 0x{expected_cmd:02X}, error=0x{err:02X}")
                return False
    print(f"  Timeout waiting for ACK (cmd 0x{expected_cmd:02X})")
    return False


class Characteristic:
    def __init__(self, svc_idx: int, chr_idx: int, uuid: str, props: int, default: bytes):
        self.svc_idx = svc_idx
        self.chr_idx = chr_idx
        self.uuid = uuid
        self.props = props
        self.default = default


class Service:
    def __init__(self, idx: int, uuid: str):
        self.idx = idx
        self.uuid = uuid
        self.characteristics: list[Characteristic] = []
        self._next_chr_idx = 0

    def add_characteristic(self, uuid: str, props: int = PROP_READ, default: bytes = b"") -> "Characteristic":
        chr = Characteristic(self.idx, self._next_chr_idx, uuid, props, default)
        self.characteristics.append(chr)
        self._next_chr_idx += 1
        return chr


class GATTSchema:
    def __init__(self):
        self.services: list[Service] = []
        self._next_svc_idx = 0

    def add_service(self, uuid: str) -> Service:
        svc = Service(self._next_svc_idx, uuid)
        self.services.append(svc)
        self._next_svc_idx += 1
        return svc

    def upload(self, port: str, baud: int = BAUD_RATE):
        """Connect to firmware and upload the schema."""
        print(f"Connecting to {port} at {baud} baud...")
        ser = serial.Serial(port, baud, timeout=0.1)
        time.sleep(0.5)  # Wait for ESP32 UART to settle
        ser.reset_input_buffer()

        try:
            for svc in self.services:
                # Send ADD_SERVICE
                payload = bytes([svc.idx]) + uuid_str_to_bytes(svc.uuid)
                frame = build_frame(CMD_ADD_SERVICE, payload)
                print(f"ADD_SERVICE idx={svc.idx} uuid={svc.uuid}")
                ser.write(frame)
                if not wait_for_ack(ser, CMD_ADD_SERVICE):
                    raise RuntimeError("Failed to add service")

                for chr in svc.characteristics:
                    # Send ADD_CHAR
                    payload = (
                        bytes([chr.svc_idx, chr.chr_idx, chr.props])
                        + uuid_str_to_bytes(chr.uuid)
                        + chr.default
                    )
                    frame = build_frame(CMD_ADD_CHAR, payload)
                    print(f"  ADD_CHAR svc={chr.svc_idx} chr={chr.chr_idx} props=0x{chr.props:02X} default={chr.default.hex() or '(empty)'}")
                    ser.write(frame)
                    if not wait_for_ack(ser, CMD_ADD_CHAR):
                        raise RuntimeError("Failed to add characteristic")

            # Send APPLY_SCHEMA
            frame = build_frame(CMD_APPLY_SCHEMA)
            print("APPLY_SCHEMA")
            ser.write(frame)
            if not wait_for_ack(ser, CMD_APPLY_SCHEMA):
                raise RuntimeError("Failed to apply schema")

            print("Schema uploaded and applied successfully!")
        finally:
            ser.close()


# ─── Define your schema here ───────────────────────────────────────────────

if __name__ == "__main__":
    port = sys.argv[1] if len(sys.argv) > 1 else "COM10"

    schema = GATTSchema()

    # Example: one service with two characteristics
    svc = schema.add_service("b2bb0000-46da-11ed-b878-0242ac120002")

    svc.add_characteristic(
        uuid="b2bb0001-46da-11ed-b878-0242ac120002",
        props=PROP_READ | PROP_WRITE | PROP_NOTIFY,
        default=b"\x48\x65\x6C\x6C\x6F",  # "Hello"
    )

    svc.add_characteristic(
        uuid="b2bb0002-46da-11ed-b878-0242ac120002",
        props=PROP_READ,
        default=b"\x01\x00",  # Version 1.0
    )

    schema.upload(port=port)
