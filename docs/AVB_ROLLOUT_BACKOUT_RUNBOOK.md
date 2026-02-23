# AVB Rollout and Backout Runbook

Last updated: 2026-02-21 22:07 - Codex
Scope: Controlled AVB rollout and reversible backout with explicit no-orphan checks.

## Preconditions

- MAP2 backend reachable at `http://localhost:8080` (or set `BASE_URL`).
- AVB installer/setup scripts available:
  - `install_on_new_host.sh`
  - `scripts/setup_avb.sh`
  - `scripts/uninstall_avb.sh`
- `jq` available for JSON checks (recommended).

## Profile Rollout Sequence

Use these profile checkpoints in order:

1. `default` profile:
   - `avb.enabled=true`
   - `avb.srp.required=false`
   - `avb.avdecc_enabled=false`
2. `strict_srp` profile:
   - `avb.srp.enabled=true`
   - `avb.srp.required=true`
3. `strict_srp_avdecc` profile (if required):
   - strict SRP plus `avb.avdecc_enabled=true`

Check active profile at every step:

```bash
BASE_URL="${BASE_URL:-http://localhost:8080}"
curl -s "$BASE_URL/api/avb/config/compatibility" | jq '.active_profile'
```

## Rollout Procedure

### 1. Baseline Capture

```bash
BASE_URL="${BASE_URL:-http://localhost:8080}"
SINCE="$(date -u +%Y-%m-%dT%H:%M:%S)"

curl -s "$BASE_URL/api/avb/status" | jq
curl -s "$BASE_URL/api/avb/srp/status" | jq
curl -s "$BASE_URL/api/avb/router/connections" | jq '.count'
curl -s "$BASE_URL/api/avb/streams" | jq '.streams | length'
```

### 2. Enable AVB and Restart Backend

Use installer default (fresh host) or direct setup:

```bash
sudo bash install_on_new_host.sh
# or:
sudo bash scripts/setup_avb.sh --yes
sudo systemctl restart map2-backend
```

### 3. Promote to Strict SRP (if not already)

Set:
- `avb.srp.enabled=true`
- `avb.srp.required=true`

Then verify:

```bash
curl -s "$BASE_URL/api/avb/config/compatibility" | jq '.active_profile'
curl -s "$BASE_URL/api/avb/srp/status" | jq
```

### 4. Optional AVDECC Enablement

Set `avb.avdecc_enabled=true` only when mixed-vendor interop is required.

```bash
curl -s "$BASE_URL/api/avb/config/compatibility" | jq '.active_profile'
curl -s "$BASE_URL/api/avb/avdecc/entities" | jq '.count'
```

## Backout Procedure

Choose one backout depth based on incident severity.

### A. Soft Backout (Runtime Flag Disable)

1. Disable AVB runtime config:
   - Set `avb.enabled=false`
2. Restart backend:

```bash
sudo systemctl restart map2-backend
```

3. Validate AVB disabled:

```bash
curl -s "$BASE_URL/api/avb/status" | jq '{enabled, available, reason}'
```

### B. Full Service Backout (Uninstall AVB Services)

```bash
sudo bash install_on_new_host.sh --uninstall-avb
# or:
sudo bash scripts/uninstall_avb.sh --yes
sudo systemctl restart map2-backend
```

### C. Build-Time Backout (No AVB in Binary)

```bash
cd juce-engine
cmake -B build -DUSE_AVB=OFF
cmake --build build --config Release -j"$(nproc)"
cd ..
sudo systemctl restart map2-backend
```

## No-Orphan Validation Checklist

Run after any backout action:

```bash
BASE_URL="${BASE_URL:-http://localhost:8080}"
# If not already set from rollout step:
SINCE="${SINCE:-$(date -u +%Y-%m-%dT%H:%M:%S)}"

# 1) No active router connections
curl -s "$BASE_URL/api/avb/router/connections" | jq '.count'

# 2) No active AVB streams
curl -s "$BASE_URL/api/avb/streams" | jq '.streams | length'

# 3) No unreleased allowed SRP admissions since rollout/backout start
curl -s "$BASE_URL/api/avb/srp/admissions?decision=allowed&since=$SINCE&limit=200" \
  | jq '[.admissions[] | select((.reservation_id // "") != "" and (.released | not))] | length'
```

Pass criteria:

- Router connections count = `0`
- Stream count = `0`
- Unreleased allowed SRP admissions count = `0`

## Software Validation Evidence

Rollback safeguards currently validated in automated tests:

```bash
pytest tests/test_avb_routes_srp.py -k "rollback or release_warning or exception_releases" -q
```

Installer AVB branch behavior validated in dry-run:

```bash
pytest tests/test_avb_ops_scripts.py -q
```
