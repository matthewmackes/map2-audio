# AVB Milestone Evidence Template

Use this template at each milestone checkpoint so results are comparable across runs and contributors.

## Header

- Milestone ID:
- Date (UTC):
- Owner:
- Branch / Commit:
- Environment:
  - Hostname:
  - AVB interface:
  - AVB enabled:
  - AVDECC enabled:

## Commands Executed

| Command | Start (UTC) | Duration | Result |
| --- | --- | --- | --- |
| `pytest ...` | | | |
| `npm --prefix web run ...` | | | |
| `ctest ...` / `cmake --build ...` | | | |

## Pass/Fail Summary

- Total checks run:
- Passed:
- Failed:
- Skipped:
- Overall status: `PASS` / `FAIL`

## Failing Items (If Any)

| Test / Check | Error Summary | Suspected Owner | Next Action |
| --- | --- | --- | --- |
| | | | |

## Artifacts

- Logs:
- Reports:
- PCAP / timing captures:
- Screenshots:

## AVB-Specific Observations

- Stream lifecycle behavior:
- PTP sync behavior:
- AVDECC discovery/connection behavior:
- Host-labeled source/destination correctness:

## Risks / Follow-ups

- New tech debt added to `docs/PROJECT_WORKLIST.md`:
- Blockers:
- Recommended next tasks:
