# AVB Latency Optimizer

## Purpose

`scripts/avb_latency_optimizer.py` audits repository signals for AVB/TSN readiness and estimates one-way latency budget with deterministic report artifacts.

This tool is evidence-first and safety-first:
- Default mode is read-only (`--dry-run` implied unless `--apply`).
- Patch application requires both `--apply` and `--confirm-apply`.
- Missing host tools are marked as skipped, not treated as crashes.

## CLI

```bash
python3 scripts/avb_latency_optimizer.py \
  --path-to-platform /home/mm/map2-audio \
  --output-dir tmp/avb-audit-sample \
  --dry-run \
  --verify \
  --max-files 3000 \
  --verbose
```

Required arguments:
- `--path-to-platform`
- `--output-dir`

Supported controls:
- `--dry-run`
- `--apply`
- `--confirm-apply`
- `--verify`
- `--max-files`
- `--include-ext`
- `--exclude-dir`
- `--verbose`

## Output Artifacts

The output directory contains:
- `report.md` - human-readable executive and technical report
- `report.json` - deterministic machine-readable report
- `findings.csv` - flattened finding table
- `patches/*.diff` - proposed diff files (even in dry-run)

## Classification Model

Each major claim is tagged as:
- `observed`: direct evidence from scanned files/commands
- `inferred`: reasoned from partial repository evidence
- `unknown`: no useful evidence in scan scope
- `blocked-by-HIL`: requires hardware-in-the-loop execution

## AVB/TSN Theory Summary

The analysis focuses on deterministic-latency essentials:
- IEEE 802.1AS (gPTP): endpoint/bridge time alignment
- IEEE 802.1Qat/Qcc reservation model: admission and bandwidth reservation
- IEEE 802.1Qav (CBS/FQTSS): bounded queue delay for Class A/B streams

Latency budget framing used by the tool:
- talker buffering
- bridge hop + queuing delay
- listener buffering
- presentation offset
- processing margin

## Assumptions and Limits

- Repository scanning cannot guarantee host runtime state; host checks under `--verify` improve confidence.
- PDF/DOCX parsing is best-effort and optional based on parser availability.
- Hardware proofs (scope loopback, live AVB switch behavior, Tesira interop) remain `blocked-by-HIL` until executed in lab.

## MAP2 Integration Notes

- Canonical AVB task tracking remains in `docs/AVB_MASTER_WORK_PLAN.md`.
- Tool output is designed to feed qualification work (Q04/Q05/Q06) and deferred hardware tasks (`T007`, `T017`).
