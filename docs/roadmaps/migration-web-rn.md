> Navigation: [Docs Hub](../../README.md) | [Core](../../docs/core/core-readme.md) | [Platforms](../../docs/platforms/mac/mac-readme.md) | [Roadmaps](../../docs/overall-roadmap.md) | [QA](../../docs/qa/qa-smoke-checklist.md)

# Web + React Native Parallel Architecture Plan / Web 与 React Native 并行架构计划

## Goal / 目标

**EN**: Keep the existing web client shipping fast, while building React Native clients for iOS and macOS without duplicating game/business logic.

**中文**：保留当前网页端的快速迭代能力，同时建设 iOS / macOS 的 React Native 客户端，并避免重复实现游戏/业务逻辑。

---

## Target Monorepo Structure / 目标目录结构

```text
mahjong/
  apps/
    mobile/                 # React Native iOS app
    mac/                    # react-native-macos app
  packages/
    shared/                 # Existing game rules/state engine (already in use)
    server/                 # Existing WS authoritative server
    web/                    # Existing browser client
    client-core/            # NEW: shared client runtime (transport/state/session)
```

---

## Responsibility Split / 职责拆分

### 1) `@mahjong/shared`
- **EN**: Rule engine, tile model, scoring/state transitions.
- **中文**：规则引擎、牌模型、计分与状态流转。

### 2) `@mahjong/client-core` (new)
- **EN**: Shared client runtime independent from UI framework.
  - WS connect/reconnect
  - resume session
  - room/game state store
  - typed message contracts (future)
- **中文**：与 UI 框架无关的共享客户端运行时。
  - WS 连接/重连
  - 会话恢复
  - 房间/牌局状态存储
  - 消息协议约束（后续补齐）

### 3) UI Layers
- **EN**: platform-specific views only.
- **中文**：仅保留平台相关视图层。
  - `packages/web`: browser DOM rendering
  - `apps/mobile`: RN iOS UI
  - `apps/mac`: RN macOS UI

---

## 4-Week Execution Plan / 4 周执行计划

### Week 1: Foundation / 基础搭建
- Create `packages/client-core` skeleton
- Add `apps/mobile` and `apps/mac` placeholders
- Define shared client state model and events
- Keep web behavior unchanged

### Week 2: Web decoupling / Web 解耦
- Move WS lifecycle + state transitions from web app into `client-core`
- Web uses `client-core` adapter
- Preserve all existing web features

### Week 3: RN bootstrap / RN 启动
- Wire `client-core` into RN apps
- Implement minimal lobby flow (hello/create/join)
- Validate room sync across web + RN

### Week 4: Gameplay parity / 对局能力对齐
- Add game action UI in RN (exchange/lack/discard/reaction)
- Recovery/autoplay/settlement parity checks
- Cross-platform QA checklist pass

---

## Acceptance Criteria / 验收标准

1. **EN**: Web remains fully functional with no regression in existing tests.
   **中文**：Web 功能保持完整，现有测试无回归。

2. **EN**: `client-core` is UI-agnostic and reused by web + RN.
   **中文**：`client-core` 与 UI 解耦，被 web + RN 复用。

3. **EN**: RN can complete P0 flow: hello -> create room -> join room -> room state sync.
   **中文**：RN 至少打通 P0 流程：确认昵称 -> 创建房间 -> 加入房间 -> 房间状态同步。

4. **EN**: Shared protocol/state behavior is consistent across platforms.
   **中文**：跨平台协议与状态行为一致。

---

## What is started in this commit / 本次提交已启动内容

- Added this bilingual architecture plan.
- Added workspace scaffolding for:
  - `packages/client-core`
  - `apps/mobile`
  - `apps/mac`
- Updated root workspace config to include `apps/*`.

Next implementation step: move web WS runtime into `client-core` incrementally.
