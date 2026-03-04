# Mahjong Architecture / 麻将项目架构

## 1) Purpose / 目标
- CN: 本文档描述项目当前技术架构与协作约定，供多个 agent 并行开发时快速对齐。
- EN: This document describes the current architecture and collaboration rules so multiple agents can work in parallel safely.

## 2) Monorepo Layout / 仓库结构
- `packages/shared`:
  - CN: 纯规则与状态机（无网络、无 UI），是唯一规则真源。
  - EN: Pure rules and game state machine (no network/UI). This is the single source of truth for game logic.
- `packages/server`:
  - CN: 权威 WebSocket 服务端，负责房间生命周期、会话恢复、托管、机器人调度、广播。
  - EN: Authoritative WebSocket server for room lifecycle, session resume, autopilot, bot scheduling, and broadcasting.
- `packages/web`:
  - CN: 浏览器客户端（单页），负责交互、渲染、连接管理与重连。
  - EN: Browser SPA client handling interaction, rendering, connection management, and reconnect/resume.
- `apps/mac`:
  - CN: macOS 客户端（React Native for macOS host + 共享前端逻辑），负责桌面牌桌 UI、房间管理面板、结算弹窗与本地交互体验。
  - EN: macOS client (React Native macOS host + shared client logic) for desktop table UI, room-management panel, settlement modal, and local UX.
- Root scripts:
  - CN: `npm run dev:server`, `npm run dev:mac`, `npm run test`, `npm run stress`。
  - EN: `npm run dev:server`, `npm run dev:mac`, `npm run test`, `npm run stress`.

## 3) Layered Architecture / 分层架构
- CN: `web -> server(protocol) -> shared(engine)`，其中 server 是唯一裁判。
- EN: `web -> server(protocol) -> shared(engine)`, with server as the sole authority.
- CN: 客户端只发意图，不做规则裁定。
- EN: Client sends intents only; it does not validate authoritative rules.

## 4) Core Runtime Flow / 关键运行流
### 4.1 Game Round Flow / 单局流程
- CN: `exchange -> lack -> play -> settlement`。
- EN: `exchange -> lack -> play -> settlement`.
- CN: `shared` 内实现胡/杠/碰优先级、定缺约束、结算、终局条件。
- EN: `shared` implements reaction priorities, missing-suit constraints, settlement, and round termination.

### 4.2 Room & Match Flow / 房间与整场流程
- CN: 4 座位房间，满员且全部 ready 自动开局。
- EN: 4-seat rooms; game auto-starts when all seats are occupied and ready.
- CN: 默认最多 `8` 局（`maxRounds`）；达到上限 `matchFinished=true`，不再续局，输出 `finalStandings`。
- EN: Default max `8` rounds (`maxRounds`); once reached, `matchFinished=true`, rematch stops, and `finalStandings` is emitted.

### 4.3 Disconnect/Resume/Autopilot / 断线恢复与托管
- CN: 真人对局中断线后保留座位，标记 `online=false, auto=true`，由托管接管。
- EN: When a human disconnects mid-game, seat is retained and marked `online=false, auto=true`; autopilot takes over.
- CN: 服务端下发 `seat_assigned`（含 `resumeToken`），客户端可发 `resume_room` 恢复原座。
- EN: Server emits `seat_assigned` with `resumeToken`; client can call `resume_room` to recover the seat.
- CN: 若无真人在线，房间启动 30 分钟倒计时，超时自动关房。
- EN: If no human is online, a 30-minute room idle timer starts, then room auto-closes.

## 5) Networking Model / 网络模型
- Transport: WebSocket (`ws`/`wss`).
- Spec file: `packages/server/PROTOCOL.md`.
- Important client->server messages:
  - `hello`, `create_room`, `join_room`, `resume_room`, `set_ready`, `add_bot`,
  - `submit_exchange`, `set_lack`, `discard`, `self_hu`, `an_gang`, `bu_gang`, `react`, `request_rematch`, `list_rooms`.
- Important server->client messages:
  - `welcome`, `hello_ack`, `seat_assigned`, `resume_ack`, `room_state`, `game_state`, `rooms_list`, `error`.

## 6) Key Data Contracts / 关键数据契约
### 6.1 shared GameState (engine) / 引擎状态
- CN: 包含 `phase`, `turnSeat`, `wall`, `players[]`, `pendingReactions`, `settlementEvents`, `settlementReason`。
- EN: Includes `phase`, `turnSeat`, `wall`, `players[]`, `pendingReactions`, `settlementEvents`, `settlementReason`.

### 6.2 server RoomState (session + match) / 房间状态
- CN: 在引擎之外维护房间级状态：`roundNo`, `maxRounds`, `matchFinished`, `roundHistory`, `finalStandings`, `rematchReadySeats`。
- EN: Maintains room-level state outside engine: `roundNo`, `maxRounds`, `matchFinished`, `roundHistory`, `finalStandings`, `rematchReadySeats`.
- CN: 玩家席位附加字段：`isBot`, `online`, `auto`, `totalScore`, `resumeToken`。
- EN: Seat metadata includes `isBot`, `online`, `auto`, `totalScore`, `resumeToken`.
- CN: 结算阶段附加可视化数据（供 web/mac 使用）：`state.settlementEvents`、`roundHistory[-1].scoreChanges`、`revealedHands`（结算亮牌）。
- EN: Settlement-phase visualization payloads (for web/mac): `state.settlementEvents`, `roundHistory[-1].scoreChanges`, and `revealedHands`.

## 7) Bot & Autopilot Logic / 机器人与托管策略
- CN: 机器人与托管共用决策入口（服务端），优先级：`hu > gang > peng > pass`；回合中优先 `self_hu`/杠，再出牌。
- EN: Bots and autopilot share the same decision path on server: `hu > gang > peng > pass`; on turn, prefer `self_hu`/kongs before discard.
- CN: 有真人在线时动作延迟 1 秒（提高可读性）；无人在线时使用快速节奏。
- EN: With online humans, bot/autopilot action delay is 1s; without humans, fast pacing is used.
- CN: 无真人在线且到结算时，不自动进入下一局（等待真人回房）。
- EN: At settlement with no human online, no auto-rematch is triggered.

## 8) Frontend Architecture / 前端架构
- Web (`packages/web`):
  - CN: 主逻辑集中在 `packages/web/src/app.js`（单文件状态容器 + 消息处理 + 渲染函数）。
  - EN: Main logic currently lives in `packages/web/src/app.js` (single-file state container + message handlers + render functions).
  - CN: 重连策略为指数退避，并在本地存储 `resumeSession`。
  - EN: Reconnect uses exponential backoff and persists `resumeSession` in localStorage.
  - CN: UI包含房间区、对局区、结算区、历史/总分/走势/最终统计。
  - EN: UI includes room controls, gameplay panel, settlement timeline, and history/totals/trend/final stats.
- macOS (`apps/mac`):
  - CN: 通过 `apps/mac/src/lobby-runtime.ts` 对接同一 WebSocket 协议（与 web 共享服务端契约）。
  - EN: Uses `apps/mac/src/lobby-runtime.ts` to consume the same WebSocket protocol contract as web.
  - CN: 牌桌 UI 位于 `apps/mac/src/App.tsx`，包含座位面板、弃牌河、动作条、倒计时、结算弹窗、亮牌展示与得分信息流。
  - EN: Table UI lives in `apps/mac/src/App.tsx`, including seat panels, discard rivers, action tray, countdown, settlement modal, revealed-hands view, and score feed.
  - CN: mac 客户端属于展示层，不做规则裁定；所有规则与结算来源仍是 `shared + server`。
  - EN: mac client remains a presentation layer; rule/settlement authority remains `shared + server`.

## 9) Testing Strategy / 测试策略
- Unit tests:
  - CN: `@mahjong/shared` 使用 Node test 覆盖规则与状态机。
  - EN: `@mahjong/shared` uses Node tests for rules and state-machine coverage.
- Integration/stress:
  - CN: `packages/server/scripts/stress-random.mjs` 做 4 客户端随机对局压测。
  - EN: `packages/server/scripts/stress-random.mjs` runs 4-client randomized stress games.
- Practical E2E:
  - CN: 可通过 `debug-client.js` 或自定义 ws 脚本验证断线恢复与托管。
  - EN: Use `debug-client.js` or custom ws scripts to verify resume/autopilot behavior.

## 10) Collaboration Rules For Agents / 多 Agent 协作约定
- CN: 规则修改优先在 `shared`，不要把规则散落到 `server/web`。
- EN: Rule changes should primarily happen in `shared`; avoid duplicating rules in `server/web`.
- CN: 协议变更必须同步更新 `packages/server/PROTOCOL.md` 与前端消息处理。
- EN: Any protocol change must update both `packages/server/PROTOCOL.md` and frontend handlers.
- CN: 房间/会话级功能（重连、托管、局数上限）放在 `server`。
- EN: Room/session features (resume, autopilot, max rounds) belong in `server`.
- CN: 提交前至少执行 `npm test`，必要时跑 `npm run stress`。
- EN: Run at least `npm test` before commit; run `npm run stress` when needed.
- CN: 新增状态字段时，先定义契约，再改渲染；保证向后兼容容错。
- EN: For new state fields, define contract first, then render; keep backward-compatible tolerance.

## 11) Recommended Next Refactors / 建议后续重构
- CN: 将 `web/src/app.js` 拆分为 `connection/room/game/render` 模块。
- EN: Split `web/src/app.js` into `connection/room/game/render` modules.
- CN: 增加服务端集成测试（断线、托管、8 局封盘、30 分钟关房）。
- EN: Add server integration tests for disconnect/resume, autopilot, 8-round cap, and idle close.
- CN: 为协议引入类型层（JSDoc typedef 或 TS）减少字段漂移。
- EN: Add typed protocol contracts (JSDoc typedef or TypeScript) to reduce schema drift.
