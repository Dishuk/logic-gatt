# Debug Serial Utility

Simple Python script that echoes UART data at 115200 baud. Useful for testing the ESP32 firmware without the full frontend.

## Setup

```bash
# Create virtual environment
python -m venv venv

# Activate it
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## Usage

```bash
# Make sure venv is activated, then:
python main.py
```

The script connects to the default serial port and echoes received data.
