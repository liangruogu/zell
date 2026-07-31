#!/bin/bash
# E2E Test Script for Zell Collaboration
# Usage: bash tests/run-e2e.sh
# Prerequisites:
#   - tauri-driver installed (cargo install tauri-driver --locked)
#   - WebKitWebDriver available
#   - Go installed
#   - app built: cd app && pnpm tauri build --debug

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
APP_DIR="$PROJECT_DIR/app"
SERVER_DIR="$PROJECT_DIR/server"
LOG_DIR="/tmp/zell-e2e-test"
mkdir -p "$LOG_DIR"

echo "========== Zell E2E Test =========="
echo "Logs: $LOG_DIR"

# ---- 1. Start Go server ----
echo "[1/4] Starting Go server..."
cd "$SERVER_DIR"
rm -f data/zell.db data/.jwt_secret
export PATH=$HOME/go/bin:/usr/local/go/bin:$PATH
go run main.go > "$LOG_DIR/server.log" 2>&1 &
SERVER_PID=$!
sleep 3
SERVER_KEY=$(grep -A1 "本次服务器密钥" "$LOG_DIR/server.log" | tail -1 | awk '{print $NF}')
echo "  Server PID: $SERVER_PID, Key: $SERVER_KEY"

# ---- 2. Kill old app instances ----
echo "[2/4] Cleaning old processes..."
pkill -f "zell" 2>/dev/null || true
sleep 1

# ---- 3. Start tauri-driver with app ----
echo "[3/4] Starting tauri-driver..."
# Build if not yet built
if [ ! -f "$APP_DIR/src-tauri/target/debug/zell" ]; then
    echo "  Building app (debug)..."
    cd "$APP_DIR"
    pnpm tauri build --debug 2>&1 | tail -5
fi

BINARY="$APP_DIR/src-tauri/target/debug/zell"
if [ -f "$BINARY" ]; then
    tauri-driver --native-driver WebKitWebDriver "$BINARY" > "$LOG_DIR/driver.log" 2>&1 &
    DRIVER_PID=$!
    echo "  Driver PID: $DRIVER_PID"
    sleep 2
else
    echo "  ERROR: App binary not found at $BINARY"
    echo "  Run: cd app && pnpm tauri build --debug"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

# ---- 4. Run WebdriverIO tests ----
echo "[4/4] Running tests..."
cd "$APP_DIR"
npx wdio run wdio.conf.ts 2>&1 | tee "$LOG_DIR/test.log"
TEST_EXIT=${PIPESTATUS[0]}

# ---- Cleanup ----
echo ""
echo "========== Cleaning up =========="
kill $SERVER_PID 2>/dev/null
kill $DRIVER_PID 2>/dev/null
pkill -f "zell" 2>/dev/null || true

echo ""
echo "Server logs: $LOG_DIR/server.log"
echo "Driver logs: $LOG_DIR/driver.log"
echo "Test logs:  $LOG_DIR/test.log"

if [ $TEST_EXIT -eq 0 ]; then
    echo "✅ ALL TESTS PASSED"
else
    echo "❌ TESTS FAILED (exit code: $TEST_EXIT)"
fi
exit $TEST_EXIT
