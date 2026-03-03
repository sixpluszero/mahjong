#!/usr/bin/env bash
set -euo pipefail

# EN: One-command server setup for clean machines.
# 中文：新机器一键初始化服务器环境（不包含 RN/macOS 客户端依赖）。

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/4] Checking Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "[error] node is required. Install Node.js 20+ first."
  exit 1
fi
NODE_VERSION="$(node -v)"
echo "[ok] node: ${NODE_VERSION}"

echo "[2/4] Installing JS dependencies"
npm ci

echo "[3/4] Running shared tests"
npm test

echo "[4/4] Setup complete"
echo "Start server with:"
echo "  npm run dev:server"
