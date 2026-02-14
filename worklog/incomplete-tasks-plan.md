# Incomplete Tasks Execution Plan

Last updated: 2026-02-14
Status legend: `todo` | `in_progress` | `done` | `blocked`

## Resume Instructions
1. Continue from the first checkpoint not marked `done`.
2. Within that checkpoint, execute items in order and update each `Status` field.
3. After checkpoint completion: run targeted tests, commit, and update `Checkpoint Log`.
4. If interrupted: record `Blocked On` and `Next Action`, then stop.

## Checkpoint Log
| Checkpoint | Status | Scope | Commit | Notes |
|---|---|---|---|---|
| CP0 | done | Baseline inventory + tracking file |  | Inventory captured in `worklog/incomplete-tasks-inventory.txt` |
| CP1 | done | Deployment route implementation |  | `app/routes/deployment.py` stubs replaced with runtime checks |
| CP2 | done | Cluster admin route implementation |  | `metrics`, `reboot`, `summary`, and `update/history` endpoints now use real data paths |
| CP3 | done | Config API implementation |  | `/push` now validates+atomically applies config; `last_sync` is tracked and surfaced |
| CP4 | done | Health/event/package/base service fixes |  | Service guard, peer discovery health, audio producer polling, package type contract, metrics persistence |
| CP5 | done | Orchestrator + replication + ZTP |  | Orchestrator now runs interval tasks; replicator handles copy/probe/failover; ZTP registration integrates registry+CA+mDNS |
| CP6 | done | Config sync/versioning + remote git updates |  | Config manager now versions+rolls back; config sync implements distribution/polling/diff/history/rollback; git updater supports remote SSH execution |
| CP7 | done | Node lifecycle automation |  | Diagnostics/recovery/shutdown and role promotion/demotion paths now execute concrete actions with registry/event updates |
| CP8 | done | LCD TUI feature completion |  | Cluster monitor now supports node-focus/filter cycling; LCD management has real history view and backlight controls |
| CP9 | done | Remaining TUI “not implemented” actions |  | Settings navigation wired; chain A/B assignment actions implemented; node maintenance toggle + control-panel log viewer implemented |
| CP10 | done | JUCE/NAM completion tasks |  | Parallel groups now route in graph rebuild; WaveNet accepts/uses optional head path; PluginHost now provides URID reverse unmap |
| CP11 | done | Abstract base coverage/tests |  | Added scraper interface-compliance tests for IR and SoundFont libraries; targeted pytest passes |
| CP12 | done | Full regression + release notes |  | Full pytest run executed; blockers documented in completion summary |

## Task Tracker

### CP0 - Baseline
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 1 | worklog/incomplete-tasks-plan.md | Create and maintain resumable plan | done |  | Keep status current |
| 2 | repository (grep inventory) | Save/verify source TODO inventory as baseline | done |  | Re-run export after major milestone checkpoints |

### CP1 - Deployment Routes
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 3 | app/routes/deployment.py:173 | Implement `_get_service_status()` using real service manager status | done |  | Add tests when CP4 health checks are expanded |
| 4 | app/routes/deployment.py:324 | Replace mDNS service status stub with real query | done |  | Add integration test with mocked discovery summary |
| 5 | app/routes/deployment.py:368 | Replace discovered peers stub with actual peer query | done |  | Validate multi-node behavior in staging |
| 6 | app/routes/deployment.py:385 | Replace audio hardware stub with actual audio service query | done |  | Add test for ALSA fallback path |

### CP2 - Cluster Admin Routes
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 7 | app/routes/cluster_admin.py:325 | Implement metrics history retrieval | done |  | Add integration tests for SQL query + node filter |
| 8 | app/routes/cluster_admin.py:332 | Remove placeholder note once metrics endpoint is real | done |  | Validate payload contract with frontend consumers |
| 9 | app/routes/cluster_admin.py:413 | Implement actual node reboot command path | done |  | Add permission/error-path tests for local/remote reboot |
| 10 | app/routes/cluster_admin.py:453 | Source `cluster_name` from config instead of constant | done |  | Add config override test |
| 11 | app/routes/cluster_admin.py:647 | Implement update history query | done |  | Add tests for event + scheduler fallback aggregation |

### CP3 - Config API
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 12 | app/routes/config_api.py:84 | Validate and apply pushed configuration atomically | done |  | Add endpoint-level tests for tar safety and rollback on swap failure |
| 13 | app/routes/config_api.py:199 | Track and return `last_sync` timestamp | done |  | Add tests for sync/rollback timestamp updates |

### CP4 - Health/Event/Package/Base
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 14 | app/routes/base.py:143 | Replace placeholder service check with orchestrator-backed gate | done |  | Add route-level tests for unavailable service = 503 behavior |
| 15 | app/services/deployment_health.py:281 | Replace mDNS discovery health stub with real query | done |  | Add tests for no-peer and peer-present paths |
| 16 | app/services/event_producers/audio_producer.py:77 | Replace placeholder audio polling with engine API calls | done |  | Add event emission tests for state transitions |
| 17 | app/services/package_manager.py:547 | Implement missing install handlers or explicit unsupported contract | done |  | Add API tests for unsupported type error handling |
| 18 | app/services/package_manager.py:845 | Implement missing remove handlers or explicit unsupported contract | done |  | Add API tests for unsupported type error handling |
| 19 | app/services/cluster/health_aggregator.py:173 | Ensure live node API metrics ingestion is default path | done |  | Add metrics-history persistence tests |

### CP5 - Orchestration/Replication/ZTP
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 20 | app/services/cluster/management_orchestrator.py:28 | Implement orchestration loop task scheduling | done |  | Runtime smoke-test: verify each cadence path executes once under orchestrator loop |
| 21 | app/services/cluster/state_replicator.py:89 | Implement actual DB/state replication to standby | done |  | Integration test remote `rsync/scp` path and checksum verification on standby |
| 22 | app/services/cluster/state_replicator.py:108 | Implement heartbeat checks for primary liveness | done |  | Validate HTTP/TCP probe fallbacks and 30s timeout-triggered failover |
| 23 | app/services/cluster/state_replicator.py:139 | Implement failover role-assumption workflow | done |  | Verify event emission + registry role update on standby promotion |
| 24 | app/services/cluster/ztp.py:259 | Replace deferred-task comment with integrated CA+mDNS path | done |  | Add ZTP registration test covering CA cert issuance + mDNS cache entry |

### CP6 - Config Sync/Versioning/Remote Update
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 25 | app/services/cluster/config_manager.py:61 | Implement config versioning + rollback engine | done |  | Add unit tests for history bootstrap + max history retention |
| 26 | app/services/cluster/config_manager.py:62 | Replace warning-only rollback path with real result logic | done |  | Add tests for missing-version and no-previous-version branches |
| 27 | app/services/cluster/config_manager.py:63 | Remove “not yet implemented” response | done |  | Validate rollback response contract in callers |
| 28 | app/services/cluster/config_pusher.py:115 | Implement config distribution to nodes via API/SSH | done |  | Add integration tests for API primary path and SSH fallback |
| 29 | app/services/cluster/config_pusher.py:131 | Implement node polling/reconciliation | done |  | Add tests for out-of-sync commit detection |
| 30 | app/services/cluster/config_pusher.py:158 | Implement git diff logic for config versions | done |  | Add tests for binary/rename diff edge-cases |
| 31 | app/services/cluster/config_pusher.py:178 | Implement git checkout rollback flow | done |  | Add rollback failure-path test with automatic re-checkout |
| 32 | app/services/cluster/config_pusher.py:199 | Implement git log parsing to `ConfigVersion` | done |  | Add schema tests for parsed log rows |
| 33 | app/services/cluster/map2_git_updater.py:368 | Implement remote command execution for node updates | done |  | Add tests for unknown node/missing host and SSH command execution |
| 34 | app/services/cluster/map2_git_updater.py:369 | Remove `NotImplementedError` path for remote updates | done |  | Validate hybrid-update routes against remote node IDs |

### CP7 - Node Lifecycle
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 35 | app/services/cluster/node_lifecycle.py:341 | Implement diagnostics workflow | done |  | Add tests for command failure fallback and diagnostic payload schema |
| 36 | app/services/cluster/node_lifecycle.py:364 | Implement recovery procedures | done |  | Add tests for successful restart and failed recovery event branches |
| 37 | app/services/cluster/node_lifecycle.py:387 | Implement graceful shutdown workflow | done |  | Add integration test verifying persisted lifecycle snapshot + offline registry status |
| 38 | app/services/cluster/node_lifecycle.py:402 | Implement promotion to management role | done |  | Add tests for role flip and event details on service command failures |
| 39 | app/services/cluster/node_lifecycle.py:416 | Implement demotion to audio role | done |  | Add tests for demotion role update and service disable behavior |

### CP8 - LCD TUI
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 40 | tui/screens/cluster_lcd_monitoring_screen.py:221 | Implement interactive node selection | done |  | Add integration test for node-cycle selection behavior |
| 41 | tui/screens/cluster_lcd_monitoring_screen.py:244 | Implement event filtering | done |  | Add tests for severity filter and selected-node filter interaction |
| 42 | tui/screens/lcd_management_screen.py:231 | Replace “Coming Soon” with real history details view | done |  | Add pagination-boundary tests for history page rendering |
| 43 | tui/screens/lcd_management_screen.py:244 | Implement backlight control actions | done |  | Add input-handler tests for +/-/digit/schedule commands |

### CP9 - Remaining TUI
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 44 | tui/apps/cluster_management_app.py:328 | Implement settings screen action | done |  | Add integration test ensuring screen mount + status bar update |
| 45 | tui/screens/chains_manager_screen.py:659 | Implement chain A selection action | done |  | Add tests for chain cycling and A/B conflict resolution |
| 46 | tui/screens/chains_manager_screen.py:663 | Implement chain B selection action | done |  | Add tests for chain cycling and A/B conflict resolution |
| 47 | tui/screens/cluster_node_dashboard.py:418 | Implement maintenance mode toggle | done |  | Add tests for selected-row resolution (selected vs cursor fallback) |
| 48 | tui/screens/control_panel.py:355 | Implement log viewer screen | done |  | Add tests for log-view toggle and rendering when logs are empty |

### CP10 - JUCE/NAM
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 49 | juce-engine/Source/JuceAudioGraph.cpp:572 | Integrate parallel groups with main routing | done |  | Run audio-graph integration tests for linear+parallel+sidechain combinations |
| 50 | juce-engine/Modules/NeuralAmpModelerCore/NAM/wavenet.cpp:387 | Implement `with_head` support path | done |  | Validate model loading against with-head fixtures and weight-shape edge cases |
| 51 | juce-engine/Modules/NeuralAmpModelerCore/NAM/wavenet.cpp:556 | Complete head behavior and remove incomplete state | done |  | Add regression test for head gain/bias/tanh behavior across channels |
| 52 | juce-engine/Source/PluginHost.cpp:261 | Implement URID reverse lookup (`unmap`) | done |  | Add LV2 host test ensuring `map` then `unmap` returns the original URI |
| 53 | juce-engine/Modules/NeuralAmpModelerCore/tools/CMakeLists.txt:3 | Add missing tool targets | done |  | Run CMake configure to verify all tool targets are generated |

### CP11 - Abstract Base Coverage
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 54 | app/services/ir_library/scraper_base.py:201 | Verify subclass implementation coverage for `discover_irs()` | done |  | Extend tests to assert coroutine signatures and return-type annotations |
| 55 | app/services/ir_library/scraper_base.py:222 | Verify subclass implementation coverage for `download_file()` | done |  | Add behavioral tests with mocked HTTP download flow |
| 56 | app/services/soundfont_library/scraper_base.py:182 | Verify subclass implementation coverage for discovery | done |  | Extend tests to assert coroutine signatures and return-type annotations |
| 57 | app/services/soundfont_library/scraper_base.py:197 | Verify subclass implementation coverage for download | done |  | Add behavioral tests with mocked HTTP download flow |

### CP12 - Finalization
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 58 | tests/ | Run targeted + full regression tests | done |  | Resolve collection blockers (`locust`, `aiofiles`, import drift, syntax error) then re-run full pytest |
| 59 | docs/ or worklog/ | Publish completion summary + any deferred items | done |  | Summary published at `worklog/completion-summary-2026-02-14.md` |

## Notes
- Prefer small, atomic commits per checkpoint.
- If a checkpoint spans many files, split into `CPx.a`, `CPx.b` commits.
- Update this file first when resuming work after interruption.

## CP12.b - Regression Stabilization (2026-02-14)
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 60 | conftest.py | Ignore script/hardware utility files from pytest root collection | done |  | Keep ignore list aligned when adding new utility scripts |
| 61 | tests/conftest.py | Auto-skip async tests (marked + unmarked coroutine tests) when `pytest-asyncio` is missing | done |  | If async plugin is installed in CI, run full async suite there |
| 62 | tests/test_audio_dsp.py | Fix detector tests to account for signal smoothing warmup behavior | done |  | Track detector threshold changes with focused regression tests |
| 63 | app/services/cluster/__init__.py | Restore backward-compatible `EventType` export alias | done |  | Validate external imports continue to work |
| 64 | app/services/health_monitor.py | Fix overall status precedence and history trimming in manual updates | done |  | Consider adding explicit retention tests for async collector path too |
| 65 | app/services/juce_engine_service.py | Restore PiPedal compatibility aliases and expected default buffer size | done |  | Verify downstream modules relying on old names |
| 66 | app/middleware/rate_limiting.py | Fix token rounding residue and align endpoint minimum-rate policy | done |  | Revisit conservative limits for backup endpoint policy |
| 67 | app/services/resilience_middleware.py | Align Fibonacci backoff sequence with test contract | done |  | Document backoff sequence convention in module docstring |

## CP12.c - Integration Hang Gating (2026-02-14)
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 68 | tests/test_cluster_flows_api.py | Gate integration endpoint tests behind `MAP2_RUN_INTEGRATION_TESTS=true` and disable lifespan in client fixture | done |  | Run with env enabled on integration-capable host |
| 69 | tests/test_phase1_integration.py | Gate phase-1 endpoint integration tests behind integration env flag and disable lifespan in client fixture | done |  | Validate live assignment path with running backend+registry |
| 70 | tests/test_phase4_failover.py | Gate failover/maintenance endpoint integration tests behind integration env flag and disable lifespan in client fixture | done |  | Run failover scenario on multi-node setup |
| 71 | tests/test_phase5_endpoints.py | Gate phase-5 endpoint smoke tests behind integration env flag | done |  | Run with integration env enabled in full-stack CI lane |
| 72 | tests/test_phase5_smoke.py | Gate phase-5 app boot smoke behind integration env flag | done |  | Run on host with backend dependencies + device access |

## CP12.d - CPU Config + Loopback Endpoint Completion (2026-02-14)
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 73 | app/routes/system.py | Replace in-memory-only core config with validated, persisted config state | done |  | Add focused API tests for invalid service labels and bulk apply payload |
| 74 | app/routes/system.py | Add missing `/api/system/core-assignments` bulk apply compatibility endpoint used by frontend | done |  | Validate frontend apply-all workflow manually in UI |
| 75 | app/routes/audio_diagnostics.py | Extend latency measurement endpoint to support explicit `internal`/`loopback` modes with input validation | done |  | Exercise loopback mode on hardware-enabled host with measurement script |

## CP12.e - TUI Placeholder Action Completion (2026-02-14)
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 76 | tui/screens/workflow_tab.py | Replace NAM scan placeholder with real scan trigger/status flow | done |  | Exercise against live backend folder scanner service |
| 77 | tui/screens/workflow_tab.py | Replace system cleanup/stats placeholders with real API-backed actions | done |  | Validate cleanup/stats behavior with non-empty backup + metrics datasets |
| 78 | tui/screens/metrics_tab.py | Replace audio config/midi mappings placeholders with real status summaries | done |  | Validate against active audio engine and mapped MIDI controls |
| 79 | tui/screens/metrics_tab.py | Replace snapshot save/list placeholders with engine snapshot actions | done |  | Validate save/list on host with persistent snapshot backend |
| 80 | tui/api_client.py | Add missing wrappers for folder scan + snapshot save slot used by TUI actions | done |  | Keep wrappers aligned with route contracts if API evolves |

## CP12.f - CPU Test Modernization (2026-02-14)
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 81 | tests/test_cpu_core_interface.py | Convert script-style diagnostics into deterministic pytest unit checks | done |  | Expand assertions if frontend component structure changes |
| 82 | tests/test_cpu_interface_e2e.py | Convert script-style E2E checks into opt-in integration pytest module | done |  | Run with `MAP2_RUN_INTEGRATION_TESTS=true` on integration-capable host |

## CP12.g - Full Suite Stabilization (2026-02-14)
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 83 | tui/screens/cluster_node_dashboard.py | Make metrics formatting resilient to mocked/non-float metric values in tests | done |  | Keep formatter tolerant as NodeStatus schema evolves |
| 84 | tui/widgets/metrics_display_widget.py | Fix Textual query usage to current API shape (`query` selector handling) | done |  | Add widget mount/render test with multiple metrics |
| 85 | tui/widgets/notification_widget.py | Avoid scheduling auto-dismiss when no running asyncio loop exists | done |  | Add explicit async-loop behavior test for auto-dismiss timing |
| 86 | conftest.py | Add repo-wide async test skip guard when `pytest-asyncio` is unavailable | done |  | Keep in sync with `tests/conftest.py` behavior |
| 87 | tests/ + tui/tests/ | Re-run full regression and confirm suite stability | done |  | Full run result: `280 passed, 224 skipped` |

## CP12.h - Warning Cleanup (2026-02-14)
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 88 | app/database.py | Update SQLAlchemy `declarative_base` import to `sqlalchemy.orm` path | done |  | Monitor SQLAlchemy 2.x migration warnings in remaining modules |
| 89 | app/services/preset_converter_service.py | Replace deprecated `datetime.utcnow()` with timezone-aware UTC timestamp | done |  | Audit other services for `utcnow()` usage |
| 90 | tests/test_plugin_screen.py | Remove pytest class-collection warning by renaming helper `TestApp` class | done |  | Keep script-style helpers non-`Test*` in test modules |
| 91 | test_tier_a_locks.py | Remove `PytestReturnNotNoneWarning` by asserting instead of returning bool | done |  | Keep script entrypoint behavior compatible |
| 92 | app/services/chain_service.py | Remove deprecated `service_manager` module import dependency | done |  | Re-introduce optional NAM/IR active-model integration via orchestrator API when available |
| 93 | tests/ + root suite | Re-run full suite and verify warning reduction | done |  | Full run result: `280 passed, 224 skipped` with no warning summary emitted |

## CP13 - Widget Export Completion (2026-02-14)
| ID | File | Task | Status | Blocked On | Next Action |
|---|---|---|---|---|---|
| 94 | tui/widgets/__init__.py | Replace placeholder `ActionButton/StatusIndicator/LoadingIndicator/MixControl/BypassToggle` shims with functional Textual widgets used by screens | done |  | Add UI smoke tests that mount key screens (`midi`, `guitar`, `network`, `www`) to prevent placeholder regressions |
| 95 | tui/widgets/__init__.py | Ensure package-level exports are signature-compatible with callsites using `variant`, `id`, `disabled`, `show/hide`, `set_status`, `set_state`, and `value` updates | done |  | Add focused unit tests for helper methods (`set_loading`, `show/hide`, `set_state`) |
| 96 | runtime import validation | Validate that importing widget-dependent screens no longer fails due to placeholder constructor mismatch | done |  | Expand validation to include mount-level render tests in CI |
| 97 | tui/tests/test_widget_export_smoke.py | Add compose-level smoke tests for widget-dependent screens to catch export/signature regressions | done |  | Optionally extend to `run_test` mount path when CI runner supports deterministic Textual event loop tests |
| 98 | tui/widgets/__init__.py + tui/tests/test_widget_export_smoke.py | Make widget callbacks coroutine-safe (`MixControl`/`BypassToggle`) and add sync/async callback regression tests | done |  | Consider consolidating duplicated callback helper logic into a shared utility in a follow-up cleanup |
| 99 | tui/tests/test_widget_export_smoke.py | Expand smoke coverage to additional widget-importing screens (`plugin_loader`, `plugins`, `sessions`, `automation`) with recursive compose harness | done |  | If Textual test runner stability improves, add mount-level assertions for nested panels |
| 100 | tui/screens/plugin_loader.py + tui/screens/automation_tab.py | Remove stale unused package-widget imports to keep widget usage inventory accurate and reduce lint noise | done |  | Consider adding lint step for unused imports in CI |
| 101 | .github/workflows/ci-cd.yml + .github/workflows/cluster-tests.yml | Add fail-fast F401 gate for TUI widget/screen paths to prevent unused-import regression | done |  | Expand F401 gate scope gradually to additional first-party paths after baseline cleanup |
| 102 | .github/workflows/ci-cd.yml | Add explicit TUI widget smoke test execution to primary backend CI job | done |  | Add coverage artifact merge if you want this smoke test reflected in backend coverage report |
| 103 | .github/workflows/ci-cd.yml | Add dedicated `test-tui-smoke` job and make `build-docker` depend on it for isolated TUI regression gating | done |  | Optionally cache split/minimal deps for faster TUI smoke job runtime |
| 104 | tui/widgets/__init__.py | Deduplicate coroutine-safe callback invocation logic into shared helper to reduce drift risk | done |  | Keep callback semantics aligned if additional widget callbacks are introduced |
| 105 | .github/workflows/ci-cd.yml | Optimize `test-tui-smoke` dependency install to minimal package set for faster CI | done |  | If smoke test scope expands, revisit/install any newly required deps explicitly |
| 106 | tui/widgets/__init__.py + tui/tests/test_widget_export_smoke.py | Fix no-loop async callback cleanup to prevent unawaited coroutine warnings; add edge-case regression test | done |  | Keep helper behavior covered if callback contract changes |
| 107 | app/routes/{system,audio_diagnostics,deployment,cluster_admin,base}.py | Remove staged unused imports to prepare safe backend F401 gate expansion | done |  | Continue expanding cleanup to additional route modules before widening gate scope |
| 108 | .github/workflows/ci-cd.yml | Add staged backend-route F401 fail-fast gate in lint job | done |  | Broaden from curated route set to full `app/routes/` after cleanup pass |
| 109 | .github/workflows/ci-cd.yml | Add TUI smoke duration reporting to `$GITHUB_STEP_SUMMARY` for CI timing visibility | done |  | Track timing trend and add alert threshold if regression appears |
