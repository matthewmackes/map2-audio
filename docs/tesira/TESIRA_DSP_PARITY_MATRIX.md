# Tesira DSP Full Replacement Parity Matrix

## Purpose
This matrix converts the full feature inventory into execution status for MAP2 parity closure.

Status values:
- `Done`: Implemented and validated in software tests.
- `Partial`: Implemented in part; important scope remains.
- `Blocked`: Cannot complete in this environment (typically HIL dependency).
- `Not Started`: No implementation yet.

## Evidence Inputs
- Feature inventory: `docs/tesira/TESIRA_DSP_FULL_PARITY_FEATURE_LIST.md`
- Program spec: `docs/tesira/PLATFORM_SPEC.md`
- Canonical execution status: `docs/PROJECT_WORKLIST.md` (`T065-*`, `T067`)
- Automation evidence: `docs/fit-for-purpose-evidence/20260308/t065/t065-automation-validation.{md,json}`

## Domain Matrix

| Domain | Target Parity Scope | Current Status | Evidence | Remaining Gap |
|---|---|---|---|---|
| Fleet and device lifecycle | Discovery, connect/reconnect, device metadata, health, transport visibility | Done | `T065-subA/B/E/F`; `app/routes/tesira.py`; `web/src/app/components/Tesira/components/TesiraFleetHealth.tsx` | None for software scope |
| Runtime DSP discovery and parameter control | Probe/list/get/set/bulk operations against runtime block model | Partial | `T065-subA/B/D`; `app/services/tesira/tesira_dsp_model.py`; `TesiraDspExplorer.tsx` | Discovery currently covers a limited block profile set; not full Tesira object universe |
| DSP editor UX | Routed DSP explorer + block panel + param editing workflow | Done | `T065-subC/D`; `web/src/app/components/Tesira/components/TesiraDspExplorer.tsx`; tests in `TesiraDspExplorer.test.tsx` | No graphical wire-edit canvas yet |
| Signal-chain canvas authoring | Full drag/drop DSP graph authoring with wiring and topology editing | Not Started | Inventory/spec target only (`T067`, `PLATFORM_SPEC`) | No MAP2-native Tesira canvas or graph compiler pipeline |
| Compiler/recompile pipeline | Compile active/all/uncompiled/recompile, optimization, compile diagnostics | Not Started | Inventory/spec target only (`T067`) | No MAP2-native Tesira-equivalent compiler implemented |
| Hardware allocation and delay equalization | DSP + I/O allocation, fixed assignment, delay equalization report | Not Started | Inventory/spec target only (`T067`) | No allocation/equalization engine in MAP2 Tesira path |
| Deploy/go-live lifecycle for new configurations | Build artifact deployment, sync-state tracking, partition-aware rollout | Partial | Existing runtime connect/control paths in `tesira_device.py`/`tesira_fleet.py` | No native config compile+deploy flow for newly authored Tesira designs |
| Block family coverage (processing library parity) | Full block families across I/O, mixers, EQ, dynamics, routing, logic, control | Partial | `_BLOCK_PROFILES` in `tesira_dsp_model.py` includes Level/Mixer/PEQ/LogicState/Router | Most Tesira block families not yet modeled/declarable/editable in MAP2 |
| Presets and interlock | Preset recall + MAP2 interlock + reverse sync + scene snapshots | Partial | `T065-subB/F`; `preset_interlock.py`; scene routes in `tesira.py` | Full preset authoring scope and all trigger workflows not complete |
| AVB and PTP operational visibility | Stream status indicators, PTP topology, cross-navigation to AVB routing | Done (software) / Blocked (HIL cert) | `T065-subE`; `TesiraPtpTopology.tsx`; `TesiraAvbTab.tsx`; `T065-subG` | HIL qualification for multi-device AVB/PTP remains blocked (`T030`, `T004`) |
| GPIO and external control | GPIO list/get/set, TTP control, bulk operations, automation hooks | Partial | `T065-subB/F`; GPIO routes and settings UI | Wider external-control surface (all command/control families) still incomplete |
| Metering/fault diagnostics | Real-time meters, meter history/peak, faults UI | Partial | `tesira_metrics.py`; faults/settings tabs; extended Tesira routes | Needs expanded diagnostics coverage and HIL performance qualification |
| Security and operations controls | Protocol state awareness, auditability, role-aware mutation control | Partial | Transport metadata and protocol visibility in API/UI | No complete RBAC/audit policy model specific to Tesira mutation surface |
| End-to-end parity proof | Automated + HIL evidence pack and go/no-go packet | Blocked | `T065-subG/H`; automation evidence present | Final parity closure blocked by HIL prerequisites (`T030`, `T004`) |

## Feature Family Coverage Matrix

| Feature Family | Current Coverage | Status |
|---|---|---|
| Project workspace and multi-partition authoring | No native Tesira design workspace | Not Started |
| DSP canvas block placement/wiring/grouping | No native Tesira wiring canvas | Not Started |
| Compile/recompile/optimize/report | No native Tesira compiler equivalent | Not Started |
| Build-time hardware allocation | Not implemented | Not Started |
| Delay equalization computation | Not implemented | Not Started |
| Deployment/go-live for authored configs | Runtime control only, not compile+deploy | Partial |
| Runtime parameter programming | Supported for discovered/declared blocks | Done |
| Presets + scene snapshots | Implemented subset | Partial |
| AVB/PTP runtime operations | Implemented in software; HIL pending | Partial |
| Full processing-library object parity | Limited block profiles implemented | Partial |

## Closure Requirements for "Every Feature Available"
To satisfy full replacement scope, MAP2 still needs all of the following delivered:
- Native Tesira-equivalent design canvas and project authoring workflow.
- Native compile/recompile/optimization/diagnostics pipeline.
- Native hardware-allocation and delay-equalization engine.
- Expanded block model to full processing-library coverage.
- Partition-aware compile/deploy lifecycle for newly authored configurations.
- HIL parity certification across AVB/PTP/live control and multi-device routing.

## Immediate Execution Backlog (Added to Worklist)
- `T069`: Implement MAP2-native Tesira DSP design canvas and graph model.
- `T070`: Implement MAP2-native compile/recompile/optimization and diagnostics pipeline.
- `T071`: Expand block family registry to full processing-library parity.
- `T072`: Complete Tesira parity HIL certification matrix and release sign-off unblock.
