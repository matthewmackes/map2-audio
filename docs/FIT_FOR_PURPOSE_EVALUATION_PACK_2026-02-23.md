# Fit-for-Purpose Evaluation Pack (No Security Scope)

Date: 2026-02-23
Target: JUCE Guitar Audio Processor Node + AVB/TSN Cluster + API/SSH + Biamp TesiraFORTÉ AVB interoperability
Repository snapshot: `master` @ `70f767a0`
Evidence root: `docs/fit-for-purpose-evidence/20260223/`

## 0) Mission and Decision Standard

### Purpose statement
Evaluate whether MAP2 is currently fit for purpose as a networked audio processing node that:
- Runs a JUCE guitar processor
- Joins AVB/TSN routable clusters predictably
- Is controllable via API (SSH optional)
- Can consume/produce AVB streams interoperable with Biamp TesiraFORTÉ AVB

### Decision basis
This evaluation is **evidence-first** for the host state on **2026-02-23**. No claim is accepted without command/log/test evidence in the evidence root listed above.

### Assumptions log (explicit)
- ASSUMPTION A1: Use-case is live-performance grade, not lab-only.
- ASSUMPTION A2: Target values are:
  - `X` local round-trip latency <= **4.0 ms** at 48 kHz
  - `N` xrun-free duration under load >= **8 hours**
  - `Y` gPTP lock time <= **10 s**
  - `Z` steady-state offset <= **1.0 us**
  - `T` cluster discovery <= **10 s**, routing converge <= **5 s**
  - `M` install-to-ready <= **30 min**
  - `K` scale check = **4 nodes** minimum
- ASSUMPTION A3: Artifact tolerance during live repatch is <= 1 buffer discontinuity and no audible pop above -40 dBFS.

## 1) Acceptance Criteria (AC)

- AC-01 local E2E processing latency <= X ms (48 kHz, configured block)
- AC-02 no underruns/xruns for N hours under mixed load
- AC-03 explicit sample-rate/bit-depth policy and stable runtime behavior
- AC-10 gPTP lock <= Y sec, steady offset <= Z us
- AC-11 SRP reservation state transitions deterministic
- AC-12 stream format/QoS profile correctness
- AC-13 listener/talker control-plane exposure
- AC-20 cluster membership discovery <= T sec
- AC-21 routing converge <= T sec under live changes
- AC-22 split routing with predictable resource accounting
- AC-30 Tesira -> Node subscribe path verified
- AC-31 Node -> Tesira publish path verified (if required)
- AC-32 control-responsibility split (API vs AVDECC/vendor tool) documented
- AC-50 install/upgrade/rollback repeatable
- AC-51 declarative config export/import
- AC-52 health/readiness observability for DSP/gPTP/SRP/stream
- AC-53 fresh install to ready <= M minutes

## 2) System Inventory (What Exists)

| Component | Current State (2026-02-23) | Interfaces/Ports | Evidence |
| --- | --- | --- | --- |
| Host OS / kernel | Fedora 43 Server, kernel `6.18.5-200.fc43` PREEMPT_DYNAMIC | N/A | `os-release.txt`, `uname.txt` |
| AVB NIC | Intel I217-LM (`e1000e`) on `enp0s25` | L2 Ethernet | `lspci-k.txt`, `ethtool-enp0s25.txt`, `ip-link-brief.txt` |
| JUCE engine build config | AVB enabled in CMake when deps present; AVDECC enabled in current build config | Local audio + AVB transport code paths | `juce-cmake-avb-options.txt`, `juce-cmake-avb-grep.txt` |
| AVB runtime readiness | **Disabled** in active config (`enabled=false`, `available=false`) | `/api/avb/*` on 8080 | `curl-avb-status.json` |
| gPTP/SRP binaries on host | `ptp4l`, `phc2sys`, `mrpd`, `msrpd` not found in PATH | N/A | `which-avb-binaries.txt` |
| AVB daemons (packaged units) | Unit files exist in repo, but host has no `map2-ptp4l`, `map2-srpd`, `map2-avb.target` installed | systemd units | `systemd-map2-ptp4l.service.txt`, `systemctl-map2-ptp4l.txt` |
| Backend control plane | FastAPI active (`map2-backend.service`) | TCP 8080 | `systemctl-map2-backend.txt`, `ss-listeners-core.txt` |
| Web control plane | Vite preview service active | TCP 3000 | `systemctl-map2-web-prod.txt`, `ss-listeners-core.txt` |
| SSH management path | SSH listener active + `/api/ssh/*` trust APIs | TCP 22 + API on 8080 | `ss-listeners-core.txt`, `curl-ssh-trust-status.json`, `routes-ssh-trust.txt` |
| Cluster discovery model | mDNS/Avahi-based discovery cache + registry service model in code | `/api/cluster/*` | `cluster-mdns-discovery-enhanced.txt`, `routes-cluster-flows.txt`, `rg-cluster-protocols.txt` |
| Cluster runtime state on host | Zero discovered/registered nodes currently (`count=0`) | `/api/cluster/status`, `/api/cluster/nodes` | `curl-cluster-status.json`, `curl-cluster-nodes.json` |
| Routing model | AVB router endpoints + flow orchestrator assignment API present | `/api/avb/router/*`, `/api/cluster/flows/*` | `openapi-avb-cluster-audio-endpoints.txt`, `routes-cluster-flows.txt` |
| Config distribution model | Git-style config push/pull + API/SSH fallback logic exists | `/api/cluster/config/*` + SSH/SCP fallback | `cluster-config-pusher.txt`, `cluster-integration-helpers.txt`, `routes-config-api.txt` |

## 3) Domain Batteries Executed (This Evaluation)

### Domain A - Audio DSP fitness (local)
Executed:
- `python3 test_tier_a_locks.py` -> lock policy check
- `bash scripts/measure_latency.sh --internal --duration 10 --json`
- `/api/audio/diagnostics/latency`, `/api/audio/health/xruns`, `/api/audio/status`

Observed:
- Lock policy claims `audio.buffer_size=64`, `audio.sample_rate=48000` (policy layer)
- Runtime reports `buffer_size=256` in `/api/audio/status` and `measured_round_trip_ms=-1.0`
- Last latency artifact is `status=estimated` (not measured loopback)

Evidence:
- `test-tier-a-locks.txt`
- `measure-latency-internal.json`
- `curl-audio-diagnostics-latency.json`
- `curl-audio-health-xruns.json`
- `curl-audio-status.json`
- `systemctl-cat-map2-backend.txt`

### Domain B - AVB/TSN correctness
Executed:
- `curl /api/avb/status`, `/api/avb/ptp/status`, `/api/avb/srp/status`
- `bash scripts/run_avb_hil_qualification.sh --interface enp0s25 --capture-seconds 30 ...`

Observed:
- AVB readiness: disabled/unavailable
- HIL wrapper classifies Q04/Q05 as `BLOCKED` due `enabled=false available=false`
- SRP API exposes daemon state, but runtime daemon not detected (`daemon_type=none`, `running=false`)

Evidence:
- `curl-avb-status.json`
- `curl-avb-ptp-status.json`
- `curl-avb-srp-status.json`
- `hil-wrapper/summary.txt`
- `hil-wrapper/matrix_update.md`

### Domain C - Cluster formation and routing semantics
Executed:
- `/api/cluster/status`, `/api/cluster/nodes`, `/api/cluster/flows/assignments`
- static inspection of discovery/routing code

Observed:
- APIs exist and are reachable
- Current host has no cluster peers (`total_nodes=0`)
- No measured join/leave/routing convergence timing artifact this run

Evidence:
- `curl-cluster-status.json`
- `curl-cluster-nodes.json`
- `cluster-mdns-discovery-enhanced.txt`
- `routes-cluster-flows.txt`

### Domain D - Tesira interoperability
Executed:
- Code/docs search for Biamp/Tesira-specific artifacts

Observed:
- No Biamp Tesira-specific test evidence, capture artifacts, or runbook in current repo state

Evidence:
- `rg-biamp-tesira.txt`

### Domain E - Operability and maintainability
Executed:
- installer/AVB setup help checks
- runtime service/process checks
- automated software qualification suites

Observed:
- Installer + AVB setup scripts are present
- Core AVB software test suites pass
- Config distributor endpoints return 500 for uninitialized distributor on this host

Evidence:
- `setup-avb-help.txt`, `install-on-new-host-help.txt`
- `systemctl-map2-backend.txt`, `systemctl-map2-web-prod.txt`
- `pytest-avb-contracts.txt`
- `npm-test-avb-routing-summary.txt`
- `cmake-check-avb.txt`
- `curl-cluster-config-root-with-status.txt`
- `curl-cluster-config-status-with-status.txt`

## 4) Requirements Matrix

Legend: `PASS / FAIL / PARTIAL / UNKNOWN`

| Requirement ID | Category | Priority | Status | Evidence | Notes / Remediation Pointer |
| --- | --- | --- | --- | --- | --- |
| DSP-01 | DSP | MUST | PARTIAL | `curl-audio-status.json`, `curl-audio-routing.json` | Engine/routing APIs live, but no physical guitar input->output integrity capture in this run. `R-02` |
| DSP-02 | DSP | MUST | FAIL | `curl-audio-diagnostics-latency.json`, `measure-latency-internal.json` | No measured loopback RTL (`measured_round_trip_ms=-1.0`), only estimate. `R-01` |
| DSP-03 | DSP | MUST | PARTIAL | `curl-audio-health-xruns.json` | Snapshot xrun counter is 0, but no N-hour mixed-load soak evidence. `R-02` |
| DSP-04 | DSP | MUST | PARTIAL | `test-tier-a-locks.txt`, `curl-audio-status.json`, `systemctl-cat-map2-backend.txt` | Policy says 48k/64; runtime shows buffer drift (128/256 paths). Bit-depth policy not acceptance-verified. `R-03` |
| DSP-05 | DSP | SHOULD | UNKNOWN | Missing artifact | No preset-switch timing/artifact capture for this run. |
| DSP-06 | DSP | SHOULD | UNKNOWN | Missing artifact | No automation stress artifact proving RT thread safety under parameter churn. |
| DSP-07 | DSP | SHOULD | UNKNOWN | Missing artifact | No validated CPU headroom benchmark under expected live chain+network load. |
| DSP-08 | DSP | COULD | PASS | `test-tier-a-locks.txt`, `systemctl-cat-map2-backend.txt` | Scheduling intent and locked settings documented + verifiable. |
| TSN-01 | AVB-TSN | MUST | FAIL | `curl-avb-status.json`, `curl-avb-ptp-status.json`, `which-avb-binaries.txt` | gPTP lock cannot be achieved in current state (AVB disabled, no ptp4l binary). `R-04` |
| TSN-02 | AVB-TSN | MUST | FAIL | `curl-avb-status.json`, `hil-wrapper/summary.txt` | No steady-state offset measurement possible while AVB unavailable. `R-04` |
| TSN-03 | AVB-TSN | SHOULD | UNKNOWN | Missing artifact | No grandmaster-change test artifact. |
| TSN-04 | AVB-TSN | SHOULD | PASS | `curl-avb-status.json`, `curl-avb-ptp-status.json` | Lock/readiness state is observable through API. |
| SRP-01 | AVB-TSN | MUST | PARTIAL | `pytest-avb-contracts.txt`, `curl-avb-srp-status.json` | Software contracts pass; runtime daemon unavailable (`running=false`). `R-05` |
| SRP-02 | AVB-TSN | MUST | PASS | `pytest-avb-contracts.txt` | Admission/route contract suite includes reservation-gating paths. |
| SRP-03 | AVB-TSN | MUST | PASS | `pytest-avb-contracts.txt`, `curl-avb-srp-status.json` | Deterministic reason/state payloads present. |
| SRP-04 | AVB-TSN | SHOULD | UNKNOWN | Missing artifact | No measured bandwidth-exhaustion behavior on AVB hardware this run. |
| SRP-05 | AVB-TSN | SHOULD | PASS | `curl-avb-srp-status.json`, `openapi-avb-cluster-audio-endpoints.txt` | Reservation/daemon status endpoints exposed. |
| AVB-01 | AVB-TSN | MUST | FAIL | `curl-avb-status.json`, `hil-wrapper/summary.txt` | VLAN/PCP correctness cannot be validated while AVB disabled. `R-04` |
| AVB-02 | AVB-TSN | MUST | UNKNOWN | Missing artifact | No pcap and no 30-min active stream packetization evidence. |
| AVB-03 | AVB-TSN | MUST | PARTIAL | `routes-avb.txt`, `openapi-avb-cluster-audio-endpoints.txt` | Channel/format fields exist, but no external endpoint mapping validation. `R-06` |
| AVB-04 | AVB-TSN | MUST | PASS | `openapi-avb-cluster-audio-endpoints.txt`, `pytest-avb-contracts.txt` | Listener-role APIs and contracts available. |
| AVB-05 | AVB-TSN | SHOULD | PASS | `openapi-avb-cluster-audio-endpoints.txt`, `pytest-avb-contracts.txt` | Talker-role APIs and software contracts available. |
| AVB-06 | AVB-TSN | SHOULD | PARTIAL | `pytest-avb-contracts.txt`, `npm-test-avb-routing-summary.txt` | Mixed-route logic covered in software tests; no hardware mixed-network trial. `R-06` |
| AVB-07 | AVB-TSN | SHOULD | UNKNOWN | Missing artifact | No packet-loss/jitter capture from live AVB traffic. |
| CLU-01 | Cluster | MUST | FAIL | `curl-cluster-status.json`, `curl-cluster-nodes.json` | Current host has zero discovered/online nodes; no join-time proof. `R-07` |
| CLU-02 | Cluster | MUST | PARTIAL | `curl-ssh-keys.json`, `cluster-mdns-discovery-enhanced.txt` | Identity model exists, but no duplicate-ID conflict test artifact in this run. `R-07` |
| CLU-03 | Cluster | MUST | UNKNOWN | Missing artifact | No leave/retract convergence measurement. |
| CLU-04 | Cluster | SHOULD | PASS | `cluster-mdns-discovery-enhanced.txt` | Discovery mechanism explicit and observable (mDNS cache model). |
| CLU-05 | Cluster | SHOULD | UNKNOWN | Missing artifact | No K-node scale evidence in this run. |
| RTE-01 | Cluster | MUST | PARTIAL | `routes-cluster-flows.txt`, `curl-audio-routing.json` | Routing APIs exist; no end-to-end cluster route matrix proof on live multi-node deployment. `R-08` |
| RTE-02 | Cluster | MUST | UNKNOWN | Missing artifact | No measured route convergence timing. |
| RTE-03 | Cluster | MUST | UNKNOWN | Missing artifact | No live repatch artifact tolerance capture. |
| RTE-04 | Cluster | SHOULD | PARTIAL | `service-flow-orchestrator.txt` | Redundancy/standby model exists; resource-accounting behavior not hardware-validated. `R-08` |
| RTE-05 | Cluster | SHOULD | UNKNOWN | Missing artifact | No competing-controller conflict test evidence. |
| RTE-06 | Cluster | SHOULD | PASS | `openapi-avb-cluster-audio-endpoints.txt`, `curl-avb-router-stats.json` | Route/state observability APIs present. |
| BIO-01 | Interop | MUST | UNKNOWN | `rg-biamp-tesira.txt` | Missing Tesira talker->node subscription evidence. |
| BIO-02 | Interop | MUST | UNKNOWN | Missing artifact | Missing Tesira clock-stability/drift evidence. |
| BIO-03 | Interop | MUST | UNKNOWN | Missing artifact | Missing Tesira channel-map verification artifact. |
| BIO-04 | Interop | SHOULD | UNKNOWN | Missing artifact | Missing node->Tesira subscription test artifact. |
| BIO-05 | Interop | SHOULD | UNKNOWN | Missing artifact | Missing explicit Tesira runbook/settings matrix. |
| API-01 | Operability | MUST | PASS | `openapi-avb-cluster-audio-endpoints.txt`, `curl-avb-status.json`, `curl-cluster-status.json`, `curl-avb-router-stats.json` | API enumerates nodes/streams/routes/sync/reservation states. |
| API-02 | Operability | MUST | PARTIAL | `pytest-avb-contracts.txt`, `routes-cluster-flows.txt` | Software route/apply behavior covered, but not proven against hardware routing convergence SLAs. `R-08` |
| API-03 | Operability | SHOULD | PARTIAL | `routes-config-api.txt`, `curl-cluster-config-root-with-status.txt` | Export/import model exists; runtime distributor uninitialized (500). `R-10` |
| API-04 | Operability | COULD | PASS | `ss-listeners-core.txt`, `routes-ssh-trust.txt`, `cluster-integration-helpers.txt` | SSH ops path exists and API/SSH hybrid fallback implemented. |
| OPS-01 | Operability | MUST | UNKNOWN | Missing artifact | No fresh-install timed run in this cycle. |
| OPS-02 | Operability | SHOULD | UNKNOWN | Missing artifact | No upgrade-to-ready timed artifact in this cycle. |
| OPS-03 | Operability | SHOULD | PARTIAL | `docs/AVB_QUALIFICATION_MATRIX.md`, `pytest-avb-contracts.txt` | Rollback logic tested at route/SRP level; full host rollback drill not captured here. `R-11` |
| OPS-04 | Operability | MUST | PASS | `curl-api-health.json`, `curl-avb-status.json`, `curl-avb-srp-status.json`, `curl-avb-router-stats.json` | Readiness/health APIs expose required state dimensions and failure reasons. |
| OPS-05 | Operability | MUST | PARTIAL | `hil-wrapper/summary.txt`, `journal-map2-backend-avb-tail.txt`, `curl-api-health.json` | Diagnostic signals exist but not yet tied to complete HIL/interop incident cookbook. `R-12` |
| MNT-01 | Maintainability | SHOULD | PARTIAL | `cmake-check-avb.txt`, `pytest-avb-contracts.txt`, `npm-test-avb-routing-summary.txt` | Reproducible subset validated on this host; clean-checkout/full pipeline proof still missing. `R-13` |
| MNT-02 | Maintainability | SHOULD | PASS | `app-config-avb-section.txt`, `config/cluster.conf.template`, `routes-config-api.txt` | Configuration schema/options are explicit and versionable. |
| MNT-03 | Maintainability | SHOULD | PARTIAL | `pytest-avb-contracts.txt`, `hil-wrapper/summary.txt` | Strong software suites exist; no single automated smoke that includes live gPTP+SRP+routing on hardware. `R-14` |
| MNT-04 | Maintainability | MUST | PASS | `docs/RUNBOOK_EVALUATION.md`, `docs/fit-for-purpose-evidence/20260223/` | Evaluation rerun procedure is provided with command list and artifact paths. |

## 5) Risk Register (Non-Security)

| ID | Title | Severity | Likelihood | Impact | Trigger | Mitigation | Verification Test | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | Local latency claim not backed by measured loopback | 5 | 4 | Cannot certify live-play latency envelope | `measured_round_trip_ms < 0` or estimate-only output | Run physical loopback `jack_iodelay` measurements and store raw captures | `scripts/measure_latency.sh --jack --duration 60 --json` with real loopback cable | Audio Runtime |
| R-02 | No long-duration DSP/xrun stability proof | 4 | 4 | Live dropouts may occur despite green snapshots | Session > 1h under load | Execute 8h and 24h stress runs with xrun counters and logs | 8h xrun soak + artifact archive | Audio QA |
| R-03 | Runtime quantum drift from policy target | 4 | 3 | Unexpected latency/jitter and operator confusion | Service override sets 128/256 while policy says 64 | Align systemd overrides, PipeWire metadata, and runtime reports | `/api/audio/status` + `/api/audio/diagnostics/latency` show consistent 64/48k | Platform Ops |
| R-04 | AVB baseline not operational (disabled + missing gPTP stack) | 5 | 5 | AVB mission goals impossible in current state | `/api/avb/status.available=false` | Enable AVB config + install/activate `linuxptp` and SRP daemon + interface marker | HIL Q04/Q05 exit PASS; `/api/avb/status.available=true` | AVB Integrations |
| R-05 | SRP runtime daemon unavailable despite strict policy | 4 | 4 | Connection admission cannot be executed on real network | `/api/avb/srp/status.running=false` | Install/enable `mrpd` or `msrpd` and validate socket path | `/api/avb/srp/status` shows running daemon + admission round-trip | AVB Integrations |
| R-06 | AVB format/QoS behavior only software-validated | 4 | 3 | Interop and QoS behavior may fail on real switches/endpoints | First hardware interop trial | Capture VLAN/PCP/packetization and mixed endpoint behavior in pcaps | pcap validation against AC-12 profile and 30-min stream run | AVB QA |
| R-07 | Cluster readiness not proven in multi-node runtime | 4 | 4 | Nodes may not join/leave predictably in field | Adding 2nd+ node | Stand up >=2 nodes and capture join/leave timing and route retraction | scripted join/leave test meeting AC-20/21 | Cluster Team |
| R-08 | Routing convergence/artifact limits unproven | 4 | 3 | Repatch operations may click/pop or stall | Live route churn | Add timed route churn test with audio artifact monitor | route churn benchmark with convergence <= T and artifact tolerance pass | Routing Team |
| R-09 | Tesira interop gap (no direct evidence) | 5 | 3 | Target interop claim cannot be made | First Tesira integration attempt | Add Tesira runbook + test tone map + bidirectional stream validation | Tesira->Node and Node->Tesira acceptance scripts + captures | Interop Team |
| R-10 | Config distribution API not initialized on host | 3 | 4 | Export/import/remote config sync unavailable at runtime | `/api/cluster/config/*` returns 500 | Initialize/fix ConfigDistributor startup path | `/api/cluster/config/status` returns 200 + commit/hash | Cluster Ops |
| R-11 | Install/upgrade/rollback timing not evidenced | 3 | 3 | Operational recovery time unknown | Upgrade incident | Time-box install/upgrade/rollback drills and publish artifacts | documented runs meeting M-minute target | Release Eng |
| R-12 | Health surface currently degraded (service dependency errors) | 3 | 3 | Operators may miss true audio readiness state | `/api/health.status=degraded` | Resolve health dependency errors and align readiness gate conditions | `/api/health` healthy with no dependency_errors | Platform Ops |
| R-13 | Reproducibility validated on active host, not clean checkout | 2 | 3 | Hidden env dependencies may break new host setup | First clean-room rebuild | Add CI/clean-host rebuild proof for AVB subset | clean checkout build + tests in fresh environment | Build/CI |
| R-14 | No single integrated AVB hardware smoke gate | 3 | 4 | Regressions may pass fragmented suites | Runtime changes between releases | Add one command that checks DSP+gPTP+SRP+routing baseline | integrated smoke script PASS in pre-release | QA |

## 6) Decision Logic Output

Decision: **NO-GO** (for the declared AVB/TSN + cluster + Tesira mission)

Reason:
- MUST criteria failures exist now (`DSP-02`, `TSN-01`, `TSN-02`, `AVB-01`, `CLU-01`).
- Hardware-gated MUSTs for Tesira interop are still unknown (no evidence package).
- AVB readiness is disabled in active runtime and HIL gates are blocked.

Scope clarification:
- This is a NO-GO for the mission-defined networked AVB/TSN interoperability release target.
- It is not a statement that software-only API/GUI AVB control-plane implementation work is absent; software suites pass extensively.

## 7) Remediation Plan (Prioritized, Testable)

| Priority | Change | Rationale | Complexity | Acceptance Test | Regression Test |
| --- | --- | --- | --- | --- | --- |
| P1 | Establish AVB runtime baseline on testbed (enable AVB config + install `linuxptp` and SRP daemon + bring up `map2-avb` services) | Removes hard blocker on gPTP/SRP/stream criteria | M | `/api/avb/status.available=true`, `/api/avb/ptp/status.available=true`, `/api/avb/srp/status.running=true` | rerun AVB contract + HIL wrapper preflight |
| P2 | Fix latency config drift (remove conflicting 128-quantum override, enforce single runtime quantum) | Needed for deterministic local latency | S | `/api/audio/status.buffer_size==64` and diagnostics align | restart backend + verify no drift across reboot |
| P3 | Produce measured local RTL evidence with loopback cable | Closes critical AC-01 gap | S | >= 30 measured samples, p95 <= X ms | repeat after restart and under background load |
| P4 | Execute Q04/Q05 hardware gates with real AVB network | Required for AC-10/11/12 and cluster AVB claims | M | HIL summary rows Q04/Q05 = PASS | `scripts/apply_avb_hil_matrix_update.sh` updates matrix cleanly |
| P5 | Run 8h/24h soak with stream counters + xrun + drift artifacts | Closes AC-02 and endurance criteria | M | 0 unrecovered failures, within agreed thresholds | repeat soak after one config change |
| P6 | Run multi-node join/leave/routing convergence benchmark (>= K nodes) | Closes cluster determinism criteria | M | AC-20/21/22 timing bounds met | repeated churn run over 3 cycles |
| P7 | Execute Tesira interop test set (Tesira->Node and Node->Tesira) and publish mappings | Closes AC-30/31/32 target | M | signed evidence bundle: stream config, gPTP offset, SRP logs, channel map recordings | rerun after endpoint format change |
| P8 | Initialize/fix ConfigDistributor runtime and verify export/import/rollback APIs | Closes operability/config management partials | S | `/api/cluster/config/status` 200; push/sync/rollback successful | add API integration tests in CI |

## 8) Reproducibility Kit

### Artifacts produced in this evaluation
- Evidence folder: `docs/fit-for-purpose-evidence/20260223/`
- Artifact index: `docs/fit-for-purpose-evidence/20260223/ARTIFACT_INDEX.txt`
- HIL wrapper outputs: `docs/fit-for-purpose-evidence/20260223/hil-wrapper/`
- This report: `docs/FIT_FOR_PURPOSE_EVALUATION_PACK_2026-02-23.md`
- Rerun guide: `docs/RUNBOOK_EVALUATION.md`

### Single rerun command sequence (software + preflight)

```bash
set -euo pipefail
STAMP="$(date +%Y%m%d-%H%M%S)"
ROOT="docs/fit-for-purpose-evidence/${STAMP}"
mkdir -p "$ROOT"

uname -a > "$ROOT/uname.txt"
cat /etc/os-release > "$ROOT/os-release.txt"
ip -brief link > "$ROOT/ip-link-brief.txt"
lspci -k > "$ROOT/lspci-k.txt"
ethtool -i enp0s25 > "$ROOT/ethtool-enp0s25.txt"

pytest tests/test_avb_service_engine_contract.py tests/test_avb_router_map2.py tests/test_avb_routes_srp.py -q > "$ROOT/pytest-avb-contracts.txt"
pytest tests/test_audio_routing_chain_avb.py tests/test_avb_readiness_routes.py -q > "$ROOT/pytest-avb-routing-readiness.txt"
pytest tests/test_avb_discovery_service.py tests/test_cluster_flows_api.py -q > "$ROOT/pytest-avb-discovery-cluster-flows.txt"

npm run test:avb-routing -- --runInBand --silent > "$ROOT/npm-test-avb-routing-summary.txt" 2>&1
cmake --build juce-engine/build --target check-avb -j4 > "$ROOT/cmake-check-avb.txt" 2>&1

curl -sS --noproxy '*' http://localhost:8080/api/avb/status > "$ROOT/curl-avb-status.json"
curl -sS --noproxy '*' http://localhost:8080/api/avb/ptp/status > "$ROOT/curl-avb-ptp-status.json"
curl -sS --noproxy '*' http://localhost:8080/api/avb/srp/status > "$ROOT/curl-avb-srp-status.json"
curl -sS --noproxy '*' http://localhost:8080/api/cluster/status > "$ROOT/curl-cluster-status.json"
curl -sS --noproxy '*' http://localhost:8080/api/audio/diagnostics/latency > "$ROOT/curl-audio-diagnostics-latency.json"

bash scripts/run_avb_hil_qualification.sh --interface enp0s25 --capture-seconds 30 --output-dir "$ROOT/hil-wrapper" > "$ROOT/run-avb-hil-wrapper.txt" 2>&1 || true
```
