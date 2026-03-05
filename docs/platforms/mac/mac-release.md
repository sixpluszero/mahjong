> Navigation: [Docs Hub](../../../README.md) | [Core](../../../docs/core/core-readme.md) | [Platforms](../../../docs/platforms/mac/mac-readme.md) | [Roadmaps](../../../docs/overall-roadmap.md) | [QA](../../../docs/qa/qa-smoke-checklist.md)

# macOS Release Guide

## Purpose
Build a distributable macOS application without requiring Metro (`npx react-native start`) on end-user machines.

## Build modes
- **Debug**: used in development; typically connects to Metro.
- **Release**: embeds JS bundle and resources into app package; users run `.app` directly.

## Prerequisites
- Xcode installed and selected (`xcode-select -p` points to Xcode)
- CocoaPods installed (`pod --version`)
- Host app created (`apps/mac/host/MahjongMacHost/`)

## 1) Prepare dependencies
```bash
cd apps/mac/host/MahjongMacHost
npm install
pod install --project-directory=macos
```

## 2) Build release from CLI
```bash
cd apps/mac/host/MahjongMacHost
xcodebuild \
  -project macos/MahjongMacHost.xcodeproj \
  -scheme MahjongMacHost-macOS \
  -configuration Release \
  -derivedDataPath build
```

Expected app path:
- `apps/mac/host/MahjongMacHost/build/Build/Products/Release/MahjongMacHost.app`

## 3) Validate no-Metro run
- Ensure Metro is **not** running.
- Open the generated `.app`.
- Confirm app launches and lobby UI works.

## 4) Optional signing/notarization (later)
- Add Apple Developer signing identity
- Notarize app for Gatekeeper-friendly distribution
- Package as `.dmg` / `.pkg`

## Notes
- During development you still use Metro for fast iteration.
- Release distribution should not require users to install Node, npm, Metro, or run terminal commands.
