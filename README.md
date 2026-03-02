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
- Random stress test (4 websocket bots, 10 rounds):
  - `npm run stress`
- Optional bot debug:
  - `npm run dev:client`
  - `ROOM_ID=<room_id_from_logs> npm run dev:client`

## E2E (Playwright)
- Install deps (once): `npm install`
- Install Playwright browser (once): `npx playwright install chromium`
- Run E2E from repo root: `npm run test:e2e`
- Headed mode: `npm run test:e2e:headed`
- Current coverage includes invite-link room join:
  - Client A create room -> get invite link
  - Client B open invite link and join
  - Both clients show the same room id and joined players

## Mobile LAN + PWA test
- Start server: `npm run dev:server`
- In server logs, find LAN URL (example: `http://192.168.1.20:8787`).
- Ensure iPad/phone is on the same Wi-Fi, then open that LAN URL in browser.
- Basic checks:
  - Room creation/join/ready/actions all work from touch UI.
  - Refresh page once to confirm app shell assets still load.
- Install as PWA:
  - iPad/iPhone (Safari): Share -> Add to Home Screen.
  - Android (Chrome): menu -> Install app / Add to Home screen.
- Launch from home screen and verify it opens in standalone mode and can reconnect to room normally.


## Quick smoke checklist
- Open desktop browser and verify WS connects within 3s.
- Create room -> add bots -> all ready -> game starts.
- Complete at least 1 round to settlement.
- Click rematch once and verify next round starts.
- Open on mobile LAN URL and verify connect + one discard action.

## Browser note (iOS)
- iOS Safari may show intermittent LAN WebSocket instability in some networks.
- If connection is unstable, use Chrome on iOS as a workaround.
