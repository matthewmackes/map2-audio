# MAP2 Architecture and Design Concepts Evaluation

Date: 2026-03-10  
Worklist task: `T081-subD`

## Executive assessment

MAP2 has an architecture, but it does not yet have a disciplined product architecture.

The codebase clearly contains intended layers:

- JUCE/C++ real-time engine
- Python service/control plane
- FastAPI routes
- React web shell and pages
- deployment/runtime/configuration wrappers

The problem is that these layers are too often bypassed or fused together in practice. The result is a platform that can move quickly, but where each new subsystem increases global coupling faster than local cohesion.

The most important architecture judgment from this pass is:

**MAP2 is over-centralized at the boundaries.**

Routes know too much. The web shell knows too much. The Python-to-C++ bridge is a direct dependency for too many surfaces. State truth is split across too many places. That is workable in a fast-moving prototype platform, but it is expensive for a product trying to become reliable and comprehensible.

## High-level dependency shape

### Current shape

```text
React pages/components
    -> AppShell + page-local hooks/apis
    -> FastAPI routes
    -> Python services / singleton managers
    -> juce_engine_service
    -> C++ JUCE engine
```

Alongside that main path, MAP2 also has parallel control planes:

```text
systemd / shell installers / env vars
    -> deployment policy
    -> runtime behavior

database / in-memory singleton services / websocket event streams
    -> overlapping state views
```

The architecture is therefore not one clean stack. It is several partially overlapping stacks.

## What the dependency hotspots say

### 1. Route modules are not consistently thin

Dependency hotspot scan from this pass:

- `app/routes/avb.py` imports `48` service symbols
- `app/routes/cluster_admin.py` imports `18`
- `app/routes/plugins.py` imports `16`
- `app/routes/pipewire.py` imports `12`
- `app/routes/midi_hub.py` imports `12`

This is the clearest sign that the API layer is carrying orchestration complexity that should live in narrower application services.

When a route module imports double-digit services, one of two things is happening:

1. the route is functioning as an application coordinator rather than a transport boundary
2. the subsystem underneath it has not been collapsed into coherent service seams

MAP2 shows both patterns.

### 2. `juce_engine_service` is the de facto center of gravity

From the same hotspot scan:

- `juce_engine_service` is imported by `50` route modules
- it is also imported by `14` services

That is a strong architectural smell.

The Python-to-C++ bridge is supposed to be an integration boundary. In MAP2 it is also a shared dependency hub. That means:

- engine concepts leak outward into many route surfaces
- many subsystems are coupled to engine availability and engine semantics
- changing the bridge shape becomes expensive across the entire backend

This does not mean the bridge is badly written. It means the system depends on it too directly and too widely.

### 3. Frontend shell complexity is becoming product-architecture complexity

`web/src/app/layout/AppShell.tsx` currently owns or coordinates all of the following at once:

- top navigation
- advanced menu grouping
- hardware submenu behavior
- MPX-1 mega-menu behavior
- special-settings-driven route promotion
- websocket connection banner state
- password/special-settings dialogs
- mobile navigation state
- some live MPX-1 state integration

That is too much responsibility for a shell component.

The result is not just a large file. The result is that product taxonomy, navigation policy, feature promotion, live system state, and responsive shell behavior are all fused into one UI boundary.

That is a classic path toward brittle UX changes.

## Sources of truth are split

MAP2 does not have one runtime truth model. It has several.

### Current truth holders

1. `app/config.py` and direct environment-variable reads
2. `~/.map2/deployment.json` via `app/deployment/deployment.py`
3. database-backed state and history
4. singleton Python service state in memory
5. JUCE engine runtime state in C++
6. websocket event streams and frontend React Query caches
7. user-facing special settings in the web layer

This split is not automatically wrong. It is wrong when the boundaries between these truths are unclear.

In MAP2, several boundaries are still blurry:

- deployment mode is persisted in JSON, but actual runtime behavior is also shaped by env vars and systemd
- engine running state is partly inferred in Python wrappers rather than always sourced from one canonical engine status contract
- frontend navigation and feature promotion are partly user-configured at the UI layer rather than derived from a unified capabilities model

Architectural consequence:

- debugging becomes a question of "which truth lost" instead of "what changed"
- feature gating gets duplicated
- state drift becomes easier to create than to detect

## Layering judgment

### What is good

- There is a real service layer rather than routes calling the database or engine directly in every case.
- The JUCE engine boundary is explicit and named.
- Deployment policy is at least recognized as a first-class concern.
- WebSocket and REST are both intentionally used rather than bolted on randomly.

### What is weak

- API routes still know too much about concrete services.
- Service namespaces are broad but not always cohesive.
- The frontend shell owns both navigation and product capability logic.
- Deployment policy, runtime health, and actual service activation are not clearly unified under one authority.

## WebSocket / REST boundary

The MAP2 split between REST and WebSocket is understandable, but not yet clean.

### Current pattern

- REST handles configuration, control, and many status reads.
- WebSocket handles metering, MIDI activity, and live status updates.
- Some operator workflows still rely on repeated REST polling even when they are effectively live-state problems.
- Some live-state features depend on shell-level websocket status while deeper page semantics remain page-local.

Architectural issue:

The split is based more on historical implementation convenience than on a crisp contract such as:

- REST = commands and snapshots
- WebSocket = subscriptions and deltas

MAP2 is trending in that direction, but it is not yet fully there.

## Extensibility judgment

### Easy to add

- a new route file
- a new service module
- a new page/component
- a new advanced menu entry
- a new runbook or qualification document

### Expensive to add well

- a new device type that needs backend, UI, runtime policy, docs, and qualification coherence
- a new DSP feature that crosses JUCE, Python bindings, backend services, routes, and UI
- a new production-ready subsystem with clear maturity, deployment, and support boundaries

This is the core architecture problem.

MAP2 is easy to expand horizontally. It is harder to close loops vertically.

## Specific design reversals I would make

### 1. Introduce domain facades between routes and concrete services

Current issue:

- routes import too many service symbols directly

Reversal:

- create explicit domain facades such as `avb_app_service`, `cluster_app_service`, `plugin_app_service`, `runtime_app_service`
- make routes thin transport adapters again

Why:

- reduces import fanout
- reduces transport-layer orchestration
- creates fewer stable integration points for tests and future API versioning

### 2. Split `AppShell` into product shell, navigation policy, and live-status slices

Current issue:

- shell owns navigation, product taxonomy, promotion, dialogs, and live system state

Reversal:

- move promoted-route policy and maturity/capability rules into a dedicated navigation model
- keep `AppShell` focused on shell layout and interaction chrome
- isolate live MPX-1 / websocket banners into dedicated shell-status components

Why:

- navigation becomes declarative instead of shell-entangled
- product-scope changes stop requiring edits across shell logic
- maturity labeling becomes implementable without more shell sprawl

### 3. Define one authoritative runtime capabilities model

Current issue:

- deployment mode, env flags, user-promoted routes, and subsystem readiness are split across multiple layers

Reversal:

- define one capability/maturity model returned by the backend
- let the frontend and docs consume that model instead of inventing their own partial rules

Why:

- one product truth
- easier feature gating
- easier supportability and release communication

### 4. Narrow the Python-to-C++ public surface

Current issue:

- `juce_engine_service` is imported almost everywhere

Reversal:

- wrap the bridge behind smaller domain-specific interfaces for plugin ops, metering, transport, MIDI, and synth/control

Why:

- engine churn stops cascading into unrelated surfaces
- non-audio/control-node modes become easier to reason about
- tests can target domain contracts instead of one giant engine service

## Architecture verdict by area

- Backend route layering: `Over-coupled`
- Service namespace organization: `Broad but only partly cohesive`
- Python-to-C++ boundary: `Explicit but too widely depended upon`
- Frontend shell/navigation: `Functionally rich, architecturally overloaded`
- State model: `Multiple competing truths`
- Extensibility: `Easy to extend, expensive to finish correctly`

## Final verdict

MAP2's architecture is good enough to build rapidly, but not yet good enough to scale calmly.

The system has grown by adding surfaces faster than by tightening boundaries. That is why so many features exist and so many of them still feel only partially complete: the architecture makes breadth easy and closure expensive.

The design direction I would push is not "add more abstraction." It is:

- fewer direct route-to-service dependencies
- fewer shell responsibilities
- fewer sources of truth
- a smaller and stricter public surface around the JUCE bridge

That is how MAP2 becomes cheaper to evolve without getting harder to trust.
