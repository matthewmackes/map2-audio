# MAP2 Platform Inventory

Date: 2026-03-09
Worklist task: `T081-subA`

## 1. Scope and method

This document inventories the current MAP2 repository as the baseline for the broader platform evaluation (`T081`). It is intentionally literal: counts come from the current tree, not from README claims or aspirational roadmaps.

Method used in this pass:

- Enumerated FastAPI route modules and counted route decorators (`@router.get/post/put/delete/patch/websocket`).
- Enumerated Python service files under `app/services/` and grouped them by namespace.
- Enumerated React pages, top-level component directories, and advanced navigation entries.
- Enumerated JUCE source files under `juce-engine/Source/`.
- Enumerated runtime/deployment surfaces: `systemd/`, `packaging/systemd/`, installer code, and `MAP2_*` environment bindings.
- Reviewed root and web JavaScript manifests plus the available Python requirements files.

## 2. Claimed product position

From `README.md`, MAP2 presents itself as a low-latency, headless audio appliance that turns commodity Linux hardware into a shared digital audio backbone. The recurring claims are:

- Real-time audio processing on isolated CPU cores with a JUCE engine.
- Headless appliance operation with remote web management.
- Multi-node clustering and AVB-based network audio.
- Broad musician-facing control surfaces: plugins, presets, MIDI, hardware integrations, and specialized rack workflows.

That value proposition is coherent in principle. The main inventory question is whether every major subsystem strengthens that appliance story or whether some areas are now adding more breadth than leverage.

## 3. Inventory snapshot

| Surface | Count | Notes |
| --- | ---: | --- |
| FastAPI route modules | 103 | Raw modules under `app/routes/`. |
| FastAPI route decorators | 1307 | Includes REST and websocket decorators in route files. |
| Python service files | 227 | `app/services/**.py`, including namespace packages. |
| Frontend page modules | 38 | `web/src/app/pages/*.(ts|tsx)`. Includes page tests in the same folder. |
| Top-level frontend component directories | 25 | High-level UI domains under `web/src/app/components/`. |
| Advanced navigation entries | 18 | Top navigation / advanced menu items. |
| Hardware submenu entries | 3 | Secondary hardware-interface menu items. |
| JUCE `.cpp`/`.h` files | 108 | `juce-engine/Source/**`. |
| Repo `systemd` unit/config files | 14 | Under `systemd/`. |
| Packaging unit files | 8 | Under `packaging/systemd/`. |
| Config-bound `MAP2_*` env vars | 28 | Explicit `env_var=` bindings in `app/config.py`. |
| Startup-time env vars in `app/main.py` | 10 | Direct `os.getenv()` usage. |

## 4. Subsystem contribution to the stated value proposition

| Subsystem | Contribution | Judgment |
| --- | --- | --- |
| JUCE engine / audio graph / native DSP | Direct | This is the core appliance value proposition; without it MAP2 has no product. |
| FastAPI backend + websocket broadcast layer | Direct | Required control plane for headless operation, remote management, and automation. |
| React dashboard + TUI + LCD surfaces | Supportive | Useful for operability, but the number of pages and surface area already exceeds what a lean appliance needs. |
| AVB / AVDECC / Tesira integrations | Strategic but hardware-dependent | These features support the multi-node digital backbone story, but current production value is gated by lab hardware and certification evidence. |
| Cluster orchestration / deployment / failover | Strategic | Aligned with the multi-node story, but the implementation breadth is significantly larger than current deployment proof. |
| MIDI Hub + MPX-1 rack control | Supportive to stretched | Musically relevant, but nine MPX-1 pages plus a 99-endpoint MIDI Hub indicate a subsystem growing faster than platform cohesion. |
| IR / NAM / SoundFont acquisition libraries | Mixed | Asset management helps musicians, but the number of scrapers and library pipelines looks broader than the core appliance promise demands. |
| Installer / systemd / realtime scripts | Direct | Necessary for the Fedora appliance story and repeatable field setup. |
| Shopping / marketing / misc support routes | Peripheral | These surfaces do not materially strengthen the audio appliance claim and increase surface area. |

## 5. Backend inventory

### 5.1 Route domain summary

| Domain | Modules | Route decorators | Observation |
| --- | ---: | ---: | --- |
| Audio engine / DSP | 25 | 334 | Large and central; this is the product core, but the public surface is already very wide. |
| Cluster / distributed control | 9 | 87 | Strategic capability area with meaningful breadth relative to current deployment proof. |
| Content / plugins / presets | 15 | 154 | Supports user workflows but adds a second product plane around asset management. |
| MIDI / control surfaces | 5 | 224 | Very broad for a subsystem that is not the platform core. |
| Network audio / Tesira | 6 | 145 | Aligned with MAP2 ambition but heavily dependent on hardware validation. |
| Other | 7 | 48 | Specialized outliers that merit separate scrutiny in later phases. |
| Platform ops / observability / UI support | 36 | 315 | Necessary, but this bucket is large enough to become a product of its own. |

Largest individual route modules by decorator count:

- `midi_hub.py`: 99 decorators (`MIDI / control surfaces`).
- `tesira.py`: 74 decorators (`Network audio / Tesira`).
- `mpx1.py`: 46 decorators (`MIDI / control surfaces`).
- `midi_v2.py`: 41 decorators (`MIDI / control surfaces`).
- `cluster_admin.py`: 38 decorators (`Cluster / distributed control`).
- `avb.py`: 37 decorators (`Network audio / Tesira`).
- `engine.py`: 37 decorators (`Audio engine / DSP`).
- `audio.py`: 36 decorators (`Audio engine / DSP`).
- `synthforge.py`: 33 decorators (`Audio engine / DSP`).
- `system.py`: 28 decorators (`Platform ops / observability / UI support`).
- `lcd.py`: 26 decorators (`Platform ops / observability / UI support`).
- `chains.py`: 24 decorators (`Content / plugins / presets`).

### 5.2 Full route-module inventory

| Route module | Decorators | Domain | Intended purpose |
| --- | ---: | --- | --- |
| `midi_hub.py` | 99 | MIDI / control surfaces | MIDI routing, mapping, hub automation, and MPX-1 control. |
| `tesira.py` | 74 | Network audio / Tesira | AVB/TSN, cross-node audio paths, and Tesira integration. |
| `mpx1.py` | 46 | MIDI / control surfaces | MIDI routing, mapping, hub automation, and MPX-1 control. |
| `midi_v2.py` | 41 | MIDI / control surfaces | MIDI routing, mapping, hub automation, and MPX-1 control. |
| `cluster_admin.py` | 38 | Cluster / distributed control | Multi-node orchestration, updates, and peer state. |
| `avb.py` | 37 | Network audio / Tesira | AVB/TSN, cross-node audio paths, and Tesira integration. |
| `engine.py` | 37 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `audio.py` | 36 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `synthforge.py` | 33 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `system.py` | 28 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `lcd.py` | 26 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `chains.py` | 24 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `midi.py` | 24 | MIDI / control surfaces | MIDI routing, mapping, hub automation, and MPX-1 control. |
| `nam.py` | 23 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `impulse_response.py` | 20 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `automation.py` | 19 | Other | Specialized surface outside the main domain buckets. |
| `dynamics.py` | 17 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `effects_loops.py` | 17 | Network audio / Tesira | AVB/TSN, cross-node audio paths, and Tesira integration. |
| `ir.py` | 17 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `modulation.py` | 17 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `plugins.py` | 16 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `plugin_presets.py` | 15 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `sessions.py` | 15 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `filters.py` | 14 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `midi_learn.py` | 14 | MIDI / control surfaces | MIDI routing, mapping, hub automation, and MPX-1 control. |
| `pipewire.py` | 14 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `backup.py` | 13 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `cluster_update.py` | 13 | Cluster / distributed control | Multi-node orchestration, updates, and peer state. |
| `services.py` | 13 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `soundfonts.py` | 13 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `folders.py` | 12 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `graceful_degradation.py` | 12 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `health_monitor.py` | 12 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `monitoring.py` | 12 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `loudness.py` | 11 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `network.py` | 11 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `request_queue.py` | 11 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `delay.py` | 10 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `flow_snapshots.py` | 10 | Network audio / Tesira | AVB/TSN, cross-node audio paths, and Tesira integration. |
| `packages.py` | 10 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `parallel.py` | 10 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `preset_exchange.py` | 10 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `usb_devices.py` | 10 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `audio_diagnostics.py` | 9 | Other | Specialized surface outside the main domain buckets. |
| `lcd_events.py` | 9 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `metrics.py` | 9 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `performance.py` | 9 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `plugin_tags.py` | 9 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `www.py` | 9 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `connection_pool.py` | 8 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `dsp.py` | 8 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `nam_models.py` | 8 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `reverb.py` | 8 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `cluster_update_hybrid.py` | 7 | Cluster / distributed control | Multi-node orchestration, updates, and peer state. |
| `cpu_metrics.py` | 7 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `deployment_health.py` | 7 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `drums.py` | 7 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `guitar.py` | 7 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `h3000.py` | 7 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `history.py` | 7 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `latency.py` | 7 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `lexi_love.py` | 7 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `passionfx.py` | 7 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `peavey5150.py` | 7 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `pitch.py` | 7 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `plugin_packages.py` | 7 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `preset_migration.py` | 7 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `presets.py` | 7 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `prometheus_metrics.py` | 7 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `runtime_profiles.py` | 7 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `shoegaze.py` | 7 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `system_tests.py` | 7 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `tweedbassman.py` | 7 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `cluster_nodes.py` | 6 | Cluster / distributed control | Multi-node orchestration, updates, and peer state. |
| `core_plugins.py` | 6 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `deployment.py` | 6 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `health.py` | 6 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `plugin_scanner.py` | 6 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `profiling.py` | 6 | Other | Specialized surface outside the main domain buckets. |
| `ssh_trust.py` | 6 | Cluster / distributed control | Multi-node orchestration, updates, and peer state. |
| `audio_path.py` | 5 | Network audio / Tesira | AVB/TSN, cross-node audio paths, and Tesira integration. |
| `chains_ab_mode.py` | 5 | Other | Specialized surface outside the main domain buckets. |
| `cluster_flows.py` | 5 | Cluster / distributed control | Multi-node orchestration, updates, and peer state. |
| `config_api.py` | 5 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `sidechain.py` | 5 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `snapshots.py` | 5 | Other | Specialized surface outside the main domain buckets. |
| `spectrum.py` | 5 | Audio engine / DSP | Real-time engine control, DSP blocks, and instrument/effect APIs. |
| `websocket.py` | 5 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `cluster_health.py` | 4 | Cluster / distributed control | Multi-node orchestration, updates, and peer state. |
| `email_notifications.py` | 4 | Other | Specialized surface outside the main domain buckets. |
| `peer_discovery.py` | 4 | Cluster / distributed control | Multi-node orchestration, updates, and peer state. |
| `prometheus_exporter.py` | 4 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `raft_api.py` | 4 | Cluster / distributed control | Multi-node orchestration, updates, and peer state. |
| `special_settings.py` | 4 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `upload.py` | 4 | Content / plugins / presets | Asset libraries, plugin inventories, and preset exchange. |
| `base.py` | 3 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `dashboard.py` | 3 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `websocket_metrics.py` | 3 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `websocket_rt.py` | 3 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `flow_failover.py` | 2 | Network audio / Tesira | AVB/TSN, cross-node audio paths, and Tesira integration. |
| `shopping.py` | 2 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `auth.py` | 1 | Platform ops / observability / UI support | Health, deployment, system status, and UI plumbing. |
| `__init__.py` | 0 | Other | Specialized surface outside the main domain buckets. |

### 5.3 Service namespace summary

| Namespace | Files | Purpose |
| --- | ---: | --- |
| `root` | 111 | Cross-cutting runtime services: orchestration, plugins, PipeWire, health, persistence, and bridges. |
| `cluster` | 38 | Distributed configuration, failover, update, topology, and node identity management. |
| `avb` | 10 | AVB discovery, routing, readiness, PTP, SRP, and TSN controls. |
| `tesira` | 19 | Biamp Tesira device model, deployment, metrics, discovery, and firmware/workspace tooling. |
| `midi_hub` | 17 | Universal MIDI router, clocking, scripting, transforms, presets, and device registry. |
| `ir_library` | 15 | Impulse-response download and scraping pipeline. |
| `soundfont_library` | 11 | SoundFont download and scraping pipeline. |
| `event_producers` | 6 | Background producers feeding LCD/event subsystems. |

### 5.4 Full service-file inventory

#### `root` (111)

- `app/services/__init__.py`
- `app/services/advanced_services.py`
- `app/services/alert_services.py`
- `app/services/audio_engine_validator.py`
- `app/services/audio_health_monitor.py`
- `app/services/audio_io_v2.py`
- `app/services/audio_meters.py`
- `app/services/automation_engine.py`
- `app/services/backup_service.py`
- `app/services/chain_analyzer.py`
- `app/services/chain_service.py`
- `app/services/circuit_breaker.py`
- `app/services/command_history.py`
- `app/services/command_queue.py`
- `app/services/config_hot_reload.py`
- `app/services/config_validator.py`
- `app/services/connection_pool.py`
- `app/services/connection_pool_integration.py`
- `app/services/database.py`
- `app/services/db_pool_manager.py`
- `app/services/default_effects_loader.py`
- `app/services/deployment_health.py`
- `app/services/deployment_remediation.py`
- `app/services/dsp_manager.py`
- `app/services/effects_loops.py`
- `app/services/event_bus.py`
- `app/services/event_publisher.py`
- `app/services/event_replay.py`
- `app/services/fastapi_integration.py`
- `app/services/featured_amps_manager.py`
- `app/services/flow_orchestrator.py`
- `app/services/folder_scanner.py`
- `app/services/frontend_degradation.py`
- `app/services/graceful_degradation.py`
- `app/services/guitar_chain.py`
- `app/services/health_checker.py`
- `app/services/health_monitor.py`
- `app/services/ir_loader.py`
- `app/services/ir_plugin_wrapper.py`
- `app/services/ir_processor.py`
- `app/services/jack_audio.py`
- `app/services/juce_engine_service.py`
- `app/services/juce_rt_dispatcher.py`
- `app/services/latency_compensation.py`
- `app/services/lcd_event_bus.py`
- `app/services/lcd_event_persistence.py`
- `app/services/lcd_event_router.py`
- `app/services/lcd_manager.py`
- `app/services/lv2_discovery.py`
- `app/services/lv2_enhanced.py`
- `app/services/mdns_discovery.py`
- `app/services/metering_broadcast.py`
- `app/services/metrics_daemon.py`
- `app/services/midi_broadcast.py`
- `app/services/midi_device_profiles.py`
- `app/services/midi_engine.py`
- `app/services/midi_learn.py`
- `app/services/midi_mapping_service.py`
- `app/services/midi_service.py`
- `app/services/mpx1_scene_service.py`
- `app/services/mpx1_service.py`
- `app/services/mpx1_syx_parser.py`
- `app/services/nam_bulk_renamer.py`
- `app/services/nam_ir_manager.py`
- `app/services/nam_library.py`
- `app/services/nam_plugin_wrapper.py`
- `app/services/nam_processor.py`
- `app/services/native_inventory.py`
- `app/services/node_identity.py`
- `app/services/package_manager.py`
- `app/services/parameter_routing.py`
- `app/services/performance_metrics.py`
- `app/services/pipewire_recovery.py`
- `app/services/pipewire_service.py`
- `app/services/platform_checks.py`
- `app/services/plugin_health.py`
- `app/services/plugin_integration_helper.py`
- `app/services/plugin_loader_unified.py`
- `app/services/plugin_loader_v2.py`
- `app/services/plugin_manager_v3.py`
- `app/services/plugin_output_service.py`
- `app/services/plugin_preset_lifecycle.py`
- `app/services/plugin_profiler.py`
- `app/services/plugin_resource_manager.py`
- `app/services/plugin_scanner.py`
- `app/services/port80_proxy.py`
- `app/services/preset_converter_service.py`
- `app/services/preset_migration.py`
- `app/services/realtime_parameter_bridge.py`
- `app/services/reevr_engine.py`
- `app/services/remote_event_aggregator.py`
- `app/services/request_latency_metrics.py`
- `app/services/request_queue.py`
- `app/services/request_queue_integration.py`
- `app/services/resilience_logging.py`
- `app/services/resilience_middleware.py`
- `app/services/rt_hardening.py`
- `app/services/rt_monitor.py`
- `app/services/runtime_profiles.py`
- `app/services/secrets_manager.py`
- `app/services/service_manager.py`
- `app/services/service_orchestrator.py`
- `app/services/session_manager.py`
- `app/services/special_settings_node_sync.py`
- `app/services/special_settings_raft.py`
- `app/services/tui_screen_manager.py`
- `app/services/unified_services.py`
- `app/services/upload_service.py`
- `app/services/usb_audio_manager.py`
- `app/services/user_content_manager.py`
- `app/services/websocket_manager.py`

#### `cluster` (38)

- `app/services/cluster/__init__.py`
- `app/services/cluster/audio_path_discovery.py`
- `app/services/cluster/avb_cluster.py`
- `app/services/cluster/certificate_authority.py`
- `app/services/cluster/clone_reset.py`
- `app/services/cluster/config_distributor.py`
- `app/services/cluster/config_loader.py`
- `app/services/cluster/config_manager.py`
- `app/services/cluster/config_pusher.py`
- `app/services/cluster/config_schema.py`
- `app/services/cluster/configuration_distributor.py`
- `app/services/cluster/deployment_manager.py`
- `app/services/cluster/disaster_recovery.py`
- `app/services/cluster/distributed_event_bus.py`
- `app/services/cluster/enhanced_node_identity.py`
- `app/services/cluster/failover_monitor.py`
- `app/services/cluster/fedora_package_manager.py`
- `app/services/cluster/health_aggregator.py`
- `app/services/cluster/heartbeat_monitor.py`
- `app/services/cluster/hybrid_update_manager.py`
- `app/services/cluster/integration_helpers.py`
- `app/services/cluster/management_orchestrator.py`
- `app/services/cluster/map2_git_updater.py`
- `app/services/cluster/mdns_discovery_enhanced.py`
- `app/services/cluster/network_topology.py`
- `app/services/cluster/node_lifecycle.py`
- `app/services/cluster/onboarding_portal.py`
- `app/services/cluster/post_update_health.py`
- `app/services/cluster/prometheus_exporter.py`
- `app/services/cluster/raft_consensus.py`
- `app/services/cluster/registry.py`
- `app/services/cluster/state_replicator.py`
- `app/services/cluster/state_replicator_impl.py`
- `app/services/cluster/update_orchestrator.py`
- `app/services/cluster/update_rollback.py`
- `app/services/cluster/update_validator.py`
- `app/services/cluster/version_manifest.py`
- `app/services/cluster/ztp.py`

#### `avb` (10)

- `app/services/avb/__init__.py`
- `app/services/avb/aem_cache.py`
- `app/services/avb/avb_discovery.py`
- `app/services/avb/avb_router.py`
- `app/services/avb/avb_service.py`
- `app/services/avb/ptp_monitor.py`
- `app/services/avb/readiness.py`
- `app/services/avb/srp_admission.py`
- `app/services/avb/srp_log_store.py`
- `app/services/avb/tsn_qdisc.py`

#### `tesira` (19)

- `app/services/tesira/__init__.py`
- `app/services/tesira/capabilities.py`
- `app/services/tesira/discovery.py`
- `app/services/tesira/firmware_service.py`
- `app/services/tesira/layout_catalog.py`
- `app/services/tesira/port61451_probe.py`
- `app/services/tesira/preset_interlock.py`
- `app/services/tesira/ptp_coordinator.py`
- `app/services/tesira/sagevue_client.py`
- `app/services/tesira/tesira_block_registry.py`
- `app/services/tesira/tesira_deploy_orchestrator.py`
- `app/services/tesira/tesira_design_compiler.py`
- `app/services/tesira/tesira_design_workspace.py`
- `app/services/tesira/tesira_device.py`
- `app/services/tesira/tesira_dsp_model.py`
- `app/services/tesira/tesira_fleet.py`
- `app/services/tesira/tesira_metrics.py`
- `app/services/tesira/ttp_client.py`
- `app/services/tesira/ttp_ssh_client.py`

#### `midi_hub` (17)

- `app/services/midi_hub/__init__.py`
- `app/services/midi_hub/clock_engine.py`
- `app/services/midi_hub/device_registry.py`
- `app/services/midi_hub/gateway.py`
- `app/services/midi_hub/hub.py`
- `app/services/midi_hub/macros.py`
- `app/services/midi_hub/midi2.py`
- `app/services/midi_hub/network.py`
- `app/services/midi_hub/ports.py`
- `app/services/midi_hub/preset_service.py`
- `app/services/midi_hub/recorder.py`
- `app/services/midi_hub/ring_buffer.py`
- `app/services/midi_hub/router.py`
- `app/services/midi_hub/scheduler.py`
- `app/services/midi_hub/script_engine.py`
- `app/services/midi_hub/traffic_monitor.py`
- `app/services/midi_hub/transforms.py`

#### `ir_library` (15)

- `app/services/ir_library/__init__.py`
- `app/services/ir_library/chunk_assembler.py`
- `app/services/ir_library/conners_scraper.py`
- `app/services/ir_library/djammincabs_scraper.py`
- `app/services/ir_library/download_manager.py`
- `app/services/ir_library/echothief_scraper.py`
- `app/services/ir_library/fokke_scraper.py`
- `app/services/ir_library/lexicon_scraper.py`
- `app/services/ir_library/nam_github_scraper.py`
- `app/services/ir_library/overdriven_scraper.py`
- `app/services/ir_library/samplicity_scraper.py`
- `app/services/ir_library/scraper_base.py`
- `app/services/ir_library/signaltonoize_scraper.py`
- `app/services/ir_library/tone3000_scraper.py`
- `app/services/ir_library/voxengo_scraper.py`

#### `soundfont_library` (11)

- `app/services/soundfont_library/__init__.py`
- `app/services/soundfont_library/download_manager.py`
- `app/services/soundfont_library/freepats_scraper.py`
- `app/services/soundfont_library/internet_archive_scraper.py`
- `app/services/soundfont_library/musical_artifacts_scraper.py`
- `app/services/soundfont_library/pianobook_scraper.py`
- `app/services/soundfont_library/polyphone_scraper.py`
- `app/services/soundfont_library/scraper_base.py`
- `app/services/soundfont_library/sfzinstruments_scraper.py`
- `app/services/soundfont_library/vpo_scraper.py`
- `app/services/soundfont_library/vsco_scraper.py`

#### `event_producers` (6)

- `app/services/event_producers/__init__.py`
- `app/services/event_producers/audio_producer.py`
- `app/services/event_producers/database_producer.py`
- `app/services/event_producers/network_producer.py`
- `app/services/event_producers/plugin_producer.py`
- `app/services/event_producers/system_producer.py`

## 6. Frontend inventory

### 6.1 Navigation tree

- System: `Overview` -> `/`, `Guide` -> `/welcome`, `Grid` -> `/grid`, `Presets` -> `/presets`, `3D Grid` -> `/grid-3d`
- Content & Plugins: `LV2 Plugins` -> `/plugins`, `IR & NAM Library` -> `/library`
- Audio Processing: `Audio Engine` -> `/engine`
- Control: `MIDI` -> `/midi`, `MIDI Hub` -> `/midi-hub`, `MPX1 Rack` -> `/mpx1`
- Hardware & Interfaces: `LCD Console` -> `/lcd`, `Audio Interfaces` -> `#hardware-interfaces`, `AVB Routing` -> `/avb-routing`, `Tesira AVB` -> `/tesira`
- Infrastructure: `Host Machine` -> `/host-machine`, `Cluster Dashboard` -> `/cluster-dashboard`, `Multi-System` -> `/multi-system`

Hardware submenu:

- `Edirol UA-1000` -> `/edirol-ua1000` (USB audio interface control)
- `HoTone JoGG` -> `/hotone-jogg` (HoTone audio interface)
- `Generic` -> `/hotone-jogg` (Generic model based on the HoTone interface)

Notable navigation observation: the hardware submenu currently exposes both `HoTone JoGG` and `Generic` on the same route (`/hotone-jogg`), which is a sign of route reuse outrunning information architecture clarity.

### 6.2 Page-group summary

| Page group | Count | Representative pages |
| --- | ---: | --- |
| Audio workflow | 7 | `AudioEnginePage.tsx`, `GridFlowPage.tsx`, `ChainsPage.tsx` |
| Infrastructure / hardware | 9 | `HostMachinePage.tsx`, `ClusterDashboardPage.tsx`, `PipeWirePage.tsx` |
| Library / plugins | 3 | `LibraryPage.tsx`, `PresetsPage.tsx`, `LV2PluginsPage.tsx` |
| MIDI | 2 | `MIDIPage.tsx`, `MidiHubPage.tsx` |
| MPX1 | 9 | `MPX1Page.tsx` plus seven focused MPX1 views |
| Network audio / Tesira | 4 | `AVBNetworkDashboard.tsx`, `AvbRoutingPage.tsx`, `TesiraPage.tsx` |
| Shell / marketing / misc | 4 | `HomePage.tsx`, `WelcomePage.tsx`, `AboutPage.tsx` |

### 6.3 Full page inventory

- `web/src/app/pages/AVBNetworkDashboard.tsx`
- `web/src/app/pages/AboutPage.tsx`
- `web/src/app/pages/AudioEnginePage.tsx`
- `web/src/app/pages/AvbRoutingPage.test.tsx`
- `web/src/app/pages/AvbRoutingPage.tsx`
- `web/src/app/pages/CPUPerformancePage.tsx`
- `web/src/app/pages/ChainsPage.tsx`
- `web/src/app/pages/ClusterDashboardPage.tsx`
- `web/src/app/pages/DSPPage.tsx`
- `web/src/app/pages/DrumsPage.tsx`
- `web/src/app/pages/EdirolUA1000Page.tsx`
- `web/src/app/pages/GridFlowAdvancedPage.tsx`
- `web/src/app/pages/GridFlowPage.tsx`
- `web/src/app/pages/HoToneJoGGPage.tsx`
- `web/src/app/pages/HomePage.tsx`
- `web/src/app/pages/HostMachinePage.tsx`
- `web/src/app/pages/LCDPage.tsx`
- `web/src/app/pages/LV2PluginsPage.tsx`
- `web/src/app/pages/LegacyPage.tsx`
- `web/src/app/pages/LibraryPage.tsx`
- `web/src/app/pages/MIDIPage.tsx`
- `web/src/app/pages/MOTURMEPage.tsx`
- `web/src/app/pages/MPX1DiagView.tsx`
- `web/src/app/pages/MPX1EditorView.tsx`
- `web/src/app/pages/MPX1FlowView.tsx`
- `web/src/app/pages/MPX1LibraryView.tsx`
- `web/src/app/pages/MPX1MatrixView.tsx`
- `web/src/app/pages/MPX1MidiMapView.tsx`
- `web/src/app/pages/MPX1Page.tsx`
- `web/src/app/pages/MPX1PanelView.tsx`
- `web/src/app/pages/MPX1PerformView.tsx`
- `web/src/app/pages/MeteringPage.tsx`
- `web/src/app/pages/MidiHubPage.tsx`
- `web/src/app/pages/MultiSystemDashboardPage.tsx`
- `web/src/app/pages/PipeWirePage.tsx`
- `web/src/app/pages/PresetsPage.tsx`
- `web/src/app/pages/TesiraPage.tsx`
- `web/src/app/pages/WelcomePage.tsx`

### 6.4 Top-level component domains

- `web/src/app/components/AvbRouting`
- `web/src/app/components/BottomRoutingPanel`
- `web/src/app/components/ChainPanel`
- `web/src/app/components/ClusterDashboard`
- `web/src/app/components/Controls`
- `web/src/app/components/Dynamics`
- `web/src/app/components/EQ`
- `web/src/app/components/GridFlow`
- `web/src/app/components/GridFlowAdvanced`
- `web/src/app/components/HorizontalSignalChain`
- `web/src/app/components/HostMachine`
- `web/src/app/components/MPX1`
- `web/src/app/components/MidiHub`
- `web/src/app/components/PluginBrowser`
- `web/src/app/components/PluginCards`
- `web/src/app/components/PluginTags`
- `web/src/app/components/Routing`
- `web/src/app/components/Tesira`
- `web/src/app/components/Visualizations`
- `web/src/app/components/icons`
- `web/src/app/components/library`
- `web/src/app/components/loaders`
- `web/src/app/components/presets`
- `web/src/app/components/shared`
- `web/src/app/components/upload`

## 7. JUCE engine inventory

JUCE source inventory summary:

- Core engine/control files: 17
- AVB/AVDECC/Tesira-facing C++ files: 19
- Native processor/interface files outside SynthForge: 40
- Metering/analysis/state files: 12
- SynthForge files: 13

Major C++ areas:

- Engine core: `Map2AudioEngine`, `JuceAudioIO`, `JuceAudioGraph`, `PluginGraph`, `PluginHost`, `PythonBindings`, `MidiHandler`, `ParameterBridge`.
- Network audio / AVDECC: `Avb*`, `Avdecc*`, `TesiraAvbNode*`.
- Native processors: NAM, H3000, TweedBassman, Eventide-style processors, modulation/filter/dynamics blocks, parallel mixer, and several themed processors.
- Metering and diagnostics: CPU, LUFS, phase correlation, spectrum, VU, snapshot management.
- SynthForge: namespaced subtrees under `SynthForge/Common`, `SynthForge/Core`, `SynthForge/Sampler`, and `SynthForge/Sound`.

Full SynthForge subtree:

- `juce-engine/Source/SynthForge/Common/Types.h`
- `juce-engine/Source/SynthForge/Core/MidiRouter.cpp`
- `juce-engine/Source/SynthForge/Core/MidiRouter.h`
- `juce-engine/Source/SynthForge/Core/Part.cpp`
- `juce-engine/Source/SynthForge/Core/Part.h`
- `juce-engine/Source/SynthForge/Core/VoiceAllocator.cpp`
- `juce-engine/Source/SynthForge/Core/VoiceAllocator.h`
- `juce-engine/Source/SynthForge/Sampler/SfzLoader.cpp`
- `juce-engine/Source/SynthForge/Sampler/SfzLoader.h`
- `juce-engine/Source/SynthForge/Sound/SynthVoice.cpp`
- `juce-engine/Source/SynthForge/Sound/SynthVoice.h`
- `juce-engine/Source/SynthForge/SynthForgeProcessor.cpp`
- `juce-engine/Source/SynthForge/SynthForgeProcessor.h`

## 8. Configuration and deployment inventory

### 8.1 Repository `systemd/` units and mode drop-ins

- `systemd/map2-backend.service`
- `systemd/map2-boot-manager.service`
- `systemd/map2-irq-affinity.service`
- `systemd/map2-lcd-boot.service`
- `systemd/map2-lcd.service`
- `systemd/map2-pipedal-test.service`
- `systemd/map2-port80-proxy.service`
- `systemd/map2-selinux-disable.service`
- `systemd/map2-system-check.service`
- `systemd/map2-web-dev.service`
- `systemd/map2-web-prod.service`
- `systemd/modes/all-in-one.conf`
- `systemd/modes/audio.conf`
- `systemd/modes/management.conf`

### 8.2 Packaging unit files

- `packaging/systemd/map2-avb.target`
- `packaging/systemd/map2-backend.service`
- `packaging/systemd/map2-cluster.service`
- `packaging/systemd/map2-frontend.service`
- `packaging/systemd/map2-phc2sys.service`
- `packaging/systemd/map2-ptp4l.service`
- `packaging/systemd/map2-srpd.service`
- `packaging/systemd/map2-tui.service`

### 8.3 Installer and operational scripts surfaced in this pass

- `install_on_new_host.sh`
- `scripts/setup_realtime.sh`
- `scripts/setup_avb.sh`
- `scripts/setup_mpx1_spdif_avb.sh`
- `scripts/measure_latency.sh`
- `scripts/start-web.sh`
- `installer/README.md`
- `installer/backend/pipewire.py`
- `installer/backend/services.py`
- `installer/config/defaults.py`

### 8.4 Environment/config surfaces

- `app/config.py` binds 28 explicit `MAP2_*` environment variables.
- `app/main.py` directly reads 10 startup-time environment variables: `MAP2_API_PORT`, `MAP2_CLUSTER_ENABLED`, `MAP2_CONFIG_GIT_REPO`, `MAP2_DEPLOYMENT_MODE`, `MAP2_DISABLE_UVICORN_ACCESS_LOG`, `MAP2_ENABLE_PIPEWIRE_RECOVERY`, `MAP2_REMOTE_BACKEND_URL`, `MAP2_STRICT_ROUTE_LOADING`, `MAP2_TEST_MODE`, `MAP2_USE_MOCK_LCD`.
- `systemd/map2-backend.service` hard-codes additional runtime environment such as `PIPEWIRE_REMOTE`, `JACK_DEFAULT_SERVER`, and `PIPEWIRE_LATENCY`.
- Realtime, AVB, and deployment mode setup are also manipulated by shell installers (`setup_realtime.sh`, `setup_avb.sh`, `map2-boot-manager.sh`).

Inventory judgment: MAP2 has a real appliance-style deployment surface, but the truth is fragmented across Python config, direct `os.getenv()` calls, systemd units, and large shell installers. That fragmentation is itself an inventory finding.

## 9. Dependency inventory

### 9.1 JavaScript manifests

| Manifest | Role | Notable packages / findings |
| --- | --- | --- |
| `package.json` | Root test harness / Jest config | React `^19.2.3`, MUI `^7.3.7`, Jest `^30.2.0`. Root manifest is oriented around frontend test execution rather than the runtime product. |
| `web/package.json` | Main dashboard application | React `^19.0.0`, MUI `^6.5.0`, Vite `^6.4.1`, React Query `^5.59.0`, Three.js stack (`@react-three/*`, `three`), React Flow, D3, Recharts, Framer Motion. |

Heavy or complexity-adding frontend dependencies visible from `web/package.json`:

- `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `three`: meaningful weight for the 3D visualization path.
- `reactflow`, `dagre`: graph editing/layout stack.
- `d3`, `recharts`: dual charting/data-viz surface.
- `@mui/material`, `@mui/styles`, Emotion, Phosphor, Lucide: layered design-system/icon stack.
- `framer-motion`: animation dependency on top of an already large UI surface.

Version-skew finding: the root manifest and the web app manifest are not aligned on some shared frontend libraries (for example MUI 7 in the root test harness vs MUI 6 in `web/`, and different React patch levels). That is manageable, but it increases maintenance friction.

### 9.2 Python manifests

- `requirements-installer.txt`: `textual>=7.3.0,<8.0.0`, `pydantic>=2.0.0,<3.0.0`, `PyYAML>=6.0.0,<7.0.0`, `rich>=13.0.0,<15.0.0`
- `requirements-search.txt`: `beautifulsoup4>=4.12.0`, `requests>=2.31.0`, `tabulate>=0.9.0`, `colorama>=0.4.6`, `lxml>=4.9.0`
- No canonical backend runtime manifest for `app/` was found in this pass (`requirements.txt`, `pyproject.toml`, `setup.py`, or equivalent were not present at the repo root for the main FastAPI application).

Inventory judgment: dependency governance is split across the root JS manifest, the web app manifest, installer/search requirements files, and implicit system packages. For a headless appliance product, that is weaker than it should be.

## 10. Initial findings from the inventory pass

1. The platform breadth is very large for a single appliance product. The inventory shows 103 route modules, 1307 route decorators, 227 service files, 38 page modules, and 108 JUCE source files. MAP2 is no longer a small pedalboard backend; it is a broad control platform.
2. The broadest non-core surfaces are `midi_hub.py` (99 decorators), `tesira.py` (74), and the cluster/service namespaces. That may be justified, but it means later phases must judge whether the control plane has outrun the proven audio product core.
3. Frontend information architecture is already stretched. There are 19 advanced-menu entries, 3 hardware submenu entries, 9 MPX1 pages, and route reuse in the hardware submenu. That is a warning sign for discoverability and product cohesion.
4. Deployment/config truth is fragmented across `app/config.py`, direct `os.getenv()` calls in `app/main.py`, systemd units, and shell installers. This is a maintainability risk before deeper architecture review even starts.
5. Dependency governance is incomplete. The installer and search helper have explicit Python requirements, but the main backend application does not expose one canonical runtime manifest in the repository root. That is a release, reproducibility, and onboarding risk.
6. Workspace/repository bloat is visible from the tree itself: root-level `node_modules/`, generated plugin build trees, and temporary audit artifacts are present alongside product code. Even without judging whether every artifact is tracked, the checkout is not cleanly separated between source and generated output.

## 11. Inputs for the next evaluation phases

- `T081-subB` should use this inventory to score completeness by subsystem rather than rediscovering the tree.
- `T081-subC` should focus on the central runtime seams surfaced here: JUCE callback path, FastAPI lifespan/service orchestration, websocket broadcasters, PipeWire recovery, cluster background tasks, and hardware hotplug boundaries.
- `T081-subD` should specifically test whether the large route/service counts reflect clean modularity or accumulated coupling.
- `T081-subI` should convert the route inventory into an API contract audit, because the current surface is too large to reason about informally.

This completes the inventory baseline. The next valuable work is not adding more inventory detail; it is using this baseline to grade completeness, reliability, and architecture quality.
