#!/bin/bash

# Usage: ./at_script.sh [PORT]
# Example: ./at_script.sh /dev/ttyUSB1

# Default port
PORT=${1:-/dev/ttyUSB0}

# Initial baud rate
BAUD=38400

echo "[INFO] Using port: $PORT"
echo "[INFO] Setting baud rate to $BAUD (8N1, no echo)..."

# Configure the serial port
stty -F "$PORT" $BAUD cs8 -cstopb -parenb -echo raw
if [ $? -ne 0 ]; then
  echo "[ERROR] Failed to configure $PORT"
  exit 1
fi

# Function to send an AT command
send_cmd() {
  local CMD=$1
  echo "[TX] $CMD"
  echo -e "$CMD\r\n" > "$PORT"
  sleep 1
}

# Run cat in the background to show responses
echo "[INFO] Starting listener..."
cat < "$PORT" &
CAT_PID=$!

sleep 1

# Send commands
send_cmd "AT"
send_cmd "AT+UART?"
send_cmd "AT+UART=9600,0,0"
send_cmd "AT+UART?"

# Stop the listener
echo "[INFO] Stopping listener..."
kill $CAT_PID 2>/dev/null
wait $CAT_PID 2>/dev/null

echo "[DONE] Script finished."
