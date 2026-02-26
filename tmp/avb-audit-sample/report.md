# AVB Latency Optimizer Report

Generated at (UTC): 2026-02-26T14:09:20Z
Root path: /home/mm/map2-audio

## Executive Summary
- F001 [high] Estimated one-way latency exceeds aggressive live-performance budget (inferred)

## AVB/TSN Compliance Matrix
| Capability | State | Classification | Evidence Count |
|---|---|---|---:|
| IEEE 802.1AS (gPTP sync) | present | observed | 6 |
| IEEE 802.1Qat/Qcc (reservation) | present | observed | 6 |
| IEEE 802.1Qav (CBS/FQTSS) | present | observed | 6 |
| VLAN PCP/QoS isolation | present | observed | 6 |
| NIC hardware timestamping | present | observed | 6 |
| RT scheduling (SCHED_FIFO/PREEMPT_RT) | present | observed | 6 |

## Latency Budget (One-Way)
| Component | Current ms |
|---|---:|
| listener_buffer_ms | 2.6667 |
| network_hops_ms | 0.7500 |
| presentation_offset_ms | 0.5000 |
| processing_ms | 0.2000 |
| talker_buffer_ms | 2.6667 |
| **worst_case_ms** | **6.7834** |
| **optimized_target_ms** | **3.7167** |
| **confidence** | **0.95** |

## Findings
### F001 - Estimated one-way latency exceeds aggressive live-performance budget
- Severity: high
- Component: end-to-end
- Classification: inferred
- Impact: Round-trip targets for live monitoring may be missed under current assumptions.
- Recommendation: Prioritize buffer reduction, hop minimization, and CBS+gPTP hardening to approach target.
- Effort: Medium
- Risk: Medium
- Confidence: 0.95
- Evidence:
  - report-model:1 :: Estimated one-way latency=6.783 ms

## Patch Plan
- P001: Add operator-reviewed AVB latency baseline config -> config/avb-latency-optimizer.conf
  - Reason: Centralize recommended latency-safe defaults before host-specific rollout.

## Verification
Verification not requested.

## Assumptions
- None

## Notes
- Numeric values use conservative minimum extraction from scanned text and should be validated on live runtime.
- Absence of keywords is not definitive absence on host; classify as inferred unless direct measurements exist.
