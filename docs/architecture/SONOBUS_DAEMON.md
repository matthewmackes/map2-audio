# `map2-sonobus-transport` Daemon — Canonical Reference

**Status:** Authoritative — Run-14b cycle 4 (2026-05-16)
**Worklist:** T2521-4 (cycles 1, 2, 5, 7 software-side complete; 3, 4, 6 bench-gated)
**Maintainer:** Platform Audio team
**See also:** [`SONOBUS_AOO_TRANSPORT.md`](SONOBUS_AOO_TRANSPORT.md) (Q1-Q21 decisions), [`SONOBUS_BENCH_HANDOFF.md`](SONOBUS_BENCH_HANDOFF.md) (operator runbook for the bench-gated cycles)

---

## TL;DR

`map2-sonobus-transport` is a standalone C++ daemon that bridges JACK
audio ↔ AOO source/sink runtime over UDP. The Python backend supervises
its lifecycle and speaks to it over a UNIX-domain socket at
`/run/map2/sonobus-transport.sock` using a line-delimited JSON protocol.

The daemon ships in two build modes — **full** (with vendored AOO source)
and **stub** (compiles cleanly without the AOO vendor pull, returns
`transport_unavailable` for every transport call). Both modes use the
same source tree, the same UDS protocol, and the same backend
supervisor; the bench operator flips stub → full with a single `git
clone https://git.iem.at/cm/aoo vendor/aoo` + rebuild.

This doc is the single canonical reference for:
- The UDS protocol (frame shape, command list, error codes, event types)
- Build modes (compile-time flags, what each enables)
- Supervisor lifecycle states (canonical strings the GUI Tag tone matches on)
- Evidence-dir layout for the bench-gated acceptance run

---

## 1. UDS protocol

### Wire format

Each line is a single JSON object terminated by `\n`. The protocol is
human-readable in `journalctl` + `jq`-friendly. The supervisor is the
only legitimate peer; the daemon enforces single-client semantics
(new connection preempts the existing one — supervisor reconnect after
a crash works without daemon restart).

#### Request frame

```json
{"v":1,"type":"<command>","id":"<request-id>","payload":{...}}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `v` | int | yes | Protocol version. Currently `1`. Bumped on breaking change. |
| `type` | string | yes | Command name (see § Commands). |
| `id` | string | yes | Request identifier (UUID hex by convention). Echoed in the response. |
| `payload` | object | depends on command | Command-specific arguments. |

#### Response frame

```json
{"v":1,"type":"<command>.response","id":"<id>","ok":<bool>,"data":{...},"error":{"code":"...","message":"..."}}
```

| Field | Type | Description |
|-------|------|-------------|
| `v` | int | Always 1 in the current protocol. |
| `type` | string | `"<command>.response"`, derived from the request `type`. |
| `id` | string | Echoed from the request. |
| `ok` | bool | True on success; false on any error. |
| `data` | object | Command-specific response payload. Always an object (possibly empty). |
| `error` | object | Only set when `ok=false`. Carries `code` (canonical string the supervisor matches on) + `message` (human-readable). |

#### Async event frame

The daemon also pushes async events to the supervisor without a
request/response pairing:

```json
{"v":1,"type":"<event-type>","event":true,"payload":{...}}
```

| Field | Description |
|-------|-------------|
| `event` | Always `true`. Discriminates events from late command responses. |
| `type` | Event topic (see § Events). |
| `payload` | Event-specific payload. |

### Commands

The supervisor sends these; the daemon dispatches via the
`UdsProtocol::registerHandler(type, handler)` map registered in
`DaemonServer::run()`. A future cycle adds more (e.g. `connect_peer`,
`disconnect_peer`); the seven below cover lifecycle + smoke + stream
management.

| Command | Payload | Response data | Notes |
|---------|---------|---------------|-------|
| `hello` | (none) | `version`, `build_mode`, `has_aoo`, `has_jack`, `sample_rate_hz`, `buffer_size`, `port_base`, `port_count` | First frame the supervisor sends after connecting. The supervisor caches the capability snapshot in `DaemonCapabilities` so the GUI shows `stub_mode` / `full_mode` without re-pinging. |
| `ping` | (none) | `{pong: true}` | Cheap liveness check. The supervisor pings every 2 s; ping failure triggers reconnect. |
| `create_source` | `{stream_id: string}` | `{stream_id: string}` | AOO source creation. Stub mode returns `transport_unavailable`. The stream is registered with the metrics collector regardless of mode so the diagnostics surface reflects active bindings. |
| `destroy_source` | `{stream_id: string}` | `{stream_id: string}` | AOO source teardown + metrics unregister. |
| `create_sink` | `{stream_id: string}` | `{stream_id: string}` | AOO sink creation. Same stub semantics as create_source. |
| `destroy_sink` | `{stream_id: string}` | `{stream_id: string}` | AOO sink teardown. |
| `metrics_query` | `{stream_id?: string}` | Full snapshot (no stream_id) or single-stream snapshot | Per-binding RTT, loss, jitter, resends, observed_latency. |
| `shutdown` | (none) | `{}` | Graceful exit. Daemon acknowledges with `ok=true` BEFORE exiting so the supervisor knows the shutdown was acknowledged. |

### Error codes

Canonical strings the supervisor matches on. New codes require a paired
update to `app/services/sonobus/daemon_client.py::DaemonCommandError`.

| Code | Source | Meaning |
|------|--------|---------|
| `invalid_json` | UDS parser | Frame was not valid JSON. |
| `invalid_frame` | UDS parser | JSON parsed but missing/wrong-typed `type` field. |
| `unknown_command` | Dispatcher | No handler registered for the command type. |
| `invalid_argument` | Handler | Handler rejected the payload shape (e.g. missing `stream_id`). |
| `transport_unavailable` | AOO transport | AOO not vendored (stub mode). The supervisor surfaces this as `daemon_status="running"` + `daemon_capabilities.has_aoo=false` so the GUI can warn operators. |
| `not_initialized` | AOO transport | Transport initialize() hasn't completed yet. Should be transient. |
| `port_allocation_failed` | AOO transport | Out of UDP ports in the allocated range (default: 10000-10100). |
| `peer_not_found` | AOO transport | (Future) `disconnect_peer` against an unknown peer. |
| `stream_not_found` | Metrics collector | `metrics_query` against a stream_id with no registered source/sink. |
| `handler_exception` | Dispatcher | Handler threw an unexpected exception. The daemon stays alive; the supervisor logs + decides whether to retry. |

### Events

The daemon pushes these to the supervisor; the supervisor relays them
to WS subscribers via `subscribe_events()`.

| Event | Payload | Cadence |
|-------|---------|---------|
| `metrics_snapshot` | Full per-stream metric tuple (mirrors `metrics_query` response data) | Every 5 s when at least one client is connected. |
| `peer_up` | (Future) `{peer_id, peer_addr, peer_port}` | On peer-discovery resolution. |
| `peer_down` | (Future) `{peer_id, reason}` | On peer disconnect. |
| `session_start` | (Future) `{stream_id, peer_id}` | When AOO source/sink session begins. |
| `session_stop` | (Future) `{stream_id, peer_id}` | When AOO source/sink session ends. |
| `transport_error` | (Future) `{stream_id, code, message}` | Recoverable transport errors (port collision, etc.). |

The `(Future)` events have wire-protocol slots reserved by the
supervisor's event-relay loop but the daemon's transport-side emission
lands with cycle 3 (AOO source/sink integration) when the AOO vendor
pull happens.

---

## 2. Build modes

### Three CMake configurations

The daemon target is built by `cmake --build juce-engine/build --target
map2-sonobus-transport`. The build mode is selected by the combination
of `USE_SONOBUS=ON|OFF` + the presence of `vendor/aoo/CMakeLists.txt`.

| `USE_SONOBUS` | `vendor/aoo/CMakeLists.txt` | Mode | What ships |
|---------------|------------------------------|------|------------|
| `ON` | exists | **full** | Daemon links libaoo + libuv + JACK. Audio moves end-to-end. |
| `ON` | missing (current state) | **stub** | Daemon binary builds + runs; AOO calls return `transport_unavailable` (the canonical error code). UDS protocol works identically. |
| `OFF` | (any) | **disabled** | Daemon NOT built. systemd unit fails-to-start (intended). |

### Compile-time flags

The daemon source tree (one set of `.cpp` files for both modes) uses
preprocessor guards on these macros, set by `juce-engine/SonoBusDaemon/CMakeLists.txt`:

| Macro | Set when | Effect |
|-------|----------|--------|
| `MAP2_SONOBUS_HAS_AOO=1` | full mode | `AooTransport.cpp` includes `<aoo/aoo_source.hpp>` + `<aoo/aoo_sink.hpp>` and calls real AOO API. |
| `MAP2_SONOBUS_HAS_AOO=0` | stub mode | `AooTransport.cpp` returns `TransportResult::Unavailable` for every transport call. `initialized_=true` so the supervisor's hello frame can report `has_aoo=false` cleanly. |
| `MAP2_SONOBUS_HAS_JACK=1` | when pkg-config finds JACK | `JackBridge.cpp` includes `<jack/jack.h>` and registers the JACK process callback. |
| `MAP2_SONOBUS_HAS_JACK=0` | JACK not in build | `JackBridge.cpp` is a no-op; daemon runs in degraded mode (UDS works, audio doesn't move). |
| `MAP2_SONOBUS_HAS_LIBUV=1` | when pkg-config finds libuv | (Reserved for cycle 4: libuv-driven event loop replaces the cycle-1 POSIX poll loop.) |

### Flipping stub → full mode

The bench operator runs:

```bash
cd vendor/aoo
git clone https://git.iem.at/cm/aoo .  # exact clone-into-existing-dir; the
                                       # placeholder VERSION + LICENSE files
                                       # get overwritten by the upstream tree
cd ../..
cmake -S juce-engine -B juce-engine/build
cmake --build juce-engine/build --target map2-sonobus-transport
```

No code changes needed. The next daemon restart picks up `MAP2_SONOBUS_HAS_AOO=1`
+ links the actual AOO library; the supervisor's hello handshake
reports `build_mode="full"` + `has_aoo=true` + the GUI Diagnostics
page shows live transport instead of "stub mode (no AOO vendored)".

---

## 3. Supervisor lifecycle

### Canonical state strings

Defined in `app/services/sonobus/daemon_supervisor.py::SonoBusDaemonStatus`.
The Carbon Tag tone on the GUI matches on these exact strings; renaming
one breaks the GUI tag-tone selector.

| State | Meaning | GUI tone |
|-------|---------|----------|
| `stopped` | Supervisor not started yet. | cool-gray |
| `waiting-for-binary` | Subprocess mode + binary doesn't exist at the install path. | cool-gray |
| `waiting-for-daemon` | Production mode (no subprocess) + UDS not reachable. | warm-gray |
| `connecting` | Opening the UDS connection / running the hello handshake. | blue |
| `running` | Connected; ping loop active. | green |
| `reconnecting` | Disconnected; retry timer active. | warm-gray |
| `degraded` | Crash storm guard tripped; auto-restart suspended until `reset_storm_guard()`. | red |
| `shutdown` | Supervisor explicitly stopped. | cool-gray |

### Storm guard

≥ 5 connection failures within a 60-second rolling window triggers
`degraded`. Auto-restart stops until the GUI's "Reset" button calls
`SonoBusDaemonSupervisor.reset_storm_guard()`.

### Two deployment models

The same supervisor handles both:

**(a) systemd-managed** (production): the daemon is started by
`/usr/lib/systemd/system/map2-sonobus-transport.service`; the
supervisor only attaches to its UDS. No subprocess spawning.
`spawn_subprocess=False`.

**(b) supervised** (dev / fallback): if no daemon is reachable AND
the binary exists at `/opt/map2-audio/juce-engine/build/map2-sonobus-transport`,
the supervisor spawns it as a child + restarts on crash with exponential
backoff (0.5s → 8s ceiling). `spawn_subprocess=True`.

CPU affinity (when supervised): the supervisor uses `taskset -c 0,1,2,3`
to keep the daemon off the isolated audio cores 4-5 — same model as
`ControllerHostService`.

---

## 4. REST + WS surface

The supervisor's status feeds these existing surfaces:

| Endpoint | What it surfaces |
|----------|------------------|
| `GET /api/sonobus/status` | `daemon_running`, `daemon_endpoint`, `daemon_status` (canonical state string), `daemon_capabilities` (full `hello` snapshot) |
| `GET /api/sonobus/diagnostics` | Per-binding metrics from `supervisor.latest_metrics()`. Live values flow when the daemon has pushed a `metrics_snapshot` event in the last 30 s; otherwise None (Diagnostics page renders "metrics unavailable"). |
| `WS /api/sonobus/events` | Existing snapshot + heartbeat frames + new `sonobus:daemon` envelope forwarding every daemon event to the WS subscriber. Late-joining subscribers replay the bounded event ring (default 512 events). |

The route handlers' supervisor access is gated through
`_supervisor_status_fields()` / `_live_metrics_for_diagnostics()` in
`app/services/sonobus/binding_routes.py`. Both helpers fail gracefully
(return stub defaults) when the supervisor module fails to import, so
backend boot order can't break the status route.

---

## 5. Evidence dir layout (T2521-4 acceptance)

The bench-gated acceptance run produces artefacts under
`docs/fit-for-purpose-evidence/<YYYYMMDD>/sonobus-transport/`:

```
sonobus-transport/
├── README.md                                   ← what each capture proves
├── MANIFEST.md                                 ← per-cycle deliverable status
├── verification-runbook.md                     ← the bench operator's procedure
├── daemon-build/
│   ├── stub-mode-cmake-output.txt              ← cmake configure (stub mode)
│   ├── full-mode-cmake-output.txt              ← cmake configure (after vendor pull)
│   └── version-string.txt                      ← `map2-sonobus-transport --version` in both modes
├── uds-protocol/
│   ├── hello-response.json                     ← capability snapshot
│   ├── ping-response.json                      ← liveness
│   ├── create-source-stub-error.json           ← transport_unavailable in stub
│   └── create-source-full-success.json         ← stream_id echoed in full mode
├── supervisor-lifecycle/
│   ├── status-payload-stub.json                ← /api/sonobus/status in stub
│   ├── status-payload-full.json                ← in full mode
│   ├── reconnect-after-kill.txt                ← supervisor recovers from SIGKILL
│   └── storm-guard-trip.txt                    ← 5 crashes in 60s → DEGRADED
└── transport/
    ├── two-node-peer-discovery.txt             ← peer_up event observed
    ├── audio-loopback-rt.txt                   ← guitar in → AOO → AOO → engine out
    └── soak-30min.csv                          ← peak block jitter < 0.35 ms, 0 xruns
```

The bench operator runs the full sequence; the per-cycle MANIFEST flips
🚧 `Bench-gated` → ✅ `Filed` as artefacts land. Final acceptance: T2521-4
status moves from `[>] In Progress` to `[✓] Done` once every row in
`MANIFEST.md` is `✅`.

---

## 6. Cross-references

- Worklist epic: `docs/PROJECT_WORKLIST.md` § T2521 + § T2521-4
- Q1-Q21 locked decisions: `docs/architecture/SONOBUS_AOO_TRANSPORT.md`
- Bench-gate operator runbook: `docs/architecture/SONOBUS_BENCH_HANDOFF.md`
- Daemon source: `juce-engine/SonoBusDaemon/Source/`
- Daemon CMake: `juce-engine/SonoBusDaemon/CMakeLists.txt`
- Supervisor: `app/services/sonobus/daemon_supervisor.py`
- UDS client: `app/services/sonobus/daemon_client.py`
- REST + WS routes: `app/services/sonobus/binding_routes.py`
- Test surface (HEAD count: 41 cases):
  - `tests/test_t2521_sonobus_daemon_build.py` (28 build-contract cases)
  - `tests/test_t2521_sonobus_daemon_protocol.py` (14 functional protocol cases)
  - `tests/test_t2521_daemon_supervisor.py` (13 supervisor + functional)
  - `tests/test_t2521_metrics_and_events.py` (14 metrics + WS event bridge)
- AOO upstream: <https://git.iem.at/cm/aoo>
- Vendor licensing: `docs/THIRD_PARTY_NOTICES.md` (AOO row, BSD-3)
