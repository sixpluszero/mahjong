#!/usr/bin/env bash
set -euo pipefail

# EN: One-command mac client environment setup.
# 中文：Mac 客户端一键环境准备脚本。

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MAC_DIR="${ROOT_DIR}/apps/mac"
HOST_BOOTSTRAP="${MAC_DIR}/scripts/bootstrap-host.sh"

echo "[1/6] Checking Xcode CLI selection"
if ! xcode-select -p >/dev/null 2>&1; then
  echo "[error] xcode-select not configured. Install Xcode and run xcode-select first."
  exit 1
fi
xcode-select -p

echo "[2/6] Checking CocoaPods"
if ! command -v pod >/dev/null 2>&1; then
  echo "[info] CocoaPods not found. Installing via Homebrew..."
  if ! command -v brew >/dev/null 2>&1; then
    echo "[error] Homebrew not found. Install Homebrew first: https://brew.sh"
    exit 1
  fi
  brew install cocoapods
fi
pod --version

echo "[3/6] Bootstrapping local host app"
cd "$MAC_DIR"
"$HOST_BOOTSTRAP"

HOST_DIR="${MAC_DIR}/host/MahjongMacHost"
if [ ! -d "$HOST_DIR" ]; then
  echo "[error] host app not found at $HOST_DIR"
  exit 1
fi

echo "[4/6] Ensuring pods are installed"
cd "$HOST_DIR"
pod install --project-directory=macos

echo "[5/6] Optional clean derived data"
rm -rf ~/Library/Developer/Xcode/DerivedData/MahjongMacHost-* || true

echo "[6/6] Done"
echo "Run mac app with:"
echo "  cd $HOST_DIR"
echo "  npx react-native start"
echo "  # another terminal"
echo "  npx react-native run-macos"
