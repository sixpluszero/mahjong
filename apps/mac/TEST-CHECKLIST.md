# Mac Client Manual Test Checklist (Lobby MVP)

## 0. Boot
- [ ] mac host app launches and renders `apps/mac/src/App.tsx`
- [ ] Preview mode shows connected status

## 1. Live connection
- [ ] Switch to Live mode
- [ ] `Connected: Yes` appears when server is running
- [ ] Stop server -> status becomes disconnected

## 2. Lobby actions
- [ ] Enter name and click Hello
- [ ] Create room updates room status
- [ ] Join room with room ID
- [ ] Players list syncs from server room_state

## 3. Regression
- [ ] Web still works for create/join after mac tests
- [ ] No server console errors from mac handshake
