> Navigation: [Docs Hub](../../../README.md) | [Core](../../../docs/core/core-readme.md) | [Platforms](../../../docs/platforms/mac/mac-readme.md) | [Roadmaps](../../../docs/overall-roadmap.md) | [QA](../../../docs/qa/qa-smoke-checklist.md)

# Mac App MVP Roadmap（Mac 应用 MVP 路线图）

## Phase 1 (Foundation)（阶段 1：基础建设）
- [x] Add app source scaffold (`src/App.tsx`)（初始化应用源码骨架）
- [x] Bootstrap react-native-macos host runtime (scripts + runbook + local host verified)（完成 react-native-macos Host 运行环境引导）
- [x] Render `src/App.tsx` in macOS host app（在 macOS Host 中渲染 `src/App.tsx`）

## Phase 2 (Playable lobby)（阶段 2：可用大厅）
- [x] Integrate shared realtime client flow (ws connect + message sync)（接入共享实时客户端流程：连接与消息同步）
- [x] Implement nickname / create room / join room（实现昵称、创建房间、加入房间）
- [x] Add room-level actions (add bot / ready / rematch)（增加房间级动作：加机器人/准备/再来一局）
- [x] Room/player sync (online, ready, score, rematch-ready)（房间与玩家状态同步）
- [x] Bilingual UI switch (中文 / EN)（中英文切换）
- [x] Random nickname + compact name input flow（随机昵称与紧凑输入流程）

## Phase 3 (Playable game - current)（阶段 3：可玩对局 - 当前）
- [x] Hand tile rendering (styled Mahjong-like cards)（手牌渲染：麻将样式牌面）
- [x] Click-to-discard in play phase（出牌阶段点击打牌）
- [x] Exchange phase interaction (select 3 + submit)（换三张交互：选三张并提交）
- [x] Lack suit selection controls（定缺选择控件）
- [x] Reaction controls (碰/杠/胡/过)（响应动作控件）
- [x] Self-hu / an-gang / bu-gang controls（自摸/暗杠/补杠控件）
- [x] Show per-player peng/gang groups (self + others)（展示各玩家碰杠牌组）
- [x] Basic table preview (turn seat / discards / hand)（基础牌桌视图：回合座位/弃牌/手牌）

## Phase 4 (Next hardening)（阶段 4：下一步加固）
- [ ] Replace text-only peng/gang summaries with tile-group visuals（将文本碰杠摘要替换为牌组视觉展示）
- [ ] Add settlement summary panel polish (per-round breakdown UI)（打磨结算摘要面板：每局分解 UI）
- [ ] Add reconnect/resume edge-case polish + explicit transient states（补强断线重连/恢复边界情况与中间态提示）
- [ ] Add focused mac UI regression checklist for full round flow（补充 Mac 端整局流程回归清单）

---

## Current Status Snapshot (2026-03-03 HST)（当前状态快照）

### What is working now（已可用能力）
- Mac app can connect in Live mode to local server (`ws://127.0.0.1:8787`)（Live 模式可连本地服务）
- Users can create/join room, add bot, ready, and request rematch（可建房/入房/加机器人/准备/再来一局）
- Core game interaction buttons exist for playable flow（核心对局交互已具备）：
  - discard（打牌）
  - exchange submit（提交换三张）
  - lack suit choose（选择定缺）
  - react (hu/gang/peng/pass)（响应：胡/杠/碰/过）
  - self-hu / an-gang / bu-gang（自摸/暗杠/补杠）
- Scoreboard and player peng/gang summary are displayed（已展示记分板与玩家碰杠摘要）
- Bilingual UI is available（支持中英文界面）

### Known limitations（当前限制）
- Meld visualization is currently text summary, not grouped tile clusters（碰杠仍偏文本化，不是完整牌组视图）
- UI polish/animation is still MVP-level（动效与视觉打磨仍是 MVP 水平）
- Release signing/notarization is documented but not completed（签名与公证流程仅有文档，尚未落地）

---

## Phase 5 (Mac Product Readiness - macOS specific)（阶段 5：Mac 产品化可用性 - macOS 专项）

### P0 must-have (from current product review)（P0 必做）
- [ ] Reconnect/resume reliability in Mac client（Mac 端断线重连与恢复可靠性）:
  - explicit reconnecting state（明确“重连中”状态）
  - auto resume to previous room/seat after transient network drop（短暂断网后自动恢复到原房间/座位）
  - safe fallback when resume fails (return to menu with clear reason)（恢复失败时安全回退到主菜单并给出原因）
- [ ] Match-end final scoreboard modal（整场结束最终记分弹窗）:
  - separate from per-round settlement（与单局结算弹窗分离）
  - include final ranking + total score + rounds summary（包含最终排名/总分/局数汇总）
  - explicit actions: rematch / back to menu（明确操作：再来一局/返回主菜单）
- [ ] Main menu scene（主菜单场景）:
  - username setup (persist locally)（用户名设置并本地持久化）
  - create room / join room entry points（创建房间/加入房间入口）
  - quit game action (desktop expected behavior)（退出游戏操作）
- [ ] In-room "Exit room" flow（房间内“退出房间”流程）:
  - leave current room and return to main menu（离开当前房间并返回主菜单）
  - clear room-scoped transient UI state（清理房间级临时 UI 状态）

### P1 strongly recommended (for real usability)（P1 强烈建议）
- [ ] Connection status ribbon + retry action in all major scenes (menu/room/table)（主菜单/房间/牌桌统一连接状态条与重试）
- [ ] Room lifecycle UX polish: empty/loading/error states for room actions（房间生命周期空态/加载态/错误态打磨）
- [ ] Basic scene split (`MenuScene` / `RoomScene` / `TableScene`) to reduce `App.tsx` coupling（按场景拆分组件，降低 `App.tsx` 耦合）

### Run (current local host path)（运行方式：当前本地 Host 路径）
```bash
cd /Users/jialin/Projects/mahjong/apps/mac/MahjongMacHost
npx react-native start --reset-cache
# new terminal（新终端）
npx react-native run-macos
```
