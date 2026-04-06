Add P2 Audio Platform — Backend Architecture Audit

**Date:** 2026-04-06  
**Scope:** All Python backend services, middleware, database layer, and integration points  
**Method:** Static analysis of ~50,000 LOC across 200+ source files  

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Concept Enumeration](#concept-enumeration)
3. [Concept-by-Concept Design Review](#concept-by-concept-design-review)
4. [Cross-Cutting Concerns](#cross-cutting-concerns)
5. [Priority Recommendations](#priority-recommendations)

---

## Executive Summary

The MAP2 backend is an ambitious system that manages a JUCE C++ audio engine, 10+ hardware devices, a multi-node cluster with Raft consensus, AVB/TSN network audio, and a real-time WebSocket control plane — all from a single Python FastAPI process. The architecture follows a clean service-layer pattern with a singleton orchestrator, and the codebase demonstrates deep domain expertise in audio, MIDI, and network protocols.

However, the audit identified **12 high-severity issues**, **18 medium-severity issues**, and numerous low-severity concerns across five categories:

| Category | High | Medium | Low |
|---|---|---|---|
| Concurrency / Race Conditions | 5 | 6 | 4 |
| Correctness Bugs | 3 | 3 | 2 |
| Design / Architecture | 2 | 5 | 6 |
| Resource Leaks | 1 | 3 | 2 |
| Maintainability / Duplication | 1 | 1 | 4 |

The three most impactful findings are:
1. **The Raft consensus implementation has correctness bugs** (wrong majority calculation, no persistent state, off-by-one in log application) that make distributed cluster operations unsafe
2. **The MIDI ring buffer has a functional bug in overwrite mode** that silently drops the newest message instead of the oldest
3. **4,000+ lines of duplicated code** between `mpx1_service.py` and `intelfx_service.py`

---

## Concept Enumeration

The backend implements 30 distinct functional concepts:

| # | Concept | Primary Files | LOC |
|---|---|---|---|
| 1 | Application Lifecycle & Startup | `main.py`, `service_orchestrator.py` | 2,688 |
| 2 | JUCE Audio Engine Bridge | `juce_engine_service.py`, `engine_runtime_facade.py` | 5,200+ |
| 3 | Plugin Management (LV2/NAM/IR) | `plugin_scanner.py`, `plugin_loader_unified.py`, `plugin_catalog.py` | 3,000+ |
| 4 | Signal Chain Management | `chain_service.py`, `chain_analyzer.py` | 3,200+ |
| 5 | Snapshot System (Preset/Rig) | `snapshot_service.py` + 8 sub-services | 6,000+ |
| 6 | MIDI Hub | `midi_hub/hub.py`, `router.py`, `ring_buffer.py` + 20 modules | 4,000+ |
| 7 | Real-Time Parameter Bridge | `realtime_parameter_bridge.py` | 740 |
| 8 | Automation Engine | `automation_engine.py` | 1,111 |
| 9 | AVB/TSN Network Audio | `avb/` (8 files) | 3,000+ |
| 10 | Biamp Tesira Integration | `tesira/` (14 files) | 4,000+ |
| 11 | Multi-Node Cluster | `cluster/` (30+ files) | 10,000+ |
| 12 | Lexicon MPX-1 Bridge | `mpx1_service.py` | 2,014 |
| 13 | DBX IntelFX Bridge | `intelfx_service.py` | 2,027 |
| 14 | Ground Control Pro | `ground_control_pro/` (8 files) | 1,500+ |
| 15 | Ableton Push Surface | `push_surface/` (20+ files) | 4,000+ |
| 16 | Maschine MK1 | `maschine/`, `maschine_service.py` | 1,500+ |
| 17 | Performance Brain | `performance_brain_service.py` | 1,966 |
| 18 | Drum Machine / Sequencer | `drum_machine_service.py`, `drum_sequencer_service.py` | 2,000+ |
| 19 | NAM Library | `nam_processor.py`, `nam_library.py` | 1,500+ |
| 20 | IR/Convolution Library | `ir_loader.py`, `ir_library/` | 2,000+ |
| 21 | PipeWire/JACK Integration | `pipewire_service.py`, `jack_audio.py` | 1,500+ |
| 22 | WebSocket Manager | `websocket_manager.py` | 426 |
| 23 | Configuration System | `config.py`, `config_hot_reload.py` | 2,000+ |
| 24 | Database Layer | `database.py`, `database_session.py`, `db_pool_manager.py` | 2,500+ |
| 25 | Health & Observability | `health_monitor.py`, `metrics_daemon.py`, `api_observatory.py` | 2,000+ |
| 26 | Cluster Proxy Middleware | `middleware/cluster_proxy.py` | 400+ |
| 27 | Event Bus | `event_bus.py` | 300+ |
| 28 | Circuit Breaker / Degradation | `circuit_breaker.py`, `graceful_degradation.py` | 800+ |
| 29 | Session & Transport | `session_manager.py`, `transport_service.py` | 800+ |
| 30 | Deployment & Updates | `deployment/`, `cluster/update_orchestrator.py` | 2,000+ |

---

## Concept-by-Concept Design Review

### 1. Application Lifecycle & Startup

**Design:** A single `lifespan()` async context manager in `main.py` (~500 lines) manually constructs, wires, and tears down ~30 services. A `ServiceOrchestrator` singleton provides dependency-aware parallel startup but `main.py` still micromanages many services around it.

**What works:** The ordered startup with priority levels and the deferred optional-service pattern are sound. GC tuning for RT workloads is a good touch.

**Issues:**
- **`lifespan()` is a 500-line God Function.** Startup and shutdown are hand-mirrored with no structural guarantee they stay in sync. Adding a service requires editing two places.
- **`ServiceOrchestrator._register_all_services` is a 200+ line method** that hard-codes every service definition. Services should self-register.
- **`ServiceDefinition.is_async` flag** is fragile — `asyncio.iscoroutinefunction()` introspection would be automatic and correct.
- **`_stop_service` catches all exceptions and returns `True`** regardless, making clean vs failed stops indistinguishable.
- **The orchestrator lock is held for the entire startup sequence**, blocking all status queries and health checks during init.

**Better approach:** Extract startup into a `StartupOrchestrator` class. Have each service module register itself via a decorator (`@register_service(priority=CRITICAL, deps=["database"])`). The orchestrator should release its lock between dependency levels. Stop errors should propagate distinct status codes.

---

### 2. JUCE Audio Engine Bridge

**Design:** Singleton wrapper around a C++ Python extension module (`.so`). ~100 async methods covering device management, plugins, parameters, MIDI, metering, and snapshots.

**What works:** The `asyncio.to_thread` pattern for C++ calls is correct where applied. The facade layer (`engine_runtime_facade.py`) provides good decoupling.

**Issues:**
- **4,836 LOC monolith** mixing 6+ responsibilities. This is the single largest service file.
- **Inconsistent `asyncio.to_thread` usage.** Several methods (`set_bypass`, `get_current_snapshot`, `load_snapshot`, `enable_midi`, `get_midi_devices`, `reorder_chain`) call into C++ directly on the event loop thread. Chain reordering involves graph topology mutation and is particularly dangerous to call without thread isolation.
- **`is_audio_running()` silently falls back to `True`** when the C++ flag check fails, conflating "initialized" with "running."
- **`resolve_instance_id` makes up to three `asyncio.to_thread` calls** on every parameter get/set — a latency hotspot. The pedalboard state should be cached with dirty-flagging.
- **Lexicon MPX-1 hardware plugin injected into `list_plugins()`** — hardware business logic mixed into software plugin listing.

**Better approach:** Break into `AudioDeviceService`, `PluginLifecycleService`, `ParameterService`, `MidiService`, `MeteringService`. Apply a `@engine_thread` decorator that automatically wraps C++ calls in `asyncio.to_thread`. Cache pedalboard topology with invalidation on topology change events.

---

### 3. Signal Chain Management

**Design:** Per-request `ChainService` instances with a `CommandQueue`, class-level plugin meta cache, and engine chain deployment.

**Issues:**
- **`ChainService` is instantiated per-request** but owns a `CommandQueue(max_size=100)` whose worker task is never started. Dead infrastructure per instance.
- **Class-level `_plugin_meta_cache`** has no TTL, no auto-invalidation on plugin rescan, and a check-then-initialize guard with no lock.
- **Plugin URI constants duplicated** across `chain_service.py`, `snapshot_service.py`, and `juce_engine_service.py`.

**Better approach:** Make `ChainService` application-scoped (singleton or DI). Connect `CommandQueue` lifecycle to the service. Consolidate plugin URI constants into `app/constants.py`. Wire cache invalidation to the plugin scanner's rescan event.

---

### 4. Snapshot System

**Design:** 4,117 LOC service with three sub-service delegates (document, activation, revision). Full revision history with JSON + graph document payloads. Compilation pipeline from snapshot → `CompiledSnapshotIntent` → engine activation.

**What works:** The delegation to sub-services is a good decomposition signal. Revision history is well-modeled.

**Issues:**
- **`_utcnow()` strips timezone from a timezone-aware datetime**, producing naive datetimes labeled as UTC.
- **`SNAPSHOT_NAME_PATTERN` only allows alphanumeric** — no spaces, hyphens, or common punctuation. Users can't name presets naturally.
- **Module-level `_snapshot_preload_tasks` dict** is a hidden global that makes the module non-reentrant.
- **Heavy import coupling** — imports from 20+ modules making unit testing impossible without mocking the platform.

**Better approach:** Fix `_utcnow()` to preserve timezone. Relax name validation. Move preload scheduling into a dedicated class. Further decompose by extracting bundle import/export and activation pre-flight into separate classes.

---

### 5. MIDI Hub

**Design:** Central message bus with a dedicated I/O thread polling ALSA ports every 2ms via a lock-free ring buffer. Hot-plug thread rescans every 1.5s. Subscriber callback pattern.

**What works:** The architecture is fundamentally sound for real-time MIDI. The separation of I/O thread from subscribers is correct.

**Issues:**

#### Ring Buffer Bug (HIGH)
The "lock-free" ring buffer has a **functional bug in overwrite mode**. When full:
```python
self._buf[self._tail] = value   # write new at tail
self._tail = (self._tail + 1) % self._capacity
self._head = self._tail         # advance head PAST the new value
```
Setting `_head = _tail` means the just-written slot is immediately considered consumed. The buffer drops BOTH the oldest AND newest message. Fix: advance head by one *before* writing the new value.

Additionally, the buffer claims to be "lock-free" but relies on CPython's GIL for atomicity. Compound operations (`read size → compare → write → increment size`) are not atomic at the bytecode level.

#### Hub Lifecycle Race
`_running = True` is set AFTER the I/O and hotplug threads are started. The hotplug thread's first scan sees `_running = False` and silently skips port opening.

#### Router Timer Leak
Every MIDI message routed with `delay_ms > 0` creates a new `threading.Timer` (which is a `Thread`). No registry, no cap, no cancellation on `stop()`. At 128 messages/second with latency compensation, this is an unbounded thread leak.

#### `asyncio.run()` from Non-Main Thread
WebSocket broadcasts from the hub's I/O thread create a new event loop per call. Should use `loop.call_soon_threadsafe()` or a dedicated background loop.

**Better approach:** Fix the ring buffer overwrite logic. Add a `threading.Lock` and rename to `ThreadSafeRingBuffer`, or document the single-producer/single-consumer contract. Set `_running = True` before starting threads. Replace `threading.Timer` with a priority-queue scheduler on a single thread.

---

### 6. Real-Time Parameter Bridge

**Design:** WebSocket-backed fast path for parameter updates with binary protocol, value caching, and source priority (UI < MIDI < AUTOMATION < PRESET < INTERNAL).

**What works:** The source priority system and value caching are well-designed. The binary protocol reduces overhead.

**Issues:**
- **Sequential WebSocket sends** — for N subscribers, N sequential `await send()` calls in the critical update path. The first slow subscriber invalidates the "<10ms latency" claim.
- **`_latency_samples.pop(0)`** is O(N) on a Python list. Should be `collections.deque(maxlen=1000)`.
- **No locks on `_clients`, `_subscriptions`, `_param_cache`** — concurrent `disconnect_client()` from an exception handler can mutate dicts while the processor loop iterates them.
- **Binary message bounds not validated** — a malformed `PARAM_BATCH` with inflated `count` will cause `struct.unpack` to read past the buffer.

**Better approach:** Broadcast to subscribers concurrently with `asyncio.gather()`. Use `deque` for latency samples. Validate binary message bounds before unpacking.

---

### 7. WebSocket Manager

**Design:** Singleton hub for all real-time push with topic subscriptions, gzip compression, and slow-client disconnect.

**Issues:**
- **`disconnect()` is synchronous but `connect()`/`subscribe()` are async.** `disconnect()` mutates shared dicts without holding `self._lock`, creating TOCTOU races with `broadcast()`.
- **Compression wraps binary in base64+JSON** — three layers of processing for what should be a WebSocket binary frame with a protocol header.
- **`bytes_saved` counter mutated without lock** from `broadcast_json`.

**Better approach:** Make `disconnect()` async with lock. Use native WebSocket binary frames instead of base64-in-JSON.

---

### 8. Automation Engine

**Design:** Timeline curves, 8 LFO waveforms, tempo sync, envelope following with numpy.

**Issues:**
- **`threading.Lock` used in async-only code** — blocks the event loop. Should be `asyncio.Lock` or eliminated.
- **RANDOM waveform logic bug** — `last_random_value` is used as both phase-tracker and amplitude value. The phase comparison `if phase < lfo.last_random_value` is semantically wrong; it should track phase wrap, not compare against an amplitude.
- **`save_to_database` is destructive** — DELETE-all then re-INSERT with no transaction safety. Should use UPSERT.

---

### 9. Raft Consensus (HIGH SEVERITY)

**Design:** HTTP-based Raft for cluster state replication with leader election and log commitment.

**This implementation has multiple correctness bugs that make it unsafe for production use:**

#### Majority Calculation is Wrong
`cluster_nodes` excludes the local node. With a 3-node cluster, `majority = len([2 nodes]) // 2 + 1 = 2`. The self-vote is not counted in the gathered votes. Result: a 3-node cluster requires ALL 3 votes (not the correct 2), making elections impossible when any node is down.

#### No Persistent State
`current_term`, `voted_for`, and `log` are in-memory only. Raft REQUIRES these on stable storage before responding to any RPC. A crash-restart will forget term and vote, violating election safety (could vote for two different candidates in the same term).

#### Off-by-One in Log Application
`last_applied` is incremented BEFORE reading `self.log[self.last_applied]`, skipping `self.log[0]` — the first committed entry is never applied.

#### Missing Term Updates on RPC Response
`_request_vote` ignores the `term` field in responses. Stale leaders will not step down when they discover a higher term.

#### Busy-Wait Replication
`replicate_command` polls `last_applied` with 10ms sleep for up to 5 seconds instead of using `asyncio.Event`.

**Better approach:** Either adopt an existing Raft library (e.g., `pysyncobj`, `raftify`) or fix: majority to include self-vote, add SQLite-backed persistent state, fix the off-by-one, process response terms, replace busy-wait with `asyncio.Event`.

---

### 10. Cluster Registry

**Issues:**
- **N+1 query pattern** in `get_cluster_summary` — five separate SQL queries where one aggregation would suffice.
- **`add_or_update_node` has TOCTOU** — SELECT then INSERT without a transaction. Use `INSERT OR REPLACE`.
- **Thread-local connections never closed** — no `close()`, no `__del__`, no context manager.

---

### 11. Heartbeat Monitor

**Issues:**
- **`httpx.AsyncClient` recreated per check** — 10 nodes = 10 connection pool setups per second.
- **No exclusion of the local node** — monitors itself via HTTP loopback.
- **`node_health` grows indefinitely** — removed nodes retain stale entries.
- **First-seen-online nodes don't fire `NODE_ONLINE` event.**

---

### 12. PipeWire Service

**Issues:**
- **Hardcoded UID 1000 and `/home/mm`** as fallbacks. Will fail for any other user/container.
- **`set_quantum`/`set_rate` return `True` regardless** of whether `pw-metadata` succeeded.
- **`uptime_seconds` measures Python object lifetime**, not PipeWire daemon uptime.
- **O(n²) stream direction detection** — two list comprehensions over entire `pw-dump` output per stream.

---

### 13. MPX-1 and IntelFX Bridges (DUPLICATION)

**Finding:** `mpx1_service.py` (2,014 LOC) and `intelfx_service.py` (2,027 LOC) are **near-verbatim copies**. Every method is identical except:
- SysEx prefix bytes
- Device discovery keywords
- Decode frame offsets
- Library preset names

**4,000+ LOC of duplicated logic.** Every bug fix must be applied twice. The T036 (echo-loop, readback, ownership, drift, write-lock) and T037 (audition, librarian) features are copy-pasted including comment labels.

**Better approach:** Extract `MidiSysexBridgeBase` abstract class (~600 LOC) with the shared scaffolding. Each device subclass provides only its protocol constants and decode logic (~150 LOC each). This collapses 4,041 LOC → ~900 LOC.

---

### 14. Tesira Integration

**What works:** Clean lifecycle, exponential backoff, concurrent device connection via `asyncio.gather`. The TTP client has proper Telnet IAC negotiation and subscription replay on reconnect.

**Issues:**
- **`_on_meter_push` creates unbounded fire-and-forget tasks** — no reference tracking, no cap.
- **Reconnect task is not stored** — `disconnect()` cannot cancel an in-progress reconnect, risking double-connection.
- **SSH password stored as plain `str`** in `TesiraDeviceConfig` — visible in `repr()` and logs.

---

### 15. Push Surface Manager

**What works:** Dependency-injected, testable. Proper task lifecycle. Thread-safe MIDI routing via `call_soon_threadsafe`.

**Issues:**
- **`scan_devices` mutates persisted config** — device discovery has a permanent side-effect on the operator config file. Runtime state should be separate from saved preferences.

---

### 16. Performance Brain

**Issues:**
- **30+ Pydantic models in a single 1,966-line file** — should be in a `models/` subpackage.
- **Filesystem `rglob` walks under `threading.RLock`** — latency hazard on large sample libraries.

---

### 17. Ground Control Pro

**What works:** Atomic artifact archiving with SHA-256, validation gate before transmit, job tracking.

**Issues:**
- **All state is in-memory** — process restart loses sessions including backup artifacts needed before hardware push (safety risk).
- **`fixture_dir` points into `tests/`** — production runtime depends on test directory.

---

### 18. Database Layer

**What works:** WAL mode, retry sessions with UOW replay, good indexing, coherent snapshot hierarchy.

**Issues:**
- **Dual engine / dual session-maker proliferation** — four module-level globals plus `DatabasePoolManager` create five competing session boundaries.
- **Hand-rolled schema migration** — ten sync/async function pairs with no version tracking, no rollback path. Unconditional `DROP TABLE` on startup.
- **`health_check` passes bare string to `execute`** — `"SELECT 1"` requires `text("SELECT 1")` in SQLAlchemy 2.x. Health checks silently always fail.
- **`datetime.utcnow` throughout** — deprecated in Python 3.12, naive datetimes.
- **`Plugin.parameters` is `Text` (manual JSON)** while `SnapshotChainPlugin.parameters` is proper `JSON`. Inconsistent type handling.

---

### 19. Middleware Stack

**Ordering bug (HIGH):** FastAPI middleware stacking is LIFO. The registration order causes:
```
Request → ClusterProxy → TrafficCapture → RequestLogging → APIAuth → CORS → Routes
```

**`ClusterProxyMiddleware` runs before `APIAuthMiddleware`.** Any unauthenticated client that sends a valid `node_id` can proxy requests to other nodes, bypassing auth entirely.

**`request_id` collision:** `TrafficCaptureMiddleware` and `RequestLoggingMiddleware` each generate independent UUIDs because of the execution order. Response `X-Request-ID` header value depends on which middleware runs last on the return path.

---

### 20. Event Bus

**Issues:**
- **No lock on `_subscribers`** — `publish` iterates while `unsubscribe` can concurrently call `.remove()`, causing `RuntimeError`.
- **`_event_history` is a list replaced on trim** — not safe under concurrent access. Use `deque(maxlen=N)`.
- **No backpressure or subscriber timeout** — a slow subscriber delays all others.

---

### 21. Circuit Breaker

**Issues:**
- **HALF_OPEN allows multiple concurrent probe calls** — the function execution runs outside the lock. Standard circuit breakers allow only one probe.
- **Failure counting is absolute, not windowed** — a single success resets the counter. 4 failures, 1 success, 4 more failures never trips threshold=5 even though 8 of 9 calls failed.
- **`DegradationStrategy.should_attempt_recovery` is implemented but never called.**

---

### 22. Configuration System

**Issues:**
- **`locked` key enforcement not visible** — if purely advisory, runtime changes to `audio.buffer_size` silently succeed.
- **List-typed config values have no element-type validation** — `audio.allowed_rates_hz` accepts `["not", "integers"]`.

---

### 23. Graceful Degradation

**Issues:**
- **`asyncio.Lock` used from synchronous callers** — `register_feature()` mutates `self.features` without holding `_lock`.
- **No recovery from `UNAVAILABLE`** — `should_attempt_recovery()` exists but is never called.
- **Health check loop has no exception guard** — any unhandled error kills the loop permanently.

---

## Cross-Cutting Concerns

### A. Singleton Thread Safety
Every singleton factory (`get_midi_hub()`, `get_midi_router()`, `get_cluster_registry()`, `get_event_bus()`, `get_deployment_config()`, etc.) is a bare module global with no lock. Only `DatabasePoolManager` and `HealthMonitor` use the `Singleton` base class with its `threading.Lock`. All others are vulnerable to double-initialization.

### B. `datetime.utcnow()` Deprecation
Used in 20+ locations across ORM models, services, and middleware. Deprecated in Python 3.12, removed in 3.14. All instances should migrate to `datetime.now(timezone.utc)`.

### C. Module-Level Mutable State
Hidden globals in `snapshot_service.py`, `chain_service.py`, `main.py`, `traffic_capture.py`, and `deployment.py`. These make modules non-reentrant, untestable, and prone to stale state across ASGI reloads.

### D. Inconsistent Lock Primitives
The codebase mixes `threading.Lock`, `threading.RLock`, `asyncio.Lock`, and no-lock across services that all run in the same async event loop. `threading.Lock` in async code blocks the event loop. `asyncio.Lock` in code called from sync contexts raises errors.

### E. WebSocket Broadcast Coupling
Every hardware service directly imports and calls the WebSocket manager. There is no publish abstraction — 15+ services each know about WebSocket internals. A thin event bus → WebSocket bridge would reduce coupling.

### F. Bare `except Exception: pass`
Appears in 30+ locations across the codebase. Silent exception swallowing in an audio system means operator-invisible failures. At minimum, `logger.debug()` should replace `pass`.

---

## Priority Recommendations

### Critical (fix before relying on the feature)

| # | Issue | Location | Fix |
|---|---|---|---|
| 1 | Raft majority excludes self-vote | `raft_consensus.py:280` | Include local node in majority calculation |
| 2 | Raft has no persistent state | `raft_consensus.py` | Add SQLite storage for term/vote/log |
| 3 | Raft off-by-one in apply | `raft_consensus.py:379` | Increment `last_applied` after apply, not before |
| 4 | Ring buffer overwrite drops newest | `ring_buffer.py:76-80` | Advance head by one before writing at tail |
| 5 | ClusterProxy bypasses auth | `main.py` middleware order | Register ClusterProxy BEFORE APIAuth (LIFO reversal) |

### High (correctness or resource issues)

| # | Issue | Location | Fix |
|---|---|---|---|
| 6 | MPX1/IntelFX 4,000 LOC duplication | `mpx1_service.py`, `intelfx_service.py` | Extract `MidiSysexBridgeBase` |
| 7 | Engine methods missing `to_thread` | `juce_engine_service.py` (7 methods) | Apply `@engine_thread` decorator |
| 8 | Sequential WS sends in RT bridge | `realtime_parameter_bridge.py:516` | Use `asyncio.gather()` |
| 9 | Router timer leak | `midi_hub/router.py:426` | Priority-queue scheduler |
| 10 | Hub lifecycle race (`_running`) | `midi_hub/hub.py:107` | Set flag before thread start |
| 11 | `disconnect()` not holding lock | `websocket_manager.py:158` | Make async, acquire lock |
| 12 | DB health check `text()` missing | `db_pool_manager.py:215` | Wrap in `text()` |
| 13 | Dual engine/session globals | `database.py` | Consolidate to single `DatabasePoolManager` |
| 14 | Automation RANDOM phase bug | `automation_engine.py:505` | Split `last_random_value` into phase + amplitude |

### Medium (design improvements)

| # | Issue | Fix |
|---|---|---|
| 15 | Hand-rolled schema migration | Adopt Alembic or at minimum add version tracking |
| 16 | `datetime.utcnow()` (20+ sites) | Global find-replace with `datetime.now(timezone.utc)` |
| 17 | Event bus no subscriber lock | Add `asyncio.Lock`; use `deque(maxlen=N)` |
| 18 | Circuit breaker HALF_OPEN race | Allow single probe under lock |
| 19 | Circuit breaker no windowed counting | Add sliding window (time or count based) |
| 20 | `juce_engine_service.py` monolith | Split into 5 focused services |
| 21 | Singleton factories unguarded | Use `Singleton` base class consistently |
| 22 | `snapshot_service.py` naive datetimes | Fix `_utcnow()` to preserve timezone |
| 23 | PipeWire hardcoded UID/user | Derive from `/proc/self/status` at startup |
| 24 | GCP sessions in-memory only | Add session index file for crash recovery |
| 25 | Alert deduplication absent | Track "alert already firing" state in health monitor |
| 26 | Heartbeat creates client per check | Share single `httpx.AsyncClient` |
| 27 | Proxy clients never closed | Add shutdown hook to close `httpx` clients |

### Low (cleanup)

| # | Issue |
|---|---|
| 28 | Plugin URI constants duplicated across 3 files |
| 29 | `threading.Lock` in async middleware (traffic capture) |
| 30 | Performance Brain models in single file (30+ classes) |
| 31 | `from __future__ import annotations` inconsistent |
| 32 | Emoji characters in logger calls |
| 33 | GCP `fixture_dir` points into `tests/` |
| 34 | `_latency_samples.pop(0)` O(N) in RT bridge |
| 35 | `config.py` schema in single 1,200-line dict |

---

*End of audit.*
