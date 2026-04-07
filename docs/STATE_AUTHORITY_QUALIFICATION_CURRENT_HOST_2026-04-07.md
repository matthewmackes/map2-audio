# State Authority Qualification Report

Date: 2026-04-07
Host artifact bundle: `/tmp/t778-state-authority-qualification-20260407-1952`
Overall result: `PASS`

This report captures the first current-host execution of the `T778` State Authority phase matrix after the runner was hardened for host-specific pytest exit leaks.

## Phase Results

| Phase | Result | Notes |
| --- | --- | --- |
| 1 | PASS | `3 passed, 13 deselected` in `4.57s`. The phase command emitted a passing pytest summary and then required timeout reaping at the `20s` bound. |
| 2 | PASS | `4 passed, 10 deselected` in `3.13s`. No timeout note. |
| 3 | PASS | `2 passed, 1 skipped` in `0.98s`. The skipped native-engine row was `tests/test_juce_engine_graph_document.py:149`: `Delay plugin did not expose named parameters for morph regression`. |
| 4 | PASS | `7 passed, 21 deselected` in `6.39s`. The phase command emitted a passing pytest summary and then required timeout reaping at the `20s` bound. |
| 5 | PASS | `10 passed, 15 deselected` in `4.77s`. The phase command emitted a passing pytest summary and then required timeout reaping at the `20s` bound. |
| 6 | PASS | `5 passed, 13 deselected` in `5.32s`. The phase command emitted a passing pytest summary and then required timeout reaping at the `20s` bound. |

## Host-Specific Findings

- The matrix is executable and green on this host once the runner disables external pytest plugin autoload for subprocesses and enforces bounded phase timeouts.
- Phases `1`, `4`, `5`, and `6` completed logically but left lingering pytest processes behind; the runner now records those as passing timeout-reap notes instead of stalling indefinitely.
- Phase `3` is not blocked by a missing JUCE engine build on this host. The only native-engine gap recorded in this run is the morph-regression skip caused by the delay plugin not exposing named parameters for that assertion.

## Evidence Files

- `/tmp/t778-state-authority-qualification-20260407-1952/t778-state-authority-qualification-summary.json`
- `/tmp/t778-state-authority-qualification-20260407-1952/T778_STATE_AUTHORITY_QUALIFICATION_SUMMARY.md`
- `/tmp/t778-state-authority-qualification-20260407-1952/phase1/stdout.txt`
- `/tmp/t778-state-authority-qualification-20260407-1952/phase2/stdout.txt`
- `/tmp/t778-state-authority-qualification-20260407-1952/phase3/stdout.txt`
- `/tmp/t778-state-authority-qualification-20260407-1952/phase4/stdout.txt`
- `/tmp/t778-state-authority-qualification-20260407-1952/phase5/stdout.txt`
- `/tmp/t778-state-authority-qualification-20260407-1952/phase6/stdout.txt`
