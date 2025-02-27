#!/bin/bash

# Kill any existing processes
cleanup() {
    echo "Cleaning up processes..."
    pkill -f "anvil --block-time"
    pkill -f "run-local-instance.sh"
    pkill -f "listen-events.js"
}

# Set up cleanup on script exit
trap cleanup EXIT

# Store the root directory
ROOT_DIR="$PWD"

# Start Anvil in the background
echo "Starting Anvil..."
anvil --block-time 0.1 --silent &
ANVIL_PID=$!

# Wait for Anvil to start
sleep 2

# Start Alto Bundler in the background
echo "Starting Alto Bundler..."
cd "$ROOT_DIR" && alto/scripts/run-local-instance.sh -l &
BUNDLER_PID=$!

# Wait for bundler to start
sleep 2

# Deploy Counter Contract
echo "Deploying Counter Contract..."
cd "$ROOT_DIR/contracts"
forge script script/Counter.s.sol:CounterScript --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --rpc-url http://localhost:8545 --broadcast

# Ensure the address file exists
if [ ! -f deployed-counter-address.txt ]; then
    echo "Error: Counter contract address file not found!"
    exit 1
fi

# Start Event Listener in the background
echo "Starting Event Listener..."
node listen-events.js &
LISTENER_PID=$!

echo "Environment setup complete! The following components are running:"
echo "1. Anvil (local Ethereum node) - PID: $ANVIL_PID"
echo "2. Alto Bundler - PID: $BUNDLER_PID"
echo "3. Counter Contract Deployed (address in deployed-counter-address.txt)"
echo "4. Event Listener - PID: $LISTENER_PID"
echo ""
echo "Press Ctrl+C to stop all processes"

# Wait for user interrupt
wait
