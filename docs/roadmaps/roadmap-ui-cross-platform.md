> Navigation: [Docs Hub](../../README.md) | [Core](../../docs/core/core-readme.md) | [Platforms](../../docs/platforms/mac/mac-readme.md) | [Roadmaps](../../docs/overall-roadmap.md) | [QA](../../docs/qa/qa-smoke-checklist.md)

# Cross-Platform GUI Evolution Roadmap

## Objective
Evolve the current web debug client into a stable, touch-friendly, cross-platform Mahjong GUI that works on desktop browsers, iPad/tablet browsers, Android/iOS home-screen installs (PWA), and future native shells with minimal duplication.

## Current Baseline (2026-03-02)
- Monorepo packages are already split by responsibility:
  - `packages/shared`: game rules and state logic
  - `packages/server`: authoritative state + static file hosting
  - `packages/web`: browser UI
- Web client is functionally complete for gameplay but primarily desktop/debug oriented.
- Server directly serves static assets from `packages/web/src` via explicit path map.

## Guiding Principles
- Keep `shared` as single source of gameplay truth.
- Keep transport protocol (`server`) backward compatible while evolving UI.
- Prefer incremental, shippable milestones with low regression risk.
- Maintain one web codebase first; only add native wrappers after web UX is stable.

## Roadmap Phases

## Phase 1: PWA Foundation (Usable)
Goal: Make current web client installable and reliable on mobile/tablet.

Deliverables:
- Web app manifest (`manifest.webmanifest`)
- Basic service worker with app-shell cache only
- Service worker registration at app entry
- Mobile meta tags in HTML
- Responsive layout polish for tablet/mobile breakpoints
- README section for LAN mobile testing + PWA install

Acceptance:
- App loads at server LAN URL on iPad/phone.
- “Add to Home Screen” installation succeeds.
- Reload while online is stable; cached shell is used when app assets are unchanged.

## Phase 2: Touch-First Interaction & Information Layout
Goal: Make gameplay efficient on touch devices without reducing desktop usability.

Deliverables:
- Restructure gameplay area into touch zones (hand/action/reactions/discards).
- Larger tap targets for tile/action controls.
- Sticky action bar for high-frequency operations.
- Better typography hierarchy and spacing for room/game status.

Acceptance:
- Core actions (discard/reaction/ready/rematch) are operable one-handed on tablet.
- No horizontal overflow at common widths (768/834/1024).

## Phase 3: UI Architecture Hardening
Goal: Make frontend easier to iterate and test across platforms.

Deliverables:
- Separate UI state projection from DOM rendering.
- Introduce modular view components (room panel, hand panel, settlement panel).
- Add lightweight UI integration tests for critical user flows.

Acceptance:
- UI updates can be changed per panel without side effects in unrelated panels.
- Key flows have automated regression coverage.

## Phase 4: Platform Packaging and Distribution
Goal: Expand beyond browser while preserving shared web UI.

Deliverables:
- Evaluate wrapper path (Capacitor or similar) for iOS/Android packaging.
- Add build profiles and environment docs for package/release.
- Define offline/online behavior boundaries and reconnect UX.

Acceptance:
- Same web bundle runs in browser and wrapper with consistent gameplay behavior.
- Basic signed internal builds available for mobile QA.

## Phase 5: Production Readiness and Accessibility
Goal: Raise reliability and usability to production level.

Deliverables:
- Error boundaries and telemetry hooks for UI failures.
- Accessibility pass (contrast, keyboard focus order, ARIA where needed).
- Performance budget for first load and runtime interactions.

Acceptance:
- No blocker accessibility issues for core actions.
- Defined SLOs for reconnect success and UI interaction latency.

## Work Breakdown Template Per Phase
For each phase execution:
1. Design note (scope, wireframe, risks).
2. Minimal implementation PR.
3. Manual verification matrix (desktop/tablet/mobile).
4. Automated test updates.
5. Rollout notes and fallback plan.

## Risks and Mitigations
- Risk: Static-file route drift between web assets and server map.
  - Mitigation: keep explicit static map updated in same PR as asset changes.
- Risk: Mobile UX tweaks regress desktop readability.
  - Mitigation: breakpoint-scoped CSS and smoke test on desktop widths.
- Risk: PWA expectations exceed current offline guarantees.
  - Mitigation: explicitly limit service worker to app-shell caching first.

## Immediate Next Step
Execute Phase 1 fully (this iteration), then validate on:
- Desktop browser (`http://localhost:8787`)
- iPad/phone over LAN (`http://<LAN_IP>:8787`)
- Home-screen install behavior and reload path.
