# Mac Lobby Acceptance Checklist

## Must-pass (P0)
- [ ] App launches in Preview mode without crash
- [ ] Language toggle (中文/EN) updates labels instantly
- [ ] Live mode connects to `ws://localhost:8787`
- [ ] Hello/Create/Join actions work in Live mode
- [ ] Add Bot updates player list with bot label
- [ ] Ready updates readiness state in room card
- [ ] Room card shows room id / phase / round info
- [ ] Buttons are temporarily disabled while action in progress

## Regression
- [ ] Web client can still create/join same room with mac client online
- [ ] Server logs show no unhandled exceptions during lobby actions

## Known non-goals (current stage)
- In-game hand/action UI is not finalized yet
- Release signing/notarization is not included yet
