# MAP2 Cluster MIDI Protocol — Host-to-Host Wire Specification

**Status:** Authoritative · **Worklist anchor:** T2459-H7 · **Schema version:** 1 · **First written:** 2026-04-28

This document defines the wire protocol that `map2-controller-host`
instances use to publish virtual MIDI ports across cluster nodes,
subscribe remote nodes to local ports, and elect a single MIDI clock
master across the cluster. Replaces `app/routes/midi_cluster_proxy.py`
(thin HTTP fan-out, deleted in T2459-H7) with a host-to-host transport
that runs over the existing cluster discovery surface.

---

## 1. Goals

1. **Publish/subscribe.** Host A publishes a named virtual port; Host B
   discovers it via mDNS (`_map2-midi._tcp.local.`) and subscribes;
   subsequent MIDI events on host A's local pipeline are mirrored to
   host B's subscriber.
2. **Single clock master.** Across N nodes in a cluster, exactly one
   node holds the MIDI clock master role at any time. Master election
   is monotonic-counter-driven so a network partition can't produce
   two simultaneous masters.
3. **No regressions for the React UI.** The MIDI Hub v2 cluster
   surfaces in `web/src/app/pages/midi-hub/` keep rendering. The
   legacy `/api/midi/cluster/proxy/...` HTTP routes are deleted; the
   new transport is host↔host directly, not Python proxied.

---

## 2. Transport

| Plane | Protocol | Purpose |
|-------|----------|---------|
| Discovery | mDNS (`_map2-midi._tcp.local.`) — already shipped | Peer enumeration, node addresses |
| Control | TCP, length-prefixed JSON frames over the host's UDS-equivalent listener on the same port advertised in mDNS | Subscriptions, port lists, clock-master vote exchange |
| Hot path | UDP (datagram-per-event) on the same port | Event broadcast (note on/off, CC, clock ticks, song-position resets) |

The hot path uses UDP because per-event TCP framing would add
~100 µs of head-of-line blocking under bursty load. Events that *must*
be delivered (clock-master vote, subscribe/unsubscribe) ride the TCP
control plane. Lost UDP packets show up as MIDI note-stuck states the
operator can hear within one quantum (1.33 ms) — recoverable by a
follow-up event.

The same TCP+UDP port number is announced via mDNS as the
`MidiCapabilities.cluster_port` field (default 7261; configurable via
`controller-host.json:cluster.port`).

---

## 3. Message envelope

All messages — TCP control or UDP hot-path — share a single envelope:

```json
{
  "v": 1,                           // protocol version (== SCHEMA_VERSION below)
  "from": "node-uuid",              // sender node_id (matches mDNS announcement)
  "type": "<message-type>",         // see §4
  "ts": 1234567890123,              // unix-monotonic millis at sender
  "seq": 42,                        // monotonic per-sender; receivers detect drops
  "payload": { … }                  // type-specific
}
```

`SCHEMA_VERSION = 1`. Receivers MUST drop messages whose `v` doesn't
match. Bump on any breaking change.

`seq` is monotonic per-sender and per-message-type. A receiver
maintaining a per-(sender, type) high-water mark drops out-of-order
duplicates.

---

## 4. Message types

### 4.1 `port.list_request` (control / TCP)

`A → B`. Request the published-port list from B.

```json
{ "type": "port.list_request", "payload": {} }
```

### 4.2 `port.list_response` (control / TCP)

`B → A`. Reply to `port.list_request`.

```json
{
  "type": "port.list_response",
  "payload": {
    "ports": [
      { "name": "MAP2 Cluster Port 0", "id": "uuid-0", "is_virtual": true }
    ]
  }
}
```

### 4.3 `port.subscribe` (control / TCP)

`A → B`. Subscribe to events on B's port `port_id`. B is expected to
mirror future events on that port to A's UDP listener.

```json
{
  "type": "port.subscribe",
  "payload": { "port_id": "uuid-0", "udp_port": 7261 }
}
```

### 4.4 `port.unsubscribe` (control / TCP)

`A → B`. Stop forwarding events.

```json
{
  "type": "port.unsubscribe",
  "payload": { "port_id": "uuid-0" }
}
```

### 4.5 `event.midi` (hot-path / UDP)

`B → A` for each event on a subscribed port. Bytes carry the raw MIDI
message; `length` is the byte count (1..256 — SysEx longer than 256 B
fragments at the source).

```json
{
  "type": "event.midi",
  "payload": {
    "port_id": "uuid-0",
    "length": 3,
    "bytes": [144, 60, 100],
    "ts_source_ns": 1234567890000000123
  }
}
```

`ts_source_ns` is the producer-side monotonic clock (matches the
local shm ring's `tsNanos`) so subscribers can compute network latency
and correct for it. The envelope's `ts` is wall-clock millis for human
debugging.

### 4.6 `clock.vote` (control / TCP, multicast-style fan-out)

The clock-master election protocol uses a Lamport-priority-vote
scheme. Each node broadcasts a `clock.vote` to every peer on every
election tick (default 1.0 s):

```json
{
  "type": "clock.vote",
  "payload": {
    "term": 17,                  // election term, monotonically increasing
    "node_id": "node-uuid",
    "priority": [42, "stable-uuid-prefix"]
  }
}
```

The priority is a `(integer, string)` tuple compared lexicographically.
Higher value wins. Default priority comes from the node's
`controller-host.json:cluster.master_priority` (default 0); ties break
on the node's UUID prefix. The node with the highest priority in a
given term is the master for that term.

After 3 consecutive ticks where a node has seen no vote with higher
priority than its own, it self-promotes to master and emits clock
ticks via `event.midi` (status=0xF8) on its `cluster.clock` virtual
port. Subscribed peers consume the master's clock instead of running
their own.

A network partition produces two masters in *different* terms — when
the partition heals, the higher-term master wins because every node
tracks the highest term it has seen and rejects votes from lower
terms.

### 4.7 `clock.cede` (control / TCP)

Sent by a current master when it sees a higher-priority vote.
Indicates an immediate role change.

```json
{
  "type": "clock.cede",
  "payload": { "term": 17, "to_node_id": "node-uuid" }
}
```

---

## 5. Clock-master election state machine

Every host runs the same loop on a 1.0 s tick:

```
┌───────────────────────────────────────────────────────────────┐
│ state = INIT                                                  │
│ term = 0                                                      │
│ master = None                                                 │
│ self_priority = config.cluster.master_priority                │
│ ticks_unchallenged = 0                                        │
└───────────────────────────────────────────────────────────────┘
                             ↓ tick
┌───────────────────────────────────────────────────────────────┐
│ broadcast clock.vote{term, self.node_id, self_priority}       │
└───────────────────────────────────────────────────────────────┘
                             ↓ collect responses for 200 ms
┌───────────────────────────────────────────────────────────────┐
│ for vote in incoming:                                         │
│   if vote.term > term: term = vote.term;                      │
│       master = vote.node_id; ticks_unchallenged = 0           │
│   elif vote.term == term:                                     │
│       if vote.priority > self_priority:                       │
│           master = vote.node_id; ticks_unchallenged = 0       │
│ if master == self.node_id or master is None:                  │
│     ticks_unchallenged += 1                                   │
│     if ticks_unchallenged >= 3:                               │
│         master = self.node_id                                 │
│         emit clock.tick events                                │
└───────────────────────────────────────────────────────────────┘
```

Convergence: in a static cluster of N nodes, election converges in
`ceil(log2(N)) * tick_period + 200 ms` because each tick at most
halves the candidate set. For N ≤ 16 (the platform's design ceiling),
that's ≤ 5 s on the 1 s tick.

---

## 6. Acceptance gates (T2459-H7 brief)

| Gate | How tested |
|------|------------|
| (a) virtual port published on host A is subscribable from host B | `tests/test_cluster_midi_gateway.py::test_publish_then_subscribe_round_trips_an_event` — two `ClusterGateway` instances on the same loopback, one publishes, one subscribes, an event pushed on the publisher arrives at the subscriber |
| (b) MIDI clock can be elected to a single master | `tests/test_cluster_midi_gateway.py::test_clock_master_election_converges_in_one_term` — three simulator nodes with distinct priorities; the highest-priority one becomes master within 3 ticks |
| (c) `app/routes/midi_cluster_proxy.py` deleted | File deletion + `test_route_prefix_collisions_phase_a.py` updated; `app/main.py` route list scrubbed |
| (d) cluster MIDI surfaces in React UI keep working | `grep -rn "midi/cluster/proxy" web/src/` returns only generated OpenAPI types; no live code calls the deleted route. The MIDI Hub v2 surfaces (`MidiHub*Page.tsx`) didn't use the proxy in the first place — verified via grep at H7 land time |

---

## 7. Cross-references

- `app/services/midi_hub/midi_discovery.py` — mDNS peer enumeration that the gateway reuses
- `juce-engine/Source/ControllerHost/Hub/ClusterGateway.{h,cpp}` — C++ gateway implementation
- `tests/cluster_midi_simulator.py` — Python simulator for single-bench acceptance testing
- `tests/test_cluster_midi_gateway.py` — integration tests
- `docs/midi/MIDI_BACKEND.md` §5 — license + attribution

---

**End of document.** Authoritative for T2459-H7 implementation work.
