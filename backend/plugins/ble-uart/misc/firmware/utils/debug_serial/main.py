import sys
import time
import serial

port = sys.argv[1] if len(sys.argv) > 1 else "COM1"
ser = serial.Serial(port, 115200, timeout=0.01)

while True:
    n = ser.in_waiting
    if n > 0:
        data = ser.read(n)
        if data:
            print(data.hex(), flush=True)
            ser.write(data[::-1])
    else:
        time.sleep(0.005)
