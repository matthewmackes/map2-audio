# PlatformEvent Control Plane

Last updated: 2026-04-19

MAP2 uses a hard-cut PlatformEvent architecture for cross-system notifications, status events, and operator-facing surface presentation.

## Canonical Entrypoint

`PlatformEventBus.emit()` is the only supported cross-system event entrypoint for backend producers. New backend code that needs cluster fanout, replay, audit history, or presentation on web, LCD, MK1, TUI, Push, or MCU surfaces must emit a canonical `PlatformEvent`.

Local web-only UI feedback may stay local through `pushNotification()` when it has no cluster, audit, replay, or hardware-surface value.

## Removed Contracts

Do not restore deleted legacy event buses, public legacy LCD/cluster event routes, re-export modules, or compatibility adapters for removed event contracts. If a caller needs a platform event, migrate that caller to the canonical envelope, factory, presenter, and `PlatformEventBus.emit()` path.

## Post-Cutover Work

Follow-on improvements belong in the T2364 epic and must improve the new architecture directly. Engine-native emission must use an RT-safe handoff, and frontend store cleanup must keep the platform event provider/router/store as the single frontend control-plane path.
