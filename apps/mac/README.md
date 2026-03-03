# @mahjong/mac

react-native-macos client workspace.

## Current status
- Source UI exists in `src/` (preview/live lobby)
- Local host app generation script exists in `scripts/bootstrap-host.sh`

## Bootstrap host app (local)

```bash
cd apps/mac
./scripts/bootstrap-host.sh
```

Then continue with react-native-macos official setup in generated host project.

## Why this split?
- Keep generated native host files out of git
- Keep product UI/runtime source in this repo under `apps/mac/src`

## One-command client setup

```bash
./scripts/setup-mac-client.sh
```
