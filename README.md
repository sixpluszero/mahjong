# Mahjong Monorepo

Current phase:
- Rule spec frozen in `rule_spec.md`
- Shared game logic bootstrap in `packages/shared`

Packages:
- `@mahjong/shared`: common Mahjong rules and scoring engine.
- `@mahjong/server`: WebSocket authoritative game server and debug bot client.
- `@mahjong/web`: browser client (placeholder).

Quick start:
- `npm install`
- `npm run dev:server`
- Open browser: `http://localhost:8787`
- You can open 4 tabs/windows, set different names, join same room, and play manually.
- Optional bot debug:
  - `npm run dev:client`
  - `ROOM_ID=<room_id_from_logs> npm run dev:client`
