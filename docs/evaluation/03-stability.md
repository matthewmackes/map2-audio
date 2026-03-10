# MAP2 Stability and Reliability Evaluation

Date: 2026-03-10  
Worklist task: `T081-subC`

## Executive assessment

MAP2 is functionally alive, but not yet operationally trustworthy enough to call stable in the strict appliance sense.

The strongest stability signal in the current evidence is that the core callback path now runs real audio and survives a focused startup/stress test path. The strongest negative signal is that several recovery and broadcast paths still rely on behavior that can amplify faults instead of containing them: active PipeWire restarts, unbounded callback-to-async queues, and websocket fanout without per-client isolation.

In short:

- single-host functional runtime stability is materially better than before
- long-run real-time stability is still not qualified
- some of the platform's self-healing/control-plane code still creates its own reliability risk

## Scope of this pass

This phase used a targeted code-and-evidence review of the runtime seams that most directly determine reliability:

- FastAPI lifecycle and service orchestration
- websocket broadcast and subscriber handling
- metering and MIDI broadcast loops
- PipeWire recovery/watchdog behavior
- JUCE callback-path clues and existing runtime evidence

This was not a new HIL or soak execution pass. It is a stability judgment from the current code and existing archived evidence.

## Severity-ranked findings

### High 1. PipeWire recovery is still a destabilization path, not a clearly safe self-healing path

The backend startup path explicitly documents that PipeWire recovery can destabilize the backend when JACK probes misfire, yet the current startup environment still defaults recovery on unless `MAP2_ENABLE_PIPEWIRE_RECOVERY` is disabled. The recovery service itself performs escalating active interventions:

- low-level daemon probes via subprocess calls
- `pw-metadata` graph reset attempts
- `systemctl --user restart pipewire.service`
- optional audio engine stop/start cycles
- full restart of PipeWire + WirePlumber + engine

Why this matters:

- False negatives from `jack_lsp`/probe commands can trigger recovery even when audio is still usable.
- Once recovery triggers, the remediation is invasive enough to become the outage.
- This is especially risky in an appliance model, where operators expect the runtime to fail closed and predictably rather than restart parts of the stack aggressively.

Current judgment:

- Detection exists.
- Escalation logic exists.
- Safety proof that the recovery path itself is reliable does not exist in this pass.

This is a `High` severity stability risk because it sits in the exact layer meant to protect uptime.

### High 2. MIDI broadcast uses an unbounded callback-to-async queue

`app/services/midi_broadcast.py` bridges engine and MidiHub events into Python with `Queue()` and no `maxsize`. Every callback path pushes events into this queue, and the async consumer drains it in a 10ms polling loop.

Why this matters:

- A bursty MIDI source or slow downstream websocket consumers can grow the queue without bound.
- The failure mode is not graceful degradation; it is silent memory growth.
- Real-time/control-plane bridges need an explicit backpressure policy: bounded queue, drop strategy, sampling, or coalescing.

Positive note:

- The task is cancelled cleanly on shutdown.
- Hub unsubscription is attempted.

That is good lifecycle hygiene, but it does not solve the queue-growth risk.

### Medium 3. WebSocket broadcast isolates disconnects, but not slow-client latency

`app/services/websocket_manager.py` snapshots subscribers and uses `asyncio.gather()` over all `websocket.send_text(...)` calls. That is better than mutating the connection set while iterating, and disconnect cleanup is explicit.

The remaining problem is fanout coupling:

- there is no per-client queue
- there is no send timeout
- there is no slow-subscriber eviction policy based on latency

Why this matters:

- One slow or degraded client can hold up the completion of a broadcast cycle.
- Broadcast-heavy topics such as meters or MIDI activity can accumulate control-plane latency even when the audio engine is fine.
- This is not a crash risk first; it is a responsiveness and backpressure risk.

The implementation is serviceable for small client counts, but it is not yet hardened for sustained operator fanout.

### Medium 4. Metering broadcast is resilient to exceptions, but can degrade into permanent log churn

`app/services/metering_broadcast.py` starts seven forever-loops for spectrum, LUFS, CPU, phase, meters, latency, and dynamics. Each loop catches broad exceptions, logs them, and continues.

That is simple and robust in one sense, but it also means:

- persistent engine/readiness failures can become infinite error logging
- there is no circuit breaker or degraded-state transition per stream
- broadcaster health is inferred, not explicitly modeled

Why this matters:

- Repeated failure without mode transition is how noisy instability becomes normal background behavior.
- Reliability systems need a way to say "this producer is unhealthy" rather than just retry forever.

This is `Medium` because the service cancels cleanly and the failure is mostly operational noise, not immediate data corruption.

### Medium 5. Service orchestration has the right primitives, but restart behavior still needs stronger proof than this code alone provides

`app/services/service_orchestrator.py` has several good ingredients:

- dependency-aware startup ordering
- explicit lifecycle states
- a dedicated health monitor task
- shutdown cancellation of that task
- background warmup isolated into its own task

The concern is not that the structure is absent. The concern is that the current review did not find equally explicit proof of restart deduplication and storm resistance when multiple services fail repeatedly.

Signals that deserve caution:

- background health task creation
- background plugin warm task creation
- `create_task(self.restart_service(name))` from health logic
- optional auto-restart across multiple services

Why this matters:

- In reliability work, restart storms and overlapping remediation are common failure multipliers.
- The orchestrator shape is promising, but this pass cannot yet call it hardened under repeated failure.

This stays `Medium` because the design is directionally correct, but it still needs evidence beyond static structure.

## Positive stability signals

These are real strengths and should not be lost in the criticism.

### 1. The callback path is now meaningfully exercised

`T008` evidence shows:

- callback path active at `48kHz/64`
- voice tracking follows requested note counts
- xruns stayed `0` during the short validation pass

That means MAP2 is no longer in the earlier state where the control plane existed but the actual callback path was effectively unproven on the host.

### 2. Short-run functional stability is good even though long-run timing is not

The 30-minute SynthForge soak failed strict timing gates, but it did not fail for functional reasons:

- voice tracking stayed accurate
- note injection kept working
- CPU budget stayed within headroom thresholds

This matters because it separates two different truths:

- functional stability is improving
- real-time qualification is still not good enough

### 3. Several async services do cancel cleanly

The reviewed Python services generally do attempt explicit cancellation and shutdown cleanup:

- orchestrator health task cancellation
- metering task cancellation
- MIDI broadcast task cancellation
- PipeWire recovery watchdog task cancellation
- websocket disconnect cleanup

That is a healthier baseline than fire-and-forget background tasks with no stop path.

## Reliability gap summary

The dominant reliability gaps are:

1. Unsafe or overly invasive automated recovery behavior
2. Unbounded or weakly bounded event/broadcast buffering
3. Broadcast latency coupling across websocket clients
4. Incomplete long-run real-time qualification despite improved callback functionality
5. Too much dependence on "keep retrying and log it" instead of explicit degraded-mode transitions

## Current subsystem-level stability judgment

- JUCE audio core: `Improving, but not yet qualified`
- FastAPI/service lifecycle: `Structurally decent, evidence still incomplete`
- WebSocket layer: `Functionally adequate, not hardened for slow-client backpressure`
- Metering/MIDI broadcast: `Useful, but not bounded enough`
- PipeWire recovery: `Potentially self-destabilizing`
- Long-session real-time behavior: `Still below strict Tier A expectations on current host`

## Recommended next actions from a stability perspective

1. Make active PipeWire recovery truly opt-in by default, or reduce it to observation-only until restart safety is proven.
2. Put a hard bound and explicit drop/coalesce policy on the MIDI broadcast queue.
3. Introduce per-client send isolation or timeout/eviction policy in websocket broadcasting.
4. Give metering and similar producers explicit degraded-state handling instead of infinite exception logging.
5. Re-run focused stability validation after the recovery/broadcast fixes, not just after DSP changes.

## Final verdict

MAP2 is no longer fragile in the same way it was when the callback path was crashing or inert. That is meaningful progress.

But the platform is still not stable in the stronger sense that matters for an appliance:

- recovery behavior is not yet trustworthy enough
- queue/backpressure policy is too loose in key bridges
- long-run timing behavior still misses strict qualification targets

So the correct stability verdict is:

**Functionally improving, operationally incomplete, and still carrying several medium-to-high reliability risks in the recovery and broadcast layers.**
