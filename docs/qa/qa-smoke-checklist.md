> Navigation: [Docs Hub](../../README.md) | [Core](../../docs/core/core-readme.md) | [Platforms](../../docs/platforms/mac/mac-readme.md) | [Roadmaps](../../docs/overall-roadmap.md) | [QA](../../docs/qa/qa-smoke-checklist.md)

# Smoke Checklist

## Desktop
- Open `http://localhost:8787`
- Confirm WS connects in under 3 seconds
- Create room, add bots, ready up
- Verify game starts and can discard
- Reach settlement once and rematch once

## Mobile LAN
- Open `http://<LAN_IP>:8787`
- Confirm connect succeeds and room list loads
- Join room and perform at least 1 action (discard/react)

## Debug Signals
- Check UI diag section:
  - `readyState` not stuck at `CONNECTING`
  - `connectTimeoutStreak` should reset after successful connect
- Check server debug endpoint:
  - `GET /api/ws-debug`
  - Verify `connections` and `closes` counters look reasonable
