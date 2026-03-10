# MAP2 Performance and Latency Analysis

Date: 2026-03-10  
Worklist task: `T081-subF`

## Executive assessment

MAP2's performance story is mixed:

- the real-time engine is capable enough to run meaningful audio workloads
- the host still misses strict timing gates under sustained stress
- the platform now has better measurement tooling than it has disciplined measurement practice

The biggest performance conclusion is this:

**MAP2's main current limiter is scheduling/jitter discipline and measurement closure, not obvious DSP CPU exhaustion.**

That matters because it changes the next engineering move. The platform does not mainly need more raw optimization. It needs:

- better latency truth
- cleaner real-time boundaries
- clearer distinction between functional pass and qualified pass

## Evidence used in this pass

- `docs/fit-for-purpose-evidence/20260224/SYNTHFORGE_T008_VALIDATION.md`
- `docs/fit-for-purpose-evidence/20260224/synthforge-tier-a-soak-30m.md`
- `docs/fit-for-purpose-evidence/20260308/t063/T064_XRUN_JITTER_GAP_ANALYSIS.md`
- `docs/RUNTIME_PROFILE_RELEASE_CONTROLS.md`
- `scripts/measure_latency.sh`
- `app/services/request_latency_metrics.py`
- `app/routes/latency.py`

## End-to-end latency budget

Some values below are measured from existing evidence. Others are explicit estimates inferred from configured sample rate/buffer size and current implementation. Those estimates are marked as such.

| Stage | Current value | Type | Notes |
| --- | --- | --- | --- |
| Input period @ `48kHz/64` | `1.33 ms` | Inferred | `64 / 48000 * 1000` |
| Output period @ `48kHz/64` | `1.33 ms` | Inferred | Same as input period |
| Minimum pure buffer round-trip | `2.67 ms` | Inferred | This is the best-case transport floor before converter, USB, scheduler, and DSP overhead |
| DSP callback work | `33.63%` to `63.42%` of budget in 30-minute soak | Measured | CPU budget stayed within threshold even during 64-voice stress |
| Short-run callback jitter | `0.713 ms` min / `1.452 ms` sampled max / `0.827 ms` mean | Measured | From 30-minute SynthForge soak |
| Lifetime peak callback jitter | `38.401 ms` | Measured | Dominated by transient spikes; still unacceptable for strict qualification |
| Xrun rate | `2579` xruns in 30-minute soak | Measured | Functional stability intact, timing stability not acceptable |
| Operational waiver gate | `<= 1.35 xruns/s`, `<= 2.0 ms` sampled max jitter, `<= 0.30 ms` jitter p95 | Documented policy | Release-default waiver exists, but strict hard-RT certification remains red |
| WebSocket meter cadence | `33 ms`, `100 ms`, `500 ms`, `1 s` loops depending on topic | Configured | Good enough for observability, not for hard-real-time control |
| API request latency snapshots | Collector exists (`p50/p95/p99`) | Instrumented but not evidenced | There is no current archived baseline in this pass |

## What the numbers really say

### 1. Raw DSP headroom is not the main bottleneck right now

The 30-minute SynthForge soak showed:

- CPU headroom stayed above threshold
- budget utilization stayed within limits
- voice tracking remained correct

The host still failed, but not because the DSP graph obviously ran out of compute. It failed because timing discipline broke first:

- xruns accumulated
- peak jitter spiked badly

That is a very different engineering problem from "the audio engine is too slow."

### 2. Startup/rewire transients are distorting strict pass/fail status

The waiver analysis documents that strict jitter failure is dominated by startup/rewire spikes in the `15-38 ms` range, while sampled callback jitter across steady operation stays much lower.

That means MAP2 has two latency stories:

- steady-state behavior: imperfect but much closer to acceptable
- transition behavior: still too disruptive

The platform therefore needs to treat transition latency as a first-class problem, not just a noisy outlier.

### 3. Loopback measurement capability exists, but measurement discipline is still incomplete

`scripts/measure_latency.sh` is a real tool with:

- JACK `jack_iodelay` path
- ALSA fallback
- internal/software path
- JSON output support

That is good.

The missing piece is not tooling. It is product practice. MAP2 still does not carry a stable, canonical set of regularly refreshed round-trip loopback results that anchor latency claims across host profiles and modes.

### 4. API/control-plane latency is instrumented, but not yet closed as an operator contract

`app/services/request_latency_metrics.py` is lightweight and sensible:

- fixed-size deques
- grouped snapshots
- p50/p95/p99/mean/max

The problem is that this instrumentation does not yet appear to drive a published performance contract. So the control plane has observability without a clear performance promise.

### 5. Plugin-latency measurement is architecturally present but not fully closed

`app/routes/latency.py` exposes plugin latency and compensation endpoints, but the route itself admits an important gap:

- impulse measurement wants a plugin process function from the engine
- the current JUCE engine path does not expose direct plugin instances there
- fallback behavior depends on reported values or manual chain inputs

That means the latency subsystem is only partly end-to-end. The API is present, but the strongest measurement path is not fully wired through the actual runtime model.

## Avoidable latency and overhead sources

### 1. Transition spikes during rewires and mode changes

This is currently the most visible avoidable performance problem. Strict peak jitter numbers are being driven by transition behavior that is larger than steady-state behavior.

### 2. Control-plane fanout and polling cadence

Metering and monitoring are correctly off the audio thread, but they still create background traffic and periodic work:

- 30 fps spectrum/meters/dynamics
- 10 fps phase/LUFS
- 2 fps CPU
- 1 fps latency

None of that is catastrophic, but it does mean performance tuning cannot look only at DSP.

### 3. Mixed truth between measured and reported latency

The presence of measurement routes, compensation routes, and a loopback tool is good, but the system still mixes:

- inferred transport latency
- measured callback timing
- reported plugin latency
- manual chain compensation inputs

That increases operator ambiguity.

## Per-subsystem performance judgment

| Subsystem | Judgment | Why |
| --- | --- | --- |
| JUCE audio core | `Capable but not fully qualified` | Good callback functionality and budget headroom; long-run timing still fails strict gates |
| PipeWire / JACK transport | `Usable, timing-sensitive` | Transport works, but transition spikes and xrun behavior still dominate qualification failures |
| DSP graph | `Not obviously compute-bound` | Budget utilization remains below critical threshold even under voice stress |
| Runtime profile / RT hardening | `Operationally useful, not certification-grade` | Waiver path exists, but strict hard-RT status stays red |
| API latency instrumentation | `Present but underused` | Collector exists, but there is no strong published baseline or SLO-like contract |
| Latency compensation | `Partially wired` | API surface exists, but direct impulse-measurement path is not fully integrated with engine instances |
| UI observability | `Adequate for ops, not neutral for overhead` | Polling/broadcast loops are reasonable but not free |

## Top three bottlenecks

1. Transition and rewire jitter spikes
   - These are the clearest reason strict hard-RT gates still fail.
2. Incomplete latency truth model
   - MAP2 has measurement tools, inferred budgets, and route-level latency APIs, but not one canonical measured truth across the platform.
3. Recovery/monitoring/control-plane overhead competing with timing discipline
   - The platform carries real background work outside the audio callback; that is fine, but it must be managed deliberately when chasing xrun/jitter goals.

## Recommended reductions

### Immediate

1. Make loopback latency measurement part of recurring qualification, not an optional script.
2. Separate steady-state and transition-performance gates explicitly in qualification reports.
3. Publish current API latency snapshots from `request_latency_metrics.py` so the control plane has a visible baseline.

### Medium-term

1. Finish the direct plugin-latency measurement path so the latency API is not partly theoretical.
2. Reduce transition-time graph churn and identify the exact operations that create the worst jitter spikes.
3. Tie websocket/polling rates to explicit operator needs rather than historical defaults.

### Strategic

1. Define one canonical latency/trust model for MAP2:
   - physical round-trip latency
   - callback timing/jitter
   - plugin latency/compensation
   - control-plane response latency
2. Stop mixing waiver-based release readiness with certification-like language unless the distinction is visible everywhere operators look.

## Final verdict

MAP2's performance is good enough to be promising and bad enough to be honest about.

The platform can run real audio loads and keep CPU budget under control. That is important. But the system still lacks the measurement closure and timing discipline required for strong professional latency claims.

So the correct performance verdict is:

**MAP2 is functionally performant, but still only partially measured and partially qualified. The main next step is not more DSP heroics; it is tighter timing truth and lower transition-time disruption.**

## Latency evidence schema

T096-sub03 establishes a canonical JSON schema for latency evidence artifacts:

- Schema: `docs/evaluation/latency-evidence-schema.json`
- Validator: `scripts/validate_latency_evidence.py`
- Example artifact: `docs/fit-for-purpose-evidence/20260310/t096/latency_baseline.sample.json`

Validation command:

```bash
python3 scripts/validate_latency_evidence.py \
  --evidence docs/fit-for-purpose-evidence/20260310/t096/latency_baseline.sample.json
```

## T096 baseline snapshot (2026-03-10)

Latest archived artifact:

- `docs/fit-for-purpose-evidence/20260310/t096/latency_baseline.json`
- Validation: `python3 scripts/validate_latency_evidence.py --evidence docs/fit-for-purpose-evidence/20260310/t096/latency_baseline.json`

Measured values in this pass:

- Hardware: `Hotone JoGG`, `48kHz`, `64` samples, isolated cores reported as `[4, 5]`
- RTL: `p95=2.9667ms`, `p99=2.9667ms`, `max=2.9667ms`
- Jitter: `p95=0.0000ms`, `max=0.0000ms`
- XRUNs during measurement window: `0`
- Gate result: `PASS`

Notes:

- Measurement method in this artifact is `internal` (no physical loopback cable attached in this run), so this is a provisional baseline and not the final loopback-qualified publication target.
- The host still carries unsettled CPU-isolation state from earlier operational notes (cores `2/3` active in some boots while `4/5` remain the intended isolated pair pending reboot/profile convergence).

## Runtime jitter monitor integration

T096 runtime plumbing now exposes:

- WebSocket topic `timing_jitter` at 10Hz (`/ws`)
- API route `GET /api/v2/latency/jitter-stats`
- API route `POST /api/v2/latency/xruns/reset`
- Retime check script: `scripts/retime_test.sh`
- Evidence generator with hard/warn gates: `scripts/measure_latency.sh`
