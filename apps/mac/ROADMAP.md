# Mac App MVP Roadmap

## Phase 1 (Foundation)
- [x] Add app source scaffold (`src/App.tsx`)
- [x] Bootstrap react-native-macos host runtime (scripts + runbook + local host verified)
- [x] Render `src/App.tsx` in macOS host app

## Phase 2 (Playable lobby)
- [x] Integrate shared realtime client flow (ws connect + message sync)
- [x] Implement nickname / create room / join room
- [x] Add room-level actions (add bot / ready / rematch)
- [x] Room/player sync (online, ready, score, rematch-ready)
- [x] Bilingual UI switch (中文 / EN)
- [x] Random nickname + compact name input flow

## Phase 3 (Playable game - current)
- [x] Hand tile rendering (styled Mahjong-like cards)
- [x] Click-to-discard in play phase
- [x] Exchange phase interaction (select 3 + submit)
- [x] Lack suit selection controls
- [x] Reaction controls (碰/杠/胡/过)
- [x] Self-hu / an-gang / bu-gang controls
- [x] Show per-player peng/gang groups (self + others)
- [x] Basic table preview (turn seat / discards / hand)

## Phase 4 (Next hardening)
- [ ] Replace text-only peng/gang summaries with tile-group visuals
- [ ] Add settlement summary panel polish (per-round breakdown UI)
- [ ] Add reconnect/resume edge-case polish + explicit transient states
- [ ] Add focused mac UI regression checklist for full round flow

---

## Current Status Snapshot (2026-03-03 HST)

### What is working now
- Mac app can connect in Live mode to local server (`ws://127.0.0.1:8787`)
- Users can create/join room, add bot, ready, and request rematch
- Core game interaction buttons exist for playable flow:
  - discard
  - exchange submit
  - lack suit choose
  - react (hu/gang/peng/pass)
  - self-hu / an-gang / bu-gang
- Scoreboard and player peng/gang summary are displayed
- Bilingual UI is available

### Known limitations
- Meld visualization is currently text summary, not grouped tile clusters
- UI polish/animation is still MVP-level
- Release signing/notarization is documented but not completed

### Run (current local host path)
```bash
cd /Users/jialin/Projects/mahjong/apps/mac/MahjongMacHost
npx react-native start --reset-cache
# new terminal
npx react-native run-macos
```
