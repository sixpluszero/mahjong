#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
HOST_ROOT="${ROOT_DIR}/host"
APP_NAME="MahjongMacHost"
APP_DIR="${HOST_ROOT}/${APP_NAME}"

if [ -d "$APP_DIR" ]; then
  echo "[skip] host already exists: $APP_DIR"
  exit 0
fi

mkdir -p "$HOST_ROOT"

echo "[1/6] init react-native 0.81.6 project"
cd "$HOST_ROOT"
npx @react-native-community/cli@18 init "$APP_NAME" --version 0.81.6 --skip-install --pm npm

if [ ! -d "$APP_DIR" ]; then
  echo "[error] expected app dir not found: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

echo "[2/6] install js deps"
npm install

echo "[3/6] install react-native-macos"
npx react-native-macos-init

echo "[4/6] install macOS pods"
pod install --project-directory=macos

echo "[5/6] patch host entry + metro config"
cat > App.tsx <<'APP_EOF'
/**
 * EN: Host entry delegates to repo source-of-truth app.
 * 中文：宿主入口委托到仓库内的业务 App 源码。
 */

export { default } from '../../src/App';
APP_EOF

cat > metro.config.js <<'METRO_EOF'
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(__dirname, '..', '..', '..', '..');

const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules')
    ]
  }
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
METRO_EOF

echo "[6/6] done"
echo "Run host app:"
echo "  cd $APP_DIR"
echo "  npx react-native start"
echo "  npx react-native run-macos"
