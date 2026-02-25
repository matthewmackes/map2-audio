# RUNBOOK_EVALUATION

Date baseline: 2026-02-23
Scope: rerun fit-for-purpose evaluation for JUCE + AVB/TSN + cluster + API/SSH + Tesira target.

## Prerequisites

- Backend reachable at `http://localhost:8080`
- Node.js + npm available for web AVB tests
- Python test environment available (`pytest`)
- CMake build tree prepared at `juce-engine/build`
- For hardware AVB gates: AVB-capable NIC, switch, and external endpoints

## Output convention

Use a dated folder under `docs/fit-for-purpose-evidence/`.

```bash
STAMP="$(date +%Y%m%d-%H%M%S)"
ROOT="docs/fit-for-purpose-evidence/${STAMP}"
mkdir -p "$ROOT"
```

## Step 1 - Inventory capture

```bash
uname -a > "$ROOT/uname.txt"
cat /etc/os-release > "$ROOT/os-release.txt"
ip -brief link > "$ROOT/ip-link-brief.txt"
lspci -k > "$ROOT/lspci-k.txt"
ethtool -i enp0s25 > "$ROOT/ethtool-enp0s25.txt"
cat /proc/cmdline > "$ROOT/proc-cmdline.txt"
```

## Step 2 - Local DSP and runtime checks

```bash
python3 test_tier_a_locks.py > "$ROOT/test-tier-a-locks.txt"
bash scripts/measure_latency.sh --internal --duration 10 --json > "$ROOT/measure-latency-internal.json"

curl -sS --noproxy '*' http://localhost:8080/api/audio/status > "$ROOT/curl-audio-status.json"
curl -sS --noproxy '*' http://localhost:8080/api/audio/diagnostics/latency > "$ROOT/curl-audio-diagnostics-latency.json"
curl -sS --noproxy '*' http://localhost:8080/api/audio/health/xruns > "$ROOT/curl-audio-health-xruns.json"
```

Optional measured loopback (preferred for AC-01):

```bash
bash scripts/measure_latency.sh --jack --duration 60 --json > "$ROOT/measure-latency-jack.json"
```

## Step 3 - AVB/TSN control-plane state

```bash
curl -sS --noproxy '*' http://localhost:8080/api/avb/status > "$ROOT/curl-avb-status.json"
curl -sS --noproxy '*' http://localhost:8080/api/avb/ptp/status > "$ROOT/curl-avb-ptp-status.json"
curl -sS --noproxy '*' http://localhost:8080/api/avb/srp/status > "$ROOT/curl-avb-srp-status.json"
curl -sS --noproxy '*' http://localhost:8080/api/avb/router/stats > "$ROOT/curl-avb-router-stats.json"
```

## Step 4 - Cluster and operability state

```bash
curl -sS --noproxy '*' http://localhost:8080/api/cluster/status > "$ROOT/curl-cluster-status.json"
curl -sS --noproxy '*' http://localhost:8080/api/cluster/nodes > "$ROOT/curl-cluster-nodes.json"
curl -sS --noproxy '*' http://localhost:8080/api/health > "$ROOT/curl-api-health.json"
curl -sS --noproxy '*' http://localhost:8080/api/ssh/trust/status > "$ROOT/curl-ssh-trust-status.json"
```

## Step 5 - Software qualification suite

```bash
pytest tests/test_avb_service_engine_contract.py tests/test_avb_router_map2.py tests/test_avb_routes_srp.py -q > "$ROOT/pytest-avb-contracts.txt"
pytest tests/test_audio_routing_chain_avb.py tests/test_avb_readiness_routes.py -q > "$ROOT/pytest-avb-routing-readiness.txt"
pytest tests/test_avb_discovery_service.py tests/test_cluster_flows_api.py -q > "$ROOT/pytest-avb-discovery-cluster-flows.txt"

npm run test:avb-routing -- --runInBand --silent > "$ROOT/npm-test-avb-routing-summary.txt" 2>&1
cmake --build juce-engine/build --target check-avb -j4 > "$ROOT/cmake-check-avb.txt" 2>&1
```

## Step 6 - Hardware-gated preflight and HIL wrapper

```bash
bash scripts/run_avb_hil_qualification.sh --interface enp0s25 --capture-seconds 30 --output-dir "$ROOT/hil-wrapper" > "$ROOT/run-avb-hil-wrapper.txt" 2>&1 || true
```

Expected when AVB lab prerequisites are missing:
- `hil-wrapper/summary.txt` shows `Q04/Q05=BLOCKED`
- `hil-wrapper/matrix_update.md` contains update snippet

## Step 7 - Optional hardware completion gates

Run only in AVB-capable lab with active AVB status:

```bash
pytest -m avb tests/test_avb_integration.py -q > "$ROOT/q04_pytest-avb-integration.txt"
./scripts/avb_capture_clock_drift.sh enp0s25 600 "$ROOT/q05-capture"
./scripts/run_avb_24h_soak.sh --duration-hours 24 --checkpoint-minutes 60 --output-dir "$ROOT/q06-soak"
```

## Step 8 - Tesira interoperability execution

Required artifacts to declare interop PASS:
- Tesira talker config snapshot
- MAP2 subscription request/result
- gPTP offset capture during active stream
- SRP reservation log with stream IDs
- Channel map recording/checklist (tone mapping)

Store as:
- `$ROOT/tesira/talker-config.*`
- `$ROOT/tesira/map2-subscribe.*`
- `$ROOT/tesira/ptp-offset.*`
- `$ROOT/tesira/srp-log.*`
- `$ROOT/tesira/channel-map.*`

## Step 9 - Update evaluation report

After rerun, update:
- `docs/FIT_FOR_PURPOSE_EVALUATION_PACK_YYYY-MM-DD.md`
- Requirements matrix statuses + evidence pointers
- risk register and final GO/NO-GO decision

