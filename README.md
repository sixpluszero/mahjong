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
- In separate terminals, run bots:
  - `npm run dev:client`
  - `ROOM_ID=<room_id_from_logs> npm run dev:client`
