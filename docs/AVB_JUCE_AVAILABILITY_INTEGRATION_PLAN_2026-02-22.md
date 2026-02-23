# AVB + JUCE Availability and Channel Integration Plan

Date: 2026-02-22  
Owner: MAP2 AVB Engine + Backend + Web + Ops

## Objective

Resolve AVB "not available" behavior and missing JUCE AVB input/output channel visibility by unifying runtime readiness checks, channel capability modeling, and web/backend integration.

## Investigation Summary (As Built)

1. AVB routing web hooks call `response.json()` directly on successful HTTP responses.
   - `web/src/app/components/AvbRouting/hooks/useAvbApi.ts:123`
   - `web/src/app/components/AvbRouting/hooks/useNodeApi.ts:417`
2. Port mode split exists:
   - Port 3000 documented as static production server (`serve`) with SPA fallback: `web/PORTS.md:5`
   - Port 3001 documented as dev proxy mode to backend API: `web/PORTS.md:18`, `web/vite.config.ts:36`
3. Web startup script defaults dev mode to port 3000, increasing mode/proxy confusion:
   - `scripts/start-web.sh:86`
4. AVB readiness is checked differently in Python and C++:
   - Python (`config + interface + ptp4l binary`): `app/services/avb/__init__.py:17`
   - JUCE (`env/marker + MAP2_AVB_INTERFACE env + /run/ptp4l.pid`): `juce-engine/Source/Map2AudioEngine.cpp:414`
5. Setup paths persist AVB marker/config, but JUCE readiness relies heavily on env naming:
   - Marker/config writes: `scripts/setup_avb.sh:848`, `scripts/setup_avb.sh:874`
   - Marker with interface key in alternate setup path: `scripts/setup_avb_ptp.sh:260`
6. AVB devices endpoint uses JUCE-facing availability path (`AvbService.is_available()`):
   - `app/routes/avb.py:2045`
   - `app/services/avb/avb_service.py:144`
7. AVB router has async start/cleanup loops, but startup is not centrally wired in lifecycle orchestration:
   - Router start method exists: `app/services/avb/avb_router.py:182`
   - Singleton getter instantiates router but does not auto-start loops: `app/services/avb/avb_router.py:2109`
8. MAP2 endpoint discovery can fall back to synthetic `2ch/48k` stream metadata:
   - `app/services/avb/avb_router.py:810`
9. Audio ports API is local-engine-centric and independent from AVB endpoint inventory:
   - `app/routes/audio.py:1019`
   - Uses `alsa_device` key while JUCE system info emits `audio_device`: `app/routes/audio.py:1040`, `juce-engine/Source/PythonBindings.cpp:1771`

## Root Causes

1. Control-plane transport ambiguity:
   - Static frontend deployment paths can return HTML for `/api/*`, which is parsed as JSON by AVB hooks.
2. Readiness-model drift:
   - AVB status surfaces rely on different prerequisites and can disagree in the same runtime.
3. Config-to-runtime propagation gap:
   - AVB interface/enablement are not uniformly propagated to the JUCE AVB readiness contract.
4. Discovery lifecycle gap:
   - AVB router discovery/start lifecycle is not explicitly managed at backend startup.
5. Channel capability fragmentation:
   - JUCE local I/O channels, AVB endpoints, and AVDECC stream descriptors are not unified into one capability model.

## Industry-Standard Target State

Follow a single capability contract aligned to IEEE 802.1AS / 1722 / 1722.1 operations:

1. One canonical AVB readiness model:
   - `enabled`: config intent
   - `configured`: interface + daemon config present
   - `operational`: gPTP lock + transport ready
   - `degraded`: partial but non-fatal
2. One channel capability model:
   - local JUCE inputs/outputs
   - AVB talker/listener endpoints
   - AVDECC descriptor-derived stream channel counts
3. Deterministic API error semantics:
   - JSON-only error envelopes (RFC 7807-style structure)
   - explicit "proxy/static misroute" diagnostics when non-JSON detected
4. Explicit lifecycle orchestration:
   - AVB router/discovery start/stop bound to FastAPI lifespan and health endpoints.

## Execution Plan

## Phase 0: Immediate Containment (0-1 day)

- Standardize deployment runbook:
  - dev: Vite proxy path (3001 or script-driven proxy mode)
  - prod: backend/reverse-proxy path with API forwarding
- Add operator check: verify `/api/avb/status` and `/api/avb/devices` consistency before opening `/avb-routing`.

Deliverables:
- Updated runbook entry and troubleshooting table
- Quick diagnostics command list

## Phase 1: Readiness Contract Unification (1-2 days)

- Implement shared AVB readiness evaluator used by:
  - `/api/avb/status`
  - `/api/avb/devices`
  - JUCE readiness bridge
- Align interface source precedence:
  - config store
  - `/etc/map2/avb-enabled` metadata
  - `MAP2_AVB_INTERFACE` env override
- Replace PID-file-only readiness checks with service/process-status aware check.

Deliverables:
- Shared readiness module
- Refactored AVB route/service consumers
- Unit tests for cross-surface parity

## Phase 2: Channel Capability Integration (2-3 days)

- Define canonical channel capability schema:
  - `local_inputs[]`, `local_outputs[]`
  - `avb_talkers[]`, `avb_listeners[]`
  - `sample_rate`, `format`, `direction`, `source`
- Implement endpoint:
  - `GET /api/avb/capabilities/channels`
- Remove synthetic defaults when descriptor/engine data exists; mark unknown explicitly instead of forcing `2`.
- Bridge `/api/audio/ports` to canonical capability model (or expose stable adapter).

Deliverables:
- Backend schema + route + tests
- AVB UI and audio-port UI integration
- Updated docs (`AVB_ENDPOINT_SCHEMA.md` and audio route docs)

## Phase 3: Router Discovery Lifecycle Wiring (1 day)

- Start AVB router discovery/cleanup loops during app startup.
- Stop loops on shutdown.
- Add health/metrics counters:
  - discovery loop running
  - endpoint count by source
  - stale-removal counters

Deliverables:
- Lifecycle wiring in app startup
- Health route extension and tests

## Phase 4: Web/API Contract Hardening (0.5-1 day)

- Introduce shared safe JSON fetch helper in AVB hooks:
  - content-type validation
  - bounded response preview in errors
  - actionable remediation text for proxy/static mismatch
- Add tests for HTML/plaintext API responses and non-JSON success payloads.

Deliverables:
- Hook-level resilient fetch implementation
- Error contract tests

## Phase 5: Qualification and Rollout (hardware stage)

- Run AVB qualification matrix (`Q04-Q06`) after phases 1-4.
- Confirm:
  - no AVB availability contradictions across endpoints/UI
  - expected local and network channel inventory visible
  - AVB routing page loads without JSON parser errors
  - router discovery continuously updates endpoint inventory

Deliverables:
- Updated `docs/AVB_QUALIFICATION_MATRIX.md`
- Updated rollout/backout runbook evidence

## Acceptance Criteria

1. `/api/avb/status.available` and `/api/avb/devices.available` are consistent under the same runtime conditions.
2. UI shows explicit actionable error text for proxy/static misrouting; no raw JSON parser exceptions.
3. JUCE local input/output channels and AVB endpoint channels are visible through one canonical capability contract.
4. AVB router discovery loops are active and observable after backend startup.
5. Existing AVB route/connect/disconnect contracts remain backward-compatible.

## Risks and Controls

1. Risk: Contract changes break existing UI assumptions.
   - Control: compatibility adapter + contract tests.
2. Risk: Hardware-dependent readiness checks vary across hosts.
   - Control: degrade-state reporting, not binary pass/fail only.
3. Risk: Startup ordering race with AVB services.
   - Control: explicit lifecycle state machine and retry/backoff.

## Backout Strategy

1. Keep current endpoints active during migration (additive rollout).
2. Feature-flag canonical capability endpoint consumption in web UI.
3. Revert UI to legacy endpoint paths if integration regressions appear.
4. Preserve current AVB scripts and runbook commands as fallback.
