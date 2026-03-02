#!/usr/bin/env bash
set -euo pipefail

# EN: Bootstrap a local RN macOS host app with compatible versions.
# 中文：用兼容版本初始化本地 RN macOS 宿主工程。

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST_DIR="${ROOT_DIR}/host"
APP_NAME="MahjongMacHost"

if [ -d "$HOST_DIR" ]; then
  echo "[skip] host already exists: $HOST_DIR"
  exit 0
fi

mkdir -p "$HOST_DIR"
cd "$HOST_DIR"

echo "[1/4] init react-native 0.81.6 project"
npx @react-native-community/cli@18 init "$APP_NAME" --version 0.81.6 --skip-install --pm npm

cd "$APP_NAME"

echo "[2/4] install js deps"
npm install

echo "[3/4] install react-native-macos 0.81.3"
npm install react-native-macos@0.81.3 --legacy-peer-deps

echo "[4/4] scaffold ready"
echo "Next manual step: follow https://microsoft.github.io/react-native-macos/docs/getting-started"
echo "Then wire app entry to: ../../src/App.tsx"
