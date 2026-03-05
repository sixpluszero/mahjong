> Navigation: [Docs Hub](../../../README.md) | [Core](../../../docs/core/core-readme.md) | [Platforms](../../../docs/platforms/mac/mac-readme.md) | [Roadmaps](../../../docs/overall-roadmap.md) | [QA](../../../docs/qa/qa-smoke-checklist.md)

# Mac Host Runbook (See real window)

## Goal
Launch a real macOS host app that renders `apps/mac/src/App.tsx`.

## 1) Bootstrap host (one-time)

```bash
cd apps/mac
./scripts/bootstrap-host.sh
```

> Host location: `apps/mac/host/MahjongMacHost/`

## 2) Start Metro + run macOS app

```bash
cd apps/mac/host/MahjongMacHost
npx react-native start
# in another terminal:
npx react-native run-macos
```

## 3) What you should see
- A window titled with RN host app
- Mahjong Mac preview lobby UI
- Mode switch (Preview / Live)
- Name/Room fields and Hello/Create/Join buttons

## 4) Live mode test
1. In project root run server:
   ```bash
   npm run dev:server
   ```
2. In mac app switch Mode -> `Live`
3. WS URL use `ws://localhost:8787`
4. Click Hello / Create / Join and observe status updates

## 5) Troubleshooting
- If Metro can't resolve workspace imports:
  - confirm host `metro.config.js` has `watchFolders` workspace root
- If app cannot connect in Live mode:
  - check server is running on `localhost:8787`
  - check firewall prompt permissions for Terminal / Node
