> Navigation: [Docs Hub](../../../README.md) | [Core](../../../docs/core/core-readme.md) | [Platforms](../../../docs/platforms/mac/mac-readme.md) | [Roadmaps](../../../docs/overall-roadmap.md) | [QA](../../../docs/qa/qa-smoke-checklist.md)

# React Native macOS Bootstrap (WIP)

## Goal
Boot a real `react-native-macos` host app and render `src/App.tsx`.

## Suggested commands

```bash
cd apps/mac
npx react-native init MahjongMac --template react-native@latest
# then apply react-native-macos setup per official docs
```

Because project templates may change, follow latest docs:
- https://microsoft.github.io/react-native-macos/docs/getting-started

## After bootstrap
1. Ensure host app compiles in Xcode.
2. Point entry to this repo's `apps/mac/src/App.tsx`.
3. Verify app launches and shows preview lobby card.
4. Next: wire `@mahjong/client-core` realtime flow.
