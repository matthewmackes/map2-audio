# Philosophy — AVB

> **Audience:** Engineers building or operating networked audio paths between MAP2 nodes and third-party AVB endpoints.
> **Scope:** AVTP transport, gPTP timing, AVDECC discovery and connection management, multi-node routing, and the latency budgets that anchor the whole stack.

## 1. The thesis

AVB exists in MAP2 because *no other standard* delivers deterministic sub-2 ms audio across a switched network with bounded jitter, without proprietary licensing. The design commits to three things:

1. **Standards-conformant on the wire.** IEEE 1722 AVTP, IEEE 802.1AS gPTP, IEEE 802.1Qav credit-based shaping. No bespoke wrappers, no proprietary headers — anything we ship interoperates with Biamp, MOTU, QSC, and other AVB-Milan equipment.
2. **Production-tested control plane.** The AVDECC controller is L-Acoustics `la_avdecc` v4.3.1.1 wrapped, not a bespoke implementation. Stream connection management uses the same library that ships in commercial AVB consoles.
3. **Multi-node from day zero.** AVB is treated as the audio interconnect for a cluster, not as a single-node feature. Talker and listener identities are *node-scoped*, and the routing UI exposes that explicitly.

## 2. The transport layer (IEEE 1722 AVTP)

`juce-engine/Source/AvbStream.{h,cpp}` is the C++ abstraction. It uses **libavtp** for packetization and raw `AF_PACKET` sockets so packets ship without a userspace network stack adding jitter. Each stream:

- Carries AAF-format PCM (16/24/32-bit, 2–16 channels).
- Sends 256 samples per AVTP frame (~5.33 ms at 48 kHz). **This is the on-the-wire packet size, not the audio buffer**, and it is independent of the engine's 64-sample callback. The 256-sample value is the IEEE 1722 sweet spot for Class A streams and is not user-tunable.
- Defaults to a 2 000 µs presentation offset, configurable from 500–10 000 µs.
- Returns three RT-safe send/receive states: 0 (sent), 1 (transient back-pressure), negative (hard failure).

Stream identity is built from the network interface's MAC plus a stream ID; the destination MAC defaults to the AVB Milan multicast MAC unless overridden. Class A (`priority=3`, 2 ms bounded latency) is the default and only documented class — Class B is not currently emitted.

## 3. The clock layer (gPTP)

AVB without working gPTP is not AVB; it is just multicast UDP that drifts. MAP2 verifies clock health at three points:

1. `/run/ptp4l.pid` exists.
2. `pidof ptp4l` returns a PID.
3. `systemctl is-active map2-ptp4l.service` returns `active`.

`map2-ptp4l.service` runs `ptp4l -f /etc/ptp4l.conf` and `map2-phc2sys.service` syncs `CLOCK_REALTIME` to the PTP hardware clock. Both are gated by the file `/etc/map2/avb-enabled` (`ConditionPathExists=`) — AVB is opt-in per host.

Discovered AVDECC entities expose grandmaster ID and PTP domain in `DiscoveredEntity` (`AvdeccController.h`), and the engine surfaces a `ptpReady` flag the UI uses to refuse stream creation until the clock is locked. TAI timestamps are preferred over UTC when the kernel exposes them.

## 4. The control layer (AVDECC via `la_avdecc`)

The AVDECC controller is wrapped in `juce-engine/Source/AvdeccController.{h,cpp}` as `Map2AvdeccController`, inheriting `la::avdecc::controller::Controller::DefaultedObserver`. The wrapper:

- Receives `onEntityOnline()` callbacks *after* full AEM enumeration (so the entity cache is complete when the UI sees it).
- Bridges async library calls to sync engine calls via `std::promise`/`std::future` for connect, disconnect, and `setStreamFormat` operations.
- Uses ACMP (Connection Management Protocol) to bind talkers to listeners and AECP (Enumeration & Control Protocol) to negotiate stream formats at runtime.

Why `la_avdecc` rather than a custom implementation: the AVDECC AEM model is large and the failure modes are subtle. The L-Acoustics library is what real AVB-Milan consoles use to talk to MOTU AVB, Biamp Tesira, and QSC Q-Sys, and reusing it makes interoperability bugs *their* problem upstream.

The build flag `HAS_AVDECC=1` is set when `USE_AVDECC=ON` and libpcap is found. AVDECC is independent of the AVB transport flag — it is possible to build a control-only node that observes streams without emitting them.

## 5. Multi-node routing

`docs/AVB_MULTI_NODE_ARCHITECTURE.md` is the canonical design document; the implementation is split across:

- `app/services/avb/avb_discovery.py` — enumerates local and remote endpoints (mDNS for MAP2-to-MAP2, AVDECC for third-party gear).
- `app/services/avb/avb_router.py` — N-to-M talker/listener bookkeeping, per-node SRP reservation tracking, `effects_loop_send`/`effects_loop_return`/`general_route` connection roles. Writes through `AvbBindingAuthority` (see §5.1) on connect/disconnect; reads back its own state on startup.
- `web/src/app/components/AvbRouting/` — the React routing UI: matrix view, node tree sidebar, ReactFlow-based cross-node visualisation.
- `web/src/app/pages/avb-services/` — the canonical operator mount at `/avb/*` (six regions: Overview, Connections, Bindings, Devices, Routing, Network).

Endpoints carry `node_id` and `node_address`, so a "connect talker A to listener B" request is unambiguous about which node holds each side. The matrix exposes node membership through colour and grouping rather than burying it in a tooltip.

SRP (Stream Reservation Protocol) admission is tracked per stream. A failed reservation surfaces as `SRP_RELEASE_FAILED` with a remediation hint rather than a silent dropout.

## 5.1 Canonical authority pattern (T2490 + T2496)

AVB Services is one of the four standing first-class platform services (MIDI, AVB, Sampler, Audio Effects per `docs/architecture/FIRST_CLASS_SERVICES.md`). The discipline is **single canonical authority + single canonical surface + no parallel implementations**. For AVB, that authority is `AvbBindingAuthority` (`app/services/avb/binding_authority.py`):

- **Single writer.** Every AVB binding write — talker/listener pairing, AVDECC stream, Tesira preset recall, Tesira block subscription, cluster route, SRP reservation — goes through this service. Vocab: `consumer_type ∈ {avdecc_stream, tesira_preset, tesira_block, cluster_route, srp_reservation}`.
- **Source of truth across restarts.** `AvbRouter._reconcile_connections_from_authority()` rebuilds the in-memory `connections` dict from durable rows on `start()`. The dict is a transient cache; the authority is the durable record. This is the same posture MIDI Services takes (T2482) and the same posture every other first-class service must take.
- **Observable through one REST surface.** `/api/avb/bindings*` (CRUD + matrix + count + cluster fan-out). The operator UI at `/avb/*` reads exclusively from this surface; there is no parallel "live router state" endpoint.
- **Defensive coupling.** Authority writes are non-fatal — a DB exception logs a warning but does not fail the audio routing operation. Authority drift self-heals on next operator action against the same talker/listener pair.

The Tesira fold-in mirrors this pattern: `TesiraFleet`'s in-memory DSP-block model remains source-of-truth for moment-to-moment block parameters, but every operator-visible decision (subscription pin, preset recall, design push) is a row in the binding authority. The Tesira adapter (`app/services/tesira/binding_adapter.py`) writes `consumer_type="tesira_block"` for raw subscriptions and `consumer_type="tesira_preset"` for preset/design recall (with `metadata.kind` discriminating preset vs. design). Pending recalls are written with `enabled=False`; the device-ack handler flips them to `enabled=True`.

## 6. The hardware contract

AVB is not "any NIC will do". The platform requires:

- IEEE 802.1AS gPTP support **with hardware timestamping**.
- IEEE 802.1Qav credit-based shaper offload.
- ETF qdisc support in the kernel.
- A PHC (PTP Hardware Clock).

Reference NICs are Intel I210 (1 Gbps) and I225 (2.5 Gbps). The interface is selected exclusively via the `MAP2_AVB_INTERFACE` environment variable (`juce-engine/Source/AvbAudioIODeviceType.cpp`). There is no auto-probing — picking the wrong interface is the kind of silent failure that ruins a show, so it is opt-in and explicit.

## 7. Latency budget

The end-to-end target documented in `AVB_MULTI_NODE_ARCHITECTURE.md` is **&lt;2 ms** for multi-node audio routing. The components:

| Component | Budget |
|---|---|
| Talker buffering | dictated by AVTP frame size (~5.33 ms window, but pipelined) |
| Bridge hop delay | gPTP-bounded; switch-dependent |
| Listener buffering | symmetric to talker |
| Presentation offset | 2 000 µs default |
| Engine processing margin | 1.33 ms (64 samples @ 48 kHz) |

The latency optimiser (`AVB_LATENCY_OPTIMIZER.md`) is an audit CLI that takes these inputs and produces a deterministic budget; it is the tool of record for "is this network path fast enough?" before a show.

## 8. What we deliberately do not do

- **No Class B streams.** 20 ms-latency streams are out of scope; everything is Class A.
- **No proprietary AVB extensions.** If it is not in the IEEE specs or AVB-Milan, MAP2 does not emit it.
- **No automatic interface selection.** `MAP2_AVB_INTERFACE` is required; we will not guess.
- **No control-plane fallback.** If gPTP is not locked, stream creation is refused, not "best-effort". A wobbling clock is a worse outcome than a clear error.

## 9. Where to read next

- `docs/avb-setup.md` — operator setup runbook.
- `docs/AVB_MULTI_NODE_ARCHITECTURE.md` — design rationale, network-first approach.
- `docs/AVB_MULTI_NODE_IMPLEMENTATION_SUMMARY.md` — phase-by-phase code map.
- `docs/AVB_LATENCY_OPTIMIZER.md` — the budget audit tool.
- `docs/MAP2_AVB_Capabilities_and_Usecases_2026-02-14.md` — discovery/enumeration walkthrough.
- `docs/design/CARBON_CONFORMANCE_STANDARD.md` §10 — operator-state discipline (T2474). The AVB routing UI at `web/src/app/components/AvbRouting/` consumes the canonical `--map2-avb-*` (locked / unlocked / grandmaster), `--map2-clock-*`, and `--map2-state-*` semantic tokens for stream and PTP status presentation; new AVB-side surfaces must use those tokens rather than raw Carbon support colors.
