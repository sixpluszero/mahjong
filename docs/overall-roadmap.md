> Navigation: [Docs Hub](../README.md) | [Core](../docs/core/core-readme.md) | [Platforms](../docs/platforms/mac/mac-readme.md) | [Roadmaps](../docs/overall-roadmap.md) | [QA](../docs/qa/qa-smoke-checklist.md)

# Mahjong Overall Product Roadmap (商业化整体路线图)

## 1) Vision & North Star（愿景与北极星）
- Build a trusted, sticky, social Mahjong platform across Web + macOS + mobile wrappers.（打造一个可信赖、高留存、强社交的跨端麻将平台）
- North Star metric: weekly active tables (WAT) with >=2 human players.（北极星指标：每周活跃牌桌数，且每桌至少 2 名真人）
- Business target: sustainable paid conversion without pay-to-win.（商业目标：在不破坏公平性的前提下形成可持续付费）

## 2) Product Success Pillars（成功支柱）
- Reliability first: reconnect/resume, anti-drop frustration, stable rounds.（可靠性优先：断线恢复、低挫败、对局稳定）
- Social depth: rooms, invites, friends, lightweight community loops.（社交深度：房间、邀请、好友、轻社区循环）
- Session quality: fast matchmaking/rooming, clear UX, low click friction.（对局体验：快进快出、信息清晰、低操作阻力）
- Fairness & trust: anti-cheat, transparent scoring/history, abuse controls.（公平与信任：防作弊、计分可追溯、反滥用）
- Monetization by identity/aesthetics/convenience, not unfair power.（通过身份、外观、便利性变现，而非数值优势）

## 3) Strategic Roadmap（战略路线）

### Phase A (0-2 months): Product Readiness Baseline（产品可用性基线）
Goal: make the game “reliably playable” for non-technical users.（目标：让非技术用户稳定可玩）
- Core:
  - mac main menu + room scene + in-room leave flow.（mac 主菜单/房间场景/退房回主菜单）
  - robust reconnect/resume UX across web/mac.（Web/Mac 统一断线重连与恢复体验）
  - final match-end scoreboard modal and round archive entry.（整场结束总记分弹窗 + 战绩归档）
  - error states with actionable recovery (retry/rejoin/back menu).（可操作错误态：重试/重连/返回主菜单）
- Quality:
  - full round regression checklist (web + mac).（全链路回归清单）
  - protocol contract hardening + compatibility tests.（协议契约加固与兼容测试）
- Exit criteria:
  - reconnect success >= 95% for transient disconnects.（短暂断线恢复成功率 >=95%）
  - complete-round success >= 99% in nightly stress suites.（夜间压测整局完成率 >=99%）

### Phase B (2-4 months): Growth Loop & Social Layer（增长闭环与社交层）
Goal: increase invite rate and 7-day retention.（目标：提高邀请率和 7 日留存）
- Features:
  - invite link lifecycle (copy/share/deep-link/rejoin).（邀请链路：复制分享、深链、回流）
  - friend list + recent teammates/opponents.（好友与最近同桌）
  - lightweight club/room tags and private room presets.（轻量俱乐部/房间标签与房规预设）
  - post-game share card (result snapshot).（局后分享卡片）
- Metrics:
  - invite-to-join conversion rate.（邀请转化率）
  - D1/D7 retention segmented by first-session type (solo/bot/friend room).（按首局类型分层的 D1/D7 留存）

### Phase C (4-7 months): Economy & Monetization v1（经济系统与变现 v1）
Goal: launch fair monetization and validate payer behavior.（目标：上线公平变现并验证付费行为）
- Monetization scope:
  - cosmetics: table skins, tile backs, avatar frames, effects.（外观：牌桌/牌背/头像框/特效）
  - convenience: profile slots, room templates, advanced stats panel.（便利：配置模板、进阶数据面板）
  - optional subscription: ad-free + premium cosmetics pass.（可选订阅：无广告+主题通行证）
- Guardrails:
  - no gameplay stat boosts for paid users.（禁止付费数值加成）
  - explicit economy policy + odds disclosure if loot mechanics exist.（若含抽取机制，必须概率披露）
- Metrics:
  - payer conversion, ARPPU, 30-day payer retention.（付费转化、ARPPU、30日付费留存）

### Phase D (6-10 months): Competitive Integrity & Live Ops（竞技完整性与运营体系）
Goal: support larger scale and trust-sensitive usage.（目标：支持规模化与信任敏感场景）
- Integrity:
  - anti-collusion heuristics + suspicious table alerts.（防串通规则与异常牌桌告警）
  - dispute replay tools from server event logs.（基于事件日志的争议回放）
  - moderation/admin controls (mute/kick/report).（治理后台：禁言/踢出/举报处理）
- Live Ops:
  - seasonal events, missions, progression.（赛季活动、任务与成长）
  - experiment framework (A/B for onboarding/paywall/events).（A/B 实验框架）
  - CRM triggers (returning reminders, friend-online nudges).（召回与社交提醒策略）

### Phase E (9-12 months): Distribution Expansion（分发扩张）
Goal: broaden acquisition channels and platform footprint.（目标：拓展获客渠道与平台覆盖）
- Platform:
  - packaged mobile app/wrapper strategy execution.（移动端打包与分发落地）
  - app-store compliance and review operations.（应用商店合规与提审流程）
  - account system upgrade (guest -> bound identity).（账号体系升级：游客到绑定账号）
- Commercial:
  - partnerships (content/IP/theme packs).（联动合作：主题/IP 皮肤包）
  - regionalized pricing and campaign calendar.（区域化定价与活动档期）

## 4) Capability Tracks (run in parallel)（并行能力建设）

### Track 1: Core Engineering（核心工程）
- Shared engine correctness + deterministic replay.（规则正确性与可复盘）
- Protocol versioning and schema validation.（协议版本化与 schema 校验）
- Performance budgets and crash/error observability.（性能预算与可观测性）

### Track 2: UX & Client Architecture（体验与客户端架构）
- Scene-based architecture (`Menu/Room/Table/Result`).（按场景拆分）
- UI system consistency across web/mac/mobile.（跨端视觉与交互一致性）
- Accessibility baseline for readable/touch-first gameplay.（可访问性基线）

### Track 3: Data & Analytics（数据与分析）
- Event taxonomy for onboarding/session/monetization funnel.（行为埋点体系）
- KPI dashboard with weekly product review cadence.（周度指标看板）
- Cohort analysis by channel, room type, and device.（按渠道/房型/设备做 cohort）

### Track 4: Operations & Compliance（运营与合规）
- Terms/privacy/age gating/region policy readiness.（条款、隐私、年龄与地域策略）
- Abuse prevention and moderation SLA.（滥用治理与响应 SLA）
- Incident response playbooks.（故障应急预案）

## 5) Priority Backlog (next 8 weeks)（未来 8 周优先级）
1. mac main menu + leave-room-to-menu + state reset contract.（mac 主菜单与退房回主菜单）
2. cross-client reconnect/resume state machine and UX copy.（跨端断线恢复状态机与文案）
3. final match-end scoreboard with historical entry point.（终局总记分弹窗与历史入口）
4. invite flow polish (share/join/rejoin/error fallback).（邀请链路打磨）
5. instrumentation baseline: session funnel + reliability KPIs.（埋点与可靠性 KPI 基线）
6. anti-cheat v0: anomaly flags and manual review console.（防作弊 v0 与人工复核台）

## 6) Commercial Readiness Gates（商业化就绪闸门）
- Gate G1 (Playable Trust): reliability + fairness + recovery UX pass.（可玩信任闸门）
- Gate G2 (Retention): D7 retention reaches target in friend-room cohort.（留存闸门）
- Gate G3 (Monetization): fair monetization with stable payer conversion.（变现闸门）
- Gate G4 (Scale): moderation and live-ops can handle growth spikes.（规模化闸门）

## 7) Suggested KPI Targets (initial)（建议 KPI 初始目标）
- Technical:
  - Round completion rate >= 99%.（整局完成率 >=99%）
  - Crash-free sessions >= 99.5%.（无崩溃会话 >=99.5%）
  - Median reconnect recovery < 3s.（重连恢复中位时长 <3 秒）
- Product:
  - D1 >= 35%, D7 >= 15% (friend-room cohort higher).（留存目标）
  - Invite acceptance >= 25%.（邀请接受率 >=25%）
  - 3+ rounds per active day (human tables).（人局日均 >=3 局）
- Business:
  - payer conversion 1-3% in v1 monetization window.（初期付费转化 1-3%）
  - positive sentiment on fairness in feedback channels.（公平性口碑为正）

## 8) What not to do early（早期不建议做）
- Do not overbuild competitive ranking before reliability/social loops are stable.（在可靠性与社交闭环稳定前，不要重投入排位体系）
- Do not introduce pay-to-win mechanics.（不要引入影响胜负的付费能力）
- Do not fragment codebases per platform too early.（不要过早分裂多套前端代码）

## 9) Decision Cadence（决策节奏）
- Weekly: KPI + incident + top friction review.（每周：指标+事故+高摩擦点复盘）
- Biweekly: roadmap reprioritization by data.（双周：基于数据重排优先级）
- Monthly: commercial/ops checkpoint and go/no-go on next phase.（每月：商业与运营闸门评审）
